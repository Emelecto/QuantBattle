"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/lib/AuthGuard";
import {
  downloadNotebook,
  forkNotebook,
  getNotebook,
  myNotebooks,
  notebookList,
  protocolLabel,
  reviewNotebook,
  reviewQueue,
  withdrawNotebook,
  type MLPublication,
} from "@/lib/ml-learning";
import { Workspace, Feedback, messageOf } from "./Workspace";

export function NotebookLibrary({
  mine = false,
  review = false,
}: {
  mine?: boolean;
  review?: boolean;
}) {
  const [entries, setEntries] = useState<MLPublication[]>([]),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false);
  const [query, setQuery] = useState(""),
    [protocol, setProtocol] = useState("all"),
    [license, setLicense] = useState("all"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = review
        ? await reviewQueue()
        : mine
          ? await myNotebooks()
          : await notebookList(offset);
      setEntries(result.entries);
      setMore("has_more" in result && Boolean(result.has_more));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }, [mine, review, offset]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);
  const visible = entries.filter(
    (p) =>
      (protocol === "all" || p.protocol === protocol) &&
      (license === "all" || p.license === license) &&
      `${p.title} ${p.description} ${p.snapshot.model_name} ${p.snapshot.dependencies}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const content = (
    <Workspace
      title={
        review
          ? "Revisión de notebooks"
          : mine
            ? "Mis publicaciones ML"
            : "Biblioteca de métodos ML"
      }
      intro="Notebooks y metodologías para torneos. Consulta su protocolo, licencia y límites antes de crear tu propia versión."
    >
      <div className="ml-toolbar">
        <Link href="/app/strategies/new">Crear un proyecto para compartir</Link>
        <Link href="/app/marketplace/mine">Mis publicaciones</Link>
        <Link href="/app/marketplace/trading">
          Catálogo histórico de trading
        </Link>
      </div>
      {!mine && !review && (
        <section className="ml-section">
          <h2>Plantillas de QuantLab</h2>
          <p>
            Para empezar sin esperar publicaciones de la comunidad. Son ejemplos
            del proyecto, no contribuciones de usuarios externos.
          </p>
          <div className="ml-toolbar">
            <a href="/ml/ejemplo_retornos_diarios.ipynb" download>
              Notebook de retornos · MAE
            </a>
            <a href="/ml/ejemplo_quantlab.ipynb" download>
              Notebook de práctica · Spearman
            </a>
          </div>
        </section>
      )}
      <div className="ml-toolbar">
        <input
          aria-label="Buscar notebooks en esta página"
          type="search"
          placeholder="Modelo, método o dependencia…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Filtrar por protocolo"
          value={protocol}
          onChange={(e) => setProtocol(e.target.value)}
        >
          <option value="all">Ambos protocolos</option>
          <option value="daily_return_mae_v1">Retornos · MAE</option>
          <option value="spearman_era_v1">Práctica · Spearman</option>
        </select>
        <select
          aria-label="Filtrar por licencia"
          value={license}
          onChange={(e) => setLicense(e.target.value)}
        >
          <option value="all">Todas las licencias</option>
          {["MIT", "BSD-3-Clause", "Apache-2.0", "CC0-1.0"].map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </div>
      <Feedback error={error} />
      {error && <button onClick={() => void load()}>Reintentar</button>}
      {loading ? (
        <p role="status">Cargando publicaciones…</p>
      ) : !error && visible.length === 0 ? (
        <p className="ml-notice">
          {entries.length
            ? "No hay coincidencias en esta página."
            : "Todavía no hay publicaciones en esta lista."}
        </p>
      ) : (
        visible.map((p) => (
          <article className="ml-record" key={p.id}>
            <div>
              <h2>
                <Link href={`/app/marketplace/notebooks/${p.id}`}>
                  {p.title}
                </Link>
              </h2>
              <p>{p.description}</p>
              {p.author_name && <p className="ml-muted">Por {p.author_name}</p>}
              <p className="ml-muted">
                {protocolLabel(p.protocol)} · {p.snapshot.model_name} ·{" "}
                {p.license}
              </p>
              <p className="ml-muted">
                {p.status === "published"
                  ? "Contenido revisado · ejecución no verificada"
                  : p.status === "pending_review"
                    ? "Pendiente de revisión"
                    : p.status === "rejected"
                      ? "Requiere cambios"
                      : "Retirada"}
              </p>
            </div>
            <Link href={`/app/marketplace/notebooks/${p.id}`}>
              Consultar notebook
            </Link>
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
      <p className="ml-muted">
        La revisión comprueba formato, contexto y divulgación. No certifica
        entrenamiento, rentabilidad o superioridad del modelo. Los notebooks se
        descargan para inspeccionarlos y ejecutarlos en tu propio entorno.
      </p>
    </Workspace>
  );
  return mine || review ? <AuthGuard>{content}</AuthGuard> : content;
}
export function NotebookDetail({ id }: { id: string }) {
  const router = useRouter();
  const [pub, setPub] = useState<MLPublication | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState("");
  const load = useCallback(async () => setPub(await getNotebook(id)), [id]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void load().catch((e) => setError(messageOf(e)));
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);
  async function action(task: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await task();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Workspace
      title={pub?.title || "Notebook de la comunidad"}
      intro="Consulta el método y sus límites. Al crear una copia se conserva el enlace a la publicación de origen y su licencia."
    >
      <Feedback error={error} />
      {!pub ? (
        <p>
          {error ? "La publicación no está disponible." : "Cargando notebook…"}
        </p>
      ) : (
        <>
          <p>{pub.description}</p>
          {pub.author_name && <p className="ml-muted">Por {pub.author_name}</p>}
          {pub.checks && (
            <ul
              className="ml-checks"
              aria-label="Comprobaciones de reproducibilidad"
            >
              <li>Formato Jupyter validado</li>
              {pub.checks.environment_declared && (
                <li>Entorno declarado por el autor</li>
              )}
              {pub.checks.content_reviewed && <li>Contenido revisado</li>}
              <li>Ejecución no verificada</li>
            </ul>
          )}
          <p className="ml-notice">
            {protocolLabel(pub.protocol)} · Licencia {pub.license} ·{" "}
            {pub.status === "published"
              ? "Contenido revisado; ejecución no verificada"
              : `Estado: ${pub.status}`}
          </p>
          <h2>Hipótesis compartida</h2>
          <p>{pub.snapshot.hypothesis || "No registrada."}</p>
          <h2>Modelo y dependencias declaradas</h2>
          <pre>{JSON.stringify(pub.snapshot, null, 2)}</pre>
          <h2>Limitaciones</h2>
          <p>{pub.limitations}</p>
          <p className="ml-muted ml-hash">
            SHA-256 del notebook sin salidas: {pub.notebook_sha256}
          </p>
          {pub.review_note && (
            <p className="ml-notice">Nota de revisión: {pub.review_note}</p>
          )}
          <div className="ml-toolbar">
            <button
              disabled={busy}
              onClick={() =>
                void action(() =>
                  downloadNotebook(`/ml/notebooks/${id}/download`),
                )
              }
            >
              Descargar notebook
            </button>
            {pub.status === "published" && (
              <button
                className="ml-primary"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const project = await forkNotebook(id);
                    router.push(`/app/strategies/${project.id}`);
                  })
                }
              >
                Crear copia en mis proyectos
              </button>
            )}
          </div>
          {pub.can_withdraw && pub.status !== "withdrawn" && (
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await withdrawNotebook(id);
                  await load();
                })
              }
            >
              Retirar mi publicación del catálogo
            </button>
          )}
          {pub.can_review && (
            <details>
              <summary>Revisar publicación</summary>
              <p>
                Revisar: código y texto sin secretos, datos compartibles,
                licencia autorizada, dependencias, hipótesis y límites. La
                aprobación no acredita una ejecución reproducida.
              </p>
              <label>
                Observaciones de revisión
                <textarea
                  minLength={20}
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <div className="ml-toolbar">
                {[
                  ["published", "Aprobar contenido"],
                  ["rejected", "Solicitar cambios"],
                  ["withdrawn", "Retirar publicación"],
                ].map(([status, label]) => (
                  <button
                    key={status}
                    disabled={busy || note.trim().length < 20}
                    onClick={() =>
                      void action(async () => {
                        await reviewNotebook(id, status, note);
                        await load();
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </Workspace>
  );
}
