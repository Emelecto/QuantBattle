# Tres modelos adicionales para QuantBattle

Revisión de fuentes e implementación: 28 de octubre de 2026. **Son recetas sin entrenar en datos de torneo.** No se usaron los Parquet de la ronda actual y no hay resultados reales ni predicciones nuevas de esa ronda.

Las tres familias difieren de Ridge y del boosting secuencial que ya preparamos. Son adaptaciones de métodos publicados al formato tabular `daily_return_mae_v1`, no reproducciones exactas de los experimentos de sus artículos. Los parámetros son decisiones iniciales de ingeniería: no se optimizaron sobre tus archivos.

## 1. Random Forest con error absoluto

Implementación: `--model random_forest`.

Construye 200 árboles sobre muestras bootstrap y promedia sus predicciones. Cada árbol aprende de forma independiente; en HistGradientBoosting los árboles se agregan secuencialmente para corregir errores. Usamos `criterion="absolute_error"`, por lo que cada árbol busca divisiones de error absoluto y predice medianas en sus hojas. El bosque promedia esas medianas: no equivale a una mediana conjunta ni a un bosque de cuantiles.

Configuración inicial: 200 árboles, profundidad máxima 6, al menos 40 ejemplos por hoja, 75 % de variables consideradas por división, bootstrap con 80 % de las filas, dos procesos y semilla 20261028. Se usan las ocho features sin escalarlas. Esa capacidad limitada busca evitar hojas que memoricen casos aislados; no garantiza evitar el sobreajuste.

