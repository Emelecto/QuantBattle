import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * API de demo pública: ejecuta un backtest SMA crossover con datos simulados.
 * No requiere autenticación. Usa datos simulados explícitamente rotulados
 * para evitar depender de APIs externas (Binance/Bybit) que pueden estar banneadas.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  
  const fast = Math.max(5, Math.min(50, parseInt(searchParams.get("fast") || "20", 10)));
  const slow = Math.max(fast + 5, Math.min(200, parseInt(searchParams.get("slow") || "50", 10)));
  
  // Generar datos simulados realistas para BTC/USDT (90 días)
  const data = generateSimulatedData(90);
  
  try {
    // Ejecutar el backtest SMA crossover directamente con datos simulados
    const result = runSMAcrossoverBacktest(data.ohlcv, fast, slow);
    
    return NextResponse.json({
      success: true,
      config: { fast, slow },
      result,
      data_source: "simulated",  // explícitamente rotulado
    });
  } catch (e: unknown) {
    return errorResponse(`Error en el backtest: ${e instanceof Error ? e.message : "Fallo inesperado"}`, 500);
  }
}

function generateSimulatedData(days: number) {
  const data = [];
  const now = new Date();
  let price = 77000;  // precio base BTC
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    // Variación realista ±3% diario
    const change = (Math.random() - 0.48) * 0.06;  // ligera tendencia alcista
    price = price * (1 + change);
    
    const high = price * (1 + Math.random() * 0.02);
    const low = price * (1 - Math.random() * 0.02);
    const open = low + Math.random() * (high - low);
    const volume = 1000000 + Math.random() * 5000000;
    
    data.push({
      timestamp: date.toISOString(),
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(price.toFixed(2)),
      volume: parseFloat(volume.toFixed(2)),
    });
  }
  
  return {
    start: startDate.toISOString().split("T")[0],
    end: now.toISOString().split("T")[0],
    ohlcv: data,
  };
}

/**
 * Backtest SMA crossover ejecutado localmente con datos simulados.
 * No depende del worker ni de APIs externas.
 */
function runSMAcrossoverBacktest(
  ohlcv: Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume: number }>,
  fast: number,
  slow: number
) {
  const capital = 10000;
  const commission = 0.001; // 0.1%
  const slippage = 0.0005; // 0.05%

  // Calcular SMAs
  const closes = ohlcv.map((d) => d.close);
  const smaFast = calculateSMA(closes, fast);
  const smaSlow = calculateSMA(closes, slow);

  // Simular trading
  let cash = capital;
  let position = 0; // cantidad de BTC
  const trades: Array<{ type: string; price: number; date: string; amount: number }> = [];
  const equityCurve: Array<{ date: string; equity: number }> = [];

  const startIdx = slow; // Empezar cuando ambas SMAs están disponibles

  for (let i = startIdx; i < ohlcv.length; i++) {
    const price = ohlcv[i].close;
    const date = ohlcv[i].timestamp;
    const fastAbove = smaFast[i] > smaSlow[i];
    const fastAbovePrev = smaFast[i - 1] > smaSlow[i - 1];

    // Señal de compra: cruce alcista
    if (fastAbove && !fastAbovePrev && cash > 0) {
      const priceWithSlippage = price * (1 + slippage);
      const amount = (cash * (1 - commission)) / priceWithSlippage;
      position = amount;
      cash = 0;
      trades.push({ type: "buy", price: priceWithSlippage, date, amount });
    }
    // Señal de venta: cruce bajista
    else if (!fastAbove && fastAbovePrev && position > 0) {
      const priceWithSlippage = price * (1 - slippage);
      const proceeds = position * priceWithSlippage * (1 - commission);
      cash = proceeds;
      trades.push({ type: "sell", price: priceWithSlippage, date, amount: position });
      position = 0;
    }

    // Equity actual
    const equity = cash + position * price;
    equityCurve.push({ date, equity });
  }

  // Métricas finales
  const finalEquity = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity : capital;
  const totalReturn = ((finalEquity - capital) / capital) * 100;

  // Calcular max drawdown
  let maxEquity = capital;
  let maxDrawdown = 0;
  for (const point of equityCurve) {
    if (point.equity > maxEquity) maxEquity = point.equity;
    const drawdown = ((maxEquity - point.equity) / maxEquity) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // Sharpe ratio simplificado (asumiendo 365 días/año)
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const dailyReturn = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
    returns.push(dailyReturn);
  }
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdReturn = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length);
  const sharpe = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(365) : 0;

  return {
    total_return_pct: parseFloat(totalReturn.toFixed(2)),
    max_drawdown_pct: parseFloat(maxDrawdown.toFixed(2)),
    sharpe_ratio: parseFloat(sharpe.toFixed(3)),
    total_trades: trades.length,
    final_equity: parseFloat(finalEquity.toFixed(2)),
    initial_capital: capital,
    fast_period: fast,
    slow_period: slow,
    trades: trades.slice(0, 20), // Limitar para no responder con demasiados datos
    equity_curve: equityCurve.filter((_, i) => i % 5 === 0), // Muestrear cada 5 días
  };
}

function calculateSMA(data: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(NaN);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / period;
      sma.push(avg);
    }
  }
  return sma;
}