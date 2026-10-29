"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { Icon } from '@/components/dashboard/Sidebar';
import {
  getReturnHistory, getReturnReceipts, getReturnResults, getReturnRows, getReturnWeek,
  listReturnWeeks, returnDate, returnDay, reviewReturnCsv, submitReturnFile,
  type ReturnReceipt, type ReturnResults, type ReturnRound, type ReturnWeek,
} from '@/lib/returnTournaments';
import './return-tournament.css';

const states: Record<ReturnRound['status'], string> = {
  open: 'Recibiendo predicciones', closed: 'Envíos cerrados', scheduled: 'Programada',
  preparing: 'Verificando datos', published: 'Resultado publicado', missed: 'Ronda no publicada',
};
const percent = (value: number) => new Intl.NumberFormat('es-CO', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value);
const score = (value: number) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value);
const errorPoints = (value: number) => `${(value * 100).toLocaleString('es-CO', { maximumFractionDigits: 4 })} p.p.`;
const message = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la consulta. Vuelve a intentar.';
const shortDay = (value: string) => new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Bogota' }).format(new Date(`${value}T12:00:00-05:00`));

export function ReturnTournamentList({ compact = false }: { compact?: boolean }) {
  const [weeks, setWeeks] = useState<ReturnWeek[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () => listReturnWeeks().then(value => { if (active) { setWeeks(value.tournaments); setError(''); } }).catch(error => { if (active) setError(message(error)); });
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [retry]);
  return <section className="qb-return-list" aria-label="Torneos de retornos reales">
    <div className="qb-return-section-head"><div><h2>Retornos diarios · mercado real</h2><p>Cuatro rondas, un torneo semanal. Predice el retorno del día siguiente con variables ofuscadas de criptoactivos.</p></div><Link href="/app/tournaments/guide#retornos-diarios">Leer las reglas</Link></div>
    {error ? <div role="alert" className="qb-return-alert"><p>{error}</p><button className={buttonClasses('secondary', 'sm')} onClick={() => { setError(''); setRetry(x => x + 1); }}>Reintentar</button></div>
      : weeks === null ? <p role="status">Consultando el calendario real…</p>
      : !weeks.length ? <p className="qb-return-empty">El primer torneo real está en preparación. Aquí aparecerá cuando el universo y sus datos estén verificados.</p>
      : <div className="qb-return-week-list">{(compact ? weeks.slice(0, 1) : weeks).map(week => <Link key={week.id} href={`/app/tournaments/weekly/${week.id}`} className="qb-return-week-link">
        <div><strong>{week.name}</strong><span>{week.asset_count} criptoactivos · 4 rondas · Colombia</span></div>
        <div><span className="qb-return-state">{week.results_released ? 'Resultados disponibles' : week.rounds.some(r => r.status === 'open') ? 'Ronda abierta' : 'Torneo en curso'}</span><span className="qb-return-inline-icon">{week.results_released ? 'Ver ranking y precios reales' : `Resultados desde ${returnDate(week.release_at)}`}<span aria-hidden><Icon name="arrow-right" size={16} /></span></span></div>
      </Link>)}</div>}
  </section>;
}

export function ReturnSubmissionHistory() {
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof getReturnHistory>>['entries'] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    getReturnHistory().then(value => { if (active) setEntries(value.entries); }).catch(e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [retry]);
  return <section id="historial-ml" className="qb-return-history" aria-label="Mis envíos de retornos diarios">
    <h2>Mis envíos · retornos diarios</h2>
    {error ? <p role="alert">{error} <button className="underline" onClick={() => { setError(''); setRetry(x => x + 1); }}>Reintentar consulta</button></p>
      : entries === null ? <p role="status">Consultando comprobantes…</p>
      : !entries.length ? <p>Tus comprobantes de los torneos reales aparecerán aquí. Cada ronda conserva el último archivo válido.</p>
      : <ul>{entries.map(entry => <li key={entry.id}><Link href={`/app/tournaments/weekly/${entry.week_id}?round=${entry.round_id}#mis-envios`}><strong>{entry.week_name} · ronda {entry.ordinal}</strong><span>Predicción para {returnDay(entry.target_day)} · {returnDate(entry.submitted_at)}</span></Link><span>{entry.score === undefined ? 'Validado · resultado retenido' : `Score ${score(entry.score)}`}</span></li>)}</ul>}
  </section>;
}

