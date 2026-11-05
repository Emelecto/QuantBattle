# Operación de Render y retornos de acciones

Render sirve la API y autentica a los participantes. GitHub Actions genera los
datasets y evalúa las predicciones. Supabase conserva rondas, comprobantes,
resultados y archivos privados. Generación y evaluación no dependen de que
Render esté despierto, ni usan su disco temporal.

## Cambios de noviembre de 2026

- Health check de Render: `/health`; instancia Free, un proceso, sin cambio de plan.
- Sonda independiente desde Supabase cada diez minutos, con evidencia de la
  respuesta HTTP. El monitor distingue disponibilidad de Render, evaluación
  fallida y ausencia de ejecuciones recientes en GitHub.
- Cron de evaluación de cripto en minutos 7 y 37; monitor en el minuto 23.
  Se conserva el aviso si pasan tres horas sin una evaluación correcta.
- Acciones: tablas, almacenamiento, recepción y puntuación separados de cripto
  y del protocolo anterior de rankings. No se reinterpretan CSV antiguos.

## Acciones

La generación intenta publicar a las 20:37, 21:07 y 21:37 de Nueva York. Acepta
publicaciones solamente entre las 20:30 y las 22:00 de la sesión observada.
Respeta festivos, sesiones cortas y cambios de horario mediante XNYS. El usuario
predice la siguiente sesión y entrega un CSV `id,prediction` antes de las 09:00
de Nueva York. Un 0.02 representa +2 %. Se conserva el último envío válido.

El workflow también intenta liquidar a las 13:37, 16:37, 17:37 y 18:37. Requiere
al menos treinta minutos desde el cierre oficial; nunca usa una vela en curso.
Si faltan datos, no elimina acciones para conseguir una puntuación: reintenta.

El resultado real es `cierre/apertura - 1`, con precios diarios SIP de Alpaca,
sin ajustes. Se guardan precios y respuesta del proveedor antes de puntuar.
La puntuación es `(MAE_cero - MAE_modelo) / max(MAE_cero, 0.005)`; cero es la
referencia que predice retorno nulo. No es rentabilidad de una cartera.

API autenticada: `/ml/stock-rounds`, y por ronda `/download/{filename}`, `/mine`,
`/predictions` y `/results`. Las descargas caducan en cinco minutos. La pantalla
existente de cripto sigue usando `/ml/return-tournaments`; una interfaz de
acciones debe consumir las rutas nuevas.

## Verificación y límites

Las pruebas cubren CSV completos, valores inválidos, conservación de envíos,
resultados ocultos hasta liquidar, reintentos con precios congelados y calendario.
`supabase/tests/stock_return_deadline.sql` verifica sustitución atómica y rechazo
al cruzar la hora de cierre en una transacción que se revierte por completo.

El plan gratuito de Render y los horarios de GitHub no ofrecen disponibilidad
ni puntualidad garantizadas. Las sondas reducen suspensión por inactividad y
detectan fallos; no garantizan servicio continuo. No se ocultan alertas por
retrasos. Ninguna ronda se publica retroactivamente para simular participación
prospectiva. El estado privado está sembrado desde el histórico local; los
datasets diarios futuros se publican únicamente en su ventana válida.

Los datos históricos conservan sesgo del universo fijo, dependencia de un
proveedor y límites de reconstrucción histórica. Los permisos de redistribución
y uso comercial de datos siguen pendientes de confirmar con el proveedor.
