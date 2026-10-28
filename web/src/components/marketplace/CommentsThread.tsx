"use client";

import { useCallback, useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { useAuth } from "@/lib/useAuth";
import {
  createStrategyComment,
  deleteStrategyComment,
  listStrategyComments,
  reportContent,
  type StrategyComment,
} from "@/lib/comments";

const MAX_LEN = 2000;

/** Fecha relativa en español: «ahora», «hace 5 min», «hace 2h»… */
function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString("es-ES");
}

function CommentSkeleton() {
  return (
    <div className="ql-glass ql-elev-1 space-y-3 rounded-xl p-5">
      {[1, 2, 3].map((i) => (
        <div key={i} className="ql-skeleton-line h-10 w-full" />
      ))}
    </div>
  );
}

function CommentRow({
  comment,
  isOwn,
  deleting,
  onDelete,
  onReport,
}: {
  comment: StrategyComment;
  isOwn: boolean;
  deleting: boolean;
  onDelete: (id: string) => void;
  onReport: (id: string, reason: string) => Promise<void>;
}) {
  // Estado local del flujo de reporte de ESTE comentario.
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [reported, setReported] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  async function submitReport() {
    const r = reason.trim();
    if (!r || reporting || reported) return;
    setReporting(true);
    setReportError(null);
    try {
      await onReport(comment.id, r);
      setReported(true);
      setReason("");
    } catch (e) {
      setReportError(
        e instanceof Error ? e.message : "No se pudo enviar el reporte.",
      );
    } finally {
      setReporting(false);
    }
  }

  return (
    <li className="ql-row flex items-start gap-3 px-5 py-4">
      {/* Avatar con inicial */}
      <span
        aria-hidden="true"
        className="metric flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full border border-line bg-surface-solid text-[12px] font-semibold text-muted"
      >
        {(comment.username ?? "?").slice(0, 1).toUpperCase()}
      </span>

      <div className="min-w-0 flex-1">
        {/* Autor + fecha */}
        <div className="flex items-center gap-2">
          <span className="metric truncate text-[13px] font-medium text-ink">
            @{comment.username ?? "anónimo"}
          </span>
          <time
            dateTime={comment.created_at}
            className="metric shrink-0 text-[11px] text-muted"
          >
            {relativeDate(comment.created_at)}
          </time>
        </div>

        {/* Cuerpo como texto plano (React lo escapa; nunca innerHTML) */}
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
          {comment.body}
        </p>
      </div>

      {/* Borrar solo tus propios comentarios; reportar los ajenos */}
      {isOwn ? (
        <button
          type="button"
          onClick={() => onDelete(comment.id)}
          disabled={deleting}
          title={deleting ? "Eliminando…" : "Eliminar comentario"}
          aria-label="Eliminar comentario"
          className={`metric shrink-0 rounded-md px-1.5 py-1 text-[11px] transition-colors ${
            deleting
              ? "cursor-wait text-muted/50"
              : "text-muted hover:bg-surface hover:text-short"
          }`}
        >
          {deleting ? "…" : "✕"}
        </button>
      ) : reported ? (
        <span className="metric shrink-0 text-[11px] text-long">Reportado</span>
      ) : (
        <button
          type="button"
          onClick={() => setReporting((v) => !v)}
          title="Reportar comentario"
          aria-label="Reportar comentario"
          className={`metric shrink-0 rounded-md px-1.5 py-1 text-[11px] transition-colors ${
            reporting
              ? "bg-surface text-accent"
              : "text-muted hover:bg-surface hover:text-accent"
          }`}
        >
          ⚑
        </button>
      )}
      {reporting && !reported && (
        <div className="mt-2 w-full">
          <textarea
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="¿Por qué lo reportas? (máx. 500 caracteres)"
            className="ql-input w-full resize-y rounded-md px-3 py-2 text-[12px] text-ink"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void submitReport()}
              disabled={!reason.trim() || reporting}
              className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:border-accent/40 hover:text-ink disabled:opacity-50"
            >
              {reporting ? "Enviando…" : "Enviar reporte"}
            </button>
            <button
              type="button"
              onClick={() => setReporting(false)}
              className="text-[11px] text-muted transition-colors hover:text-ink"
            >
              Cancelar
            </button>
            {reportError && (
              <span className="text-[11px] text-short">{reportError}</span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export default function CommentsThread({ strategyId }: { strategyId: string }) {
  return <CommentsContent key={strategyId} strategyId={strategyId} />;
}

function CommentsContent({ strategyId }: { strategyId: string }) {
  const { user, loading: authLoading } = useAuth();

  // null = cargando la lista; [] = vacía (estado honesto)
  const [comments, setComments] = useState<StrategyComment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => listStrategyComments(strategyId)
    .then((list) => { setComments(list); setLoadError(null); })
    .catch((e: unknown) => { setComments([]); setLoadError(e instanceof Error ? e.message : "No se pudieron cargar los comentarios."); }), [strategyId]);

  useEffect(() => {
    load();
  }, [load]);

  const tooLong = draft.length > MAX_LEN;
  const canPublish = !authLoading && !!user && draft.trim().length > 0 && !tooLong && !posting;

  async function handlePublish() {
    const body = draft.trim();
    if (!body || tooLong || posting) return;
    setPosting(true);
    setActionError(null);
    try {
      await createStrategyComment(strategyId, body);
      setDraft("");
      await load(); // re-sincroniza con el servidor (orden ASC garantizado)
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "No se pudo publicar tu comentario.",
      );
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    setActionError(null);
    // Optimista: quitamos ya; si falla, devolvemos el comentario y avisamos.
    const snapshot = comments;
    setComments((prev) => prev?.filter((c) => c.id !== id) ?? prev);
    try {
      await deleteStrategyComment(id);
    } catch (e) {
      setComments(snapshot);
      setActionError(
        e instanceof Error ? e.message : "No se pudo eliminar el comentario.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  const viewerId = user?.id ?? null;

  return (
    <section aria-label="Comentarios" className="animate-fadeIn">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-ink">
          Comentarios
        </h2>
        {comments && comments.length > 0 && (
          <span className="metric text-[11px] text-muted">
            {comments.length} {comments.length === 1 ? "comentario" : "comentarios"}
          </span>
        )}
      </div>

      {/* Lista */}
      {comments === null ? (
        <CommentSkeleton />
      ) : comments.length === 0 ? (
        <div className="ql-glass ql-elev-1 rounded-xl px-6 py-8 text-center">
          {loadError ? (
            <>
              <p className="text-sm text-muted">{loadError}</p>
              <button
                type="button"
                onClick={load}
                className={`${buttonClasses("secondary", "sm")} mt-3`}
              >
                Reintentar
              </button>
            </>
          ) : (
            <p className="text-sm text-muted">Sé el primero en comentar.</p>
          )}
        </div>
      ) : (
        <div className="ql-glass ql-elev-1 overflow-hidden rounded-xl">
          <ul className="divide-y divide-line">
            {comments.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                isOwn={viewerId != null && c.author_id === viewerId}
                deleting={deletingId === c.id}
                onDelete={handleDelete}
                onReport={async (id, reason) => {
                  await reportContent("comment", id, reason);
                }}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Compositor */}
      <div className="ql-glass ql-elev-1 mt-4 rounded-xl p-4">
        {!authLoading && !user ? (
          <p className="metric text-xs text-muted">Inicia sesión para comentar.</p>
        ) : (
          <>
            <label htmlFor="comment-body" className="sr-only">
              Escribe un comentario
            </label>
            <textarea
              id="comment-body"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canPublish) {
                  handlePublish();
                }
              }}
              placeholder="Escribe un comentario…"
              rows={3}
              className="w-full resize-y rounded-lg border border-line bg-bg/60 px-3 py-2.5 text-sm leading-relaxed text-ink placeholder:text-muted/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span
                className={`metric text-[11px] ${tooLong ? "text-short" : "text-muted"}`}
                aria-live="polite"
              >
                {draft.length}/{MAX_LEN}
              </span>
              <button
                type="button"
                onClick={handlePublish}
                disabled={!canPublish}
                className={buttonClasses("primary", "sm")}
              >
                {posting ? "Publicando…" : "Publicar"}
              </button>
            </div>
          </>
        )}
        {actionError && (
          <p role="alert" className="metric mt-2 text-[11px] text-short">
            {actionError}
          </p>
        )}
      </div>
    </section>
  );
}
