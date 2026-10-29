"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { submitToTournament } from "@/lib/tournaments";
import { StrategyEditor } from "@/components/Editor";

export default function TournamentSubmitPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [code, setCode] = useState("fast=20,slow=50\n# Escribe tu estrategia aquí");
  const [assetType, setAssetType] = useState("crypto");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("1d");
  const [fast, setFast] = useState(20);
  const [slow, setSlow] = useState(50);
  const [commission, setCommission] = useState(0.1);
  const [slippage, setSlippage] = useState(0.05);
  const [qpStake, setQpStake] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const finalCode = `fast=${fast},slow=${slow}\n${code.split("\n").slice(1).join("\n")}`;
      await submitToTournament(id, finalCode, {
        asset_type: assetType,
        symbol,
        timeframe,
        commission: commission / 100,
        slippage: slippage / 100,
        fast,
        slow,
        folds: 3,
        split: 70,
        start: "2023-01-01",
        end: "2023-12-31",
        capital: 1000,
      }, qpStake);
      router.push(`/app/tournaments/${id}`);
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : "Error al enviar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Enviar estrategia
        </h1>
        <p className="mt-2 text-sm text-muted">
          Configura tu estrategia y envíala al torneo.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
          {/* Editor de código */}
          <div className="qb-glass qb-elev-2 overflow-hidden rounded-xl">
            <div className="border-b border-line px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">
              strategy.py
            </div>
            <StrategyEditor value={code} onChange={setCode} />
          </div>

          {/* Configuración */}
          <div className="qb-glass qb-elev-1 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-ink">Configuración</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Activo
                <select
                  value={assetType}
                  onChange={(e) => setAssetType(e.target.value)}
                  className="qb-input rounded-md px-3 py-2 text-sm text-ink"
                >
                  <option value="crypto">Crypto</option>
                  <option value="stock">Stock</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Símbolo
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="qb-input rounded-md px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Timeframe
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="qb-input rounded-md px-3 py-2 text-sm text-ink"
                >
                  <option value="1h">1h</option>
                  <option value="4h">4h</option>
                  <option value="1d">1d</option>
                  <option value="1w">1w</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                QP a apostar
                <input
                  type="number"
                  min={0}
                  value={qpStake}
                  onChange={(e) => setQpStake(Number(e.target.value))}
                  className="qb-input rounded-md px-3 py-2 text-sm text-ink"
                />
              </label>
            </div>
          </div>

          {/* Parámetros */}
          <div className="qb-glass qb-elev-1 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-ink">Parámetros</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Media rápida (fast)
                <input
                  type="number"
                  min={2}
                  max={200}
                  value={fast}
                  onChange={(e) => setFast(Number(e.target.value))}
                  className="qb-input rounded-md px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Media lenta (slow)
                <input
                  type="number"
                  min={3}
                  max={400}
                  value={slow}
                  onChange={(e) => setSlow(Number(e.target.value))}
                  className="qb-input rounded-md px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Comisión (%)
                <input
                  type="number"
                  step="0.01"
                  value={commission}
                  onChange={(e) => setCommission(Number(e.target.value))}
                  className="qb-input rounded-md px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Slippage (%)
                <input
                  type="number"
                  step="0.01"
                  value={slippage}
                  onChange={(e) => setSlippage(Number(e.target.value))}
                  className="qb-input rounded-md px-3 py-2 text-sm text-ink"
                />
              </label>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-short/30 bg-short/10 px-4 py-3 text-sm text-short">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-bg hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Enviando..." : "Enviar estrategia"}
            </button>
            <a
              href={`/app/tournaments/${id}`}
              className="text-sm text-muted hover:text-ink transition-colors"
            >
              Cancelar
            </a>
          </div>
        </form>
      </div>
    </main>
  );
}
