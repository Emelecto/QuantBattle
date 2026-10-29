# Plan: Torneos ML con datasets (modelo Numerai) — HÍBRIDO

Estado: **Fase 1 IMPLEMENTADA y verificada** (25 tests verdes).
Decisiones de Emilio: migrar del torneo de código, universo lo más amplio
posible, cadencia rápida, retirar el torneo de código, y **enfoque híbrido:
datasets sintéticos propios como base + torneos con datos reales como
categoría insignia**.

---

## 0. Por qué híbrido (resultado de atacar mi propio diseño)

Antes de escribir código intenté **de-anonimizar** mi propuesta con datos
reales. Encontré 4 fugas explotables y un problema estructural peor:

| Vector de ataque | Resultado |
|---|---|
| Orden de eras = orden temporal | **FUGA** (era_0001 era la más antigua) |
| Huecos de fin de semana | **FUGA** (cripto opera findes, acciones no → separa clases) |
| Nº de filas por era | **FUGA** (era con 3 filas = finde = esas 3 son cripto) |
| Escala de volatilidad | **FUGA** si se normaliza global en vez de por era |
| Correlación con series reales | bloqueado por el binning (BTC quedó 3º de 6) |

Y el hallazgo decisivo: **con pocos activos el scoring por era es ruido**.
Medido por simulación (IC real = 0.03):

| activos/era | desv. por era | eras para detectar señal |
|---|---|---|
| 8 | 0.3767 | 1 420 |
| 20 | 0.2323 | **540** ← propuesta inicial |
| 250 | 0.0644 | 42 |
| 500 | 0.0425 | **19** |

Con 20 activos harían falta ~10 años de rondas para distinguir habilidad de
suerte. Verificado empíricamente: con 8 activos reales un GradientBoosting
**no batió al azar** (`-0.0040` vs `+0.0278`).

**Los datos sintéticos resuelven los cuatro problemas de golpe:** anonimato por
construcción (no hay nada que descubrir), universo del tamaño que queramos,
señal conocida (garantizamos que el torneo es ganable) y cero licencias.

Los datos reales siguen siendo la categoría insignia: credibilidad, la
habilidad transfiere al mercado y el meta-modelo tiene valor comercial real.
El sintético **calibra** el sistema; el real es el producto.

---

## 1. Por qué migramos del torneo de código (evidencia)

`worker/engine.py:132` (`_parse_windows_from_code`) solo busca los strings
`fast=` y `slow=` dentro del código del usuario. **Todo lo demás se ignora.**

Verificado con datos reales de Binance (BTCUSDT 1d, 2024-01-01→2024-06-30):

| Código enviado | sharpe_oos |
|---|---|
| Red neuronal LSTM (torch) | **-1.454316** |
| RSI + MACD | **-1.454316** |
| Mismo código, `fast=5/slow=15` | -0.552233 |

Dos estrategias radicalmente distintas obtienen el **mismo score**. Un torneo
con premios sobre esta base no tiene integridad. Nota positiva: el motor nunca
hizo `exec`, así que no había agujero de seguridad.

<!-- P2 -->

---

## 2. Arquitectura

El usuario ya NO sube código. Sube **predicciones**.

```
[CRON]                                [USUARIO, en su máquina]
   │                                            │
 1. Genera el dataset                           │
    · sintético: factores + regímenes + colas   │
    · real: OHLCV → features → obfuscación      │
 2. Parte en 3 por era_idx (server-side):       │
      train      (público) ───────────────────► descarga parquet
      validation (público) ───────────────────► entrena lo que quiera
      live       (PRIVADO: target nunca sale)   │   (XGBoost, LSTM, …)
                                               │
 4. SCORING sobre el holdout ◄────────────────── 3. sube CSV: id,prediction
      numerai_corr por era                     │
      FNC (feature-neutral)                    │
      consistencia + originalidad              │
 5. Ranking + QP vía el ledger existente        │
```

**El worker nunca ejecuta código del participante.** El cómputo pesado
(entrenar) lo paga el usuario; el worker solo compara CSVs.

### 2.1 No es cifrado, es obfuscación

Si el dataset estuviera cifrado nadie podría entrenar con él. Lo que se hace es
**destruir la identificabilidad conservando la señal estadística**:

