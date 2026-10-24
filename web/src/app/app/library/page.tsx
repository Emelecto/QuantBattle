import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";

const DATASETS = [
  { id: "btc-daily", name: "Bitcoin", detail: "BTC/USD · diario" },
  { id: "eth-daily", name: "Ethereum", detail: "ETH/USD · diario" },
  { id: "aapl-daily", name: "Apple", detail: "AAPL · diario" },
  { id: "sp500-daily", name: "S&P 500", detail: "Índice · diario" },
  { id: "us-cpi-monthly", name: "Inflación de EE. UU.", detail: "IPC · mensual" },
];

export default function LibraryPage() {
  return <div className="ql-page">
    <header className="ql-page-heading"><h1>Datasets de QuantLab</h1><p>Encuentra los datos de tu próxima investigación y consulta el contexto de cada fuente.</p></header>
    <section className="ql-dataset-entry" aria-labelledby="round-data-heading">
      <div><h2 id="round-data-heading">Datos para competir</h2><p>Descarga train, validation y live desde la ronda en la que vas a participar. Cada versión tiene sus propias filas, plazo y reglas de envío.</p></div>
      <Link href="/app/tournaments" className={buttonClasses("primary", "lg")}>Descargar datos de una ronda</Link>
    </section>
    <section className="mt-12" aria-labelledby="historical-data-heading">
      <h2 id="historical-data-heading" className="text-xl font-semibold">Exploración histórica</h2>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">Series independientes de los torneos. Su disponibilidad depende de cada fuente externa; consulta su detalle antes de usarlas.</p>
      <ul className="ql-dataset-list mt-6">{DATASETS.map(d=><li key={d.id}><Link href={`/app/library/${d.id}`}><span><strong>{d.name}</strong><span>{d.detail}</span></span><span aria-hidden="true">↗</span></Link></li>)}</ul>
    </section>
  </div>;
}
