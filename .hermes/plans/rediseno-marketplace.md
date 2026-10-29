# Plan: Rediseño del Marketplace de QuantBattle

Fecha: 2026-08-27 | Autor: Orchestrator (con Emilio)

## Contexto y decisiones cerradas con el usuario

- **Modelo A (caja negra verificada):** el código fuente de la estrategia NUNCA se muestra al
  comprador. Se vende el *acceso a las señales* generadas por ese código y un reporte de integridad.
  El IP queda oculto por diseño (`is_public_code` en el schema ya existe; se respeta).
- **Vista unificada:** una sola grilla de tarjetas; cada tarjeta declara su tipo
  ("Señales en vivo" / "Paquete completo") mediante un badge. No se separan en secciones.
- **Sello de Integridad** como eje central (exigencia de "cero tolerancia a incongruencias"):
  muestra (a) si la plataforma pudo *replicar* el Sharpe OOS con datos frescos,
  (b) si bate al benchmark (buy&hold / media móvil naive), y (c) el método de medición
  (walk-forward, folds, slippage por rango/volumen — usa el motor event-driven nuevo).
- **Broker real:** pospuesto. El copy-trading se queda en señales a cuenta paper. No se implementa.
- **Cobro QP:** YA funciona en el backend (`marketplace_subscribe` descuenta y acredita vía
  `token_ledger`). El problema era solo que el frontend lo simulaba con `setTimeout`. Se conecta
  el flujo real y se muestra el saldo/confirmación.

## Estado actual real (leído, no inventado)

- `web/src/app/app/marketplace/page.tsx` + `MarketplaceCard.tsx`: grilla + tarjeta. Hoy muestra
  Sharpe, MaxDD, rating por estrellas, botón "Suscribirse" que llama `subscribeToStrategy` (lib/tokens)
  y un `setTimeout` fake en la UI. El backend SÍ cobra.
- `web/src/app/app/marketplace/my-subscriptions/page.tsx`: ya funcional (pausar/cancelar, P&L paper).
- `worker/tournaments.py`: `marketplace_list`, `marketplace_publish`, `marketplace_subscribe`
  (cobro real), `marketplace_signals`. El subscribe ya descuenta/acredita QP.
- `supabase/migrations/0002_...sql`: `marketplace_strategies` tiene `backtest_metrics` (jsonb),
  `backtest_equity` (jsonb), `is_public_code`, `price_qp_week`. NO tiene campos de integridad
  explícitos (replicable / benchmark / method / integrity_label).
- `engine.run_backtest` (worker/engine.py): walk-forward OOS, deflated Sharpe, integrity_label
  (Alta/Media/Baja por ratio OOS/IS). El refactor event-driven estaba en curso (ver pendiente).

## Qué hacer — FASE 1 (frontend + backend de lectura/visualización)

### A. Tarjeta unificada (`MarketplaceCard.tsx`)
1. Añadir badge de TIPO: "Señales en vivo" (tono cyan) cuando `strategy.delivers == 'signals'`,
   "Paquete completo" (tono violeta) cuando `delivers == 'package'`. Campo a añadir en schema
   (`delivers` text default 'signals').
2. **Sello de Integridad** (componente nuevo `IntegritySeal.tsx`): lee de
   `strategy.backtest_metrics` (o columnas nuevas) y pinta 3 micro-badges:
   - Replicable: ✓ (verde) / ✗ no verificado (gris) — `replicable` bool.
   - Benchmark: "+X% vs B&H" (verde) o "−Y% vs B&H" (rojo) — `bench_buyhold` float.
   - Método: "WF 5-fold · slippage rango/vol" (texto estático derivado de `method` text).
3. **Nunca mostrar `code`** aunque `is_public_code` sea true en esta vista; el código solo se ve
   en la página de detalle y SOLO si `is_public_code == true` (lo decide el autor).
4. Métricas: conservar Sharpe OOS y MaxDD, pero etiquetar "OOS" explícitamente para no confundir
   con in-sample. Quitar las estrellas de rating por estrellas de "integridad" (más honesto) o
   dejar ambas; decidir en implementación pero priorizar integridad.
5. Botón "Suscribirse": conectar al flujo real. Al pulsar, llamar `subscribeToStrategy` (que ya
   va al backend que cobra) y mostrar: saldo insuficiente (402) → mensaje claro; éxito →
   "Suscrito · −N QP" y link a mis suscripciones. Eliminar el `setTimeout` fake.

### B. Página de detalle (`marketplace/[id]/page.tsx`)
1. Si `is_public_code == true`: sección "Código" colapsable (default cerrado). Si false: sección
   "Cómo funciona" en lenguaje natural (no código): régimen, confianza, descripción del autor.
2. Pestaña "Señales": últimas N señales (endpoint `/marketplace/{id}/signals` ya existe, sin auth).
   Mostrar 3 señales de ejemplo GRATIS antes de suscribir (idea #5 del brainstorm).
3. Pestaña "Integridad": gráfico is/oos (equity_curve ya existe en `backtest_equity`), método,
   benchmarks, y el Sello ampliado.
4. Perfil del autor embebido: reputación de torneos, racha de integridad (columnas a añadir).

### C. Backend de listado (worker)
- `marketplace_list`: añadir `delivers` al select y ordenar también por `replicable desc`.
- No tocar el cobro (ya funciona).

## Qué hacer — FASE 2 (datos de integridad) — REQUIERE MIGRACIÓN (la aplica Emilio)

El agente DEJA lista la migración en `supabase/migrations/NNNN_marketplace_integrity.sql` pero
**NO la aplica** (regla de Emilio: DDL lo hace él en el SQL Editor).

Columnas a añadir en `marketplace_strategies`:
- `delivers text not null default 'signals'`  -- 'signals' | 'package'
- `replicable boolean not null default false`
- `bench_buyhold float`   -- % diferencia vs buy&hold en OOS
- `bench_ma float`        -- % diferencia vs media móvil naive
- `method text`           -- p.ej. 'walk-forward 5-fold, slippage por rango/volumen'
- `integrity_label text`  -- 'Alta'|'Media'|'Baja' (ya lo calcula engine)
- `author_integrity_streak int not null default 0`  -- para el perfil del autor

La lógica de completar estos campos al publicar/backtest la implementa el agente en
`marketplace_publish` leyendo `backtest_metrics`, PERO solo se activa cuando la migración exista.
Para no romper antes de aplicar la migración, el agente hace el INSERT condicional (try/except)
o usa `backtest_metrics` jsonb existente para los campos que ya caben ahí.

## Verificación
- Worker: `cd worker && TESTING=1 .venv/Scripts/python.exe -m pytest tests/ -q` (sin romper).
- Web: `cd web && npx tsc --noEmit -p tsconfig.json && npm run build` (sin errores).
- Manual: suscribirse a una estrategia con QP suficientes → ver descuento real en token_ledger
  (verificar con Emilio vía Supabase). El código NO aparece en la tarjeta ni en detalle si
  `is_public_code=false`.

## Fuera de alcance (acordado)
- Broker real / ejecución en cuenta de trading (fase futura).
- Marketplace de features abiertos (rompe el modelo de IP oculto).
