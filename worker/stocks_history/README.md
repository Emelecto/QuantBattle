# Generador histórico de acciones de QuantBattle

Este módulo construye el histórico de acciones separado del worker y del torneo
cripto existente. No contiene rutas de trading ni publica archivos en servicios
externos.

## Ejecutar desde la raíz

```powershell
python -m venv .venv-stocks
.\.venv-stocks\Scripts\python.exe -m pip install -r worker/requirements-stocks.txt
.\.venv-stocks\Scripts\python.exe -m worker.stocks_history.build
```

Credenciales locales: `worker/credentials/.env`, con `APCA_API_KEY_ID` y
`APCA_API_SECRET_KEY`. El archivo está ignorado por Git. Nunca registrar valores
ni copiar el archivo al paquete de entrega.

La configuración fija 50 acciones, SPY como contexto, fechas fuente
2016-01-04 a 2026-10-30, primer objetivo 2017-01-04, entrenamiento hasta
2023-12-29 y validación desde 2024-01-02. Fuente SIP; ningún fallback a IEX/Yahoo.

El resultado se guarda en `artifacts/stock-dataset-v1/`, también ignorado por Git.
El ZIP contiene los siete archivos de entrega; `_internal/` conserva las
respuestas originales comprimidas, recibos, calendario y sesiones para auditoría
local. La descarga puede reanudarse verificando hashes y parámetros de cada
página almacenada. No borrar cachés válidas para volver a ejecutar el cálculo.

Para reconstruir sólo desde una descarga completa:

```powershell
.\.venv-stocks\Scripts\python.exe -m worker.stocks_history.build --from-cache
```

## Convenciones importantes

- Fechas según calendario XNYS en America/New_York, incluidos cierres abreviados.
- OHLC de velas diarias del proveedor; no se afirma equivalencia a subastas/fills.
- Volumen como suma intradiaria de intervalos de 30 minutos en sesión regular
  más operaciones de cierre (condición 6) reportadas al cierre o después. No
  duplicar referencias de cierre (M) ni operaciones ya incluidas antes del
  cierre; excluir volumen sin evidencia de subasta. No confundir con el
  volumen total de la vela diaria del proveedor.
- Precios originales escalados con factores de ajuste por splits inferidos del
  volumen ajustado. No usar directamente precios ajustados redondeados a centavos.
- Las distribuciones corporativas históricas pueden estar codificadas en los
  ajustes heredados del proveedor. Revisar eventos, fuentes y cuarentenas.
- Ningún relleno de huecos, clipping automático, normalizador aprendido ni
  redondeo de objetivos. Retornos decimales, características float64.
- Separación por fecha objetivo; las ventanas solapadas de información pasada
  entre fechas consecutivas son normales y no implican etiquetas futuras.
- Universo fijo con sesgo de supervivencia; sin certificación de vintages
  históricos ni reconciliación con un segundo proveedor.
- Generar localmente no verifica derechos de redistribución o uso comercial.

## Verificación

```powershell
.\.venv-stocks\Scripts\python.exe -m pytest worker/stocks_history/test_pipeline.py -q
```

Las pruebas cubren causalidad de las variables, invariancia ante cambio de
unidades por split, etiquetas de la siguiente sesión sin saltar huecos,
particiones temporales, cierres anticipados, RSI de Wilder, reinicio por eventos
y cuarentenas. Al generar también se verifican integridad de los datos,
etiquetas contra el origen y lectura posterior de los Parquet.
