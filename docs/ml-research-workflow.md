# Espacio personal de investigación ML

## Participar y registrar un experimento

El inicio muestra la ronda abierta cuyo cierre es más próximo, en hora de Colombia, su versión y el estado del envío propio. El historial permite consultar intentos anteriores sin confundirlos con el único archivo seleccionado de cada ronda.

En Enviar, seleccionar un CSV activa una revisión en el navegador: UTF-8, cabecera, filas, cobertura de IDs, duplicados, valores numéricos finitos entre 0 y 1 y variación de predicciones por era. La revisión utiliza un índice verificado de IDs y eras públicos, nunca targets. Muestra la huella SHA-256 de los bytes originales. La validación definitiva permanece en el servidor y vuelve a comprobar el plazo.

La ficha contiene nombre del modelo, parámetros JSON, semilla opcional y nota. Son declaraciones del participante, no una certificación del entrenamiento realizado. Si no se utilizó semilla se deja vacía. La configuración debe elegirse con validation antes de consultar resultados de live.

## Historial privado y reproducibilidad

Cada ficha se guarda en el mismo bucket privado que las predicciones como documento inmutable asociado al ID del envío, versión del dataset y SHA-256 del CSV. El servidor guarda CSV y ficha antes de activar el envío. Una falla previa a la activación conserva la selección anterior; pueden quedar objetos privados huérfanos si falla una escritura posterior.

No se requiere una migración de base de datos: las fichas usan objetos JSON privados junto a los CSV. El sufijo `.experiment.csv` identifica los envíos con ficha. Los envíos anteriores conservan su comprobante y se muestran como «sin ficha»; no se inventan metadatos históricos. Una ficha que no coincide con la huella o que no se puede consultar aparece como no disponible.

`GET /ml/experiments` autentica al usuario y filtra por su ID. Pagina de diez en diez (máximo veinte por petición) con una fecha de corte para evitar que un nuevo envío desplace las páginas durante la consulta. La exportación JSON corresponde únicamente a la página consultada; para ver envíos posteriores se actualiza el historial.

Las puntuaciones y referencias permanecen ocultas hasta que la ronda tenga estado scored. Se muestran dentro de su propia ronda; no se agregan scores de datasets diferentes ni se interpretan como rentabilidad. Los parámetros y la semilla describen el experimento, pero para repetir el entrenamiento también se necesitan código y dependencias.

## Calidad del catálogo

Una publicación debe conservar un título identificable, Sharpe OOS numérico y finito y la huella registrada por el motor. El motor heredado calcula esa huella a partir de la configuración; no es un hash del archivo financiero subyacente ni prueba por sí solo la reproducibilidad de sus datos. El criterio admite métricas cero o negativas: no selecciona solamente experimentos ganadores. Si la evaluación falla, el registro se conserva como needs_review y la interfaz no anuncia una publicación exitosa.

El script `worker/scripts/archive_marketplace.py` genera un plan y un respaldo local completo. `--apply` archiva únicamente candidatos publicados sin suscripciones activas o pausadas. No borra código, resultados, comentarios ni contratos. Los registros protegidos conservan sus suscripciones y quedan fuera del catálogo mediante el filtro de evidencia; autor y suscriptor mantienen acceso al detalle. El respaldo permite restaurar el estado anterior de los IDs registrados.

En la revisión del 20 de octubre de 2026 se revisaron doce publicaciones: nueve archivadas y tres preservadas por suscripciones. No se reconstruyeron métricas a partir de descripciones.

## Verificación

Las pruebas cubren privacidad por usuario, ausencia de score anticipado, integridad de fichas, índices públicos sin targets, conservación de la selección ante fichas inválidas, revisión CSV y calidad de publicaciones. La prueba de navegador usa exclusivamente la cuenta técnica y un modelo de referencia ya entrenado; no representa adopción externa ni un nuevo resultado financiero.
