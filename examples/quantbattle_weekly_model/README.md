# Modelo listo para el torneo semanal de QuantBattle

Para las tres implementaciones adicionales sin entrenar (Random Forest, SVR RBF aproximada y MLP), consulta [TRES_MODELOS.md](TRES_MODELOS.md). Su ejecución requiere un comando explícito independiente; este script conserva su conjunto original de candidatos.

Este script entrena un baseline tabular para `daily_return_mae_v1` y produce el CSV `id,prediction` que se sube a una ronda.

Compara tres alternativas predefinidas: predicción cero, Ridge con estandarización y HistGradientBoostingRegressor con árboles pequeños y pérdida absoluta (mediana condicional, acorde con MAE). Escoge por MAE en `validation`; en empate mantiene cero. Además, siempre entrena y guarda el mejor modelo aprendido con `train + validation` y genera sus predicciones en un CSV separado. El preprocesamiento de la comparación se ajusta exclusivamente con train.

Es un modelo tabular para features anónimas discretizadas. No usa `id` ni `era` como predictores. Las eras públicas están permutadas: ordenarlas alfabéticamente no permite reconstruir una validación temporal. Se respeta la separación train/validation del organizador. El rendimiento de validation es una medida de desarrollo porque ya se ha usado para seleccionar; hace falta una ronda prospectiva para evaluar generalización nueva.

## 1. Preparar archivos

Descarga los tres archivos desde **la misma ronda y versión** de QuantBattle y colócalos en una carpeta:

```text
datos-ronda/
  train.parquet
  validation.parquet
  live.parquet
```

## 2. Instalar dependencias

Python 3.11 (versión usada en el entrenamiento reproducible):

```powershell
py -m pip install -r examples/quantbattle_weekly_model/requirements.txt
```

## 3. Entrenar y generar el envío

Desde la raíz del repositorio, puedes indicar la carpeta:

```powershell
py examples/quantbattle_weekly_model/quantbattle_model.py --data-dir "C:\ruta\a\datos-ronda" --output "predicciones_retornos.csv"
```

O indicar las rutas directas a los tres archivos:

```powershell
py examples/quantbattle_weekly_model/quantbattle_model.py --train-path "C:\ruta\train.parquet" --validation-path "C:\ruta\validation.parquet" --live-path "C:\ruta\live.parquet" --output "predicciones_retornos.csv"
```

El script crea cuatro archivos:

- `predicciones_retornos.csv`: el archivo `id,prediction` para subir a la misma ronda.
- `predicciones_retornos.report.json`: modelo elegido, MAE/score de validation, filas, features y rango de predicciones.
- `predicciones_retornos.ml.csv`: predicciones del mejor modelo aprendido, incluso si cero tuvo mejor MAE. El reporte indica si este modelo superó cero.
- `predicciones_retornos.model.joblib`: modelo aprendido con preprocesamiento, features y huella de live para reproducir su salida.

Para repetir las predicciones del modelo guardado:

```powershell
py examples/quantbattle_weekly_model/quantbattle_model.py --model-file "predicciones_retornos.model.joblib" --live-path "C:\ruta\live.parquet" --output "reproduccion_ml.csv"
```

Usa únicamente archivos joblib generados por este script y de confianza: cargarlos puede ejecutar código. Se exige la misma versión de scikit-learn del entrenamiento y el mismo live. Las transformaciones de features cambian por ronda: para una ronda nueva vuelve a entrenar con sus tres Parquet. Si el organizador renombra los archivos, las opciones de rutas directas admiten esos nombres.

En este proyecto también puedes ejecutar el script con `worker/.venv/Scripts/python.exe`, cuyo entorno se usó para el entrenamiento registrado. Las versiones reproducibles están en `requirements.txt` y en cada reporte.

Pruebas de integridad y reproducción:

```powershell
py -m unittest discover -s examples/quantbattle_weekly_model -p "test_*.py"
```

Revisa el reporte y abre el CSV antes de subirlo. La carpeta de datos debe contener exactamente los Parquet de una sola ronda, porque los IDs de live solo son válidos para esa versión.

## Qué significa el resultado

- Los retornos se expresan como fracciones: `0.025` significa `+2,5 %`; `-0.02` significa `-2 %`.
- El reporte de validation usa etiquetas históricas redondeadas; el torneo evalúa los retornos futuros sin ese redondeo.
- Un score de validation mayor que cero no garantiza ganar una ronda futura. Conserva el reporte, el CSV y el comprobante de QuantBattle para poder reproducir el envío.
- El modelo es un punto de partida documentado y acotado, no una promesa de rentabilidad o ventaja.

Datos de Binance Vision y derivados según las condiciones y licencia declaradas por QuantBattle: investigación y educación no comercial.
