# Generador diario de acciones — QuantBattle

Generación incremental compatible con `stocks-oc-v1.0.0`. Produce CSV como
descarga principal, Parquet equivalente, plantilla `id,prediction`, manifiesto,
informe de calidad y guía. Las 37 columnas son las cinco de identificación y
las mismas 32 variables del histórico. Nunca exporta el retorno futuro real.

## Estado de la implementación

El generador se puede ejecutar localmente con las claves de Alpaca ya guardadas.
Incluye un adaptador de almacenamiento privado y un workflow de GitHub Actions.
Activar ese workflow y conectar las descargas a la web son pasos de despliegue;
crear este código no los activa. Render no participa en la generación.

## Ejecutar localmente

Desde la raíz del repositorio:

```powershell
.\.venv-stocks\Scripts\python.exe -m worker.stocks_daily.run
```

Si falta el estado local, se inicializa desde el histórico existente en
`artifacts/stock-dataset-v1/`, incluyendo las sesiones normalizadas de `_internal`.
Ese bootstrap debe proceder de los archivos locales de confianza generados por
el proceso histórico; el ZIP público de siete archivos no contiene ese estado.
Las credenciales se leen del entorno o de `worker/credentials/.env`. Una pareja
incompleta de variables de entorno se rechaza, sin mezclarla con el archivo.

Salida:

```text
artifacts/stock-daily-v1/
  state.zip
  daily/<fecha-objetivo>/v1/
    live.csv
    live.parquet
    submission_template.csv
    manifest.json
    quality_report.json
    README.md
  _internal/runs/<fecha-observacion>-<identificador>/
    ...respuestas de Alpaca y recibos...
```

El estado privado conserva todo el historial normalizado, para mantener el RSI
recursivo y las ventanas largas. Se refrescan precios diarios, ajustes y eventos
desde 2016 (series pequeñas). El volumen intradiario y las subastas se descargan
sólo desde nueve sesiones anteriores al último checkpoint, hasta la observación
actual; los periodos más antiguos de volumen se conservan. No se vuelve a
descargar todo el histórico intradiario. Los cambios del proveedor fuera de esa
ventana de volumen requieren una auditoría/backfill explícitos.

Se aceptan hasta 20 sesiones pendientes por defecto (`--max-catchup` permite un
backfill mayor). No se rellena con ceros una fuente ausente, ni se cambia a IEX
si SIP falla. Se requiere SPY en la sesión observada y un mínimo de 40 acciones
habilitadas, configurable mediante `--min-assets`. Los eventos excluyen sólo
las acciones afectadas; cada archivo identifica su universo exacto.

La consulta de símbolos conserva la fecha de referencia del universo original
(2026-11-04). No se incorporan nuevos símbolos por reutilización de tickers sin
revisión. Se mantienen las limitaciones de selección/supervivencia del universo.

## Reconstrucción histórica

```powershell
.\.venv-stocks\Scripts\python.exe -m worker.stocks_daily.run --replay --observation-date 2026-10-29
```

Guarda el ejemplo en `replays/2026-10-30/v1/`, sin tocar el checkpoint ni consultar
Alpaca. Usa únicamente sesiones anteriores o iguales a la observación al
calcular las variables. La fuente sigue siendo una descarga histórica corregida,
no una prueba de qué versión de datos existía entonces. Un replay nunca se
puede publicar como una ronda prospectiva.

## Horarios y recuperación

- Calendario XNYS, zona `America/New_York`, incluidos festivos y cierres parciales.
- Observación por defecto: última sesión cerrada hace al menos 20 minutos.
- Objetivo: siguiente sesión del calendario; cierre de envíos a las 09:00 de NY.
- `--due-only` sólo abre rondas entre las 20:30 y las 22:00 de NY de la sesión
  observada. Evita abrir una ronda de madrugada con una ventana de envío menor.
  También omite rondas cuyo plazo de envío ya pasó.
- Una ejecución manual normal puede crear una revisión local antes de las
  20:30, siempre después de madurar los datos y antes del plazo de envío.
- El workflow intenta a las 20:37, 21:07 y 21:37 de NY, de lunes a viernes.
  GitHub puede retrasar u omitir ejecuciones; no es un servicio con hora exacta
  garantizada. Los intentos siguientes recuperan fallos transitorios.
- Una ronda existente se verifica y se reutiliza; no se regenera sobre ella.
- `--revision v2` crea una revisión explícita distinta. No modifica v1; no
  introducir cambios de versión a participantes sin una política anunciada.

## Preparar GitHub Actions + Supabase

1. Crear un bucket **privado** llamado `stock-datasets-private`, o indicar otro
   nombre con la variable `STOCK_DAILY_BUCKET`. El código rechaza buckets públicos.