export function ReturnTournament({ id }: { id: string }) {
  const [week, setWeek] = useState<ReturnWeek | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('round') ?? '');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () => getReturnWeek(id).then(value => { if (active) { setWeek(value); setError(''); } }).catch(e => { if (active) setError(message(e)); });
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [id, retry]);
  const round = week?.rounds.find(r => r.id === selected) ?? week?.rounds.find(r => r.status === 'open') ?? week?.rounds.find(r => r.dataset) ?? week?.rounds[0];
  return <div className="qb-page qb-return-page">
    <Link href="/app/tournaments" className="qb-return-back"><span aria-hidden><Icon name="arrow-left" size={18} /></span>Todos los torneos</Link>
    {error && <div role="alert" className="qb-return-alert"><p>{error}</p><button className={buttonClasses('secondary', 'sm')} onClick={() => setRetry(x => x + 1)}>Volver a consultar</button></div>}
    {!week ? <p role="status">Cargando torneo y fechas verificadas…</p> : <>
      <header className="qb-return-header"><div><h1>{week.name}</h1><p>Retornos diarios de {week.asset_count} criptoactivos. <strong>0.025 = +2,5 %</strong>.</p></div><span className="qb-return-state">{week.results_released ? 'Torneo finalizado' : 'Resultados retenidos'}</span></header>
      <p className="qb-return-calendar-note">Cierre diario: 23:59 de Colombia. El ranking general exige cuatro envíos válidos.</p>
      <nav className="qb-return-rounds" aria-label="Elegir ronda">{week.rounds.map(r => <button key={r.id} type="button" aria-label={`Ronda ${r.ordinal} · ${returnDay(r.submission_day)}. ${states[r.status]}. Predice ${returnDay(r.target_day)}`} aria-pressed={r.id === round?.id} onClick={() => setSelected(r.id)} className={r.id === round?.id ? 'selected' : ''}><strong>Ronda {r.ordinal} · {shortDay(r.submission_day)}</strong><span>{r.status === 'open' ? 'Abierta' : r.status === 'scheduled' ? 'Próxima' : states[r.status]}</span><small>Predice {shortDay(r.target_day)}</small></button>)}</nav>
      {round && <section aria-label={`Ronda ${round.ordinal}`} className="qb-return-workspace">
        <div className="qb-return-section-head"><div><h2>Ronda {round.ordinal} · {states[round.status]}</h2><p>Información hasta {returnDay(round.observation_day)}. Predice el retorno de {returnDay(round.target_day)}, desde las 00:00 hasta las 23:59.</p></div><div className="qb-return-deadline"><span>Cierre de envíos</span><strong>{returnDate(new Date(Date.parse(round.closes_at) - 1).toISOString())}</strong></div></div>
        <DatasetFiles round={round} />
        <ReturnSubmission key={round.id} round={round} released={week.results_released} />
      </section>}
      <section className="qb-return-method"><h2>Cómo se evalúa</h2><p>El servidor mide el error absoluto medio entre tus retornos y los observados. Cada ronda se compara con predecir 0 % para todos los activos: un score positivo mejora esa referencia; uno negativo queda por debajo. El promedio de cuatro rondas determina el ranking, con el error medio como desempate.</p><p>Las variables están mezcladas y discretizadas, y las etiquetas históricas se redondean a pasos de 0,5 puntos porcentuales. No se entregan precios ni símbolos originales durante el torneo. Se permite información pública anterior al cierre; la ficha del modelo documenta el método declarado, pero el CSV no prueba por sí solo que se usó ML.</p><details><summary>Fórmula y límites</summary><p><code>score = (MAE de la referencia cero − MAE del modelo) / max(MAE de la referencia cero, 0.005)</code>. Cada activo pesa lo mismo dentro de su ronda. El normalizador evita que un día con poco movimiento produzca divisiones inestables. Los retornos se expresan como fracciones; se aceptan valores entre −1 y 10. Hasta 50 intentos por ronda; solo el último válido antes del cierre compite.</p><p>La ofuscación dificulta identificar activos, pero no garantiza anonimato. Los precios de origen son públicos. No hay premios QP ni operaciones de trading en este torneo.</p><p>Datos derivados de <a href="https://data.binance.vision/" target="_blank" rel="noreferrer">Binance Vision</a>, para investigación no comercial, bajo CC BY-NC-SA 4.0 y sus condiciones de uso.</p></details></section>
      {week.results_released ? <PublishedResults week={week} /> : <section className="qb-return-embargo"><h2>Un único cierre para todos los resultados</h2><p>Las puntuaciones de las cuatro rondas, los nombres de los activos y los precios reales se publicarán juntos, después de verificar el último día de mercado.</p><strong>No antes de {returnDate(week.release_at)}</strong><p>Si falta un dato, el torneo permanecerá pendiente de verificación. Un fallo de la fuente no se sustituye por precios inventados.</p></section>}
    </>}
  </div>;
}

