"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/lib/AuthGuard";
import {
  createProject,
  projectList,
  protocolLabel,
  type MLProject,
  type Protocol,
} from "@/lib/ml-learning";
import { Workspace, Feedback, messageOf } from "./Workspace";

export function ProjectList() {
  const [entries, setEntries] = useState<MLProject[]>([]),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await projectList(offset);
      setEntries(data.entries);
      setMore(data.has_more);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }, [offset]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);
  return (
    <AuthGuard>
      <Workspace
        title="Mis proyectos de ML"
        intro="Organiza hipótesis, versiones de modelos y comprobantes de tus torneos. Entrena en tu entorno y conserva aquí la ficha de cada experimento."
      >
        <div className="ml-toolbar">
          <Link className="ml-action" href="/app/strategies/new">
            Nuevo proyecto ML
          </Link>
          <Link href="/app/learn/first-tournament">Mi primer torneo</Link>
          <Link href="/app/backtesting">Backtesting clásico</Link>
        </div>
        <Feedback error={error} />
        {error && <button onClick={() => void load()}>Reintentar</button>}
        {loading ? (
          <p role="status">Cargando proyectos…</p>
        ) : !error && !entries.length ? (
          <div className="ml-notice">
            <h2>Empieza con una pregunta</h2>
            <p>
              Por ejemplo: ¿una regresión regularizada mejora la referencia en
              validation? Crea un proyecto, guarda una versión y vincula después
              tu comprobante.
            </p>
          </div>
        ) : (
          entries.map((project) => (
            <article className="ml-record" key={project.id}>
              <div>
                <h2>
                  <Link href={`/app/strategies/${project.id}`}>
                    {project.title}
                  </Link>
                </h2>
                <p>
                  {project.hypothesis || "Hipótesis pendiente de registrar."}
                </p>
                <p className="ml-muted">
                  {protocolLabel(project.protocol)} ·{" "}
                  {new Date(project.updated_at).toLocaleDateString("es-CO")}
                </p>
              </div>
              <Link href={`/app/strategies/${project.id}`}>Abrir proyecto</Link>
            </article>
          ))
        )}
        <div className="ml-toolbar">
          {offset > 0 && (
            <button disabled={loading} onClick={() => setOffset(offset - 20)}>
              Página anterior
            </button>
          )}
          {more && (
            <button disabled={loading} onClick={() => setOffset(offset + 20)}>
              Página siguiente
            </button>
          )}
        </div>
      </Workspace>
    </AuthGuard>
  );
}
export function NewProject() {
  const router = useRouter();
  const [title, setTitle] = useState(""),
    [hypothesis, setHypothesis] = useState(""),
    [protocol, setProtocol] = useState<Protocol>("daily_return_mae_v1");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const p = await createProject({ title, hypothesis, protocol });
      router.push(`/app/strategies/${p.id}`);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthGuard>
      <Workspace
        title="Nuevo proyecto ML"
        intro="Registra qué quieres probar antes de comparar modelos. Cada proyecto utiliza un protocolo de evaluación."
      >
        <form className="ml-form" onSubmit={submit}>
          <label>
            Nombre del proyecto
            <input
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Hipótesis
            <textarea
              maxLength={3000}
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="Qué esperas observar y cómo lo evaluarás"
            />
          </label>
          <label>
            Protocolo del torneo
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as Protocol)}
            >
              <option value="daily_return_mae_v1">
                Retornos reales · MAE frente a cero
              </option>
              <option value="spearman_era_v1">
                Práctica sintética · Spearman por era
              </option>
            </select>
          </label>
          <p className="ml-muted">
            Los dos protocolos utilizan escalas distintas. El entrenamiento se
            realiza en tu notebook; el envío oficial sigue siendo el CSV
            validado en Torneos.
          </p>
          <Feedback error={error} />
          <button className="ml-primary" disabled={busy}>
            {busy ? "Creando…" : "Crear proyecto"}
          </button>
        </form>
      </Workspace>
    </AuthGuard>
  );
}
