import { StockHistoryDownloads } from "@/components/research/StockHistoryDownloads";
import { StockRoundList } from "@/components/research/StockRounds";
export default function LibraryPage() {
  return (
    <div className="qb-page">
      <header className="qb-page-heading">
        <h1>Datasets de acciones · Alpaca</h1>
        <p>
          Un histórico para entrenar y validar; archivos nuevos para cada sesión
          del torneo.
        </p>
      </header>
      <StockHistoryDownloads />
      <StockRoundList />
    </div>
  );
}
