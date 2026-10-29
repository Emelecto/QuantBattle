# Operación del piloto y contingencias

Responsable técnico del piloto: Emilio Cardona López, mantenedor del repositorio. Canal público de incidencias: https://github.com/Emelecto/QuantBattle/issues/new?template=bug_report.yml. La plantilla pide ruta, momento, pasos y resultado esperado, e indica que no deben compartirse credenciales ni archivos privados. No existe un tiempo de respuesta garantizado.

## Antes de una convocatoria

1. Confirmar el estado en `scripts/check_release.py` para el commit que está desplegado.
2. Revisar Torneos: distinguir práctica sintética de retornos reales, comprobar las cuatro rondas, plazos y archivos. Un piloto histórico cerrado no equivale a una inscripción abierta.
3. Confirmar secretos de GitHub por nombre: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATASET_SALT`; verificar que `TESTING` y `ALLOW_TEST_AUTH` estén ausentes de despliegues.
4. Ejecutar manualmente **Daily return tournament referee**, con `check_only=true`: comprueba configuración y esquema sin mutaciones. Después ejecutar el tick normal; conserva las fechas reales y nunca fabrica datos futuros.
5. Ejecutar **operations-monitor** y revisar `/admin/launch-readiness` con una cuenta administradora. La salud básica `/health` no comprueba base de datos ni archivos.
6. Tener una semana real completa revisada antes de convocatoria abierta. Hasta entonces presentar la disponibilidad como piloto controlado.

## Variables de operación

- `ML_DAILY_TOURNAMENTS_ENABLED=true`: activa el flujo de retornos reales, independiente de la práctica y de los modos históricos anteriores.
- `ML_DAILY_TOURNAMENTS_CREATE_ENABLED=false`: pausa nuevas generaciones. El árbitro sigue liquidando predicciones existentes, registra plazos perdidos y publica al terminar el embargo. El valor ausente equivale a `true`.
- `ML_REAL_ROUNDS_APPROVED` gobierna los modos históricos/prospectivos anteriores del scheduler general; no debe activarse como requisito del torneo de retornos de cuatro rondas.

El árbitro solicita ejecución cada 30 minutos. GitHub puede retrasarla; la aceptación de CSV usa `clock_timestamp()` y un bloqueo transaccional, por lo que un retraso no amplía el plazo. No cambiar `DATASET_SALT` durante una semana abierta.

## Señales y recuperación

`operation_runs` guarda únicamente identificador de ejecución, SHA, fechas, estado y contadores. Está cerrada para `anon` y `authenticated`. Un comienzo queda en `running`; un éxito registra `success`; un fallo registra `failed` y un código opaco. No se guardan mensajes con símbolos ni secretos.

El monitor horario es independiente del árbitro. Falla si el último registro no terminó bien en las tres horas anteriores, pertenece a otro commit o si una liquidación/publicación lleva más de dos horas vencida. El fallo queda visible en GitHub Actions y utiliza las preferencias de notificación del mantenedor; no se presupone que un correo externo haya sido entregado.

Ante un fallo:

1. Revisar Actions, `/admin/launch-readiness` y los registros privados del servicio. No publicar logs con datos privados.
2. Si hace falta contener generación, pausar solo `ML_DAILY_TOURNAMENTS_CREATE_ENABLED`; conservar el árbitro activo.
3. Corregir configuración o fuente y ejecutar el tick manual. El flujo es idempotente: no crear rondas o resultados manuales para aparentar continuidad.
4. Si faltan precios, mantener la ronda pendiente y comunicar el retraso. Los resultados continúan embargados hasta resolver toda la semana. No eliminar activos para completar artificialmente un ranking.
5. Para recuperar generación, reactivar la variable y repetir el monitor. Guardar la incidencia, impacto y resultado en el registro del piloto.

Si el worker inicia lentamente, reintentar después de un minuto. La documentación y evidencia estática siguen disponibles. Los pagos están desactivados y fuera de esta entrega; no anunciar premios monetarios ni suscripciones de pago.
