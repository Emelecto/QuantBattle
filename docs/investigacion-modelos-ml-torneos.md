# Modelos de ML para recrear en los torneos de QuantBattle

**Fecha de revisión:** 28 de octubre de 2026
**Alcance:** modelos publicados para predicción financiera y una receta de reproducción compatible con el torneo semanal de retornos diarios de QuantBattle.
**Conclusión:** no hay un ganador universal demostrado. La mejor evidencia académica comparativa respalda probar regresión regularizada, árboles potenciados y redes neuronales poco profundas bajo el mismo protocolo temporal. Para QuantBattle, el modelo solo cuenta como candidato exitoso si mejora el MAE de cero en validación temporal y conserva esa mejora en semanas prospectivas.

## 1. Qué problema resuelve QuantBattle

El torneo semanal no pide elegir activos ni optimizar una cartera. Cada ronda pide predecir el retorno decimal de la vela diaria siguiente para cada activo y puntúa el error absoluto medio con peso igual por activo. Su referencia es la predicción cero:

```text
MAE_modelo = mean(abs(predicción - retorno real))
score      = (MAE_cero - MAE_modelo) / max(MAE_cero, 0.005)
```

Por eso, métricas como accuracy, Sharpe, P&L o retorno de una estrategia de trading no son sustitutos del score. Sí pueden servir como análisis secundarios en otro protocolo, pero no demuestran que un modelo vaya a ganar este torneo.

El conjunto semanal contiene al menos 30 pares cripto spot/USDT, hasta 900 días y ocho features públicas (`feature_01`…`feature_08`). Las features parten de indicadores retrospectivos, se convierten a rangos transversales, se proyectan y se discretizan. Las etiquetas históricas también se redondean a pasos de 0,005. El objetivo de entrenamiento relaciona variables del día d con el retorno del día d+2, de modo que los ejemplos deben construirse exactamente como indica el protocolo, sin usar datos posteriores a la fecha de predicción.

Implicaciones para la reproducción:

- Comparar los modelos en las mismas filas, particiones y target, siempre frente a cero.
- Separar validación por tiempo; nunca mezclar filas futuras en train ni ajustar el preprocesamiento con validation/test.
- Mantener una tabla de error absoluto por activo y por fecha, además del score agregado; promediar cada activo con el mismo peso.
- Tratar las features como valores discretizados con relación entre activos, no como precios o indicadores continuos originales.
- No usar la ronda live repetidamente para escoger hiperparámetros. La validación es para desarrollo; la ronda prospectiva es evidencia nueva.

## 2. Evidencia publicada y qué permite afirmar

### Gu, Kelly y Xiu (2020): una comparación académica amplia

En *Empirical Asset Pricing via Machine Learning*, publicado en *The Review of Financial Studies*, los autores comparan modelos lineales, regularizados, árboles aleatorios, gradient-boosted regression trees (GBRT) y redes neuronales para retornos de acciones estadounidenses. Reportan que árboles y redes capturan interacciones no lineales que los modelos lineales omiten. En el panel de acciones, las redes neuronales poco profundas obtienen resultados competitivos; el NN de tres capas logra un R² fuera de muestra de aproximadamente 0,40%, y arquitecturas más profundas no lo mejoran en esa tarea. Los autores también advierten que una regresión OLS grande se sobreajusta y que cero es una referencia más estricta que la media histórica ruidosa.

Es evidencia relevante para justificar una reproducción de GBRT y NN3, pero el resultado no se transfiere directamente a QuantBattle: el estudio usa características fundamentales/financieras de acciones, retornos mensuales y una evaluación de retornos/portafolios; QuantBattle usa features transformadas de cripto, etiquetas diarias y MAE. La afirmación válida es “familias con valor demostrado en otra tarea financiera”, no “este modelo ya demostró ventaja en QuantBattle”.