- Features normalizadas por era y reducidas a 5 valores `[0, .25, .5, .75, 1]`.
- Nombres opacos (`feature_07`) en **orden aleatorio**: las features útiles y
  las trampa son indistinguibles.
- `era_0042` en vez de una fecha, y **con el orden permutado**.
- `id` = SHA-256 con **sal server-side**: irreproducible sin ella.
- Nº de filas por era **constante**.
- El **target del holdout nunca se publica**.

En el modo sintético todo esto es redundante pero se aplica igual: el activo
directamente no existe.

<!-- P3 -->

---

## 2.2 Fase 1 — YA IMPLEMENTADA (25 tests verdes)

| Fichero | Contenido | Tests |
|---|---|---|
| `worker/scoring_ml.py` | Scoring portado de `numerai-tools`, verificado **delta 0.00e+00** | 10 |
| `worker/dataset_builder.py` | Generador sintético + real, obfuscación de 6 capas, split temporal | 15 |

Comandos de verificación:

```bash
cd worker && TESTING=1 .venv/Scripts/python.exe -m pytest tests/test_scoring_ml.py -q       # 10 passed
cd worker && TESTING=1 .venv/Scripts/python.exe -m pytest tests/test_dataset_builder.py -q  # 15 passed
```

### Resultados medidos del dataset sintético

600 activos × 350 eras × 50 features = 210 000 filas, generado en **35.7 s**
(113 MB en memoria):

```
participante       corr       FNC   corr/era     desv   t-stat
modelo_ml       +0.0348   -0.0014    +0.0344   0.0395     7.29
clon            +0.0345   +0.0061    +0.0341   0.0411     6.94
un_feature      -0.0038   -0.0023    -0.0034   0.0457    -0.63
azar            +0.0151   +0.0147    +0.0151   0.0381     3.31
```

- Modelo ML bate al azar con **t = 7.29** (altamente significativo).
- Bastan **12 eras** para detectar habilidad (vs 540 con 20 activos reales).
- La trampa `un_feature` no puntúa.
- El clon se detecta a `0.8532` de correlación con el original.

### Dos anomalías investigadas (no descartadas)

1. **El azar puntuó `+0.0151` con t=3.31.** ¿Sesgo del scoring? Probado con 200
   predicciones aleatorias: media `+0.00154`, `t = 1.22` → **el scoring está
   limpio**; fue suerte de una semilla concreta.
2. **Pedimos 3 regímenes y salieron 2.** Con `p_stay=0.97` la cadena se queda
   pegada (7 cambios); con `0.90` recorre los 3 con ~24 cambios. **Corregido a
   0.90** en el generador.

### Modo real: escala verificada

Descarga medida: **30/30 acciones en 37 s** (1.24 s/activo) y **11/12 cripto en
26 s**. Proyección para 700 activos: **~17 min** en cron, con caché incremental
después. Viable.

End-to-end con 42 activos (30 acciones + 12 cripto), 407 eras, 92 s:

```
columnas internas expuestas   : NINGUNA
orden de eras = cronologico   : False   (permutado OK)
filas por era                 : [42]    (constante OK)
valores por feature           : [0.0, 0.25, 0.5, 0.75, 1.0]
ids unicos                    : True

modelo  corr=+0.0167  fnc=-0.0052  score=+0.0081  eras=82  valida=True
azar    corr=-0.0180  fnc=-0.0002  score=-0.0077  eras=82  valida=True
modelo bate al azar: True | t-stat=0.88
```

Los 4 vectores de de-anonimización siguen cerrados a escala. El modelo bate al
azar pero **t=0.88 no es significativo**: coherente con la tabla de §0 (42
activos siguen siendo pocos). Para el modo real en producción hay que subir a
**250+ activos**; el código ya lo soporta, solo es ampliar la lista del universo.

### Bug encontrado en el e2e (y corregido)

`puntuar_submission` hacía `features.loc[g.index]` confiando en que el índice
fuera contiguo. Con un slice de panel real (índice salteado) lanzaba
`KeyError: '[49, 131, 213, ...] not in index'`. Los 25 tests iniciales no lo
detectaron porque usaban índices `0..n-1`.

Fix: reindexar todo por posición dentro de la función. Añadidos 2 tests de
regresión (índice no contiguo y arrays sin índice) → **27 tests verdes**.

