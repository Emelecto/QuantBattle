import Link from "next/link";
import pilot from "../../../public/research/judge-pilot.json";

const model = pilot.results.model;
const random = pilot.results.random_reference;
const firstFeature = pilot.results.feature_reference;
const chartMax = 0.14;

export function PilotEvidencePanel() {
  return <div className="ql-pilot-grid" aria-label="Evidencia pública del piloto sintético">
    <section className="ql-pilot-result" aria-labelledby="pilot-result-title">
      <div className="ql-pilot-panel-head"><div><h3 id="pilot-result-title">Resultado del piloto</h3><p>Spearman por era · {model.n_eras} eras live · datos sintéticos</p></div><Link href="/docs#evaluacion">Metodología ↗</Link></div>
      <div className="ql-pilot-result-body"><div className="ql-pilot-score"><span>Media de correlación</span><strong>{model.corr_mean.toLocaleString("es-CO", { minimumFractionDigits: 5, maximumFractionDigits: 5 })}</strong><p>No representa rentabilidad ni capacidad de pronosticar mercados reales.</p></div><div className="ql-pilot-chart-wrap"><svg viewBox="0 0 560 180" role="img" aria-label="Correlación de Spearman en veinte eras. Las barras se distribuyen a ambos lados de cero."><line x1="0" x2="560" y1="84" y2="84" stroke="#b4c6d9" strokeWidth="1" /><text x="0" y="172" fill="#52677d" fontSize="11">era 01</text><text x="512" y="172" fill="#52677d" fontSize="11">era 20</text><text x="2" y="78" fill="#52677d" fontSize="10">0</text>{model.per_era.map((value, index) => { const height = Math.max(2, Math.abs(value) / chartMax * 69); return <rect key={index} x={8 + index * 27} y={value >= 0 ? 84 - height : 84} width="16" height={height} rx="2" fill={value >= 0 ? "#3e7ce1" : "#9fb2c8"} style={{animationDelay:`${index*18}ms`}}><title>Era {index + 1}: {value.toFixed(5)}</title></rect>; })}</svg></div></div>
      <div className="ql-pilot-baselines"><span><b>Modelo</b> {model.score.toFixed(6)}</span><span><b>Azar</b> {random.score.toFixed(6)}</span><span><b>Primera variable</b> {firstFeature.score.toFixed(6)}</span></div>
      <p className="ql-pilot-result-note">Las referencias pertenecen a la misma ronda. El score publicado se reprodujo exactamente. <a href="/research/judge-pilot.json">Abrir registro completo ↗</a></p>
    </section>
    <section className="ql-pilot-verification" aria-labelledby="pilot-verification-title"><div className="ql-pilot-panel-head"><div><h3 id="pilot-verification-title">Qué se verificó</h3><p>Pruebas del recorrido completo de una ronda</p></div></div><ul><li><span>✓</span><div><strong>Datos versionados</strong><p>El objetivo live no se descargó públicamente durante la ronda.</p></div></li><li><span>✓</span><div><strong>Envíos comprobados</strong><p>CSV inválidos rechazados y comprobante SHA-256 para el envío válido.</p></div></li><li><span>✓</span><div><strong>Evaluación tras el cierre</strong><p>Score oculto antes del plazo y resultado reproducido después.</p></div></li></ul><a href="/research/judge-pilot.json">Consultar evidencia técnica ↗</a></section>
  </div>;
}