Fuentes: [artículo de RFS](https://academic.oup.com/rfs/article/33/5/2223/5758276), [DOI](https://doi.org/10.1093/rfs/hhaa009), [NBER Working Paper 25398](https://www.nber.org/papers/w25398).

### LSTM para señales de acciones: éxito histórico con límite temporal

Fischer y Krauss estudian LSTM para clasificar movimientos de acciones del S&P 500 entre 1992 y 2015. Reportan rentabilidad excedente en parte del período, pero indican que tras 2010 la rentabilidad después de costos fluctúa alrededor de cero. Sirve como antecedente de secuencias temporales, y también como advertencia: el éxito histórico puede desaparecer. El estudio no valida LSTM para el score MAE diario de QuantBattle.

Fuente: [Deep learning with long short-term memory networks for financial market predictions](https://doi.org/10.1016/j.ejor.2017.11.054).

### FinRL y FinRL-Meta: reproducibilidad de RL, pero otro tipo de tarea

FinRL presenta algoritmos como PPO, A2C, DDPG, SAC y TD3 dentro de entornos de trading con estados, acciones, recompensa y costos. FinRL-Meta, publicado en la pista Datasets and Benchmarks de NeurIPS 2022, destaca explícitamente el bajo signal-to-noise, sesgo de supervivencia y sobreajuste de backtests como problemas de evaluación.

Esto es un marco útil para futuros torneos donde se entrega un entorno interactivo y se evalúa una política de trading. No es la primera opción aquí: QuantBattle entrega una tabla con features y pide predicciones de retornos, sin interacción, acciones ni recompensa acumulada. Usar RL en este formato añade complejidad sin resolver una necesidad de la métrica.

Fuentes: [FinRL (arXiv)](https://arxiv.org/abs/2011.09607), [FinRL-Meta (NeurIPS 2022)](https://proceedings.neurips.cc/paper_files/paper/2022/hash/0bf54b80686d2c4dc0808c2e98d430f7-Abstract-Datasets_and_Benchmarks.html).

### Ensambles y control del sesgo de selección

Un trabajo de *Financial Innovation* sobre pronósticos financieros muestra un procedimiento que combina Random Forest, Extremely Randomized Trees y Gradient Boosting para reducir la selección retrospectiva del “mejor” método. La idea metodológica es pertinente: limitar el número de pruebas, fijar de antemano la información disponible y combinar modelos solo con pesos definidos en validation. No es evidencia de que ese ensamble mejore el MAE del torneo de QuantBattle.

Fuente: [Robust monitoring machine](https://link.springer.com/article/10.1186/s40854-023-00497-z).

## 3. Shortlist para recrear

| Prioridad | Modelo | Por qué probarlo | Riesgo / límite | Decisión para QuantBattle |
| --- | --- | --- | --- | --- |
| 0 | Cero | Referencia oficial, score 0 | No aprende del panel | Obligatorio para toda tabla |
| 1 | Ridge con shrinkage robusto | Baseline barato y estable; detecta si hay señal lineal sin gran capacidad | Puede quedarse corto ante umbrales e interacciones | Primer modelo aprendido; regularización seleccionada solo en validation |
| 2 | Gradient-boosted trees (GBRT) | Evidencia comparativa de Gu et al.; modela no linealidad e interacciones en tabla | Fácil sobreajustar; discretización y pocos días/activos efectivos | LightGBM o HistGradientBoosting como implementación reproducible; árboles poco profundos y hojas con soporte mínimo |
| 3 | MLP poco profunda (NN1/NN3) | NN3 figura entre los mejores modelos en Gu et al.; el mismo estudio no encontró ventaja por profundizar más | Alta sensibilidad a semilla y escala; panel diario tiene menos observaciones efectivamente independientes | Una capa y tres capas como máximo; varias semillas con promedio fijado de antemano |
| 4 | Random Forest | Evaluación clásica y robusta de interacciones, con varianza reducida por bagging | Puede suavizar en exceso señales débiles; extrapolación pobre | Control comparativo, no asumir que será el ganador |
| 5 | Ensamble pequeño | Puede reducir varianza si Ridge y GBRT/MLP cometen errores distintos | Se puede convertir en búsqueda de pesos sobre validation | Solo promedio simple o pesos definidos antes de abrir la ronda live |

**No incluir en la primera reproducción:** RL (mismatch de la interfaz y la métrica), LSTM/TFT/Transformers (la evidencia más sólida no corresponde a esta tarea y hay poco beneficio esperado frente a modelos tabulares), ni modelos enormes de lenguaje o fundacionales. Se podrían convertir en experimentos posteriores si el protocolo cambia o aparece evidencia de ganancia estable bajo la evaluación QuantBattle.

## 4. Protocolo de reproducción recomendado

### A. Congelar el problema y el preprocesamiento

1. Descargar los Parquet versionados de train, validation y live y guardar hashes, versión, fecha límite, método y semilla.
2. Usar la etiqueta objetivo ya publicada; validar que la alineación de d a d+2 coincide con el protocolo.
3. No reconstruir nombres de activos, no intentar invertir la proyección secreta y no usar precios externos para “completar” features.
4. Mantener los ejemplos en orden temporal. Si un activo no tiene datos para un día, no inventar filas.
5. Ajustar cualquier escalador solo con train, dentro de cada corte temporal.

### B. Evaluación de desarrollo

- Baseline principal: predicción constante cero.
- Partición de validation cronológica; separar en subventanas contiguas si hay suficiente historia para ver estabilidad temporal.
- Para cada modelo registrar MAE absoluto, score normalizado, score por ventana y score por activo. La media oficial usa peso idéntico por activo.
- Elegir la configuración con el MAE de validation agregado, revisando también si gana en varias subventanas y no solo en una.
- Mantener el conjunto de hiperparámetros pequeño y predeclarado. No seleccionar entre decenas de variantes usando el resultado live.
- Ajustar límite/clipping de predicciones usando exclusivamente train y validation. Reportar resultado antes y después de clipping.
- Como control de integridad, repetir con etiquetas permutadas por fecha dentro de train; ese control no debería mostrar ventaja consistente en validation.

### C. Una configuración inicial modesta por modelo

Estos son rangos iniciales de ingeniería para reproducir, no hiperparámetros óptimos publicados ni afirmaciones de rendimiento:

- **Ridge/Huber:** centrar/estandarizar con parámetros de train, `alpha` en una grilla logarítmica corta; comparar Ridge con pérdida Huber si está disponible.
- **GBRT:** profundidad/hojas bajas, learning rate pequeño, mínimo de observaciones por hoja y early stopping con la única partición de validation declarada. Usar pérdida MAE/Huber si la librería lo admite de forma estable.
- **MLP:** una capa oculta y NN3 compacta como máximo, activación ReLU, regularización L2/dropout moderado, early stopping y semillas predefinidas. Promediar semillas; no reportar la mejor semilla.
- **Random Forest:** árboles con profundidad limitada, tamaño mínimo de hoja y número fijo de árboles; no dar al modelo libertad para aislar filas individuales.
- **Ensamble:** comenzar por media simple de predicciones ya convertidas a la escala original. Comparar su MAE solo después de congelar los miembros; no optimizar pesos en la ronda evaluada.

### D. Reproducción prospectiva

Tras elegir configuraciones con validation, entrenar y enviar a las cuatro rondas prospectivas sin cambios motivados por los scores ocultos. Al cierre completo, comparar cada ronda, el promedio semanal y la frecuencia con que el modelo supera a cero. Reportar dispersión e intervalos por activo/día; cuatro rondas son una primera comprobación operativa, no evidencia suficiente para proclamar superioridad general.

## 5. Criterio de éxito para QuantBattle

Un modelo se considera **candidato prometedor** si:

1. Reduce MAE frente a cero en validation de manera reproducible, con preprocesamiento y configuración registrados.
2. La mejora no depende de una sola era, activo o semilla.
3. Mantiene puntuación superior a cero en varias semanas prospectivas independientes, con incertidumbre y resultados por semana visibles.
4. Puede rehacerse desde la versión del dataset, código, parámetros y semilla archivados.

Un score positivo aislado, una Sharpe publicada por otro trabajo o un buen resultado en una partición elegida después de probar muchos modelos no cumple este criterio.

## 6. Referencias

1. Gu, S., Kelly, B. y Xiu, D. (2020). [Empirical Asset Pricing via Machine Learning. *The Review of Financial Studies*, 33(5), 2223–2273.](https://doi.org/10.1093/rfs/hhaa009)
2. Fischer, T. y Krauss, C. (2018). [Deep learning with long short-term memory networks for financial market predictions. *European Journal of Operational Research*, 270(2), 654–669.](https://doi.org/10.1016/j.ejor.2017.11.054)
3. Liu, X.-Y. et al. (2021). [FinRL: A Deep Reinforcement Learning Library for Automated Stock Trading in Quantitative Finance.](https://arxiv.org/abs/2011.09607)
4. Liu, X.-Y. et al. (2022). [FinRL-Meta: Market Environments and Benchmarks for Data-Driven Financial Reinforcement Learning. NeurIPS 2022 Datasets and Benchmarks.](https://proceedings.neurips.cc/paper_files/paper/2022/hash/0bf54b80686d2c4dc0808c2e98d430f7-Abstract-Datasets_and_Benchmarks.html)
5. [Robust monitoring machine: a machine learning solution for out-of-sample R²-hacking in return predictability monitoring. *Financial Innovation*.](https://link.springer.com/article/10.1186/s40854-023-00497-z)

## 7. Fuentes internas de QuantBattle

- [Protocolo del torneo semanal](daily-return-tournaments.md)
- [Protocolo de torneos ML anterior](ml-tournaments.md)
- [Resumen de producto e invariantes](../PRODUCT.md)
