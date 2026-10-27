# Aprendizaje y proyectos ML

Las rutas `/app/strategies` y `/app/marketplace` contienen proyectos de investigación ML y una biblioteca de notebooks. Backtesting clásico permanece en `/app/backtesting`; el catálogo histórico de trading en `/app/marketplace/trading`. Las páginas de resultados y las suscripciones existentes conservan sus URLs y datos.

## Activación

Estado del 27 de octubre de 2026: migración 0032 aplicada en Supabase y comprobación SQL de privacidad aprobada en la base real, con rollback de todas sus cuentas y registros temporales. No volver a ejecutar la migración sobre tablas ya creadas.

1. Aplicar `supabase/migrations/0032_ml_learning_projects.sql` después de 0031. Es aditiva y no convierte ni elimina registros de trading.
2. Publicar el worker con `ml_learning.py` y su router registrado en `main.py`.
3. Publicar la web. Utiliza las variables públicas y autenticación existentes.
4. La cola `/app/admin/notebooks` utiliza los administradores actuales del panel. Para añadir revisores hay que sincronizar `ADMIN_USER_IDS` del worker con la lista administrativa del proxy web y su navegación; configurar únicamente el worker no habilita la página administrativa.

No hay una migración automática de hipótesis o modelos a partir de textos históricos. Los proyectos nuevos se crean explícitamente.

## Recorrido

- `/app/learn`: entrada al aprendizaje práctico.
- `/app/learn/first-tournament`: reglas, archivos reales de la ronda abierta, notebooks, revisión del CSV y comprobante. Preparación tiene tres confirmaciones declaradas por la persona; el envío es comprobado por el servidor. No se afirma que un clic pruebe una descarga o entrenamiento.
- `/app/learn/missions`: tres misiones sintéticas versionadas. El servidor evalúa predicciones o respuestas; los intentos y finalizaciones son privados. No generan premios QP ni modifican rankings.
- `/app/learn/glossary`: ejemplos interactivos, explícitamente ilustrativos, de MAE, purga temporal, volatilidad y puntuación semanal. Spearman se presenta por separado.
- `/app/learn/errors`: reconstruye el error del CSV propio seleccionado después de la liberación completa de la semana. No usa símbolos/targets privados antes del cierre ni CSV de terceros.

## Proyectos y versiones

Las tablas nuevas son `ml_research_projects`, `ml_project_versions`, `ml_project_submissions` y `ml_research_publications`. El protocolo de un proyecto es inmutable. Cambiar de protocolo requiere otro proyecto.

Las versiones guardan una copia de la hipótesis, modelo, parámetros, semilla opcional, dependencias, versión de dataset, nota privada y MAE declarado de validation (solo retornos). No acreditan que el entrenamiento haya sucedido. Las versiones no tienen endpoint de actualización.
La práctica sintética admite Spearman medio de validation entre −1 y 1; el servidor rechaza métricas de otro protocolo.

Un comprobante se vincula solo después de comprobar propietario de proyecto, versión y envío. Si la ficha declara versión de dataset, tiene que coincidir con la del comprobante. Un vínculo no altera selección ni puntuación. Las métricas oficiales siguen en los comprobantes originales con su embargo vigente.

Los notebooks Jupyter v4 se limitan a 2 MB y 300 celdas. Se eliminan outputs, attachments y metadatos de ejecución; el código y texto de las celdas siguen siendo contenido no confiable. Los archivos se guardan con nombre nuevo en el bucket privado de targets, y se verifican por SHA-256 al descargar. No se ejecutan ni se renderizan como HTML.

## Publicación y revisión

La publicación comparte solo una copia explícita de la hipótesis, modelo, parámetros, semilla, dependencias y notebook, junto con descripción, limitaciones y licencia. Excluye nota privada, CSV, IDs de comprobantes y métricas declaradas de validation. La persona confirma sus derechos y revisa el código antes de compartirlo.

Estados: `pending_review`, `published`, `rejected`, `withdrawn`. Solo administradores del worker aprueban contenido. La revisión comprueba formato, contextualización, licencia y ausencia visible de secretos/datos ajenos. **No otorga una insignia de ejecución reproducida.** La UI dice «contenido revisado · ejecución no verificada»; no se inventa rendimiento ni adopción. Para una ejecución verificada futura haría falta infraestructura aislada específica.

