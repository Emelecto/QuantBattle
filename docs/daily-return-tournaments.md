# Torneo semanal de retornos diarios · protocolo v1

Autor del proyecto: Emilio Cardona Lopez · DeepFin / Universidad EIA.

## Calendario y datos disponibles

Todas las horas se interpretan en `America/Bogota` (UTC−5). El torneo tiene cuatro rondas:

| Ronda | Observación más reciente | Envía durante | Predice el retorno de |
| --- | --- | --- | --- |
| 1 | Domingo | Lunes | Martes |
| 2 | Lunes | Martes | Miércoles |
| 3 | Martes | Miércoles | Jueves |
| 4 | Miércoles | Jueves | Viernes |

La apertura prevista es a las 00:30; el cierre es exclusivo a las 00:00 del día siguiente (el último minuto de envío es 23:59). El período observado empieza al cerrar los envíos y termina 24 horas después. No existe solapamiento entre el plazo de envío y el retorno evaluado. La primera ronda puede publicarse manualmente más tarde el lunes; su plazo y objetivo no cambian ni se retrotrae una predicción. Una ronda no publicada antes del cierre se marca como perdida y el torneo no tendrá ganador general.

Las tareas se revisan cada media hora. GitHub Actions puede demorarse; las fechas de cierre están fijadas en la base de datos y no se desplazan por un retraso del programador. Solo se publica un archivo después de verificar los datos. La ronda puede abrir más tarde de las 00:30 si la fuente no está lista.

## Mercado y objetivo

El universo de cada semana se fija antes de publicar la primera ronda: al menos 30 pares spot/USDT activos de Binance Vision con historia suficiente. No se sustituyen activos durante la semana. Se descargan hasta 900 días y se exige continuidad, precios positivos y velas completas. Las velas diarias usan `timeZone=-5:00`; `startTime` y `endTime` se envían en UTC. Se comprueba que cada vela comienza a las 00:00 de Colombia y dura 24 horas.

El objetivo es `cierre / apertura - 1` de la vela del día objetivo. Es retorno del precio, no rendimiento de una cartera y no incluye comisiones, spread o ejecución. Para reproducir el mismo problema en entrenamiento, las variables de la fecha d se relacionan con el retorno del día d+2: d+1 es el día disponible para preparar y enviar el archivo. Los últimos dos días sin respuesta madura no forman ejemplos etiquetados. Train y validation se separan cronológicamente; se purgan dos observaciones antes de la frontera.

## Dataset público y protección

Cada ronda tiene train, validation y live con una versión inmutable. Train y validation contienen `target`, un retorno histórico redondeado a pasos de 0.005 (0,5 puntos porcentuales); live nunca contiene target. Se declara ese redondeo para distinguir la precisión de los ejemplos de la evaluación real, que usa retornos sin redondear.

El constructor calcula 17 variables retrospectivas de momentum, volatilidad, RSI, distancia a medias y volumen. Las convierte a rangos entre activos de cada día, mezcla esos rangos mediante una proyección ortogonal secreta de ocho dimensiones y vuelve a discretizar en cinco niveles. Los nombres son feature_01…feature_08. Los IDs usan HMAC-SHA256, truncado a 24 dígitos hexadecimales; la clave cambia por ronda. Las etiquetas históricas de era y las filas se permutan. No se publican símbolos, precios, volúmenes originales ni fechas exactas de entrenamiento.

Originales y correspondencias se cifran con AES-256-GCM, nonce aleatorio de 12 bytes y contexto autenticado por ruta. La clave semanal deriva de `DATASET_SALT` mediante HMAC; no se publica durante el torneo. La clave de transformación por ronda deriva de esa clave semanal. Nunca se reutiliza una clave semanal en otro torneo. El ciphertext tiene SHA-256 registrado antes de que se reciban predicciones. Los archivos privados viven en un bucket privado y la API no entrega sus rutas.

Esto es ofuscación de las entradas públicas y cifrado de originales privados, no una garantía de anonimato criptográfico de las variables. La fecha de una ronda es pública y los precios fuente también lo son. Los datos nuevos de días siguientes pueden aportar información indirecta sobre días ya observados. Un CSV tampoco demuestra que se usó ML: la ficha declara método, parámetros, semilla y notas; no sustituye una ejecución controlada del modelo.

