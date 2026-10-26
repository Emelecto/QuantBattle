# Torneos de predicción ML de QuantLab

Este documento describe el protocolo anterior Spearman, incluida la práctica sintética. El nuevo torneo semanal de cuatro rondas con retornos reales tiene [su propio protocolo](daily-return-tournaments.md), calendario y puntuación; no usa el objetivo antiguo a cinco días.

## Qué recibe cada participante

Cada ronda publica tres archivos Parquet con IDs de fila y variables `feature_XX`:

| Archivo | `target` | Uso |
| --- | --- | --- |
| `train.parquet` | Sí | Entrenar el modelo |
| `validation.parquet` | Sí | Comparar modelos fuera del holdout |
| `live.parquet` | No | Producir un CSV `id,prediction` |

`round_type` identifica una ronda `practice` (datos sintéticos), `historical`
(mercado pasado) o `prospective` (evaluación futura). No se publican símbolos,
fechas exactas ni precios. Las transformaciones son ofuscación: no son cifrado
ni una garantía de anonimato, en especial porque las fuentes son públicas.

## Fuente y licencia de datos reales

**Estado de la entrega del semillero:** se publican rondas de práctica con
datos sintéticos. GitHub Actions usa solo `practice` por defecto. Las rondas
reales requieren `ML_REAL_ROUNDS_APPROVED=true` en la configuración del
generador/worker y la variable de repositorio del mismo nombre en GitHub.
No activar ese permiso sin resolver las condiciones de distribución.

Las rondas reales usan velas diarias spot de pares cripto cotizados en USDT,
descargadas del endpoint público de [Binance Vision](https://data-api.binance.vision/api/v3/klines).
El universo inicial está en `worker/generate_dataset_github.py`; el secreto
opcional `ML_REAL_UNIVERSE` permite reemplazarlo con al menos 30 entradas como
`crypto:BTCUSDT,crypto:ETHUSDT,...`. Antes de generar una ronda, el worker
conserva únicamente pares USDT spot que Binance reporte como activos.

Binance publica estos datos y sus derivados bajo
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), con las
condiciones adicionales de los
[términos de Binance Public Data](https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md).
QuantLab atribuye los datos a Binance Vision y declara esa licencia en los
metadatos de cada dataset real. Los archivos derivados deben conservar la misma
licencia y se ofrecen solo para investigación y educación no comercial. Por
esta razón, los torneos ML no distribuyen QP ni premios; el worker también
bloquea los créditos aunque una ronda antigua tenga un fondo distinto de cero.
Si QuantLab se monetiza o distribuye señales con compensación, esta fuente no
debe seguir utilizándose sin permiso escrito de Binance.

La cláusula 4.3 también restringe alojar datasets o feeds históricos derivados,
mientras la 4.5 contempla obras derivadas redistribuidas. Publicar Parquet de
features requiere aclarar esa aparente incompatibilidad; declarar atribución y
CC BY-NC-SA por sí solo no resuelve el permiso para este uso concreto.

No se necesita API key de Binance. El worker consulta `exchangeInfo` para
filtrar pares activos y usa el endpoint público de velas. Las velas de la ronda
son diarias en UTC y se descarta la vela que todavía está abierta. La caché
privada separa los datos de Binance Vision de los de otros proveedores para
evitar mezclar series.

## Protocolo de predicciones

- El CSV debe tener exactamente las columnas `id,prediction`, codificación
  UTF-8, un ID único por fila y todos los IDs de `live.parquet`.
- `prediction` debe ser un número finito entre 0 y 1, con variación dentro de
  cada era.
- La validación comprueba el archivo, su versión y su SHA-256. No calcula ni
  revela puntuaciones antes del cierre.
- Se guardan los intentos y solo el último envío válido antes del cierre queda
  seleccionado. La base de datos confirma la selección junto con el estado de
  la ronda.
- Tras el cierre, `spearman_era_v1` calcula Spearman entre predicción y target
  en cada era. La puntuación oficial es la media de esas correlaciones. No es
  una métrica de rentabilidad ni incluye costos de trading.