Lección: los tests con datos sintéticos limpios no sustituyen un e2e con datos
reales.

<!-- P4bis -->



---

## 3. Scoring (portado del código real de Numerai — verificado bit-a-bit)

Los subagentes localizaron `numerai-tools/scoring.py` (repo oficial, 673 líneas).
Porté las funciones críticas y **las comparé contra el fuente oficial ejecutando
ambas sobre los mismos datos**: desviación máxima `0.00e+00` en las tres.
Todo con `scipy` + `pandas`, que **ya están instalados** (0 dependencias nuevas).

| Función | Qué hace |
|---|---|
| `rank_series` | `(rank − 0.5) / count` → `[0,1]` sin extremos |
| `gaussian` | `norm.ppf` del rank |
| `power(df, 1.5)` | `sign(x)·|x|^1.5` |
| `numerai_corr` | center target → rank → gaussianize → pow 1.5 → Pearson |
| `neutralize` | `lstsq` con **intercepto** y `rcond=1e-6` |
| `feature_neutral_corr` (FNC) | corr tras neutralizar → mide señal **propia** |
| `churn` | `1 − spearman`: cuánto cambió el modelo entre rondas |
| `stake_weight` | meta-modelo ponderado por stake |

### Tres detalles que había implementado mal (y que importan)

Mi primera versión desviaba `4.4e-03` en la correlación y `0.4` en `neutralize`.
Causas, encontradas leyendo el fuente oficial:

1. El rank es `(rank − 0.5) / count`, **no** `rank(pct=True)`. Evita ±∞ en
   `norm.ppf` sin necesidad de `clip` (mi `clip` introducía sesgo).
2. `neutralize` añade una **columna de 1s** (intercepto) a los neutralizadores.
3. Usa `np.linalg.lstsq(..., rcond=1e-6)`, no `pinv`.

Tras corregir los tres: **delta 0.00e+00**. Lección: portar de memoria no basta,
hay que diferenciar contra el fuente ejecutándolo.

### Resultados verificados con el código oficial

```
             corr        FNC       caída
honesto   +0.2788    +0.0144    +0.2644
f01       +0.2607    -0.0410    +0.3017   <- se hunde al neutralizar
azar      -0.0729    -0.0369    -0.0359
```

`f01` (un modelo que solo replica un feature) puntúa casi como el honesto en
`corr`, pero **cae más al neutralizar**. Sin FNC, ese modelo vacío te gana el
torneo.

Otras validaciones (con el PoC propio):
- Meta-modelo **+0.2676** vs mejor individual **+0.2472** → el ensemble gana.
- Churn: vs sí mismo `0.0009`, vs azar `0.9803`.

### Score final propuesto

```
score = 0.5 · corr_media
      + 0.3 · FNC_media
      + 0.2 · consistencia            (1 - desv_std entre eras)
      − penalización_originalidad     (si corr con meta-modelo > 0.95)
```

Requisito mínimo: **N eras válidas** para que nadie gane con 3 predicciones
afortunadas.

---

## 4. Anti-trampa

Riesgo detectado en el PoC: un clon del mejor modelo (`corr 0.9991` con el
original) quedó **2º con casi el mismo score**. Copiar funciona si solo mides
correlación. Mitigaciones:

| Vector | Defensa |
|---|---|
| Plagio entre cuentas | matriz de correlación entre submissions; `> 0.95` → revisión |
| Overfitting al holdout | el target live **nunca** se publica; se puntúa sobre datos futuros |
| Descubrir el activo real | obfuscación + binning; sin fechas ni tickers |
| Colgarse de un feature | FNC en el score |
| Multi-cuenta | límite de submissions por IP/dispositivo + `churn` entre cuentas |
| Suerte | consistencia entre eras + mínimo de eras |

<!-- P3 -->

---

## 5. Schema nuevo (migración 0011)

Se **añade**, no se rompe nada. `tokens`, `token_ledger`, `profiles` y
`leaderboard_entries` se reutilizan tal cual.

