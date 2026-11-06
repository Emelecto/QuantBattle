import Link from "next/link";
import { StockHistoryDownloads } from "@/components/research/StockHistoryDownloads";
export default function Guide() {
  return (
    <div className="qb-page max-w-4xl">
      <Link href="/app/tournaments" className="text-sm text-accent underline">
        Volver a torneos
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">
        Tu primer torneo con datos de Alpaca
      </h1>
      <p className="mt-3 text-muted">
        Predice retornos de acciones estadounidenses. No necesitas ejecutar
        operaciones ni conectar una cuenta de inversión.
      </p>
      <StockHistoryDownloads />
      <ol className="mt-8 list-decimal space-y-6 pl-5 text-base leading-relaxed">
        <li>
          <strong>Entrena con train.parquet.</strong> Incluye 83.563 filas con
          32 variables y objetivo. El universo histórico contiene 50 acciones.
        </li>
        <li>
          <strong>Evalúa en validation.parquet.</strong> Incluye 34.962 filas de
          fechas posteriores. Mantén el orden temporal y evita ajustar
          repetidamente a esta partición.
        </li>
        <li>
          <strong>Elige una ronda diaria publicada.</strong> Descarga live.csv o
          live.parquet: son dos formatos del mismo conjunto, sin objetivo.
          Consulta las acciones y la fecha de esa ronda; no supongas que todas
          incluyen el mismo universo.
        </li>
        <li>
          <strong>Genera un CSV id,prediction.</strong> Usa la plantilla,
          incluye cada ID una vez y expresa el retorno de apertura a cierre como
          fracción: 0.02 significa +2 %. El límite es 1 MB y los valores deben
          estar entre −1 y 10.
        </li>
        <li>
          <strong>Envía antes del plazo mostrado.</strong> El servidor valida la
          cobertura. Sólo el último envío válido de cada ronda queda
          seleccionado.
        </li>
        <li>
          <strong>Consulta el resultado al terminar la evaluación.</strong> El
          score compara el MAE de tu modelo con predecir cero: (MAE cero − MAE
          modelo) / max(MAE cero, 0.005). Una ronda cerrada puede estar
          esperando evaluación.
        </li>
      </ol>
      <p className="mt-8 text-sm text-muted">
        Verifica los SHA-256 de los archivos con el manifiesto. Las descargas
        diarias se verifican antes de guardarse. El histórico usa Alpaca SIP; la
        validación histórica no demuestra rentabilidad futura.
      </p>
      <Link
        href="/app/tournaments#rondas-diarias"
        className="mt-6 inline-block text-accent underline"
      >
        Ver rondas diarias y plazos
      </Link>
    </div>
  );
}