Breiman presenta el método y su extensión a regresión en [Random Forests (2001)](https://www.stat.berkeley.edu/~breiman/randomforest2001.pdf). Gu, Kelly y Xiu comparan bosques y otros métodos en retornos de acciones y encuentran valor en relaciones no lineales; véase [Empirical Asset Pricing via Machine Learning](https://doi.org/10.1093/rfs/hhaa009). Sus datos, horizonte y evaluación difieren de los retornos diarios de cripto de QuantBattle.

Riesgos: los árboles correlacionados reducen la diversificación del bosque; las features discretizadas pueden limitar la información disponible. El criterio absoluto puede hacer más lento el entrenamiento que el criterio cuadrático.

## 2. SVR no lineal con kernel RBF aproximado

Implementación: `--model rbf_svr`.

Transforma las features estandarizadas mediante una aproximación Nyström del kernel RBF y ajusta `LinearSVR` en ese espacio. Aunque el último paso es lineal, la relación con las ocho entradas originales es no lineal. Es una aproximación de una SVR con kernel, no el mismo algoritmo numérico que una SVR RBF exacta.

La pérdida epsilon-insensitive ignora errores dentro de un margen pequeño y penaliza linealmente lo que queda fuera, junto con regularización. Configuración: 128 componentes Nyström, gamma 0.1, C 0.1, epsilon 0.05, máximo 10.000 iteraciones y semilla 20261028. Requiere al menos 128 filas de train. Estandarizamos tanto X como y exclusivamente con el conjunto usado en cada ajuste; epsilon 0.05 está expresado en desviaciones estándar del target, no en retornos del 5 %. La transformación inversa devuelve predicciones en retornos decimales.

Base metodológica: Smola y Schölkopf, [A Tutorial on Support Vector Regression (2004)](https://alex.smola.org/papers/2004/SmoSch04.pdf). La reducción del coste mediante una base más pequeña se apoya en Williams y Seeger, [Using the Nyström Method to Speed Up Kernel Machines](https://proceedings.neurips.cc/paper/2000/file/19de10adbaa1b2ee13f77f679fa1483a-Paper.pdf). Estos trabajos sustentan el método, no una ventaja demostrada en los torneos de QuantBattle.

Riesgos: gamma y C influyen en suavidad y ajuste; 128 componentes sacrifican fidelidad al kernel exacto. La estandarización puede verse afectada por extremos del target. El reporte conserva advertencias de convergencia en lugar de ocultarlas.

## 3. MLP pequeña de dos capas ocultas

Implementación: `--model mlp`.

Una red de 32 y 16 neuronas con activación ReLU aprende combinaciones no lineales de las ocho variables. Usa Adam, penalización L2 (`alpha=0.01`), lotes de 128 ejemplos, tasa inicial 0.001 y un máximo de 300 épocas. X e y se estandarizan dentro del ajuste y la salida vuelve a su escala decimal original.

Se usa pérdida cuadrática, no MAE, porque esta implementación de MLPRegressor se configura con `squared_error`. La comparación externa siempre usa MAE, igual que el torneo. `early_stopping=False` evita crear una partición interna aleatoria para validar; puede parar por estabilización de la pérdida de entrenamiento (`tol=0.0001`, 20 épocas sin mejora). Mezclar mini-lotes de train no mueve observaciones de validation al entrenamiento ni sustituye el corte temporal oficial.

Gu, Kelly y Xiu encuentran resultados favorables para redes relativamente poco profundas en su [estudio de retornos de acciones](https://doi.org/10.1093/rfs/hhaa009). Nuestra red de dos capas es una adaptación compacta; no replica su arquitectura NN3, datos ni resultados. No hay evidencia aún de que supere cero con QuantBattle.

Riesgos: sensibilidad a inicialización y escalas, pérdida cuadrática influida por valores extremos, y posible sobreajuste. Solo hay una semilla predefinida; no se selecciona la mejor entre múltiples semillas.

## Flujo común

1. Leer train, validation y live de una misma ronda y comprobar columnas, finitud, IDs disjuntos y separación de eras.
2. Entrenar el modelo elegido y sus escaladores solo con train.
3. Medir su MAE en validation y compararlo con cero mediante el score oficial con suelo 0.005.
4. Crear un modelo nuevo y ajustarlo con train + validation para producir live.
5. Guardar CSV `id,prediction`, modelo `.model.joblib` y reporte `.report.json` con parámetros, fuentes, versiones, advertencias y hashes.

El CSV siempre corresponde al modelo elegido. **No se sustituye automáticamente por cero** cuando pierde la comparación: revisa `beats_zero` y `validation_score_vs_zero` en el reporte antes de decidir un envío. La métrica de validation corresponde al primer ajuste; no demuestra rendimiento independiente del modelo final reentrenado.

Solo se utilizan columnas `feature_XX`. `id` y `era` nunca entran como predictores. El modelo no recibe el target de live. Las features cambian de transformación por ronda, de modo que siempre hay que reentrenar. La inferencia con un archivo guardado exige el mismo live y la misma versión de scikit-learn.

## Uso posterior

Desde la raíz del repositorio, con Python 3.11:

```powershell
py -3.11 -m pip install -r examples/quantbattle_weekly_model/requirements.txt
py -3.11 examples/quantbattle_weekly_model/three_models.py describe
```

`describe` imprime las recetas sin abrir Parquet ni entrenar. Los siguientes comandos sí entrenan, únicamente cuando decidas ejecutarlos con datos de una ronda:

```powershell
py -3.11 examples/quantbattle_weekly_model/three_models.py train --model random_forest --data-dir "C:\ruta\ronda" --output "salidas/random_forest.csv"
py -3.11 examples/quantbattle_weekly_model/three_models.py train --model rbf_svr --data-dir "C:\ruta\ronda" --output "salidas/rbf_svr.csv"
py -3.11 examples/quantbattle_weekly_model/three_models.py train --model mlp --data-dir "C:\ruta\ronda" --output "salidas/mlp.csv"
```

La carpeta contiene `train.parquet`, `validation.parquet` y `live.parquet`. Para nombres diferentes, reemplaza `--data-dir` por `--train-path`, `--validation-path` y `--live-path`. Para reproducir un CSV ya entrenado:

```powershell
py -3.11 examples/quantbattle_weekly_model/three_models.py predict --model-file "salidas/mlp.model.joblib" --live-path "C:\ruta\ronda\live.parquet" --output "salidas/mlp_reproducido.csv"
```

Carga únicamente modelos joblib propios o de confianza, porque su carga puede ejecutar código.

En el ZIP, los archivos están en la raíz. Tras extraerlo, usa `three_models.py` y `requirements.txt` directamente en lugar de los prefijos `examples/quantbattle_weekly_model/` de los ejemplos.

## Comprobación sin usar la predicción actual

```powershell
py -3.11 -m unittest discover -s examples/quantbattle_weekly_model -p "test_three_models.py" -v
```

Estas pruebas crean datos artificiales en una carpeta temporal, comprueban los tres ciclos de entrenamiento y reproducción, las columnas y los límites de los CSV. No evalúan rendimiento financiero ni usan los Parquet del usuario.

Documentación de implementación: [RandomForestRegressor](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestRegressor.html), [Nystroem](https://scikit-learn.org/stable/modules/generated/sklearn.kernel_approximation.Nystroem.html), [LinearSVR](https://scikit-learn.org/stable/modules/generated/sklearn.svm.LinearSVR.html), [MLPRegressor](https://scikit-learn.org/stable/modules/generated/sklearn.neural_network.MLPRegressor.html).
