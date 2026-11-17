# Verificación del recorrido publicado

## Incidencias encontradas

El registro público devolvió `Database error saving new user` durante la prueba
manual. La función publicada `handle_new_user` ignoraba los metadatos del
formulario y asignaba el nombre a partir del correo. Correos distintos con la
misma parte local podían chocar con los índices únicos de perfiles.

La migración `20261117043000_safe_signup_profiles.sql` utiliza el alias elegido
si su formato es válido. Si está ocupado, asigna un alias único para completar
el alta. Para metadatos ausentes o inválidos genera un identificador sin exponer
el correo. No modifica perfiles existentes ni desactiva la confirmación del correo.
El usuario conserva la opción habitual de editar su perfil.

La web deja de intentar escribir el perfil sin sesión después de `signUp`:
Auth y el perfil se guardan en la misma transacción mediante el trigger.

También faltaba la ronda actual en el catálogo: solo aparecía la ronda finalizada
del 10 de noviembre. El archivo comprometido para el 17 de noviembre sí existía,
con 49 filas, modo `live`, generado el 17 a las 02:02 UTC y huella correcta.
Se recuperó su registro mediante el mismo verificador del generador, manteniendo
el manifiesto y el cierre original, 17 de noviembre a las 14:00 UTC (09:00 COL).

El árbitro ahora reconcilia el último compromiso antes de evaluar, y los reintentos
del generador recuperan el registro aunque los archivos ya existan. Después de
insertar una ronda se comprueba su presencia y huella en la base de datos: una
escritura sin confirmación provoca un fallo visible. Los compromisos vencidos
sin registro se omiten; no se abren rondas retrospectivas.

La evidencia disponible confirma la discrepancia entre archivos y catálogo,
pero no permite atribuir por sí sola por qué faltó la inserción original. La
recuperación y la comprobación posterior cubren esa discrepancia. La puntualidad
de los cron y las alertas de publicación requieren la revisión operativa siguiente.

## Comprobaciones realizadas

- El nuevo test SQL falló con la función anterior porque ignoraba el alias elegido.
- La función corregida y sus casos se probaron primero en una transacción revertida.
- La migración se aplicó al proyecto publicado y se repitieron las comprobaciones:
  alias elegido, misma parte local con dominios distintos, colisión por mayúsculas,
  metadatos inválidos y ausentes, y nombre visible. Todas aprobaron.
- Las identidades técnicas del test SQL se revirtieron; su recuento final fue cero.
- Las pruebas de navegador de autenticación aprobaron en escritorio y móvil
  (14 casos); no envían correos ni sustituyen el alta manual.
- Las pruebas de generación/evaluación diaria aprobaron (40 casos y un caso
  opcional de histórico local omitido).
- Compilación, tipos y lint de la web: aprobados.

No se guardan correos personales, contraseñas ni tokens en este informe.
El registro manual, la entrega del correo, la sesión del participante y su primer
envío se marcan completos solo después de observarlos en el sitio publicado.
