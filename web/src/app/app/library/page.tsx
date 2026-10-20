import Link from "next/link";
import "./library.css";

// La biblioteca heredada (Ruta Aprendiz) se retiró: todo el contenido
// vive ahora en la Academia, abierta y sin gates. Los datasets con datos
// reales siguen disponibles en sus páginas de detalle.
const DATASETS = [
  { id: "btc-daily", name: "BTC/USD Diario" },
  { id: "eth-daily", name: "ETH/USD Diario" },
  { id: "aapl-daily", name: "AAPL Diario" },
  { id: "sp500-daily", name: "S&P 500 (índice)" },
  { id: "us-cpi-monthly", name: "IPC de EE.UU. Mensual" },
];

export default function LibraryPage() {
  return (
    <div className="ql-learn-wrap">
      <div className="ql-glass" style={{ padding: 32, marginTop: 40, textAlign: "center" }}>
        <p style={{ color: "var(--ql-muted)", fontSize: 13, margin: "0 0 8px" }}>
          Datos para investigación
        </p>
        <h1 style={{ color: "var(--ql-ink)", margin: "0 0 8px" }}>
          Datasets de QuantLab
        </h1>
        <p style={{ color: "var(--ql-muted)", margin: "0 0 20px" }}>
          Los datos para competir se descargan desde cada ronda ML: train,
          validation y live comparten una versión y sus propias reglas de envío.
        </p>
        <Link href="/app/tournaments" className="btn-primary" style={{ display: "inline-block", textDecoration: "none" }}>
          Descargar datos de una ronda
        </Link>
        <div style={{ marginTop: 28 }}>
          <p style={{ color: "var(--ql-muted)", fontSize: 13, margin: "0 0 12px" }}>
            Exploración histórica independiente de los torneos. La disponibilidad depende de cada fuente externa:
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {DATASETS.map((d) => (
              <Link key={d.id} href={`/app/library/${d.id}`} className="btn-secondary" style={{ textDecoration: "none" }}>
                {d.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