2. Configurar como secretos de GitHub: `APCA_API_KEY_ID`, `APCA_API_SECRET_KEY`,
   `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Esta última sólo en procesos
   internos de confianza; nunca en navegador, CSV ni repositorio.
3. Desde la estación que contiene el histórico, configurar las credenciales
   Supabase en el entorno y sembrar el estado privado una sola vez:

```powershell
.\.venv-stocks\Scripts\python.exe -m worker.stocks_daily.run --seed-cloud
```

4. Subir el código al repositorio y habilitar `STOCK_DAILY_ENABLED=true` en sus
   variables. El workflow está apagado por defecto y sólo tiene disparadores
   de calendario y ejecución manual; no se ejecuta en pull requests.
5. Ejecutarlo manualmente durante la ventana válida y verificar los objetos
   privados y el registro de ejecución antes de integrar la entrega a usuarios.

No se necesitan Render ni un token personal de GitHub para este workflow.
El proyecto Supabase/bucket y sus secretos remotos no se crean ni verifican al
generar archivos localmente. El adaptador remoto debe comprobarse en el entorno
de despliegue antes de activar usuarios.

## Almacenamiento y publicación

`--cloud --due-only` restaura `state/latest.json`, comprueba el SHA-256 del estado,
genera y verifica los archivos y guarda fuentes/estados en rutas inmutables.
Las fuentes se conservan en ZIP privados sin cabeceras de autenticación.

Los archivos de entrega se suben a una ruta cuyo nombre incorpora la huella del
manifiesto. Un fallo a mitad de subida deja objetos incompletos sin anunciar.
Después de verificar la subida se crea el compromiso inmutable de la ronda:

```text
rounds/<fecha-objetivo>/v1.json
```

Sólo entonces se actualiza `daily/latest.json`. Los consumidores deben descubrir
las rondas mediante esos compromisos; no mediante listados de carpetas. Una
repetición respeta el compromiso existente y comprueba sus archivos. Se impide
anunciar una ronda después del plazo o retroceder el puntero a una fecha anterior.

El workflow admite **un solo escritor** mediante su grupo de concurrencia.
Además se comprueba que el puntero de estado no haya cambiado antes de
reemplazarlo. Esa comprobación no es una transacción distribuida/CAS del servicio:
no ejecutar dos escritores por otros mecanismos al mismo tiempo.

El backend registra cada compromiso en `stock_return_rounds`. Render ofrece
`GET /ml/stock-rounds` y, para cada ID, `download/{filename}`, `mine`,
`POST predictions` (cuerpo CSV UTF-8) y `results`. Todas estas rutas requieren
la sesión del participante. Las descargas usan enlaces privados de cinco minutos.
Nunca se entrega el ZIP de estado ni las credenciales administrativas.

La última predicción válida sustituye la anterior en una transacción; se admiten
50 intentos por ronda, todos antes de las 09:00 de Nueva York. Se verifica la
hora de pared después del bloqueo de base de datos, incluida una carga iniciada
antes del cierre. El CSV exige todos los IDs y retornos decimales entre -1 y 10.

`python -m worker.stocks_daily.tournament` liquida las rondas cuyo cierre ocurrió
hace al menos 30 minutos. Congela una copia privada de las velas diarias SIP sin
ajustar, calcula `close/open - 1`, MAE y puntuación frente a predecir cero:
`(MAE_zero - MAE_model) / max(MAE_zero, 0.005)`. No elimina activos que falten;
reintenta la ronda completa. Los reintentos usan la misma copia de precios.
Publica resultados únicamente después de evaluar todos los CSV seleccionados.
Esto evalúa predicciones; no envía órdenes a un bróker ni acredita rentabilidad.

La pantalla existente de torneos de cripto mantiene su contrato. El consumidor
del nuevo torneo de acciones debe utilizar estas rutas específicas.

Los estados y fuentes privados se acumulan para auditoría. El piloto debe medir
almacenamiento y transferencia y definir retención antes de crecer; no se afirma
coste cero ilimitado ni se eliminan automáticamente evidencias. Siguen pendientes
los permisos aplicables de redistribución y uso comercial del proveedor.

## Pruebas

```powershell
.\.venv-stocks\Scripts\python.exe -m pytest worker/stocks_history/test_pipeline.py worker/stocks_daily/test_daily.py worker/stocks_daily/test_tournament.py -q
```

Cubren causalidad, equivalencia CSV/Parquet, compatibilidad exacta con el
histórico local cuando está disponible, calendario/DST, ventanas corporativas,
calidad mínima, recuperación del estado, inmutabilidad, paginación defectuosa,
actualización incremental y ausencia de anuncios tras fallos o al cruzar el plazo.
Las pruebas remotas de publicación usan un almacenamiento simulado.

Referencias oficiales:
- https://docs.alpaca.markets/us/reference/stockbars
- https://docs.alpaca.markets/us/reference/stockauctions-1
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- https://supabase.com/docs/guides/storage/buckets/fundamentals
