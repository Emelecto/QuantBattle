"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthGuard } from "@/lib/AuthGuard";
import {
  downloadNotebook,
  getErrorReport,
  getMissions,
  getProgress,
  markCheckpoint,
  sendMission,
  type ErrorReport,
  type Mission,
  type MissionResult,
  type Progress,
} from "@/lib/ml-learning";
import {
  getReturnHistory,
  listReturnWeeks,
  type ReturnWeek,
} from "@/lib/returnTournaments";
import { Workspace, Feedback, messageOf } from "./Workspace";

export function LearningHub() {
  return (
    <Workspace
      title="Aprender investigando"
      intro="Desde tu primer archivo hasta entender tus errores. Practica con datos sintéticos y lleva lo aprendido a un torneo."
    >
      <section className="ml-section">
        <h2>
          <Link href="/app/learn/first-tournament">Mi primer torneo</Link>
        </h2>
        <p>
          Prepara el entorno, descarga una ronda y registra tu primer CSV. Cada
          paso tiene una lección de apoyo.
        </p>
      </section>
      <section className="ml-section">
        <h2>
          <Link href="/app/learn/missions">Misiones de práctica</Link>
        </h2>
        <p>
          Supera una referencia cero, detecta información futura y compara dos
          ventanas de validación en ejercicios sintéticos.
        </p>
      </section>
      <section className="ml-section">
        <h2>
          <Link href="/app/learn/errors">Laboratorio de errores</Link>
        </h2>
        <p>
          Revisa tu predicción, el resultado observado y el error por activo
          después de la liberación de una semana real.
        </p>
      </section>
      <section className="ml-section">
        <h2>
          <Link href="/app/learn/glossary">Glosario visual</Link>
        </h2>
        <p>
          Cambia predicciones, explora la volatilidad y entiende cómo se calcula
          una puntuación.
        </p>
      </section>
      <div className="ml-toolbar">
        <Link href="/app/academia">Cursos completos de Academia</Link>
        <Link href="/app/marketplace">Notebooks de la comunidad</Link>
      </div>
    </Workspace>
  );
}

