# QuantLab · DeepFin / Universidad EIA

Prototipo de investigación de Emilio Cardona Lopez para una comunidad de investigación cuantitativa en español. Incluye **práctica sintética con piloto reproducible** y un **torneo semanal de cuatro rondas prospectivas de retornos reales**, con validación de CSV, fuentes privadas y publicación de resultados solo al cierre completo.

- Plataforma: https://quant-lab-nine.vercel.app
- Evaluación técnica y resultados: https://quant-lab-nine.vercel.app/docs#evaluacion
- [Protocolo ML](docs/ml-tournaments.md)
- [Torneo semanal de retornos reales](docs/daily-return-tournaments.md)
- [Guía para evaluadores](docs/evaluation-guide.md)
- [Proyectos ML, aprendizaje práctico y biblioteca de notebooks](docs/ml-learning-projects.md)

## Alcance de la entrega

Las rondas de práctica son artificiales y gratuitas, sin premios QP ni pagos. Su ranking usa `spearman_era_v1`. El torneo semanal nuevo usa `daily_return_mae_v1`: predicciones de retornos decimales, score normalizado frente a cero y cuatro rondas obligatorias. No se comparan scores entre protocolos. Ninguno mide rentabilidad de una cartera. La automatización real requiere activar `ML_DAILY_TOURNAMENTS_ENABLED`; los modos reales anteriores a cinco días continúan separados.

El repositorio también contiene backtesting, academia, comunidad, marketplace y API/MCP. La prueba técnica documentada se refiere al flujo ML; no constituye una validación completa de todos esos módulos ni evidencia de adopción por usuarios externos.

## Desarrollo local

Requisitos: Node.js 22, Python 3.11 y un proyecto Supabase con `supabase/schema.sql` y las migraciones aplicadas en orden. Para pruebas con datos remotos, usar un proyecto de prueba o una ronda técnica separada.

1. Instalar dependencias: `python -m pip install -r worker/requirements.txt`; para investigación y pruebas, instalar también `worker/requirements-research.txt`.
2. Copiar `worker/.env.example` a `worker/.env` y `web/.env.local.example` a `web/.env.local`. Las claves de servicio se usan solo en el worker.
3. Worker, desde `worker/`: `python -m uvicorn main:app --port 8000`.
4. Web, desde `web/`: `npm ci`, luego `npm run dev`. Configurar `NEXT_PUBLIC_WORKER_URL=http://localhost:8000` y el origen local en `CORS_ORIGINS` del worker.

## Verificación

```text
python -m pytest worker/tests -q
cd web
npx tsc --noEmit
npm run build
npm run test:e2e
```

Las pruebas del worker que simulan Supabase/Storage son pruebas de contrato. El piloto de jueces usa autenticación, API, Storage y base de datos reales; sus comprobaciones están publicadas en `web/public/research/judge-pilot.json`.

## Reproducir un piloto técnico

```text
python worker/scripts/judge_pilot.py prepare --minutes 8
python worker/scripts/judge_pilot.py finalize
```

`prepare` crea una cuenta técnica marcada y una ronda independiente de la semanal; no envía correos. Descarga únicamente las particiones públicas, selecciona entre dos configuraciones con validation y envía el CSV al worker real. `finalize` se ejecuta después del plazo real, puntúa solo esa ronda, reproduce el resultado y publica evidencia sin claves ni tokens. Usar un nuevo `--manifest` para otro piloto. Las credenciales se leen de variables de entorno o de los archivos locales ignorados.

Los resultados generados y las cuentas técnicas deben identificarse como pruebas del proyecto. No presentar sus conteos como usuarios reales.
