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

## Cierre de las prioridades · 23 de octubre de 2026

El resumen personal, historial de experimentos y revisión previa del CSV están implementados y publicados; el flujo se comprobó en producción con 42 000 predicciones de la cuenta técnica. Se archivaron nueve publicaciones del catálogo sin evidencia suficiente y se protegieron tres por suscripciones.

La revisión posterior de las dieciséis rutas autenticadas no registró errores de página ni solicitudes fallidas. Se comprobó cambio de contraseña con inicio de sesión posterior, creación y revocación de una clave desechable y recuperación del ranking ante un fallo simulado. Las consultas concurrentes se verificaron después de corregir el transporte compartido del cliente de base de datos.

Se corrigieron el destino de recuperación de contraseña, mensajes de autenticación con caracteres %, reenvío de confirmación y destinos del callback. El ranking histórico diferencia ausencia de actividad de un error, excluye cuentas en cero y muestra también listas con uno o dos registros. La demo pública remite al piloto ML reproducible; las páginas informativas distinguen datos sintéticos y resultados históricos.

La página Estado comprueba conectividad de la API y espera el posible arranque inicial. Explica expresamente que esa consulta no certifica base de datos, archivos ni puntuación. Los fallos concretos se recuperan desde el historial, comprobante o ranking correspondiente.

## Próximas mejoras que requieren trabajo adicional

1. **Recordatorios opcionales:** implementarlos con consentimiento, preferencias persistidas y un canal real antes de exponer controles de configuración.
2. **Prueba con personas externas:** observar de tres a cinco participantes descargando datos y enviando predicciones; registrar bloqueos, tiempos y comentarios como observaciones reales.

Conviene completar estas mejoras alrededor de los torneos antes de ampliar premios, pagos o nuevas funcionalidades de backtesting.
