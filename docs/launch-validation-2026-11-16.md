# Corrección de las pruebas previas al lanzamiento

## Diagnóstico

La ejecución `web-ci` 43981160259 del commit `6a78353` terminó con 30 fallos,
46 casos aprobados y 18 omitidos. Los principales problemas eran:

- Las identidades simuladas existían solo en el navegador. El proxy del servidor
  consultaba un host ficticio y rechazaba correctamente el acceso al dashboard.
- Varias expectativas seguían el encabezado anterior, el historial en Inicio y
  la guía previa a las rondas diarias.
- Cuatro contratos de datasets se omitían por falta de credenciales reales,
  aunque sus respuestas y archivos ya estaban interceptados.
- El laboratorio de errores consultaba las funciones retiradas del torneo semanal,
  que devolvían listas vacías. No descubría los envíos actuales ni podía informar
  un fallo real al consultar ese historial.

## Correcciones

Las pruebas usan ahora un servicio local de identidad para el navegador y el
servidor. Acepta únicamente las firmas artificiales de los contratos; no forma
parte de los scripts de inicio del producto. La protección de producción no se
modifica. Se comprueban acceso autenticado, rechazo anónimo y rechazo de una
sesión almacenada cuyo token no admite el servicio de identidad.

Se actualizan las expectativas al flujo vigente conservando las comprobaciones
de errores, navegación, CSV, integridad de descargas, evaluación y privacidad.
Los contratos de datasets dejan de depender de una cuenta real.

El laboratorio consulta el historial privado de envíos evaluados, con paginación.
Su informe de rondas diarias exige autenticación, propietario, selección,
puntuación y ronda liquidada. Verifica las huellas del CSV y del resultado,
el manifiesto y la cobertura de activos antes de reconstruir el diagnóstico.
Los informes históricos conservan sus restricciones anteriores.

## Reproducción

Antes de compilar la web para los contratos generales, establecer:

| Variable | Valor aislado |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:3331` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `isolated-release-fixture` |
| `NEXT_PUBLIC_WORKER_URL` | `http://127.0.0.2:3332` |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3100` |

Los hosts de frontend, identidad y worker son distintos para que las respuestas
interceptadas no capturen por error la página o el servicio de identidad.
Estos valores pertenecen al entorno de pruebas, no a Vercel ni a Render.

Desde `web`, ejecutar `npm run lint -- --max-warnings=0`, `npm audit --audit-level=low`,
`npx tsc --noEmit`, `npm run build` y `npm run test:e2e`.
El catálogo y el historial se ejecutan por separado con
`npx playwright test --config=playwright.competitions.config.ts`; el workflow
ejecuta ambos conjuntos y conserva sus informes JSON separados.

Desde `worker`, con sus dependencias instaladas, ejecutar
`python -m pytest tests/ -q -m "not external"`.

## Resultado local

Verificado sobre `6a78353` más los cambios de esta entrega antes del commit:

- Compilación de producción, TypeScript y lint sin advertencias: aprobados.
- Auditoría de dependencias completas, incluidas las de desarrollo: cero vulnerabilidades.
- Navegador general: 88 aprobados, sin fallos ni omisiones.
- Navegador de catálogo e historial: 14 aprobados, sin fallos ni omisiones.
- Servidor: 240 aprobados; 17 casos externos excluidos expresamente.

Los resultados de GitHub y de los despliegues deben verificarse sobre el commit
publicado; este informe local no los sustituye.

## Alcance

Las pruebas de navegador usan cuentas y respuestas controladas. Las del servidor
usan dobles de almacenamiento y base de datos. No demuestran entrega de correos,
una sesión real en producción, publicación puntual de rondas ni uso externo.
Esas verificaciones siguen formando parte de los próximos pasos del lanzamiento.
Esta entrega no requiere migraciones nuevas; web y worker deben publicarse juntos.
