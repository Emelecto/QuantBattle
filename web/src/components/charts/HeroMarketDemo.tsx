"use client";

import { useEffect, useId, useMemo, useState } from "react";

const RANGE_OPTIONS = [
  { id: "30d", label: "30D", period: "30 días", days: 30 },
  { id: "90d", label: "90D", period: "90 días", days: 90 },
  { id: "1y", label: "1A", period: "1 año", days: 365 },
] as const;

type RangeKey = (typeof RANGE_OPTIONS)[number]["id"];
type LoadState = "loading" | "ready" | "fallback";

type Candle = {
  time: number;
  close: number;
};

type MarketData = {
  source: string;
  symbol: "BTCUSDT";
  interval: "1d";
  range: RangeKey;
  period: string;
  fetchedAt?: string;
  candles: Candle[];
  isFallback: boolean;
};

type MarketMetrics = {
  price: number;
  equity: number;
  maxDrawdown: number;
};

function getRangeOption(range: RangeKey) {
  return RANGE_OPTIONS.find((option) => option.id === range) ?? RANGE_OPTIONS[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseMarketData(payload: unknown, expectedRange: RangeKey): MarketData {
  if (!isRecord(payload)) {
    throw new Error("La respuesta del mercado no es válida.");
  }

  if (
    payload.source !== "Binance" ||
    payload.symbol !== "BTCUSDT" ||
    payload.interval !== "1d" ||
    payload.range !== expectedRange ||
    !Array.isArray(payload.candles)
  ) {
    throw new Error("La respuesta del mercado está incompleta.");
  }

  const parsedCandles: Candle[] = [];
  for (const item of payload.candles) {
    if (!isRecord(item)) continue;

    const time = Number(item.time);
    const close = Number(item.close);
    if (Number.isSafeInteger(time) && time > 0 && Number.isFinite(close) && close > 0) {
      parsedCandles.push({ time, close });
    }
  }

  parsedCandles.sort((a, b) => a.time - b.time);
  const candles = parsedCandles.filter(
    (candle, index) => index === 0 || candle.time !== parsedCandles[index - 1].time,
  );

  if (candles.length < 2) {
    throw new Error("No hay suficientes velas para el demo.");
  }

  return {
    source: "Binance",
    symbol: "BTCUSDT",
    interval: "1d",
    range: expectedRange,
    period:
      typeof payload.period === "string" && payload.period.trim().length > 0
        ? payload.period
        : `${candles.length} días`,
    fetchedAt: typeof payload.fetchedAt === "string" ? payload.fetchedAt : undefined,
    candles,
    isFallback: false,
  };
}

/** Serie determinista solo para el último recurso visual. Nunca se presenta como mercado real. */
function createFallbackData(range: RangeKey): MarketData {
  const option = getRangeOption(range);
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);

  const candles = Array.from({ length: option.days }, (_, index) => {
    const offset = index - (option.days - 1);
    const trend = offset * 0.00045;
    const slowCycle = Math.sin(offset / 15) * 0.05;
    const fastCycle = Math.sin(offset / 3.7) * 0.018;
    const pullback = -0.06 * Math.exp(-Math.pow((offset + 23) / 9, 2));
    const close = 68_000 * Math.exp(trend + slowCycle + fastCycle + pullback);
    const time = end.getTime() + offset * 86_400_000;

    return { time, close };
  });

  return {
    source: "Demo de respaldo",
    symbol: "BTCUSDT",
    interval: "1d",
    range,
    period: option.period,
    candles,
    isFallback: true,
  };
}

function calculateMetrics(candles: Candle[]): MarketMetrics {
  const firstClose = candles[0].close;
  const price = candles[candles.length - 1].close;
  let peak = candles[0].close;
  let maxDrawdown = 0;

  for (const candle of candles) {
    peak = Math.max(peak, candle.close);
    maxDrawdown = Math.min(maxDrawdown, candle.close / peak - 1);
  }

  return {
    price,
    equity: (price / firstClose) * 100,
    maxDrawdown,
  };
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatIndex(value: number) {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: number, withYear = false) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(new Date(value));
}

function formatUpdatedAt(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}

function sourceErrorMessage(payload: unknown) {
  if (isRecord(payload) && typeof payload.error === "string") {
    return payload.error;
  }

  return "No fue posible consultar Binance en este momento.";
}

function MetricCell({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "long" | "short";
}) {
  const valueClass =
    tone === "long" ? "text-long" : tone === "short" ? "text-short" : "text-ink";

  return (
    <div className="min-w-0 rounded-xl bg-white/[0.035] px-3 py-3 sm:px-4">
      <dt className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted">
        {label}
      </dt>
      <dd className={`metric mt-2 truncate text-[15px] font-semibold tracking-[-0.04em] ${valueClass}`}>
        {value}
      </dd>
      <p className="mt-1 text-[10px] leading-relaxed text-muted">{detail}</p>
    </div>
  );
}

function MarketMetadata({ data, range, state }: { data: MarketData | null; range: RangeKey; state: LoadState }) {
  const option = getRangeOption(range);
  const source = data?.source ?? "Binance";
  const period = data?.period ?? option.period;
  const updatedAt = data?.fetchedAt ? formatUpdatedAt(data.fetchedAt) : null;

  return (
    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-black/15 px-3 py-3 sm:grid-cols-4 sm:px-4">
      <div className="min-w-0">
        <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">Fuente</dt>
        <dd className="mt-1 break-words text-[11px] font-medium text-ink">{source}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">Símbolo</dt>
        <dd className="metric mt-1 text-[11px] font-medium text-ink">BTCUSDT</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">Intervalo</dt>
        <dd className="metric mt-1 text-[11px] font-medium text-ink">1D</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">Período</dt>
        <dd className="metric mt-1 text-[11px] font-medium text-ink">{period}</dd>
      </div>
      {state === "ready" && updatedAt && (
        <div className="col-span-2 border-t border-white/[0.05] pt-2 text-[10px] text-muted sm:col-span-4">
          Actualizado {updatedAt}
        </div>
      )}
    </dl>
  );
}

function LoadingChart() {
  return (
    <div
      aria-live="polite"
      className="mt-4 overflow-hidden rounded-xl bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.015))] p-4"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="ql-skeleton h-3 w-28" />
        <div className="ql-skeleton h-3 w-16" />
      </div>
      <div className="relative mt-5 h-[210px] overflow-hidden">
        <div className="absolute inset-x-0 top-[25%] h-px bg-surface-solid" />
        <div className="absolute inset-x-0 top-1/2 h-px bg-surface-solid" />
        <div className="absolute inset-x-0 top-[75%] h-px bg-surface-solid" />
        <div className="ql-skeleton absolute bottom-7 left-0 h-24 w-full rounded-[40%] opacity-70" />
      </div>
      <p className="mt-2 text-[11px] text-muted">Cargando velas diarias desde Binance…</p>
    </div>
  );
}

function MarketLineChart({ data, metrics }: { data: MarketData; metrics: MarketMetrics }) {
  const gradientId = useId().replace(/:/g, "");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const geometry = useMemo(() => {
    const width = 720;
    const height = 220;
    const padding = { top: 18, right: 10, bottom: 20, left: 10 };
    const closes = data.candles.map((candle) => candle.close);
    const rawMin = Math.min(...closes);
    const rawMax = Math.max(...closes);
    const spread = Math.max(rawMax - rawMin, rawMax * 0.04, 1);
    const min = rawMin - spread * 0.14;
    const max = rawMax + spread * 0.14;
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const points = data.candles.map((candle, index) => {
      const x = padding.left + (index / (data.candles.length - 1)) * innerWidth;
      const y = padding.top + ((max - candle.close) / (max - min)) * innerHeight;
      return { x, y };
    });
    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(" ");
    const first = points[0];
    const last = points[points.length - 1];
    const baseline = height - padding.bottom;

    return {
      height,
      width,
      padding,
      points,
      linePath,
      areaPath: `${linePath} L${last.x.toFixed(2)},${baseline} L${first.x.toFixed(2)},${baseline} Z`,
      last,
    };
  }, [data.candles]);

  const firstCandle = data.candles[0];
  const lastCandle = data.candles[data.candles.length - 1];
  const stroke = data.isFallback ? "#cbd5e1" : "#10b981";
  const hoveredCandle = hoveredIndex === null ? null : data.candles[hoveredIndex];
  const hoveredPoint = hoveredIndex === null ? null : geometry.points[hoveredIndex];
  const tooltipWidth = 118;
  const tooltipHeight = 36;
  const tooltipX = hoveredPoint
    ? Math.min(
        Math.max(hoveredPoint.x - tooltipWidth / 2, 4),
        geometry.width - tooltipWidth - 4,
      )
    : 0;
  const tooltipY = hoveredPoint
    ? Math.min(
        Math.max(hoveredPoint.y - tooltipHeight - 10, 4),
        geometry.height - tooltipHeight - 4,
      )
    : 0;

  function selectCandleAt(clientX: number, element: SVGSVGElement) {
    const bounds = element.getBoundingClientRect();
    if (bounds.width <= 0) return;

    const progress = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    setHoveredIndex(Math.round(progress * (data.candles.length - 1)));
  }

  return (
    <figure className="mt-4 overflow-hidden rounded-xl bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.012))] p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-[10px] uppercase tracking-[0.14em] text-muted">
        <span>{data.isFallback ? "Serie simulada · no mercado real" : "Precio de cierre · USD"}</span>
        <span className="metric normal-case tracking-normal text-ink">{formatPrice(metrics.price)}</span>
      </div>
      <svg
        className="mt-2 h-[210px] w-full cursor-crosshair touch-pan-y focus:outline-none sm:h-[250px]"
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        preserveAspectRatio="none"
        role="group"
        tabIndex={0}
        aria-describedby="hero-market-chart-instructions"
        aria-label={
          data.isFallback
            ? "Gráfica interactiva de una serie simulada de BTCUSDT, no datos de mercado reales."
            : `Gráfica interactiva de cierres de BTCUSDT en ${data.period}.`
        }
        onFocus={() => setHoveredIndex(data.candles.length - 1)}
        onBlur={() => setHoveredIndex(null)}
        onPointerDown={(event) => selectCandleAt(event.clientX, event.currentTarget)}
        onPointerMove={(event) => selectCandleAt(event.clientX, event.currentTarget)}
        onPointerLeave={() => setHoveredIndex(null)}
        onKeyDown={(event) => {
          const lastIndex = data.candles.length - 1;

          if (event.key === "Escape") {
            setHoveredIndex(null);
            return;
          }

          if (event.key === "Home") {
            event.preventDefault();
            setHoveredIndex(0);
            return;
          }

          if (event.key === "End") {
            event.preventDefault();
            setHoveredIndex(lastIndex);
            return;
          }

          if (event.key === "ArrowLeft") {
            event.preventDefault();
            setHoveredIndex((current) => Math.max(0, (current ?? lastIndex) - 1));
            return;
          }

          if (event.key === "ArrowRight") {
            event.preventDefault();
            setHoveredIndex((current) => Math.min(lastIndex, (current ?? 0) + 1));
          }
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.2, 0.4, 0.6, 0.8].map((position) => (
          <line
            key={position}
            x1="0"
            x2={geometry.width}
            y1={geometry.height * position}
            y2={geometry.height * position}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
        ))}
        <path d={geometry.areaPath} fill={`url(#${gradientId})`} />
        <path
          d={geometry.linePath}
          fill="none"
          stroke={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={geometry.last.x}
          cy={geometry.last.y}
          r="4"
          fill={stroke}
          stroke="#0a0c10"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {hoveredCandle && hoveredPoint && (
          <g pointerEvents="none">
            <line
              x1={hoveredPoint.x}
              x2={hoveredPoint.x}
              y1={geometry.padding.top}
              y2={geometry.height - geometry.padding.bottom}
              stroke="rgba(238,242,247,0.42)"
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r="4"
              fill={stroke}
              stroke="#0a0c10"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <g transform={`translate(${tooltipX} ${tooltipY})`}>
              <rect
                width={tooltipWidth}
                height={tooltipHeight}
                rx="4"
                fill="#11151c"
                fillOpacity="0.96"
                stroke="rgba(255,255,255,0.14)"
              />
              <text x="8" y="13" fill="#8b93a7" fontSize="9">
                {formatDate(hoveredCandle.time, true)}
              </text>
              <text x="8" y="27" fill="#eef2f7" fontSize="11" fontWeight="600">
                {formatPrice(hoveredCandle.close)}
              </text>
            </g>
          </g>
        )}
      </svg>
      <p id="hero-market-chart-instructions" className="mt-2 px-1 text-[10px] leading-relaxed text-muted">
        Pasa el cursor o usa las flechas para consultar cada cierre.
      </p>
      <span className="sr-only" aria-live="polite">
        {hoveredCandle
          ? `${formatDate(hoveredCandle.time, true)}: ${formatPrice(hoveredCandle.close)}`
          : ""}
      </span>
      <figcaption className="metric mt-1 flex justify-between gap-4 px-1 text-[10px] text-muted">
        <span>{formatDate(firstCandle.time)}</span>
        <span>{formatDate(lastCandle.time)}</span>
      </figcaption>
    </figure>
  );
}

export function HeroMarketDemo() {
  const [range, setRange] = useState<RangeKey>("90d");
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<MarketData | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMarket() {
      setState("loading");
      setData(null);
      setSourceError(null);

      try {
        const response = await fetch(`/api/market?range=${range}`, {
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(sourceErrorMessage(payload));
        }

        const market = parseMarketData(payload, range);
        if (controller.signal.aborted) return;

        setData(market);
        setState("ready");
      } catch (error) {
        if (controller.signal.aborted) return;

        setData(createFallbackData(range));
        setSourceError(
          error instanceof Error
            ? error.message
            : "No fue posible consultar Binance en este momento.",
        );
        setState("fallback");
      }
    }

    void loadMarket();
    return () => controller.abort();
  }, [range, reloadKey]);

  const metrics = useMemo(() => (data ? calculateMetrics(data.candles) : null), [data]);
  const liveStatus =
    state === "loading"
      ? "Cargando Binance"
      : state === "fallback"
        ? "Datos simulados"
        : "Datos reales";

  function chooseRange(nextRange: RangeKey) {
    if (nextRange === range || state === "loading") return;

    setData(null);
    setSourceError(null);
    setState("loading");
    setRange(nextRange);
  }

  function retryBinance() {
    if (state === "loading") return;

    setData(null);
    setSourceError(null);
    setState("loading");
    setReloadKey((value) => value + 1);
  }

  return (
    <div className="relative w-full min-w-0">
      <article className="ql-glass ql-elev-2 relative overflow-hidden rounded-2xl p-4 sm:p-5" aria-labelledby="hero-market-title">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              "radial-gradient(70% 70% at 100% 0%, rgba(16,185,129,0.11), transparent 65%), radial-gradient(55% 50% at 0% 100%, rgba(248,250,252,0.07), transparent 70%)",
          }}
        />
        <div className="relative">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">Demo de mercado</p>
              <h2 id="hero-market-title" className="metric mt-1 text-lg font-semibold tracking-[-0.04em] text-ink sm:text-xl">
                BTC/USDT <span className="text-muted">· 1D</span>
              </h2>
            </div>
            <div
              aria-live="polite"
              className={`flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-medium ${
                state === "fallback"
                  ? "bg-short/10 text-short"
                  : state === "loading"
                    ? "bg-surface-solid text-muted"
                    : "bg-long/10 text-long"
              }`}
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${
                  state === "fallback" ? "bg-short" : state === "loading" ? "bg-muted animate-pulse" : "bg-long"
                }`}
              />
              {liveStatus}
            </div>
          </header>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">Rango</span>
            <div className="flex rounded-lg bg-black/20 p-1" role="group" aria-label="Seleccionar rango de mercado">
              {RANGE_OPTIONS.map((option) => {
                const isSelected = option.id === range;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={state === "loading"}
                    onClick={() => chooseRange(option.id)}
                    className={`metric min-h-8 rounded-md px-3 text-[11px] font-medium transition-[background-color,color,box-shadow] ${
                      isSelected
                        ? "bg-surface-solid text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                        : "text-muted hover:bg-surface-solid hover:text-ink"
                    } disabled:cursor-wait disabled:opacity-60`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <MarketMetadata data={data} range={range} state={state} />

          {state === "fallback" && (
            <div role="alert" className="mt-4 rounded-xl bg-short/[0.08] px-3 py-3 sm:px-4">
              <p className="text-[11px] leading-relaxed text-short">
                <span className="font-semibold">Error de fuente:</span> {sourceError ?? "Binance no está disponible."}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] leading-relaxed text-muted">
                  Mostrando <span className="font-medium text-ink">datos simulados de respaldo</span>; sus valores, fechas y métricas no corresponden al mercado real.
                </p>
                <button
                  type="button"
                  onClick={retryBinance}
                  className="min-h-8 rounded-md bg-surface-solid px-3 text-[11px] font-medium text-ink hover:bg-surface-solid"
                >
                  Reintentar Binance
                </button>
              </div>
            </div>
          )}

          {metrics && data ? (
            <>
              <dl className="mt-4 grid gap-2 sm:grid-cols-3">
                <MetricCell
                  label="Precio"
                  value={formatPrice(metrics.price)}
                  detail={data.isFallback ? "Valor simulado; no es mercado real" : "Último cierre cargado"}
                />
                <MetricCell
                  label="Equity"
                  value={formatIndex(metrics.equity)}
                  detail={data.isFallback ? "Serie simulada · base 100" : "BTC buy-and-hold · base 100"}
                  tone={metrics.equity >= 100 ? "long" : "short"}
                />
                <MetricCell
                  label="Drawdown"
                  value={formatPercent(metrics.maxDrawdown)}
                  detail={data.isFallback ? "Serie simulada" : "Máximo del período"}
                  tone={metrics.maxDrawdown < 0 ? "short" : "default"}
                />
              </dl>
              <MarketLineChart data={data} metrics={metrics} />
            </>
          ) : (
            <LoadingChart />
          )}

          <p className="mt-3 text-[10px] leading-relaxed text-muted">
            {data?.isFallback
              ? "El respaldo usa una serie simulada identificada explícitamente; no representa el mercado ni una estrategia."
              : "Equity y drawdown se calculan sobre las velas cargadas con el benchmark BTC buy-and-hold; no representan una estrategia."}
          </p>
        </div>
      </article>
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 -bottom-10 -z-10 h-28 rounded-full blur-3xl"
        style={{ background: "rgba(16,185,129,0.12)" }}
      />
    </div>
  );
}
