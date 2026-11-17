# Catálogo de torneos e historial de envíos

La entrega sustituye la pantalla centrada en una sola competición por tarjetas
independientes y separa el historial personal de Inicio. Los componentes usan
la paleta, tipografía, navegación y logo existentes.

## Recorridos

- `/app/tournaments`: catálogo con filtros de abiertos, en evaluación y
  finalizados. Cada tarjeta abre su ronda con plazo, datos y formulario propio.
  La paginación conserva las tarjetas cargadas y los contadores se refieren
  explícitamente a ese conjunto cuando faltan páginas por consultar.
- `/app/tournaments/stocks-oc-AAAA-MM-DD`: descargas verificadas, reglas del CSV,
  envío autenticado y comprobantes. El formulario desaparece al vencer el plazo.
- `/app/submissions`: historial privado, filtros por estado y fechas, páginas de
  20 registros y comprobante desplegable. Los contadores resumen la página
  actual. Los intentos anteriores permanecen identificados. Las puntuaciones
  no se devuelven antes de la evaluación completa de la ronda.
- Inicio conserva las tarjetas de actividad y no muestra descargas ni la lista
  de rondas. Los enlaces antiguos `/app#historial-ml` llevan al historial nuevo.
- Datos conserva sus descargas y lista de rondas; sus textos no nombran al proveedor.

`competitionCatalog.ts` adapta las rondas publicadas a tarjetas independientes
de su modalidad. Hoy su única fuente es el torneo diario existente. Añadir
otra modalidad requiere su fuente y lógica de competición, no tarjetas ficticias.
No se añadieron premios, participantes, nombres de archivo ni métricas inventadas.

## Publicación

Desplegar worker y web de esta misma entrega juntos: la web necesita
`GET /ml/stock-rounds/{round_id}` y `GET /ml/stock-submissions/mine`.
El catálogo amplía `/ml/stock-rounds` con `offset`, `limit` y `has_more` sin
retirar los campos existentes. No hay migraciones nuevas; requiere el esquema
de rondas y envíos de acciones de la migración 0034 ya existente.

## Verificación reproducible

Desde `worker`: `python -m pytest tests/test_stock_api.py stocks_daily/test_tournament.py -q`.
Desde `web`: compilar primero con los valores aislados documentados en
[launch-validation-2026-11-16.md](launch-validation-2026-11-16.md) y ejecutar
`npx playwright test --config=playwright.competitions.config.ts`.
Ambos conjuntos de navegador usan esa compilación de producción y conservan
sus informes JSON separados.

Las pruebas de navegador usan una identidad aislada y respuestas controladas;
no envían archivos ni cambian cuentas o torneos de producción. Las pruebas del
servidor comprueban autorización previa al almacenamiento, filtro obligatorio
por propietario, embargo de resultados, límites y filtros de consultas, CSV y
evaluación. No sustituyen la comprobación posterior al despliegue contra los
servicios y la base de producción. Capturas: `artifacts/competitions-review`.
