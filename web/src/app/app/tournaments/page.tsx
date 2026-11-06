"use client";

import Link from "next/link";
import { StockRoundList } from "@/components/research/StockRounds";
import { StockHistoryDownloads } from "@/components/research/StockHistoryDownloads";

export default function TournamentsPage() {
  return (
    <div className="qb-page">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Torneos de machine learning</h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">Descarga el histórico de acciones para entrenar y validar tus modelos, y participa en las rondas diarias con los datos publicados para cada jornada.</p>
      <div className="mt-5 flex flex-wrap gap-5 text-sm">
        <Link href="/app/learn/first-tournament" className="text-accent underline underline-offset-4">Mi primer torneo, paso a paso</Link>
        <Link href="/app/learn/errors" className="text-accent underline underline-offset-4">Analizar mis errores</Link>
        <Link href="/app/tournaments/guide" className="text-accent underline underline-offset-4">Cómo participar</Link>
        <Link href="/docs#evaluacion" className="text-accent underline underline-offset-4">Evidencia técnica del semillero</Link>
      </div>
      <StockHistoryDownloads />
      <StockRoundList />
    </div>
  );
}
