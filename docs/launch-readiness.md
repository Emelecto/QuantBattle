# Preparación para lanzamiento

Estado del producto: **piloto controlado**. Una URL pública identifica dónde se puede evaluar; el estado de la convocatoria se decide con la evidencia de la versión publicada.

## Alcance y evidencia

`release/scope.json` es el inventario versionado. Cada recorrido tiene fuentes concretas; no se usa un porcentaje de cobertura como sustituto de completar acciones.

| Recorrido | Evidencia automatizada | Límite práctico |
| --- | --- | --- |
| Landing, documentación, registro y recuperación | `auth`, `research`, `redesign` en Playwright | Las solicitudes de recuperación están interceptadas: no se envían correos durante pruebas |
| Academia | Quiz aprobado/reprobado, reintento, persistencia, progreso sin duplicados; RLS y escritura real en staging | El progreso local es por navegador; el correo de onboarding y la revisión pedagógica necesitan evaluación humana |
| Práctica ML y retornos reales | Contratos de API/calendario/embargo, revisión del CSV, cierre transaccional en PostgreSQL | El calendario simulado no equivale a una semana real transcurrida |
| Proyectos ML y biblioteca | Crear versiones, limpiar/integrar notebook, moderar y copiar; Auth/Storage/Postgres reales en staging | No se ejecuta código de notebooks de participantes ni se certifica su rendimiento |
| Backtesting | Envío autenticado, validación, ejecución/guardado/recuperación en navegador; persistencia y privacidad reales en staging; motor con series deterministas | Los tests de transporte no validan todas las fuentes de mercado ni una estrategia rentable |
| Dashboard y cuenta | Analítica, caché por cuenta, ranking, navegación y recuperación de errores | No acredita uso externo del producto |
| Operación | Registro privado duradero del árbitro, alertas por retraso/fallo, prueba de pausa de creación con liquidación | GitHub puede retrasar el inicio de un cron; el plazo se aplica con el reloj real de la base |

Los navegadores se ejecutan en escritorio y móvil. Las simulaciones y servicios reales se reportan por separado. En staging se crean cuentas confirmadas y desechables: no se envían correos, no se usan participantes humanos y se limpian archivos/filas al terminar.

## Controles de la versión

- `web-ci`: lint con cero errores y cero advertencias, tipos, auditoría de dependencias de producción, compilación y navegador. El reporte de lint anterior era 70 errores y 4 advertencias; la corrección mantiene todas las reglas activas.
- `backend-ci`: pruebas del servidor sin pruebas externas y reporte JUnit.
- `database-ci`: esquema y todas las migraciones desde cero; SQL de privacidad y cierre; integración real con Auth, PostgreSQL, Storage y worker locales aislados.
- `Daily return tournament referee`: configuración comprobada y tick real registrado sobre la versión publicada.
- `operations-monitor`: último árbitro del mismo commit terminado correctamente en menos de tres horas, ausencia de liquidaciones/publicaciones vencidas por más de dos horas.
- `scripts/check_release.py`: requiere resultados satisfactorios de los workflows requeridos y despliegues de Vercel/Render sobre el mismo SHA. Un resultado ausente, pendiente, fallido o de otra versión bloquea la aprobación.

Los informes son artefactos de cada ejecución. Los informes locales indican si se generaron con cambios aún sin commit. No escribir una afirmación de “CI aprobada” en el README a partir de que el YAML existe.

## Estados de publicación

1. **Plataforma pública:** documentación y producto accesibles; no presume que todos los recorridos estén aprobados.
2. **Piloto controlado:** controles automáticos y operación verificados para el alcance anterior; uso con un grupo acotado y soporte identificado.
3. **Convocatoria abierta:** además, semana real completa publicada y reproducida, incidencias críticas resueltas y retroalimentación externa revisada.

`release/pilot-evidence.json` empieza con referencias vacías para los dos requisitos humanos/temporales. Completarlo únicamente con una semana real ya liberada, una revisión guardada y feedback real, consentido y anonimizado. Ejecutar después `python scripts/check_release.py --stage open-call`. Las cuentas técnicas nunca cuentan como usuarios externos. No publicar afirmaciones de rentabilidad de cartera derivadas del score de un torneo.

## Reproducción aislada

Con Docker, Supabase CLI 2.120.0, Python y dependencias del worker:

```text
python scripts/verify_database.py --workdir artifacts/quantbattle-validation --start --bootstrap
python scripts/verify_product_staging.py --workdir artifacts/quantbattle-validation
supabase stop --workdir artifacts/quantbattle-validation
```

Usar una carpeta nueva para `--bootstrap`: la migración 0032 es aditiva y no se reaplica sobre un esquema ya creado. El proyecto debe llamarse `quantbattle-validation` o `launch-staging` y usa los puertos 55321/55322. Los scripts rechazan proyectos remotos. No sustituyen ni detienen otros proyectos de Docker.
