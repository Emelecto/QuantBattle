# QuantBattle · DeepFin / Universidad EIA

Prototipo de investigación de Emilio Cardona Lopez para una comunidad de investigación cuantitativa en español. El recorrido actual usa **histórico train/validation de acciones de Alpaca SIP** y **rondas diarias de retornos de apertura a cierre**, con validación de CSV y verificación SHA-256 de archivos. Conserva la evidencia de un piloto sintético reproducible.

- Plataforma: https://www.quantbattle.co
- Evaluación técnica y resultados: https://www.quantbattle.co/docs#evaluacion
- [Protocolo ML](docs/ml-tournaments.md)
- [Datasets Alpaca y rondas diarias](docs/alpaca-datasets.md)
- [Guía para evaluadores](docs/evaluation-guide.md)
- [Proyectos ML, aprendizaje práctico y biblioteca de notebooks](docs/ml-learning-projects.md)

## Alcance de la entrega

El catálogo actual publica el histórico `stocks-oc-v1.0.0` (un train y un validation) y sólo las rondas diarias registradas de Alpaca, protocolo `stocks_open_close_mae_v1`. Su score es (MAE cero − MAE modelo) / max(MAE cero, 0.005). El piloto sintético documentado usa `spearman_era_v1`; no se comparan sus scores. Ninguno mide rentabilidad de una cartera. La publicación diaria depende de `STOCK_DAILY_ENABLED` y de la verificación del generador; un catálogo vacío no se sustituye con datos anteriores. El recorrido de Binance queda retirado de la web y del MCP; se conservan registros y documentación históricos sin reetiquetar su origen.

La entrega está en **piloto controlado**. La evidencia se organiza por recorrido en [la matriz de lanzamiento](docs/launch-readiness.md) y `release/scope.json`: web y autenticación, Academia, torneos, proyectos ML, biblioteca, backtesting e inicio de sesión. El piloto técnico publicado sigue teniendo el alcance ML que declara; las pruebas automatizadas adicionales no representan adopción externa ni rentabilidad.

La URL pública permite evaluar el producto. La convocatoria abierta requiere revisar una semana real ya liberada y retroalimentación externa documentada. `release/pilot-evidence.json` conserva esos requisitos pendientes; nunca se sustituyen con cuentas técnicas.

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
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build
npm run test:e2e
```

Las pruebas del worker que simulan Supabase/Storage son pruebas de contrato. El piloto de jueces usa autenticación, API, Storage y base de datos reales; sus comprobaciones están publicadas en `web/public/research/judge-pilot.json`.

`database-ci` reconstruye una instancia Supabase aislada, aplica esquema y migraciones, verifica RLS con PostgreSQL real y ejecuta `scripts/verify_product_staging.py` con Auth, Storage y worker reales, sin bypass de autenticación. Los contratos de navegador cubren escritorio y móvil con servicios simulados y se identifican como tales. CI conserva informes por commit, también cuando una comprobación falla.

`python scripts/check_release.py --stage controlled-pilot` exige CI satisfactoria, despliegues y monitor operativo sobre el commit actual. `--stage open-call` exige además la revisión de una semana real liberada y referencias a retroalimentación externa. La presencia de workflows o evidencia de otra versión no satisface ese control. Consulta el [procedimiento de operación y contingencia](docs/tournament-operations.md).

## Reproducir un piloto técnico

```text
python worker/scripts/judge_pilot.py prepare --minutes 8
python worker/scripts/judge_pilot.py finalize
```

`prepare` crea una cuenta técnica marcada y una ronda independiente de la semanal; no envía correos. Descarga únicamente las particiones públicas, selecciona entre dos configuraciones con validation y envía el CSV al worker real. `finalize` se ejecuta después del plazo real, puntúa solo esa ronda, reproduce el resultado y publica evidencia sin claves ni tokens. Usar un nuevo `--manifest` para otro piloto. Las credenciales se leen de variables de entorno o de los archivos locales ignorados.

Los resultados generados y las cuentas técnicas deben identificarse como pruebas del proyecto. No presentar sus conteos como usuarios reales.
