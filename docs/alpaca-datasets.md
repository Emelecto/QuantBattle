# Histórico y rondas diarias de Alpaca

El catálogo activo es exclusivamente de acciones de Alpaca SIP. No se convierten ni se reetiquetan los datasets anteriores de Binance. Los registros históricos de ese protocolo permanecen en almacenamiento; sus páginas antiguas redirigen a Torneos y las APIs antiguas de la biblioteca responden 410.

## Histórico

Fuente única del catálogo: `web/src/data/stock-history-v1.json`, versión `stocks-oc-v1.0.0`. La web y el MCP importan el mismo catálogo, enlaces de la release y SHA-256 de bytes:

- `train.parquet`: 83.563 filas, objetivos 2017-01-04 a 2023-12-29.
- `validation.parquet`: 34.962 filas, objetivos 2024-01-02 a 2026-10-30.
- 50 acciones, 32 variables. Objetivo fraccional de apertura a cierre de la sesión siguiente.
- ZIP opcional con ambos archivos y documentación. No hace falta descargar train/validation por ronda.

## Datos diarios

La web consulta `GET /ml/stock-rounds` con sesión. Sólo muestra filas realmente publicadas en `stock_return_rounds`; si no hay ninguna, muestra un estado vacío. Cada ronda ofrece live CSV o Parquet (alternativas), plantilla, README, manifest y quality_report. Las descargas usan enlaces temporales y se comprueban contra el SHA-256 de los bytes antes de guardarse.

Los cierres se muestran en hora de Colombia; el objetivo es una sesión del mercado estadounidense. Estado open con plazo vencido se trata como cerrado. Sólo el último CSV válido antes del cierre queda seleccionado. Los comprobantes son privados por usuario y el servidor valida cobertura, tamaño y plazo. Los resultados requieren cierre y verificación.

El proceso `stock-daily-datasets.yml` genera y registra las rondas, activado con `STOCK_DAILY_ENABLED=true`; no genera una ronda abierta cuando no corresponde a la ventana de publicación. Consultar `worker/stocks_daily/README.md` para operación y recuperación. No registrar replay ni sesiones con plazo pasado como nuevas rondas.

## MCP 4.0

Tras actualizar, refrescar el catálogo de herramientas o reconectar el agente para abandonar herramientas antiguas en caché. OAuth y el endpoint no cambian.

- `get_historical_dataset_download`: catálogo completo o un archivo histórico, con checksum de bytes.
- `list_ml_tournaments`: rondas diarias; por defecto sólo acepta rondas con plazo vigente. `include_closed=true` incluye las anteriores.
- `get_stock_round`, `get_daily_dataset_download`: detalle y archivos de una ronda.
- `validate_stock_prediction_csv`: comprueba plantilla con hash e IDs, sin enviar.
- `submit_stock_predictions`, `get_my_stock_submissions`, `get_stock_results`: participación y comprobantes privados.
- `get_connection_status`: verifica identidad sin depender del worker.

El endpoint `/public` sólo ofrece histórico y orientación para autorizar el catálogo diario. Nunca simula un calendario vacío como una consulta autenticada. Todas las herramientas de protocolos anteriores se retiran: no hay alias que puedan devolver Binance.

## Verificación

`deno test --allow-env --allow-net supabase/functions/quantbattle-mcp/index_test.ts` cubre autenticación, catálogo Alpaca, ausencia de herramientas anteriores, cierres e integridad antes de envíos. `web/e2e/stock-datasets.spec.ts` cubre documentación, endpoints retirados y, con cuenta desechable QB_TEST_EMAIL/QB_TEST_PASSWORD, histórico, estado vacío, redirecciones, descarga íntegra y rechazada, envío y comprobante. No se omite la protección del dashboard para ejecutar pruebas.