```sql
-- Un dataset publicado por ronda
create table tournament_datasets (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  version       text not null,              -- 'v1'
  n_eras        int  not null,
  n_features    int  not null,
  n_rows        int  not null,
  train_url     text not null,              -- Supabase Storage (público)
  validation_url text not null,             -- Supabase Storage (público)
  live_era_from  text not null,             -- 'era_0269'  (holdout: NO se publica)
  live_era_to    text not null,
  feature_meta  jsonb,                      -- mapping opaco, solo server-side
  checksum      text not null,
  created_at    timestamptz not null default now(),
  unique(tournament_id, version)
);

-- El target del holdout vive aquí y NUNCA se expone por la API
create table dataset_targets (
  dataset_id uuid not null references tournament_datasets(id) on delete cascade,
  row_id     text not null,
  era        text not null,
  target     double precision not null,
  primary key (dataset_id, row_id)
);

-- Predicciones subidas por el participante
create table prediction_submissions (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  dataset_id     uuid not null references tournament_datasets(id) on delete cascade,
  user_id        uuid not null references profiles(id) on delete cascade,
  file_url       text not null,
  n_rows         int  not null,
  corr_mean      double precision,
  corr_std       double precision,
  fnc_mean       double precision,
  churn          double precision,
  meta_corr      double precision,          -- corr con el meta-modelo
  score          double precision,
  rank           int,
  qp_staked      int not null default 0,
  qp_earned      int not null default 0,
  status         text not null default 'pending',
  eval_error     text,
  submitted_at   timestamptz not null default now(),
  scored_at      timestamptz,
  unique(tournament_id, user_id)            -- + endpoint con replace, como ya hicimos
);
```

**RLS:** `tournament_datasets` lectura pública; `dataset_targets` **solo
service_role** (crítico: si se filtra, el torneo muere);
`prediction_submissions` el dueño lee la suya, el resto ve solo el ranking.

---

## 6. Formatos de torneo propuestos

Más allá del semanal clásico:

| Formato | Descripción | Esfuerzo | Impacto |
|---|---|---|---|
| **Rondas solapadas** | Nueva ronda cada semana; varias abiertas a la vez. Siempre hay algo que hacer | Bajo | **Alto** |
| **Ligas por divisiones** | Bronce→Plata→Oro→Diamante, con ascenso/descenso. El novato compite en su nivel | Medio | **Alto** |
| **Meta-modelo de la comunidad** | Combina todas las predicciones ponderadas por reputación. Ya validado: bate al mejor individual. Vitrina brutal | Medio | **Alto** |
| **Crisis históricas** | Dataset de marzo 2020 / mayo 2022. Premia robustez, no mercado alcista | Bajo | Medio |
| **Duelos 1v1** | Retas a alguien, mismo dataset, gana el mejor score. Viral | Medio | Medio |
| **Torneo por equipos** | 3-5 personas, score del ensemble del equipo | Alto | Medio |
| **Supervivencia** | Cada ronda elimina al último 20% hasta que queda uno | Medio | Medio |
| **Relámpago (24h)** | Dataset pequeño, deadline en un día | Bajo | Medio |

### Engagement

- **Rachas**: enviar N rondas seguidas da bonus de QP.
- **Badges**: primera submission, top-10, 5 rondas seguidas, originalidad alta.
- **Reputación**: media de las últimas 5 rondas (ya existe `_reputation_scores`).
- **Replay de la ronda**: gráfico animado de cómo se movió el ranking.
- **Perfil público**: historial, mejor score, badges, evolución.

### Monetización sana (sin convertir QP en dinero)

Sponsors con premios en especie (cursos, suscripciones de datos), torneos
premium por suscripción, tiers con más submissions o features extra.
**QP sigue sin ser convertible.**

<!-- P4 -->

---

## 7. Fases de implementación

### Fase 1 — Núcleo del backend ✅ HECHA
- `worker/scoring_ml.py` — scoring verificado bit-a-bit (10 tests).
- `worker/dataset_builder.py` — generador sintético + real, obfuscación de
  6 capas, split temporal (15 tests).

### Fase 2 — Persistencia y API (siguiente)
- Migración `0011_ml_tournaments.sql` con RLS (`dataset_targets` solo
  service_role: si se filtra, el torneo muere).
- Subir parquet a Supabase Storage; guardar el holdout en `dataset_targets`.
- `GET  /tournament/{id}/dataset` → URLs + metadatos.
- `POST /tournament/{id}/predictions` → sube CSV, valida (columnas, nº filas,
  ids válidos, sin NaN, rango), con `replace` como ya hicimos en submit.