Las publicaciones aprobadas se consultan y descargan mediante API; Storage sigue privado. Autor y revisor pueden consultar propuestas pendientes. El autor puede retirar una publicación. Un fork crea un proyecto y una versión privados, conservando publicación de origen y licencia. Retirar una publicación no borra copias previamente autorizadas.

## Acceso e integridad

Todas las tablas nuevas tienen RLS. El cliente puede leer sus propios registros; no tiene políticas de escritura directa. Las mutaciones pasan por el worker autenticado, que determina notas de misiones, propiedad, estados y moderación. Las publicaciones públicas usan una lista explícita de campos; las rutas de Storage nunca salen en el JSON.

El laboratorio verifica el mismo criterio de liberación completa que la API semanal, descarga el JSON liberado y el CSV propio comprobando sus hashes, y vuelve a calcular MAE, referencia cero y score. Los ejercicios descriptivos no diagnostican sobreajuste ni superioridad estadística. La lista inicial cubre las semanas/envíos recientes; también admite el ID de una ronda anterior.

Los archivos se escriben antes de registrar su versión; un fallo posterior de base de datos puede dejar objetos privados huérfanos, pero no una versión pública incompleta. No se hace borrado automático de archivos durante esta entrega.

## Verificación

`worker/tests/test_ml_learning.py` cubre privacidad, limpieza e integridad de notebooks, versiones inmutables, compatibilidad de dataset, moderación, retirada, fork, misiones y embargo semanal. Las pruebas de contrato no sustituyen la comprobación de RLS con PostgreSQL real.
`supabase/tests/ml_learning_privacy.sql` comprueba aislamiento y denegación de escrituras directas en PostgreSQL dentro de una transacción con rollback. Debe ejecutarse después de aplicar la migración; no es una prueba de servicios ejecutada automáticamente por pytest.

`web/e2e/ml-learning.spec.ts` recorre proyectos, misiones, glosario y biblioteca con servicios simulados en escritorio y móvil. La configuración usa los mismos hosts públicos que el resto de pruebas de QuantLab.

## Resultado de verificación local · 27 de octubre de 2026

- Compilación de producción y TypeScript: aprobados.
- Lint de los módulos nuevos y su configuración: aprobado.
- Seis pruebas nuevas del worker: aprobadas; cubren varios escenarios de propiedad, revisión, integridad, progreso y embargo.
- Veinticinco pruebas existentes de torneos ML y retornos: aprobadas.
- Veinte casos de navegador en escritorio y móvil: aprobados. La última ejecución completa del módulo nuevo aprobó catorce casos de aprendizaje/proyectos; los seis casos existentes de retornos también aprobaron. Los casos nuevos comprueban que una consulta fallida no se anuncia como vacía y que reintentar un análisis repite la solicitud del informe.
- Capturas de los contratos de navegador: `artifacts/ml-learning/`. Son datos y sesiones simulados de prueba; no evidencia de participación externa ni de producción.
- Detector visual mecánico: sin hallazgos en la superficie nueva.

La revisión de navegador encontró una redirección histórica `/app/learn/* → /app/academia` que interceptaba las páginas nuevas. Se retiró y se verificaron de nuevo los recorridos. Se conservan las rutas de Academia.

La revisión visual independiente pidió tres correcciones: diferenciar disponibilidad desconocida de ausencia confirmada, retirar prefijos internos de los errores y repetir la operación fallida, y preservar el tamaño de etiquetas temporales en móvil. Se aplicaron en una tanda y se recapturaron las mismas pantallas; la cronología ahora tiene desplazamiento local, leyenda HTML y texto oscuro sobre la celda de purga.
El pase de veredicto independiente marcó las tres correcciones como resueltas, con disposición `ship` limitada a esas correcciones; no constituye una certificación del resto de la plataforma ni de servicios reales.

La migración 0032 se aplicó mediante la API de administración al proyecto Supabase de QuantLab. El guion SQL de privacidad pasó contra PostgreSQL real y revirtió sus registros temporales. La publicación se realiza mediante push a `main`, con comprobación posterior de los despliegues de Render/Vercel y de las rutas públicas y autenticadas. Los servicios del torneo anterior mantienen sus datos y reglas.
