# Torneos de predicción ML de QuantLab

## Qué recibe cada participante

Cada ronda publica tres archivos Parquet con IDs de fila y variables `feature_XX`:

| Archivo | `target` | Uso |
| --- | --- | --- |
| `train.parquet` | Sí | Entrenar |
| `validation.parquet` | Sí | Comparar modelos sin tocar la competición |
| `live.parquet` | No | Producir un CSV `id,prediction` |

`live` es el nombre del archivo en el protocolo, no una afirmación de que toda
ronda sea prospectiva. La propiedad `round_type` distingue `practice` (datos
sintéticos), `historical` (mercado pasado) y `prospective` (mercado futuro).
No se publican símbolos, fechas exactas ni precios en los archivos del torneo.
Las transformaciones son **ofuscación**, no cifrado ni garantía de anonimato.

## Reglas de una ronda v1

- El CSV tiene exactamente las columnas `id,prediction`, codificación UTF-8,
  un ID por fila y **todos** los IDs de `live.parquet`.
- `prediction` es un número finito entre 0 y 1. Cada era debe tener variación.
- La validación solo comprueba datos públicos. Devuelve hora, versión del
  dataset y SHA-256 del archivo; no calcula ni muestra score antes del cierre.
- Se conservan todos los intentos y solo el último **válido** anterior al
  cierre queda seleccionado. El RPC de la migración 0029 confirma esta
  selección de forma atómica con el estado de la ronda.
- Tras cerrar, `spearman_era_v1` calcula Spearman entre predicción y target
  por era. El score oficial es la media aritmética de esas correlaciones.
  El orden del CSV no importa. La desviación por era es diagnóstica.
- El resultado final muestra dos referencias reproducibles: predicciones
  seudoaleatorias derivadas de la versión e ID, y la primera variable pública
  (`feature_01`) usada directamente como predicción. No compiten por premios.
- Práctica e histórico no reparten QP. Una ronda prospectiva puede repartir
  un fondo virtual configurado en `tournaments.prize_pool_qp`. El RPC
  `award_ml_qp_once` evita créditos duplicados tras un reintento.

## Cómo se crea el dataset

El worker usa datos sintéticos de `dataset_builder.py` o precios diarios de
Yahoo Finance a través de `data_feed.py`. Para acciones y ETF usa `Adj Close`
cuando está disponible. El target real es el retorno relativo a cinco fechas
de negociación posteriores, discretizado por rango transversal en cinco
niveles. Entrenamiento y validación se separan por fecha y se purgan cinco
eras en la frontera. El constructor rechaza una ronda si una era tiene menos
de 30 activos, hay IDs repetidos, valores no finitos o targets constantes.

Una ronda **histórica** reserva varias eras pasadas como holdout. Sirve para
probar el flujo y comparar modelos, pero no prueba rendimiento prospectivo:
los precios originales son públicos y la ofuscación puede ser vulnerable a
reconstrucción. Una ronda **prospectiva** publica la última fecha común con
características calculadas hasta ese momento. El mapeo de IDs a activos y el
precio base se guarda en `tournament-targets` (privado). Una tarea posterior
espera cinco fechas de negociación completas para todo el universo, verifica
que el precio base no haya sido revisado y entonces sella el target. Solo
después del cierre y de esa maduración se puntúa.

Los tres archivos públicos, el mapeo y el holdout privado tienen hashes. La
versión de ronda incluye los hashes del material disponible al publicarse.
El target prospectivo tiene una huella adicional cuando madura. Mantener los
Parquet y los metadatos permite repetir el cálculo del score.

## Despliegue

1. Aplicar `supabase/migrations/0029_ml_round_integrity.sql` después de
   `0028_onboarding_activation.sql`. La migración crea buckets privados,
   columnas, políticas y los RPC necesarios. **Desplegarla antes del worker**.
2. Configurar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `DATASET_SALT`
   tanto en el worker como en GitHub Actions. Usar el mismo salt en ambos.
   Los buckets nuevos tienen valores por defecto `submissions` y
   `tournament-targets`; nunca configurarlos igual que `tournament-datasets`.
3. Desplegar el worker y la web. `scheduler.yml` ejecuta diariamente las
   modalidades `practice`, `historical` y `prospective` en trabajos separados,
   madura los objetivos pendientes y llama a
   `/scheduler/evaluate?sync=true` para que el código de salida refleje la
   evaluación terminada.
4. Configurar el secreto de Actions `ML_REAL_UNIVERSE` como
   `stock:AAPL,stock:MSFT,...` con **al menos 30 símbolos distintos** que
   superen el control de calidad. Lanzar `workflow_dispatch` y descargar los
   tres archivos publicados para comprobarlos. El histórico se publica una
   vez cada siete días; práctica tiene su propia cadencia semanal.
5. El prospectivo v1 admite solo acciones/ETF diarios. Publica los domingos
   a las 06:00 UTC y cierra a las
   06:00 UTC del lunes, antes de la sesión estadounidense. La tarea diaria
   intenta madurar el objetivo hasta que existan cinco fechas completas.

No convertir un torneo histórico ya publicado a prospectivo ni recalcular
premios con otra versión de métrica. Los datos previos a 0029 son de solo
lectura en la nueva interfaz de envíos.

## Verificación local

```powershell
& 'worker/.venv/Scripts/python.exe' -m pytest worker/tests -q
cd web
npx tsc --noEmit
```

La prueba de integración genera una ronda, comprueba que el público no recibe
el target, envía dos CSV, confirma que no hay score durante la apertura, cierra
la ronda y verifica que solo se puntúa el último válido. Otra prueba simula
precios diarios y comprueba que el objetivo prospectivo aparece solo después
de la quinta fecha completa.

## Límites para el informe de investigación

Un score positivo en una ronda no demuestra rentabilidad de trading. El
protocolo mide capacidad de ordenar retornos entre activos; no modela
costos, ejecución ni gestión de cartera. La validación histórica se puede
sobreajustar y las rondas cercanas pueden compartir condiciones de mercado.
Informar número de eras, activos, score por era, dispersión y resultados de
referencia antes de hablar de generalización. No afirmar usuarios reales ni
rendimiento prospectivo hasta contar con esos datos.
