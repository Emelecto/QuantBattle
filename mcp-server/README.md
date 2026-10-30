# QuantBattle MCP

El servidor recomendado es remoto y usa Streamable HTTP. Las consultas públicas funcionan sin iniciar sesión. Al enviar predicciones o consultar comprobantes propios, el agente inicia el flujo OAuth 2.1 de Supabase y el usuario autoriza desde QuantBattle. No se instala Python ni se crea o copia una clave API.

## Conectar un agente

URL del servidor:

```text
https://ejwusgwgezvyylepagpz.supabase.co/functions/v1/quantbattle-mcp
```

Codex CLI:

```bash
codex mcp add quantbattle --url https://ejwusgwgezvyylepagpz.supabase.co/functions/v1/quantbattle-mcp
```

Claude Code:

```bash
claude mcp add --transport http quantbattle https://ejwusgwgezvyylepagpz.supabase.co/functions/v1/quantbattle-mcp
```

En Cursor, pega la URL como servidor MCP remoto. Las consultas públicas quedan disponibles de inmediato; para operaciones propias, el cliente abre el sitio de QuantBattle y permite aprobar o rechazar el acceso. Los clientes compatibles renuevan sus credenciales OAuth; el usuario puede revocar permisos en **App → API y MCP → Agentes autorizados**.

## Envío de predicciones

El servicio remoto no puede acceder a una ruta local como `C:/.../predicciones.csv`. Para validar o enviar un archivo, el agente debe leerlo desde su entorno y pasar el contenido CSV como argumento `csv_content`. El servidor comprueba el encabezado, duplicados, rango, cobertura de IDs live y variación por era antes de permitir el envío. Nunca recibe targets ocultos.

La ficha de experimento es un objeto JSON, por ejemplo:

```json
{"model_name":"Ridge","parameters":{"alpha":1.0},"seed":42,"note":"Seleccionado en validation"}
```

Los protocolos siguen siendo distintos:

| Flujo | Predicción | Métrica / reglas |
|---|---|---|
| Práctica ML | `0` a `1` | `spearman_era_v1`; cada era necesita variación |
| Retornos diarios semanal | `-1` a `10` en retorno decimal (`0.025` = +2,5 %) | `daily_return_mae_v1`; permite predicciones constantes; el ranking general necesita cuatro rondas |

## Despliegue

El endpoint vive en `supabase/functions/quantbattle-mcp`. La autenticación se compone de Supabase OAuth 2.1 y una pantalla de consentimiento en `web/src/app/oauth/consent`. Configuración del proyecto: `supabase/config.toml`.

Requisitos de activación en Supabase Auth:

- OAuth 2.1 Server activo.
- Dynamic Client Registration activo para clientes MCP.
- URL de sitio `https://quantbattle.co` y ruta de autorización `/oauth/consent`.
- El proyecto debe firmar JWT con clave asimétrica ES256 o RS256.

La función debe mantener `verify_jwt = false`: primero necesita responder con el desafío OAuth MCP; luego `withSupabase({ auth: "user" })` valida la credencial de cada llamada. La función reenvía el JWT de usuario al worker oficial, que valida la firma y deriva el `user_id` de la sesión.

## Servidor local heredado

`mcp_server.py` sigue disponible como alternativa para entornos que solo admiten MCP por stdio. Esa ruta local aún requiere instalar dependencias y configurar `QUANTBATTLE_TOKEN`; no es la integración recomendada para nuevos usuarios.