function DatasetFiles({ round }: { round: ReturnRound }) {
  if (!round.dataset) return <div className="qb-return-empty"><p>{round.status === 'missed' ? 'Esta ronda no publicó datos antes del plazo. No admite envíos retroactivos.' : 'Los archivos se publican después de verificar los datos completos del día anterior.'}</p><p>Apertura prevista: {returnDate(round.opens_at)}</p></div>;
  return <section className="qb-return-downloads" aria-label="Archivos del dataset"><h3>Descarga y entrena tu modelo</h3><div className="qb-return-file-list">{(['train', 'validation', 'live'] as const).map(kind => <a key={kind} href={round.dataset!.files[kind].url} target="_blank" rel="noreferrer"><strong>{kind}.parquet <span aria-hidden><Icon name="download" size={18} /></span></strong><span>{round.dataset!.files[kind].rows.toLocaleString('es-CO')} filas · {kind === 'live' ? 'sin respuesta futura' : 'con retorno histórico'}</span></a>)}</div><p>Entrena con train, elige parámetros con validation y genera un CSV para todos los IDs de live. <a href="/ml/ejemplo_retornos_diarios.ipynb" download>Descargar notebook de referencia</a>.</p><details><summary>Versión y huellas del dataset</summary><p className="qb-return-hash">{round.version}</p>{Object.entries(round.dataset.files).map(([kind, file]) => <p key={kind} className="qb-return-hash">{kind}: {file.hash}</p>)}<p className="qb-return-hash">Compromiso de fuente cifrada: {round.dataset.source_commitment}</p></details></section>;
}

