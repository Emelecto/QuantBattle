# Informe de implementación y lanzamiento de torneos de retornos diarios

QuantLab · Emilio Cardona Lopez · DeepFin / Universidad EIA  
Fecha: 26 de octubre de 2026. Horarios de usuario: America/Bogota, UTC−5.

## Estado entregado

Se implementó y publicó una modalidad real independiente de la práctica sintética: un torneo semanal con cuatro rondas, de lunes a jueves. Cada ronda entrega variables derivadas de los datos completos del día anterior y recibe predicciones del retorno del día siguiente. Los scores diarios, los nombres de los activos y sus precios reales permanecen retenidos hasta que termina y se verifica todo el torneo.

El primer torneo ya está creado y su ronda del lunes está abierta. La fecha de publicación real de esa ronda fue **26 de octubre, 18:41:40, hora de Colombia**. Es la excepción de lanzamiento autorizada; el cierre del lunes se conserva a las 23:59. Las aperturas posteriores se programan desde las 00:30, sin admitir pronósticos retroactivos.

- [Abrir primer torneo](https://quant-lab-nine.vercel.app/app/tournaments/weekly/0c19132c-6cc1-5bb5-a804-3f5ac7b8823d)
- Identificador semanal: `0c19132c-6cc1-5bb5-a804-3f5ac7b8823d`.
- Primera ronda: `18a179c3-7ca7-57a9-a587-c3b25d4e40dd`.
- Versión del primer dataset: `dr1-a419cca7b0d8d07d0df0`.
- Universo fijo durante esta semana: **40 criptoactivos spot/USDT de Binance Vision**.
- Primera ronda: train **23.920 filas**, validation **8.000 filas**, live **40 filas**.

## Calendario exacto de la primera semana

| Ronda | Datos hasta | Recepción de archivos | Día cuyo retorno se predice |
| --- | --- | --- | --- |
| 1 | Domingo 25 de octubre | Lunes 26, desde 18:41 hasta 23:59 | Martes 27, 00:00–23:59 |
| 2 | Lunes 26 de octubre | Martes 27, desde 00:30 hasta 23:59 | Miércoles 28, 00:00–23:59 |
| 3 | Martes 27 de octubre | Miércoles 28, desde 00:30 hasta 23:59 | Jueves 29, 00:00–23:59 |
| 4 | Miércoles 28 de octubre | Jueves 29, desde 00:30 hasta 23:59 | Viernes 30, 00:00–23:59 |

El cierre técnico de un envío es exclusivo a las 00:00 del día siguiente: el archivo debe haber sido validado y seleccionado antes de ese instante. La respuesta futura comienza a medirse al cerrarse el plazo de envío, por lo que nadie puede entregar después de observar parte del movimiento evaluado.

La publicación general está prevista **desde el sábado 31 de octubre a las 00:30**, después de verificar las cuatro rondas. No se publican resultados el martes, miércoles o jueves al terminar una ronda individual. Si falta información verificable, la publicación se retrasa y la interfaz lo explica. La fecha no autoriza inventar precios para terminar un ranking.

El mismo calendario se repite cada semana. El siguiente lunes previsto es el 2 de noviembre a las 00:30. GitHub puede retrasar una ejecución; en ese caso la apertura espera a los datos completos, pero los plazos de cierre no se desplazan silenciosamente.

## Descarga y construcción de datos reales

La generación se ejecuta en GitHub Actions, no en el worker de Render. Así se evita cargar la memoria del servidor que atiende a los usuarios y se conserva un registro de cada ejecución del árbitro.

Antes de iniciar una semana se comprueban los pares spot/USDT activos y su cobertura histórica. Se exigen al menos 30 activos con historia suficiente. El universo seleccionado queda fijo toda la semana; no se sustituye una moneda durante una ronda para favorecer o completar un resultado.

Se consulta el endpoint público de velas de Binance Vision con `interval=1d` y `timeZone=-5:00`. Los límites de consulta se envían en UTC, como requiere Binance. Se comprueba que cada vela abra a medianoche de Colombia, dure exactamente 24 horas, tenga precios positivos y finitos, y ya haya cerrado. No se rellenan días ausentes con precios inventados.

Este ajuste nativo de zona horaria permite obtener hasta 900 días de historia sin descargar y agregar cientos de miles de velas horarias. Como comprobación independiente del lanzamiento, se descargaron las 24 velas de una hora de un día observado y se verificó que apertura, máximo, mínimo, cierre y volumen coinciden con la vela diaria UTC−5. Esa comprobación pasó sin revelar el símbolo o sus precios en el informe público previo al cierre.

El objetivo de cada activo es:

```text
retorno_diario = precio_de_cierre_del_día_objetivo / precio_de_apertura_del_día_objetivo − 1
```

Se mide el retorno del precio cotizado en USDT. No se simula una compra, una cartera o una operación, ni se incluyen comisiones, spread o ejecución.

## Alineación del entrenamiento con el concurso

Si las variables representan el domingo y el lunes se dispone de tiempo para enviar, el objetivo es el martes. Por eso los ejemplos históricos relacionan variables de la fecha d con el retorno del día d+2. El constructor no entrena un problema a cinco días y luego lo presenta como un concurso diario.

Las variables se construyen usando únicamente información disponible hasta su fecha. Los ejemplos cuyos objetivos todavía no existen quedan fuera del entrenamiento etiquetado. Train y validation se separan cronológicamente y se purgan dos observaciones en la frontera. El conjunto live contiene las variables del día observado y nunca incluye target.

Cada ronda genera una versión nueva e inmutable de sus tres archivos. Se comprueba la integridad del archivo publicado antes de validar IDs de un envío. Los datos de una ronda no se sustituyen silenciosamente cuando el participante ya empezó a entrenar.

## Qué se protege y cómo

Los datos originales y las correspondencias con los símbolos se cifran; los datos públicos de entrenamiento se transforman para que sigan siendo útiles para ML. Son protecciones distintas.

1. **Sin precios originales en el archivo público.** Se calculan 17 variables retrospectivas de retornos, volatilidad, RSI, distancias a medias y volumen. No se entrega OHLCV original.
2. **Normalización transversal.** Cada variable se convierte en un rango entre los activos de ese día. Así se elimina la escala del precio y el volumen.
3. **Mezcla secreta y discretización.** Los rangos se mezclan mediante una proyección ortogonal de ocho dimensiones y se agrupan de nuevo en cinco niveles. El participante recibe feature_01…feature_08. La proyección se conserva igual en train, validation y live de una ronda, y cambia en la siguiente.
4. **IDs que cambian por ronda.** Se generan con HMAC-SHA256 y una clave secreta por ronda, truncados a 24 caracteres hexadecimales. No hay un ID permanente que permita seguir públicamente el mismo activo entre días. Las eras históricas y las filas se permutan.
5. **Etiquetas históricas redondeadas.** Los retornos históricos exactos también pueden actuar como huella digital. En train y validation se redondean a pasos de 0.005, equivalentes a 0,5 puntos porcentuales. La puntuación del torneo usa el retorno futuro real sin ese redondeo.
6. **Cifrado autenticado de originales.** Los archivos privados usan AES-256-GCM con nonce aleatorio de 12 bytes y contexto autenticado por ruta. La clave semanal deriva de DATASET_SALT mediante HMAC; las claves de transformación de cada ronda derivan de ella. La clave maestra no se publica y debe conservarse durante una semana abierta.
7. **Compromiso previo.** La huella SHA-256 del archivo fuente cifrado aparece en el manifiesto antes de recibir predicciones. Los archivos de generación usan rutas propias para que un reintento no sobrescriba una versión ya publicada.
8. **Revelación al cierre general.** Solo al terminar toda la semana se publican las fuentes cifradas, sus huellas y la clave derivada de esa semana. Se pueden descifrar y reproducir sin revelar la clave maestra ni las claves de semanas futuras.

No se promete anonimato criptográfico de las variables públicas. La fuente de mercado y la fecha de una ronda son públicas; los datos diarios nuevos pueden dar pistas indirectas sobre días ya observados. Tampoco es posible demostrar a partir de un CSV que el participante utilizó ML: se exige una ficha del modelo, pero no se ejecuta su entrenamiento en un entorno controlado.

En el lanzamiento se hizo una prueba limitada de identificación mediante comparación con vectores generados usando otra transformación conocida. Acertó 2 de 40 correspondencias (5 %); la referencia aleatoria sería 2,5 %. Este ensayo no es una prueba exhaustiva de anonimato y no se presenta como tal.

## Envíos, comprobantes y selección

El formato obligatorio es UTF-8 con cabecera exacta `id,prediction`. Debe aparecer cada ID del live una sola vez. Se aceptan retornos decimales finitos entre −1 y 10: `0.025` significa +2,5 %, `-0.02` significa −2 % y `0` es una predicción válida. No se exige variación entre activos, porque la referencia oficial predice cero para todos.

La web revisa el CSV usando exclusivamente IDs públicos y calcula su SHA-256. El servidor repite la validación, conserva los bytes originales en almacenamiento privado y registra la versión del dataset. También se exige la ficha del modelo: nombre, parámetros JSON, semilla opcional y nota. Hay un límite de 10 MB por archivo y un máximo de 50 intentos por ronda controlado por la API.

La base de datos selecciona el archivo válido dentro de una transacción que bloquea la ronda y vuelve a comprobar hora, estado y versión. Un intento inválido no sustituye al archivo válido anterior. Si el plazo termina durante una carga, la API no anuncia una selección exitosa.

En la revisión final se corrigió una condición de borde: PostgreSQL conserva `now()` desde el inicio de una transacción. Si esa transacción esperaba por el bloqueo de otro envío, podía seguir viendo una hora anterior al cierre. La migración `0031_return_submission_wall_clock.sql` utiliza `clock_timestamp()` después de obtener el bloqueo. Una prueba SQL con rollback reprodujo la aceptación tardía en la versión anterior y confirmó el rechazo después de aplicar la corrección, sin crear torneos ni archivos de prueba visibles.

El usuario puede consultar fecha, filas, versión, huella, intento seleccionado e historial. Antes del cierre general se muestra «validado · resultado retenido»; ese estado confirma el archivo, no la calidad de la predicción.

Se permite información pública disponible antes del plazo de envío. La ofuscación dificulta vincular las filas con activos concretos, pero no transforma esa regla en una garantía de que solo se usaron los archivos entregados.

## Fórmula de puntuación y ranking

Dentro de una ronda todos los activos pesan lo mismo:

```text
MAE_modelo = media(abs(predicción − retorno observado))
MAE_cero   = media(abs(retorno observado))
score     = (MAE_cero − MAE_modelo) / max(MAE_cero, 0.005)
```

La referencia que predice cero siempre obtiene score cero. Un valor positivo mejora esa referencia; uno negativo queda por debajo. El suelo de 0.005 evita divisiones inestables en días con poco movimiento. El MAE se muestra en puntos porcentuales para evitar confundirlo con rentabilidad.

El ranking general requiere cuatro envíos seleccionados y puntuados. Se promedian los cuatro scores y se desempata por menor MAE medio. Los empates exactos comparten puesto. Los participantes con menos de cuatro rondas conservan sus registros pero aparecen sin clasificación general. Si una ronda no llegó a publicarse, la semana se identifica como incompleta y no se proclama un ganador general.

No hay premios QP, pagos ni ejecución de operaciones en esta modalidad.

## Automatización y controles de acceso

Se aplicó la migración `0030_weekly_return_tournaments.sql` en el proyecto Supabase de QuantLab. Añade semanas, rondas y envíos sin reinterpretar las rondas sintéticas anteriores. Las tres tablas nuevas tienen RLS y deniegan lecturas directas tanto a anon como a authenticated; el worker utiliza su credencial de servidor.

También se aplicó `0031_return_submission_wall_clock.sql`, con la corrección del reloj de cierre comprobada en la base de datos real.

El embargo se aplica en la API además de los permisos de la base de datos. Los comprobantes excluyen scores mientras la semana no esté liberada. El endpoint final requiere la fecha mínima de publicación y las cuatro rondas resueltas. El material público con símbolos y claves no se crea antes de cumplir esas condiciones. Los archivos originales cifrados permanecen en el bucket privado de targets.

La nueva tarea `daily-return-tournaments.yml` se ejecuta cada media hora y tiene una exclusión de concurrencia para evitar árbitros superpuestos. Crea únicamente las rondas que corresponden al calendario, puntúa cuando el día objetivo está completo y publica la semana después de verificar todas las rondas. No admite creación retroactiva de una ronda vencida. Los errores transitorios se reintentan; una falta de datos impide finalizar, en vez de sustituir el precio.

Se activó `ML_DAILY_TOURNAMENTS_ENABLED=true` en GitHub y se sincronizó la clave de cifrado mediante un secreto, sin imprimirla ni incluirla en el repositorio. Este control es independiente de los antiguos modos de mercado a cinco días. La práctica sintética se mantiene disponible.

- [Primera generación manual correcta](https://github.com/Emelecto/QuantLab/actions/runs/40421219209).
- [Segundo arbitraje correcto, sin duplicados](https://github.com/Emelecto/QuantLab/actions/runs/40422276629): creó 0 rondas, puntuó 0 y publicó 0 semanas, conservando la versión existente.
- [Código del backend](https://github.com/Emelecto/QuantLab/commit/7343dfb583179f58500715815f6c68f361b313f9).
- [Interfaz y recorrido del participante](https://github.com/Emelecto/QuantLab/commit/4a735ccde1671d67661a7b98ef1c6fe5f525f9bc).

## Interfaz y documentación

Se añadió una vista semanal con selección de las cuatro rondas, estado real, plazos absolutos en Colombia, archivos versionados, formulario de retornos, comprobante e historial. El dashboard muestra el torneo nuevo y sus envíos. El enlace «Mis envíos» conduce al historial real, conservando la práctica debajo. Los precios y el ranking final tienen una vista distinta que solo se carga cuando el servidor libera la semana.

La interfaz conserva la estética clara aprobada. La revisión visual encontró dos ajustes: mostrar las cuatro rondas en el primer viewport móvil y sustituir las flechas de texto por los SVG compartidos. Ambos se corrigieron y confirmaron; la prueba comprueba que la cuarta tarjeta queda por encima de la navegación inferior. El detector mecánico no reportó hallazgos en la superficie nueva.

Se actualizaron README, documentación pública, guía de participación, reglas del producto y registro visual. Se añadió el notebook `ejemplo_retornos_diarios.ipynb`: descarga los archivos de la misma ronda, compara dos configuraciones HistGradientBoosting y la referencia cero en validation y produce el CSV live. Elegir cero también es un resultado válido; no se obliga a seleccionar un modelo peor para aparentar complejidad.

## Verificación realizada

- **Worker:** 197 pruebas locales sin servicios externos aprobadas; 17 pruebas marcadas external excluidas de ese comando. Siete pruebas nuevas cubren calendario, retornos firmados, cifrado autenticado, transformación, semana completa, reemplazo, cierre, embargo, ranking 4/4, idempotencia y fallo de la fuente. El ciclo prospectivo completo de esas pruebas usa un reloj y un mercado simulados.
- **CI del backend:** [ejecución aprobada](https://github.com/Emelecto/QuantLab/actions/runs/40397157823), y [verificación del commit de interfaz](https://github.com/Emelecto/QuantLab/actions/runs/40422447377).
- **Web:** compilación de producción y tipos aprobados con la versión fijada Next.js 16.4.1. Se sincronizó la instalación local, que antes estaba en 16.3.8. Los archivos modificados pasan lint. La auditoría de dependencias de producción no reportó vulnerabilidades.
- **CI de la web publicada:** [ejecución final aprobada](https://github.com/Emelecto/QuantLab/actions/runs/40423258250), incluyendo instalación limpia, auditoría de producción, tipos, compilación y pruebas de navegador. Vercel confirmó la publicación del mismo código `cb7aa09`; la corrección SQL posterior se aplicó directamente a Supabase.
- **Navegador local:** 48 pruebas aprobadas sin casos omitidos; después de la corrección visual se aprobaron nuevamente los seis casos de la modalidad nueva, incluidos escritorio y móvil.
- **Configuración de pruebas:** Playwright carga los mismos hosts públicos que la aplicación y la CI los define expresamente. Esto evita omitir las pruebas de autenticación y API por falta de variables.
- **API/Storage/auth reales:** 18 controles aprobados, con descargas y hashes de los tres archivos, live sin respuesta, envío válido, CSV incorrecto rechazado, último válido preservado y reemplazado, resultados retenidos, envío anónimo rechazado, lecturas directas denegadas en las tres tablas y fuente privada no pública.
- **Plazo en PostgreSQL real:** prueba transaccional `supabase/tests/weekly_return_deadline.sql`; acepta un envío dentro del plazo, rechaza otro cuando el reloj real supera el cierre aunque la transacción comenzara antes, y conserva el envío anterior. Todos los registros de esa prueba se revierten.
- **Web publicada:** 13 controles aprobados en escritorio y móvil: ronda real cargada, cuatro rondas, símbolos y scores ausentes, revisión de CSV, carga real con comprobante, ausencia de desbordamiento y ausencia de errores de JavaScript observados.

La cuenta utilizada es una **cuenta técnica identificada**, creada confirmada sin enviar correos. No representa adopción externa. Se entrenó solo con los archivos públicos y se seleccionó configuración con validation; la auditoría privada de fuente se hizo por separado de esa selección.

El modelo de referencia elegido fue HistGradientBoosting, semilla 20261026. Su MAE de validación fue 0.0278782582 —2,7878 puntos porcentuales— frente a 0.0279006250 de la referencia cero. La diferencia es muy pequeña y corresponde a etiquetas históricas redondeadas; no acredita superioridad estadística, rentabilidad ni desempeño de la ronda futura. El score real de esta ronda sigue sin existir públicamente.

Los informes locales sanitizados se encuentran en `artifacts/weekly-return-launch/production-check.json` y `production-browser.json`. Las capturas de la web publicada se conservan en el mismo directorio. Las credenciales y la sesión técnica no se incorporan a esos informes ni a Git.

## Reproducción después del cierre

La evidencia final incluirá precios de apertura/cierre en USDT, retornos, símbolos, IDs, timestamps, fuentes cifradas originales y sus hashes. El siguiente comando verifica el compromiso, descifra una fuente ya liberada y reconstruye las tres matrices públicas:

```text
python worker/scripts/replay_return_evidence.py --results URL_DEL_INFORME_FINAL --round 1 --output fuente.json
```

Si el participante conserva su propio CSV puede añadir `--predictions predicciones.csv` para reproducir el MAE, la referencia cero y el score de esa ronda. No se publican los CSV privados de otros participantes. Su verificación externa completa requiere que ellos decidan compartirlos.

## Límites de la verificación y trabajo que realizará el reloj

La creación real, los archivos, la autenticación, la recepción y las protecciones de acceso ya están comprobados. El avance de las cuatro rondas, la puntuación y la revelación se verificaron mediante simulación temporal. **No se afirma haber observado ya el martes, miércoles, jueves y viernes futuros.** El árbitro está configurado para hacerlo cuando esos días terminen.

La primera semana solo puede completar su observación de mercado al finalizar el viernes 30, y publicar desde el sábado 31 después de verificarla. Los servicios externos pueden sufrir retrasos; los errores quedan visibles y reintentables. No se promete ausencia absoluta de fallos, identificación imposible de activos, uso demostrado de ML por cada participante ni calidad financiera de las predicciones.

Las pruebas se refieren al nuevo flujo y a las regresiones ejecutadas. El repositorio conserva deuda de lint y módulos históricos que esta implementación no certifica integralmente. Los resultados de la práctica Spearman, los del nuevo torneo diario y las afirmaciones científicas del informe deben conservar sus alcances separados.