- `GET  /tournament/{id}/my-prediction` → estado y score propio.

### Fase 3 — Scoring automático (cron)
- Extender `scheduler.py`: crear ronda → generar dataset → evaluar la ronda
  cerrada → construir meta-modelo → repartir QP.
- Detección de plagio con `matriz_similitud` (ya implementada).
- **Cadencia rápida** (decisión de Emilio): rondas de 3-4 días con holdout
  corto, en vez del semanal + 4 semanas de Numerai.

### Fase 4 — Frontend
- `/app/tournaments/[id]`: pestaña **Datos** (descargar train/validation),
  **Enviar** (drag & drop del CSV con validación en cliente), **Ranking**
  (corr, FNC, consistencia).
- Notebook de ejemplo (`ejemplo_quantbattle.ipynb`) — clave para que alguien
  participe sin leer documentación.
- **Retirar el flujo de subir código** (decisión de Emilio).
- Etiquetar claramente qué torneos son sintéticos y cuáles con datos reales.

### Fase 5 — Formatos y engagement
Divisiones, rachas, badges, meta-modelo público, replay de ronda.


---

## 8. Decisiones tomadas

| Pregunta | Decisión de Emilio | Implicación |
|---|---|---|
| Activos | Máxima variedad; anonimato al 100% | Híbrido: sintético (anonimato por construcción) + real con universo grande |
| Tamaño | ~20 activos, "entre más mejor si es manejable" | **Corregido por evidencia**: 20 activos → 540 rondas para detectar señal. Sintético usa 600; el modo real necesita 250+ |
| Cadencia | Más rápida que Numerai | Rondas de 3-4 días, holdout corto |
| Torneo de código | Retirar | Se elimina en Fase 4 |

**Nota sobre el tamaño**: tu intuición de "más es mejor" era correcta, pero el
número inicial (20) resultó insuficiente por dos órdenes de magnitud. El
sintético lo resuelve gratis; el modo real exige descargar cientos de activos
(medido viable: ~17 min).


---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Fuga de `dataset_targets` | RLS service_role + nunca en ninguna respuesta de API |
| Render free tumba el cron | El scoring es liviano (correlaciones); el pesado lo hace el usuario |
| Nadie participa | Notebook de ejemplo + torneo relámpago de bajo compromiso |
| Storage de Supabase (límite free 1GB) | Parquet comprimido; purgar datasets viejos |
| Features con poca señal | Iterar; el PoC ya muestra correlación real |

## 10. Verificado antes de escribir este plan

- Dataset obfuscado generado con datos **reales** (BTC/ETH/SOL/AAPL/MSFT/NVDA):
  1 641 filas, 335 eras, 7 features, **cero fugas**.
- Scoring portado de `numerai-tools/scoring.py` y **diferenciado contra el
  fuente oficial ejecutando ambos**: `numerai_corr`, `neutralize` y FNC dan
  **delta 0.00e+00**. Tres bugs propios corregidos en el proceso (ver §3).
- FNC confirmada con código oficial: un modelo que solo replica un feature
  puntúa `+0.2607` en corr pero `-0.0410` en FNC.
- Meta-modelo **+0.2676** vs mejor individual **+0.2472**.
- Plagio detectado a `0.9991` de correlación.
- `scipy`, `pandas`, `pyarrow`, `sklearn` ya instalados: **0 dependencias nuevas**.
- Gotcha real encontrado: cripto viene tz-aware y acciones tz-naive →
  normalizar a UTC antes de concatenar (rompe con `TypeError` si no).

### Nota sobre la investigación

Los 3 subagentes despachados **murieron** (2 `interrupted` esperando respuesta
del modelo 340s/54s, 1 truncado por timeout de 90s) y sus resúmenes finales
llegaron vacíos. Pero habían recolectado el fuente de `numerai-tools` antes de
caer: lo recuperé de sus transcripciones (`live/deleg_*/task-N.log`) y de ahí
salió el scoring de §3. El brainstorming de §6 es propio.
Lección incorporada a la skill: en este tier, **el log del subagente es el
entregable**, no su resumen.