function ReturnSubmission({ round, released }: { round: ReturnRound; released: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [digest, setDigest] = useState('');
  const [review, setReview] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [model, setModel] = useState('');
  const [parameters, setParameters] = useState('{}');
  const [seed, setSeed] = useState('');
  const [note, setNote] = useState('');
  const [attempts, setAttempts] = useState<ReturnReceipt[] | null>(null);
  const [receiptError, setReceiptError] = useState('');
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    getReturnReceipts(round.id).then(value => { if (active) setAttempts(value.attempts); }).catch(e => { if (active) setReceiptError(message(e)); });
    return () => { active = false; };
  }, [round.id, retry, released]);
  async function inspect(candidate: File) {
    const token = ++generation.current;
    setFile(candidate); setReview(null); setDigest(''); setFeedback(null);
    if (!candidate.size || candidate.size > 10 * 1024 * 1024 || !candidate.name.toLowerCase().endsWith('.csv')) {
      setChecking(false); setFeedback({ ok: false, text: 'Selecciona un CSV entre 1 byte y 10 MB.' }); return;
    }
    setChecking(true);
    try {
      const [bytes, index] = await Promise.all([candidate.arrayBuffer(), getReturnRows(round.id)]);
      if (index.round_id !== round.id || index.version !== round.version) throw new Error('La versión de la ronda cambió. Vuelve a cargar el torneo.');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const issues = reviewReturnCsv(text, index.ids);
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
      if (token === generation.current) { setReview(issues); setDigest(hash); }
    } catch (e) { if (token === generation.current) setFeedback({ ok: false, text: message(e) }); }
    finally { if (token === generation.current) setChecking(false); }
  }
  async function send() {
    if (!file || review === null || review.length || checking || sending || round.status !== 'open') return;
    setFeedback(null);
    try {
      if (!model.trim()) throw new Error('Indica el nombre del modelo que generó las predicciones.');
      const params: unknown = JSON.parse(parameters);
      if (!params || Array.isArray(params) || typeof params !== 'object' || new TextEncoder().encode(JSON.stringify(params)).length > 2048) throw new Error('Los parámetros deben ser un objeto JSON de hasta 2 KB.');
      const randomSeed = seed.trim() ? Number(seed) : null;
      if (randomSeed !== null && (!Number.isInteger(randomSeed) || randomSeed < 0 || randomSeed > 4294967295)) throw new Error('Usa una semilla entera entre 0 y 4294967295 o deja el campo vacío.');
      setSending(true);
      const response = await submitReturnFile(round.id, file, { model_name: model.trim(), parameters: params as Record<string, unknown>, seed: randomSeed, note: note.trim() });
      if (response.submission.file_sha256 !== digest) throw new Error('No coincide la huella del comprobante. Consulta tus envíos antes de reintentar.');
      setFeedback({ ok: true, text: 'Predicciones validadas y seleccionadas. La puntuación permanecerá retenida hasta el cierre del torneo completo.' });
      setFile(null); setReview(null); setAttempts(current => [response.submission, ...(current ?? []).map(x => ({ ...x, is_selected: false }))]);
      window.dispatchEvent(new Event('quantbattle:return-submitted'));
    } catch (e) { setFeedback({ ok: false, text: e instanceof SyntaxError ? 'Los parámetros no contienen JSON válido.' : message(e) }); }
    finally { setSending(false); }
  }
  const selected = attempts?.find(x => x.is_selected);
  return <section className="qb-return-submit" id="mis-envios"><h3>{round.status === 'open' ? 'Envía tus predicciones' : 'Tus comprobantes de esta ronda'}</h3>
    {round.status === 'open' && <>
      <p>Sube exactamente <code>id,prediction</code>. Cada ID debe aparecer una vez. Una predicción de −0.02 equivale a −2 %; 0 es válido.</p>
      <label className="qb-return-field">Archivo CSV<input type="file" aria-label="CSV de retornos diarios" accept=".csv,text/csv" disabled={sending} onChange={e => { const candidate = e.target.files?.[0]; if (candidate) void inspect(candidate); e.target.value = ''; }} /></label>
      {file && <p className="qb-return-hash">{file.name} · {file.size.toLocaleString('es-CO')} bytes</p>}
      {checking && <p role="status">Comprobando IDs, retornos y huella del archivo…</p>}
      {review && (review.length ? <ul role="alert" className="qb-return-alert">{review.map(issue => <li key={issue}>{issue}</li>)}</ul> : <p role="status" className="qb-return-valid">Archivo listo para validar en el servidor.</p>)}
      {digest && <details><summary>Huella del archivo revisado</summary><p className="qb-return-hash">{digest}</p></details>}
      <fieldset disabled={sending}><legend>Ficha privada del modelo</legend><div className="qb-return-form-grid"><label className="qb-return-field">Nombre del modelo<input value={model} onChange={e => setModel(e.target.value)} maxLength={100} placeholder="Ej.: HistGradientBoosting v1" /></label><label className="qb-return-field">Semilla, si la utilizaste<input type="number" min={0} max={4294967295} step={1} value={seed} onChange={e => setSeed(e.target.value)} placeholder="Opcional" /></label></div><label className="qb-return-field">Parámetros del modelo (JSON)<textarea value={parameters} onChange={e => setParameters(e.target.value)} rows={3} maxLength={2048} spellCheck={false} /></label><label className="qb-return-field">Nota del experimento<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} rows={2} placeholder="Cómo entrenaste y elegiste la configuración" /></label></fieldset>
      <button className={buttonClasses('primary', 'lg')} disabled={review === null || review.length > 0 || checking || sending} onClick={() => void send()}>{sending ? 'Registrando predicciones…' : 'Validar y registrar predicciones'}</button>
    </>}
    {feedback && <p role={feedback.ok ? 'status' : 'alert'} className={feedback.ok ? 'qb-return-valid' : 'qb-return-alert'}>{feedback.text}</p>}
    <div className="qb-return-receipt"><h4>Último envío válido seleccionado</h4>{receiptError ? <p role="alert">{receiptError}</p> : attempts === null ? <p role="status">Consultando tu comprobante…</p> : selected ? <><dl><div><dt>Recibido</dt><dd>{returnDate(selected.submitted_at)}</dd></div><div><dt>Filas</dt><dd>{selected.row_count}</dd></div><div><dt>Estado</dt><dd>{selected.score === undefined ? 'Validado · resultado retenido' : `Score ${score(selected.score)}`}</dd></div></dl><p className="qb-return-hash">SHA-256: {selected.file_sha256}</p><p className="qb-return-hash">Dataset: {selected.dataset_version}</p></> : <p>Aún no has registrado un archivo válido en esta ronda.</p>}
      <button className={buttonClasses('secondary', 'sm')} onClick={() => { setReceiptError(''); setRetry(x => x + 1); }}>Actualizar comprobante</button>
      {!!attempts?.length && <details><summary>Historial de intentos ({attempts.length})</summary><ul>{attempts.map(a => <li key={a.id}>{returnDate(a.submitted_at)} · {a.is_selected ? 'Seleccionado' : 'No seleccionado'}<span className="qb-return-hash">{a.file_sha256}</span></li>)}</ul></details>}
      {selected?.mae !== undefined && selected.baseline_mae !== undefined && <p>Error medio: {errorPoints(selected.mae)} · referencia cero: {errorPoints(selected.baseline_mae)}</p>}
    </div>
  </section>;
}

