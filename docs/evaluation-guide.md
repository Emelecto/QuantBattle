# Guía de evaluación · QuantBattle / DeepFin

Autor: Emilio Cardona Lopez · Universidad EIA · Semillero DeepFin.

## Recorrido de la demostración

1. Abrir `/docs#evaluacion`. Se puede inspeccionar el protocolo y la evidencia sin registrar una cuenta.
2. Descargar el informe JSON enlazado. Contiene la versión del dataset, las configuraciones del modelo, resultados por era y las comprobaciones del ciclo completo.
3. Abrir el torneo de demostración enlazado. La cuenta técnica está identificada y sus resultados proceden de mercado artificial. La tabla se publica únicamente tras el cierre.
4. Para participar, registrar una cuenta y abrir Torneos. Comprobar allí que la ronda de práctica figure como activa y leer su fecha de cierre; el piloto técnico cerrado se muestra por separado. Descargar train, validation y live. Entrenar con train, escoger configuración con validation y producir `id,prediction` para todos los IDs de live.
5. Subir el CSV en Enviar. Un archivo aceptado queda validado; su puntuación aparece después del cierre. Un segundo archivo válido reemplaza la selección anterior. Un archivo inválido no reemplaza el último válido.

La programación revisa primero las rondas vencidas y después decide si publica la siguiente. La prueba del estado vigente debe hacerse en Torneos; las fechas de capturas y paquetes antiguos corresponden a ejecuciones registradas.

## Qué prueba la evidencia

El piloto técnico usa una cuenta controlada por el proyecto, Supabase y Storage reales y la API desplegada. Comprueba descargas y hashes, autenticación, rechazo de CSV inválido, selección del último archivo válido, ausencia de puntuación anticipada, privacidad del holdout y de sus metadatos, cierre, ranking público, reproducibilidad del score y finalización idempotente.

El modelo de referencia es HistGradientBoostingRegressor. Se ajustan dos tamaños de árbol con los mismos parámetros y semilla; se elige usando la media de Spearman en validation. El holdout live no interviene en el entrenamiento ni en esa selección. Las referencias son predicción seudoaleatoria determinista y la primera variable pública.

## Interpretación y límites

- La prueba demuestra funcionamiento técnico de una ronda y una ejecución experimental; no representa adopción externa.
- El generador incorpora factores, regímenes y ruido. Su parámetro de señal configura el escenario artificial, no garantiza que un algoritmo concreto supere al azar.
- La métrica mide orden relativo entre activos artificiales. No incluye costos, ejecución, cartera ni rentabilidad.
- Las rondas reales requieren resolver las condiciones de distribución de los datos. La programación automática publica práctica por defecto.
- El uso de Hermes Agent en el desarrollo fue informado por el autor. Las trazas de sus sesiones deben aportarse por separado para estudiar su contribución; el piloto no mide causalmente productividad ni calidad atribuible al agente.
- La preparación de esta versión para evaluación incluyó cambios y pruebas asistidos por Codex. Al reconstruir la procedencia del código, distinguir esas intervenciones de las sesiones anteriores de Hermes y de las decisiones humanas del autor.

## Contingencia durante la presentación

Si el worker está iniciando, esperar un minuto y volver a intentar. La documentación y el informe JSON son archivos servidos por la web y permiten revisar la evidencia aunque el worker no responda. Un fallo de red debe mostrarse como tal; no sustituir resultados por métricas inventadas.

## Evidencia adicional para el informe colectivo

El autor debe incorporar las sesiones exportadas de Hermes, registrar las tareas delegadas y los cambios humanos relevantes, y obtener retroalimentación de participantes identificados como externos o de prueba. La evidencia técnica de este repositorio no reemplaza esos datos humanos.