export function FirstTournament() {
  const [progress, setProgress] = useState<Progress | null>(null),
    [weeks, setWeeks] = useState<ReturnWeek[]>([]),
    [weeksKnown, setWeeksKnown] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setError("");
    setWeeksKnown(false);
    setLoading(true);
    const results = await Promise.allSettled([
      getProgress(),
      listReturnWeeks(),
    ]);
    if (results[0].status === "fulfilled") setProgress(results[0].value);
    if (results[1].status === "fulfilled") {
      setWeeks(results[1].value.tournaments);
      setWeeksKnown(true);
    }
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length)
      setError(
        failed
          .map((r) => (r.status === "rejected" ? messageOf(r.reason) : ""))
          .join(" · "),
      );
    setLoading(false);
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);
  const active = weeksKnown
      ? weeks.find((w) => w.rounds.some((r) => r.status === "open"))
      : undefined,
    round = active?.rounds.find((r) => r.status === "open");
  async function complete(step: string) {
    setBusy(true);
    setError("");
    try {
      await markCheckpoint(step);
      await load();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  const completed =
    (progress?.checkpoints.length || 0) + (progress?.has_submission ? 1 : 0);
  function checkpoint(step: string, label: string) {
    return (
      <button
        disabled={busy || !progress || progress.checkpoints.includes(step)}
        onClick={() => void complete(step)}
      >
        {progress?.checkpoints.includes(step) ? "Confirmado por ti" : label}
      </button>
    );
  }
  return (
    <AuthGuard>
      <Workspace
        title="Tu primer torneo, paso a paso"
        intro="Puedes retomar esta ruta cuando quieras. Las tres confirmaciones de preparación las marcas tú; el envío se confirma desde el servidor."
      >
        <Feedback error={error} />
        {error && <button onClick={() => void load()}>Reintentar carga</button>}
        {loading ? (
          <p role="status">Consultando tu progreso y las rondas…</p>
        ) : (
          progress && (
            <div className="ml-progress">
              <progress
                aria-label="Progreso de preparación"
                value={completed}
                max={4}
              />
              <span>{completed} de 4 hitos · preparación y primer envío</span>
            </div>
          )
        )}
        <ol className="ml-steps">
          <li>
            <h2>Entiende qué vas a predecir</h2>
            <p>
              En retornos reales se predice un retorno decimal: 0.025 significa
              +2,5 %. La práctica sintética usa otra escala y Spearman. Revisa
              el protocolo antes de elegir un notebook.
            </p>
            <div className="ml-toolbar">
              <Link href="/app/tournaments/guide">Reglas y formatos</Link>
              <Link href="/app/academia/torneos/1">
                Lección: cómo participar
              </Link>
              {checkpoint("read_rules", "Ya revisé las reglas")}
            </div>
          </li>
          <li>
            <h2>Descarga una ronda publicada</h2>
            {active && round?.dataset ? (
              <>
                <p>
                  {active.name} · ronda {round.ordinal} · versión{" "}
                  <code>{round.version}</code>
                </p>
                <div className="ml-toolbar">
                  {(["train", "validation", "live"] as const).map((kind) => (
                    <a
                      key={kind}
                      href={round.dataset!.files[kind].url}
                      download
                    >
                      {kind} · {round.dataset!.files[kind].rows} filas
                    </a>
                  ))}
                  <Link href={`/app/tournaments/weekly/${active.id}`}>
                    Abrir ronda y consultar plazo
                  </Link>
                </div>
              </>
            ) : !weeksKnown ? (
              <p>
                {loading
                  ? "Consultando las rondas…"
                  : "No se pudo confirmar la disponibilidad de rondas. Reintenta la consulta."}
              </p>
            ) : active ? (
              <p>
                Los archivos de la ronda todavía no están disponibles.{" "}
                <Link href="/app/tournaments">
                  Consulta su estado en Torneos.
                </Link>
              </p>
            ) : (
              <p>
                No encontramos una ronda real abierta en la consulta.{" "}
                <Link href="/app/tournaments">
                  Consulta Torneos para ver también la práctica sintética.
                </Link>
              </p>
            )}
            <p className="ml-muted">
              Descargar un enlace no confirma que el archivo llegó a tu equipo.
              Verifica la versión de los tres archivos.
            </p>
          </li>
          <li>
            <h2>Prepara tu notebook</h2>
            <p>
              Abre el ejemplo de la modalidad elegida en Jupyter o Colab.
              Entrena con train y selecciona la configuración con validation.
            </p>
            <div className="ml-toolbar">
              <a href="/ml/ejemplo_retornos_diarios.ipynb" download>
                Notebook de retornos
              </a>
              <a href="/ml/ejemplo_quantlab.ipynb" download>
                Notebook de práctica sintética
              </a>
              <Link href="/app/academia/python/1">
                Preparar Jupyter y pandas
              </Link>
              {checkpoint("environment", "Ya preparé mi entorno")}
            </div>
          </li>
          <li>
            <h2>Revisa tu predicción</h2>
            <p>
              Genera el CSV con cabecera id,prediction. La página de tu ronda
              comprueba estructura, IDs y límites de su protocolo antes del
              envío.
            </p>
            <div className="ml-toolbar">
              <Link href="/app/learn/missions">Practicar con una misión</Link>
              <Link href="/app/strategies/new">
                Guardar la ficha del modelo
              </Link>
              {checkpoint("validation", "Ya revisé mi CSV")}
            </div>
          </li>
          <li>
            <h2>Envía y conserva el comprobante</h2>
            <p>
              {progress?.has_submission
                ? "El servidor confirmó que tu cuenta tiene un envío seleccionado. Consulta el historial para identificar su ronda y versión."
                : "El paso se completará cuando el servidor registre un envío seleccionado para tu cuenta."}
            </p>
            <div className="ml-toolbar">
              <Link
                href={
                  active
                    ? `/app/tournaments/weekly/${active.id}`
                    : "/app/tournaments"
                }
              >
                Abrir torneo y enviar
              </Link>
              <Link href="/app#historial-ml">Consultar mis comprobantes</Link>
            </div>
          </li>
          <li>
            <h2>Vuelve después del cierre</h2>
            <p>
              En la modalidad real, los resultados se liberan al terminar y
              verificar toda la semana. Entonces podrás analizar tus errores.
            </p>
            <Link href="/app/learn/errors">Laboratorio de errores</Link>
          </li>
        </ol>
      </Workspace>
    </AuthGuard>
  );
}

function MissionExercise({
  mission,
  onPass,
}: {
  mission: Mission;
  onPass: () => void;
}) {
  const [choice, setChoice] = useState<number | null>(null),
    [predictions, setPredictions] = useState(""),
    [result, setResult] = useState<MissionResult | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    setResult(null);
    try {
      const answer =
        mission.kind === "choice"
          ? { choice }
          : {
              predictions: predictions
                .split(/[\s,;]+/)
                .filter(Boolean)
                .map((v) => {
                  const n = Number(v);
                  if (!Number.isFinite(n))
                    throw new Error(
                      "Todas las predicciones deben ser números finitos.",
                    );
                  return n;
                }),
            };
      const value = await sendMission(mission.id, answer);
      setResult(value);
      if (value.passed) onPass();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ml-section">
      <h2>{mission.title}</h2>
      <p>{mission.prompt}</p>
      {mission.train && (
        <div className="ml-table-wrap">
          <table>
            <caption>Datos artificiales · train</caption>
            <thead>
              <tr>
                <th>ID</th>
                <th>Feature</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {mission.train.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.feature}</td>
                  <td>{r.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mission.validation && (
        <p className="ml-notice">
          Validation en orden:{" "}
          {mission.validation
            .map((r) => `${r.id}: feature ${r.feature}`)
            .join(" · ")}
        </p>
      )}
      <form className="ml-form" onSubmit={submit}>
        {mission.kind === "choice" ? (
          <fieldset>
            <legend>Elige una respuesta</legend>
            {mission.options?.map((option, i) => (
              <label className="ml-choice" key={option}>
                <input
                  type="radio"
                  name={mission.id}
                  required
                  checked={choice === i}
                  onChange={() => setChoice(i)}
                />
                {option}
              </label>
            ))}
          </fieldset>
        ) : (
          <label>
            Seis predicciones, en orden v0 a v5
            <textarea
              required
              value={predictions}
              onChange={(e) => setPredictions(e.target.value)}
              placeholder="0.01, -0.02, 0, 0.03, 0.01, -0.01"
            />
            <span className="ml-muted">
              Usa punto decimal y coma o espacio entre valores.
            </span>
          </label>
        )}
        <button disabled={busy} className="ml-primary">
          {busy ? "Evaluando…" : "Evaluar mi respuesta"}
        </button>
      </form>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await downloadNotebook(
              `/ml/learning/missions/${mission.id}/notebook`,
            );
          } catch (e) {
            setError(messageOf(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Descargar notebook del ejercicio
      </button>
      <Feedback error={error} />
      {result && (
        <div className="ml-notice" role="status">
          <h3>{result.passed ? "Misión completada" : "Inténtalo de nuevo"}</h3>
          <p>{result.explanation}</p>
          {result.mae != null && (
            <p>Tu MAE: {(result.mae * 100).toFixed(3)} puntos porcentuales.</p>
          )}
        </div>
      )}
      <Link href={mission.lesson}>Abrir lección relacionada</Link>
    </section>
  );
}
export function Missions() {
  const [missions, setMissions] = useState<Mission[]>([]),
    [passed, setPassed] = useState<string[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    const results = await Promise.allSettled([getMissions(), getProgress()]);
    if (results[0].status === "fulfilled")
      setMissions(results[0].value.missions);
    if (results[1].status === "fulfilled")
      setPassed(results[1].value.passed_missions);
    for (const result of results)
      if (result.status === "rejected") setError(messageOf(result.reason));
    setLoading(false);
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);
  return (
    <AuthGuard>
      <Workspace
        title="Misiones de práctica"
        intro="Tres ejercicios sintéticos para entrenar tu criterio. Sus resultados son pedagógicos y se guardan en tu progreso personal."
      >
        <Feedback error={error} />
        {error && <button onClick={() => void load()}>Reintentar</button>}
        {loading ? (
          <p role="status">Cargando misiones…</p>
        ) : (
          <div className="ml-progress">
            <progress
              aria-label="Misiones completadas"
              max={3}
              value={passed.length}
            />
            <span>{passed.length} de 3 completadas</span>
          </div>
        )}
        {missions.map((m) => (
          <MissionExercise
            key={m.id}
            mission={m}
            onPass={() =>
              setPassed((old) => (old.includes(m.id) ? old : [...old, m.id]))
            }
          />
        ))}
      </Workspace>
    </AuthGuard>
  );
}

export function ErrorLaboratory() {
  const [weeks, setWeeks] = useState<ReturnWeek[]>([]),
    [own, setOwn] = useState<Set<string>>(new Set()),
    [round, setRound] = useState(""),
    [report, setReport] = useState<ErrorReport | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [availabilityKnown, setAvailabilityKnown] = useState(false),
    [errorSource, setErrorSource] = useState<"catalog" | "report">("catalog");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setErrorSource("catalog");
    setAvailabilityKnown(false);
    const results = await Promise.allSettled([
      listReturnWeeks(),
      getReturnHistory(),
    ]);
    if (results[0].status === "fulfilled")
      setWeeks(results[0].value.tournaments);
    if (results[1].status === "fulfilled")
      setOwn(new Set(results[1].value.entries.map((r) => r.round_id)));
    for (const result of results)
      if (result.status === "rejected") setError(messageOf(result.reason));
    setAvailabilityKnown(
      results.every((result) => result.status === "fulfilled"),
    );
    setLoading(false);
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);
  const available = weeks
    .filter((w) => w.results_released)
    .flatMap((w) =>
      w.rounds
        .filter((r) => r.status === "published" && own.has(r.id))
        .map((r) => ({ id: r.id, label: `${w.name} · ronda ${r.ordinal}` })),
    );
  async function analyze(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    setReport(null);
    try {
      setReport(await getErrorReport(round));
    } catch (e) {
      setErrorSource("report");
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthGuard>
      <Workspace
        title="Laboratorio de errores"
        intro="Explora un envío propio con resultados ya liberados. Las preguntas se generan a partir de sus errores observados; describen una ronda y no prueban la calidad futura del modelo."
      >
        <Feedback error={error} />
        {error && (
          <button
            disabled={busy}
            onClick={() =>
              errorSource === "report" ? void analyze() : void load()
            }
          >
            {errorSource === "report"
              ? "Reintentar análisis"
              : "Reintentar consulta"}
          </button>
        )}
        {loading ? (
          <p role="status">Consultando semanas y comprobantes…</p>
        ) : (
          <>
            {!availabilityKnown && (
              <p className="ml-notice">
                No se pudo determinar qué rondas están disponibles para tu
                cuenta. Reintenta la consulta o indica el ID de una ronda
                conocida.
              </p>
            )}
            {availabilityKnown && !available.length && (
              <p className="ml-notice">
                No hay una ronda liberada con envío propio en el historial
                reciente. Cuando termine y se verifique una semana en la que
                participaste, aparecerá aquí. También puedes indicar el ID de
                una ronda anterior.
              </p>
            )}
            <form className="ml-form" onSubmit={analyze}>
              <label>
                ID de ronda con resultados liberados
                <input
                  required
                  list="released-rounds"
                  value={round}
                  onChange={(e) => setRound(e.target.value)}
                  placeholder="Selecciona una ronda o pega su ID"
                />
                <datalist id="released-rounds">
                  {available.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </datalist>
              </label>
              <button className="ml-primary" disabled={busy}>
                {busy ? "Reconstruyendo errores…" : "Analizar mi envío"}
              </button>
            </form>
            {report && (
              <>
                <h2>Tu diagnóstico de esta ronda</h2>
                <p>
                  MAE: {(report.mae * 100).toFixed(3)} pp · Referencia cero:{" "}
                  {(report.baseline_mae * 100).toFixed(3)} pp · Score:{" "}
                  {report.score.toFixed(4)}
                </p>
                <p>
                  Sesgo medio firmado:{" "}
                  {(report.mean_signed_error * 100).toFixed(3)} pp.
                </p>
                <p className="ml-muted">{report.limitations}</p>
                <div className="ml-table-wrap">
                  <table>
                    <caption>
                      Errores propios, ordenados por magnitud · valores en
                      puntos porcentuales
                    </caption>
                    <thead>
                      <tr>
                        <th>Activo</th>
                        <th>Predicción</th>
                        <th>Observado</th>
                        <th>Error absoluto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.assets.map((a) => (
                        <tr key={a.id}>
                          <td>{a.symbol}</td>
                          <td>{(a.prediction * 100).toFixed(3)}</td>
                          <td>{(a.actual * 100).toFixed(3)}</td>
                          <td>{(a.absolute_error * 100).toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h2>Preguntas para investigar</h2>
                {report.exercises.map((ex) => (
                  <details key={ex.question}>
                    <summary>{ex.question}</summary>
                    <p>{ex.answer}</p>
                    <Link href={ex.lesson}>Repasar el concepto</Link>
                  </details>
                ))}
                <p className="ml-muted ml-hash">
                  Dataset {report.dataset_version} · CSV {report.file_sha256}
                </p>
              </>
            )}
            <Link href="/app/tournaments">Consultar los torneos</Link>
          </>
        )}
      </Workspace>
    </AuthGuard>
  );
}