function PublishedResults({ week }: { week: ReturnWeek }) {
  const [data, setData] = useState<ReturnResults | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    getReturnResults(week.id).then(value => { if (active) setData(value); }).catch(e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [week.id, retry]);
  return <section className="qb-return-results"><h2>Resultados y precios reales</h2>{error ? <p role="alert">{error} <button className="underline" onClick={() => { setError(''); setRetry(x => x + 1); }}>Reintentar</button></p> : !data ? <p role="status">Consultando la evidencia final…</p> : <>
    <p>{week.status === 'incomplete' ? 'El torneo tuvo rondas sin publicar. Se revela la evidencia disponible y no se proclama un ganador general.' : 'El torneo completo terminó. Los símbolos y precios que estuvieron privados ya pueden verificarse.'}</p>
    {!data.leaderboard.length ? <p>No hubo envíos puntuados en este torneo.</p> : <><div className="qb-return-table"><table><caption>Clasificación general · se requieren cuatro rondas</caption><thead><tr><th>Puesto</th><th>Participante</th><th>Rondas</th><th>Score medio</th><th>Error medio</th></tr></thead><tbody>{data.leaderboard.map(entry => <tr key={entry.user_id}><td>{entry.rank ?? 'Sin clasificar'}</td><td>{entry.username ?? `Cuenta ${entry.user_id.slice(0, 8)}`}</td><td>{entry.rounds.length}/4</td><td>{entry.score !== null ? score(entry.score) : 'Requiere 4 rondas'}</td><td>{entry.mean_mae !== null ? errorPoints(entry.mean_mae) : '—'}</td></tr>)}</tbody></table></div><details><summary>Ver las cuatro puntuaciones de cada participante</summary><div className="qb-return-table"><table><caption>Desglose por ronda</caption><thead><tr><th>Participante</th>{[1, 2, 3, 4].map(n => <th key={n}>Ronda {n}</th>)}</tr></thead><tbody>{data.leaderboard.map(entry => <tr key={entry.user_id}><td>{entry.username ?? `Cuenta ${entry.user_id.slice(0, 8)}`}</td>{[1, 2, 3, 4].map(n => <td key={n}>{entry.rounds.find(r => r.ordinal === n) ? score(entry.rounds.find(r => r.ordinal === n)!.score) : 'Sin envío válido'}</td>)}</tr>)}</tbody></table></div></details></>}
    {data.evidence.rounds.map(round => <details key={round.id} className="qb-return-price-details"><summary>Ronda {round.ordinal} · {returnDay(round.target_day)} · precios y retornos</summary>{round.assets ? <><div className="qb-return-table"><table><caption>Velas reales del día, 00:00–23:59 Colombia</caption><thead><tr><th>Activo</th><th>Precio inicial (USDT)</th><th>Precio final (USDT)</th><th>Retorno observado</th><th>ID público</th></tr></thead><tbody>{round.assets.map(asset => <tr key={asset.id}><td>{asset.symbol}</td><td>{asset.open.toLocaleString('es-CO', { maximumSignificantDigits: 10 })}</td><td>{asset.close.toLocaleString('es-CO', { maximumSignificantDigits: 10 })}</td><td>{percent(asset.return)}</td><td className="qb-return-hash">{asset.id}</td></tr>)}</tbody></table></div>{round.evidence && <a href={round.evidence.url}>Descargar fuente cifrada verificable de esta ronda</a>}</> : <p>La ronda no se publicó antes de su cierre.</p>}</details>)}
    <a href={week.results_url} target="_blank" rel="noreferrer">Descargar evidencia completa y claves de reproducción de este torneo</a><p className="qb-return-hash">SHA-256 de la evidencia: {data.results_sha256}</p>
  </>}</section>;
}
