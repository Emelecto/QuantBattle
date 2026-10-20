# Revisión del dashboard · 20 de octubre de 2026

Alcance: inicio, torneos, estrategias y editor, marketplace y suscripciones, Academia, datasets, claves API, perfil, configuración, logros, referidos, wallet y ranking. Las verificaciones autenticadas usan exclusivamente una cuenta técnica del proyecto. No equivalen a una prueba de adopción externa.

## Correcciones

- El inicio consulta rondas ML publicadas con el protocolo actual, selecciona la última ronda de cada torneo y comprueba su plazo real. Omite contenedores heredados sin datos y rondas cerradas.
- Los torneos de práctica indican datos sintéticos y ausencia de premios. El envío mostrado corresponde al archivo seleccionado; no a un intento anterior arbitrario.
- El menú móvil incluye las secciones que antes solo estaban en escritorio; recupera los iconos de perfil y volver. Añade nombres accesibles y un estado explícito del menú.
- Las tarjetas se adaptan al ancho disponible y la grilla evita forzar dos filas de igual altura con grandes espacios vacíos.
- La analítica comparte constantes compatibles con el servidor. Sus rutas ya no importan datos de un módulo marcado exclusivamente para navegador.
- La guía de claves API redirige a la documentación MCP existente. Las consultas, creación y revocación usan el cliente común de sesión y errores; una revocación fallida no se anuncia como exitosa. Los fallos del portapapeles ofrecen copia manual.
- Las estrategias usan cachés por usuario. Las copias antiguas sin propietario identificado se conservan intactas y no se asignan automáticamente a ninguna cuenta. Las estrategias guardadas se recuperan de Supabase, incluidos resultados privados propios.
- El perfil cuenta torneos únicos de ambos flujos, incluido ML, sin multiplicar participaciones por cada archivo enviado. El progreso de Academia descarta duplicados, identificadores desconocidos y borradores.
- El cambio de contraseña tiene un formulario funcional con confirmación y errores. Cerrar sesión comprueba la respuesta de autenticación. La eliminación de cuentas y la configuración de correos todavía no existen; se indican como no disponibles.
- El ranking distingue errores de ausencia de actividad, permite reintentar e ignora respuestas de filtros anteriores. Las victorias acumuladas se describen como acumuladas.
- Las suscripciones muestran los errores al pausar, reanudar o cancelar; el encabezado puede envolver en móvil.
- El tour inicial explica el flujo ML y sus límites; elimina promesas de premios que no corresponden a estas rondas.

## Verificación y límites

Se verifican compilación de producción, tipos, contrato de analítica y aislamiento de caché. El recorrido autenticado examina 16 rutas y comprueba navegación móvil, recibo ML, validación de contraseñas, creación/revocación de una clave desechable y recuperación de un error simulado del ranking. La simulación afecta únicamente la solicitud del navegador de prueba, no la base de datos ni el servidor.

El script `web/scripts/dashboard-audit.mjs` requiere `QL_ENABLE_LIVE_UI_TEST=true`, credenciales locales de administración y los manifiestos locales del piloto técnico. Solo modifica la contraseña y la clave desechable de esa cuenta. No usar una cuenta humana para este procedimiento.

La comprobación de escritorio y móvil no certifica todos los proveedores históricos, operaciones comerciales ni combinaciones posibles de datos. En la revisión inicial hubo respuestas 500 intermitentes del worker en balance/claves; las consultas directas posteriores respondieron 200. Se reforzó la recuperación y no se atribuyó una causa no demostrada. La política CORS de producción se mantuvo cerrada para orígenes locales; la integración completa se comprueba en el preview publicado.

## Mejoras propuestas, por prioridad

1. **Resumen personal de ML:** ronda, fecha de cierre en Colombia, estado del archivo seleccionado, versión y acceso al comprobante. Después del cierre, mostrar score por era y referencias de esa misma ronda. No mezclar scores de rondas diferentes en un único ranking.
2. **Historial de experimentos:** vincular cada envío con nombre del modelo, configuración, semilla, versión del dataset y nota del participante. Facilita reproducibilidad e informe científico.
3. **Revisión del CSV antes de enviar:** mostrar cantidad de filas, cobertura de IDs, duplicados y valores inválidos. El servidor conserva la validación definitiva.
4. **Estado del servicio:** distinguir inicio del worker, desconexión y consulta fallida; conservar el trabajo del participante y ofrecer recuperación contextual.
5. **Recordatorios opcionales:** implementarlos con consentimiento, preferencias persistidas y un canal real antes de exponer controles de configuración.
6. **Prueba con personas externas:** observar de tres a cinco participantes descargando datos y enviando predicciones; registrar bloqueos, tiempos y comentarios como observaciones reales.

Conviene completar estas mejoras alrededor de los torneos antes de ampliar premios, pagos o nuevas funcionalidades de backtesting.