## Envíos

Se exige UTF-8, cabecera exacta `id,prediction`, todos los IDs del live una sola vez y retornos decimales finitos entre −1 y 10. Ejemplos: 0.025 = +2,5 %, −0.02 = −2 %, 0 = sin cambio. Se permiten predicciones constantes, porque cero es la referencia oficial. El límite es 10 MB y 50 intentos por participante y ronda. Se permite información pública anterior al plazo de cierre.

El servidor valida el archivo sin tocar la respuesta futura, conserva el archivo privado inmutable y su SHA-256 y registra la ficha del experimento. La selección del último envío válido se confirma en una transacción que bloquea la ronda y vuelve a verificar fecha y versión. Un archivo inválido o tardío no sustituye la selección válida anterior. El comprobante muestra huella, versión, fecha y filas, sin puntuación.

## Puntuación y publicación

Cada activo pesa lo mismo. Para una ronda se calculan:

```text
MAE_modelo = media(abs(predicción − retorno real))
MAE_cero   = media(abs(retorno real))
score     = (MAE_cero − MAE_modelo) / max(MAE_cero, 0.005)
```

La referencia cero tiene score 0; un valor positivo la mejora, uno negativo queda por debajo. El suelo de 0.5 puntos porcentuales evita divisiones inestables y limita la influencia de días casi inmóviles. No convierte el score en rentabilidad. El ranking general exige cuatro envíos seleccionados y puntuados; promedia los cuatro scores y desempata por menor MAE medio. Empates exactos comparten puesto. Los participantes con menos de cuatro rondas aparecen sin clasificación general.

Los scores diarios se almacenan privadamente, aunque ya existan los precios. Ni los comprobantes ni el ranking revelan resultados hasta el cierre completo. Las tablas nuevas deniegan acceso directo a anon/authenticated; solo el worker puede leerlas. La API aplica además el embargo de tiempo y exige cuatro rondas asentadas o explícitamente perdidas.

Desde el sábado 00:30, y solo con todas las rondas resueltas, se publica en conjunto: ranking, scores, símbolos, correspondencia con IDs, velas objetivo y retornos. También se publica cada fuente cifrada, su compromiso anterior y la clave derivada de esa semana para descifrar y reproducir la transformación. La clave maestra nunca se publica. `worker/scripts/replay_return_evidence.py` verifica el SHA-256 y descifra una fuente final. Si falta una vela de un activo, la ronda queda pendiente; no se fabrica ni se elimina el dato para terminar el ranking.

## Operación y verificación

1. Aplicar `0030_weekly_return_tournaments.sql` y después `0031_return_submission_wall_clock.sql` antes de desplegar el worker y la web. La segunda revisa la hora real tras adquirir el bloqueo de selección; `now()` conserva la hora de inicio de la transacción y no sirve para ese control después de una espera.
2. Configurar en GitHub los secretos existentes SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y DATASET_SALT (mínimo 24 caracteres). No cambiar el salt durante una semana abierta.
3. Activar la variable `ML_DAILY_TOURNAMENTS_ENABLED=true`. Este flujo no activa los antiguos modos real/historical/prospective de cinco días.
4. `daily-return-tournaments.yml` ejecuta el árbitro cada 30 minutos y permite lanzamiento manual. La concurrencia de GitHub y la selección transaccional de archivos evitan duplicados.
5. Conservar la práctica sintética como modalidad independiente. Nunca reinterpretar sus scores Spearman como scores de retorno.

Las pruebas de `test_weekly_returns.py` simulan el avance del calendario y fallos de mercado; no constituyen una semana real transcurrida. Una primera ejecución real permite comprobar datos, descargas, autenticación y envíos; el cierre real solo puede verificarse al madurar el viernes.

Datos de Binance Vision, derivados bajo CC BY-NC-SA 4.0 y condiciones de Binance Public Data. Uso de investigación sin premios QP; no implica asociación ni aval de Binance. Referencias: [API de velas](https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md#klinecandlestick-data), [condiciones de datos](https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md).
