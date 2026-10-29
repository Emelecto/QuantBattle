# QuantBattle MCP

Conecta Claude Code, Cursor, Codex u otro cliente MCP con los torneos de predicción ML de QuantBattle. El servidor es un proceso local por `stdio`: el agente llama las herramientas y estas consultan el worker oficial. No hay código de estrategia ni operaciones QP en este flujo.

## Requisitos

- Python 3.10 o superior.
- Una clave API personal de QuantBattle (`qbt_…`) para enviar predicciones y consultar tus comprobantes. Créala en `https://www.quantbattle.co/app/api-keys`; se muestra una sola vez y puedes revocarla desde la app.
- Los enlaces y datasets públicos se pueden consultar sin clave.

## Instalación

```powershell
cd C:\Users\ecard\QuantBattle\mcp-server
python -m pip install -r requirements.txt
```

Worker predeterminado: `https://quantlab2.onrender.com` (configurado también como worker del frontend y comprobado en producción). Para un entorno alternativo, establece `QUANTBATTLE_WORKER_URL`.

## Configurar el cliente

### Claude Code

```powershell
claude mcp add quantbattle -e QUANTBATTLE_TOKEN=qbt_tu_clave -- python C:/Users/ecard/QuantBattle/mcp-server/mcp_server.py
```

### Cursor

En `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "quantbattle": {
      "command": "python",
      "args": ["C:/Users/ecard/QuantBattle/mcp-server/mcp_server.py"],
      "env": {
        "QUANTBATTLE_TOKEN": "qbt_tu_clave"
      }
    }
  }
}
```

### Codex CLI

En `~/.codex/config.toml`:

```toml
[mcp_servers.quantbattle]
command = "python"
args = ["C:/Users/ecard/QuantBattle/mcp-server/mcp_server.py"]
env = { QUANTBATTLE_TOKEN = "qbt_tu_clave" }
```

Reinicia o vuelve a cargar el cliente después de registrar el servidor.

## Flujo para empezar

1. Pregunta **“¿Qué torneos ML y rondas están abiertos?”**. `list_ml_tournaments` distingue práctica y retornos diarios, y muestra identificadores, plazos y datasets publicados.
2. Para una ronda semanal, descarga `train`, `validation` y `live` con `get_weekly_dataset_download`. Para la práctica, usa `list_practice_datasets` y `get_practice_dataset_download`.
3. Entrena/selecciona el modelo con train y validation. Genera UTF-8 `id,prediction` con cada ID de live una sola vez. `validate_prediction_csv` compara la cobertura contra el índice live publicado; `get_weekly_live_ids` también permite recuperar los IDs para la ronda semanal.
4. Registra el envío con `submit_weekly_predictions` o `submit_practice_predictions`. Incluye la ficha experimental JSON y la clave API se envía en Bearer al worker. Consulta después `get_my_weekly_submissions` o `get_my_practice_submission` para verificar el comprobante.

La IA puede ayudar a escribir o explicar el código de entrenamiento en el entorno del usuario, pero el servidor MCP no ejecuta notebooks, no ve los targets de live ni inventa predicciones. El usuario genera el CSV y lo entrega al agente mediante la ruta local.

## Protocolos

| Flujo | Predicción | Métrica / reglas |
|---|---|---|
| Práctica ML | `0` a `1` | `spearman_era_v1`; cada era necesita variación; datasets sintéticos/históricos según ronda |
| Retornos diarios semanal | `-1` a `10` en retorno decimal (`0.025` = +2,5 %) | `daily_return_mae_v1`; permite predicciones constantes; el ranking general necesita cuatro rondas |

Ambos requieren exactamente todos los IDs live, sin duplicados, y columnas exactas `id,prediction`. Los resultados se mantienen ocultos según el protocolo; no compares sus scores.

## Herramientas

- `quantbattle_status`: worker, conteo de datasets/torneos y estado de configuración de credencial.
- `list_ml_tournaments`, `get_weekly_tournament`: descubrimiento y detalle de semanas y rondas.
- `list_practice_datasets`, `get_practice_dataset_download`, `get_weekly_dataset_download`, `get_weekly_live_ids`: preparación de datos públicos.
- `validate_prediction_csv`: validación local de formato/rango y cobertura exacta de IDs.
- `submit_practice_predictions`, `submit_weekly_predictions`: envío autenticado con ficha experimental.
- `get_my_practice_submission`, `get_my_weekly_submissions`: comprobantes autenticados.
- `get_ml_leaderboard`, `get_weekly_results`: rankings/resultados públicos cuando estén liberados.

Ficha de envío (`experiment_json`), por ejemplo:

```json
{"model_name":"Ridge","parameters":{"alpha":1.0},"seed":42,"note":"Seleccionado en validation"}
```

La clave `qbt_` concede acceso a la cuenta: no la pegues en conversaciones ni código compartido. Se guarda en la configuración local del cliente y se transmite solo al worker configurado.