- El resultado final muestra referencias reproducibles: una predicción
  seudoaleatoria derivada de la versión e ID y la primera variable pública
  usada directamente como predicción.
- Las rondas ML no tienen premios QP.

## Construcción del dataset

El constructor crea variables de retornos, volatilidad, RSI, distancia a medias
móviles y volumen relativo a partir de `close` y `volume`. Para datos reales, el
target se calcula como el retorno a cinco velas diarias y se discretiza en cinco
niveles por rango transversal. Entrenamiento y validación se separan en orden
temporal y se purgan cinco eras en la frontera. Una ronda se rechaza si no
mantiene al menos 30 activos por era, tiene valores no finitos, IDs repetidos o
targets constantes.

Una ronda **histórica** separa eras pasadas para evaluar el flujo y comparar
modelos. Como los precios originales son públicos, no debe presentarse como una
prueba prospectiva ni como protección criptográfica contra reconstrucción.

Una ronda **prospectiva** publica las features de la última vela diaria común
cerrada. Los participantes tienen 24 horas para enviar predicciones. El precio
base se fija en el primer cierre diario común posterior a ese plazo; la etiqueta
se calcula con el quinto cierre diario que le sigue. El mapeo privado de IDs a
pares y el precio de la última vela publicada se usan para verificar la serie,
pero el holdout permanece privado. La etiqueta no se escribe ni se puntúa hasta
que ese horizonte haya madurado.

Los tres Parquet públicos y los artefactos privados tienen hashes. La versión
de ronda incluye los hashes de los archivos publicados, la fuente y la licencia.
El holdout prospectivo obtiene otro hash al madurar. Conservar los archivos y
metadatos permite repetir la puntuación.

## Despliegue

1. Aplicar `supabase/migrations/0029_ml_round_integrity.sql` después de
   `0028_onboarding_activation.sql`. La migración crea buckets privados,
   columnas, políticas y RPC. Desplegarla antes del worker.
2. Configurar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `DATASET_SALT` tanto
   en el worker como en GitHub Actions. Usar el mismo salt en ambos. Los buckets
   de envíos y targets deben seguir siendo privados y distintos del bucket
   público `tournament-datasets`.
3. Desplegar worker y web. `scheduler.yml` revisa diariamente `practice`.
   Si se aprueban explícitamente las rondas reales, también revisa `historical`
   y `prospective`: práctica e histórico publican como máximo cada siete días,
   y el prospectivo solo se intenta los domingos UTC.
   Las rondas pendientes maduran diariamente y el worker puntúa después.
4. `ML_REAL_UNIVERSE` es opcional. Si está vacío, se usa el universo inicial
   integrado en el generador. Si se define, debe contener al menos 30 pares en
   formato `crypto:BTCUSDT,crypto:ETHUSDT,...`; los valores anteriores de
   acciones/ETF deben eliminarse o sustituirse.
5. Lanzar `workflow_dispatch` y verificar los tres archivos publicados, los
   metadatos `data_source` y `data_license` en la API de listado/descarga y la
   atribución visible en la web.

No convertir una ronda histórica publicada a prospectiva ni recalcular premios
con otra versión de métrica. Los datos previos a la migración 0029 son de solo
lectura en la interfaz actual.

## Verificación local

```powershell
& 'worker/.venv/Scripts/python.exe' -m pytest worker/tests -q
cd web
npx tsc --noEmit
```

Las pruebas verifican que el feed solicita el endpoint de Binance Vision, no
mezcla su caché con la de otros proveedores y descarta velas abiertas. Las
pruebas del protocolo comprueban que una ronda prospectiva no se resuelva antes
de cinco cierres posteriores al precio base, que ocurre después de la fecha
límite de envío.

## Límites para el informe de investigación

Un score positivo no demuestra rentabilidad ni generalización. El protocolo
mide la capacidad de ordenar retornos relativos entre activos; no modela
ejecución, costos ni gestión de cartera. La validación histórica puede
sobreajustarse y rondas cercanas pueden compartir condiciones de mercado.
Informar activos, eras, score por era, dispersión y referencias antes de hablar
de rendimiento. No afirmar que hay usuarios reales ni resultados prospectivos
hasta contar con esos datos.
