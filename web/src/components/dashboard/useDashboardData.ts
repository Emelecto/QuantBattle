"use client";

import { useCallback, useEffect, useState } from "react";
import { getBalance } from "@/lib/tokens";
import {
  getMyCourseProgress,
  getMyMlTournamentSubmissions,
  getMyQpRanking,
  getMyTournamentSubmissions,
} from "@/lib/db";
import type {
  MlTournamentSubmissionLookup,
  MyCourseProgress,
  MyQpRanking,
  TournamentSubmissionSnapshot,
} from "@/lib/db";
import { projectList, type MLProject } from "@/lib/ml-learning";
import { listTournaments, isAuthError, isCorsLikeError } from "@/lib/tournaments";
import { listDatasets, type MlDataset } from "@/lib/mlTournaments";
import type { Tournament } from "@/lib/tournaments";

export type DashboardSourceState = "loading" | "ready" | "error";
export type SubmissionLoadState =
  | "loading"
  | "ready"
  | "unavailable"
  | "round-unavailable";

export type DashboardTournament = {
  datasetId: string;
  datasetVersion: string | null;
  id: string;
  name: string;
  type: "code" | "ml";
  asset_type: "crypto" | "stock" | "any" | "synthetic";
  symbol: string | null;
  qp_prize: number | null;
  deadline: string | null;
  participants: number | null;
  metric_label: string | null;
  submission: TournamentSubmissionSnapshot | null;
  submissionState: SubmissionLoadState;
};

export type DashboardData = {
  qp: number | null;
  course: MyCourseProgress | null;
  ranking: MyQpRanking | null;
  projects: MLProject[];
  tournaments: DashboardTournament[];
  loading: boolean;
  error: string | null;
  /** Detalle técnico del error real (para diagnóstico y consola). */
  errorDetail: string | null;
  /** True si alguna fuente falló con 401: la UI debe pedir login, no reintento de red. */
  authRequired: boolean;
  /** Reintenta la carga completa del dashboard. */
  retry: () => void;
  sources: {
    qp: DashboardSourceState;
    course: DashboardSourceState;
    ranking: DashboardSourceState;
    projects: DashboardSourceState;
    tournaments: DashboardSourceState;
    submissions: DashboardSourceState;
  };
};

const INITIAL_DATA: DashboardData = {
  qp: null,
  course: null,
  ranking: null,
  projects: [],
  tournaments: [],
  loading: true,
  error: null,
  errorDetail: null,
  authRequired: false,
  retry: () => {},
  sources: {
    qp: "loading",
    course: "loading",
    ranking: "loading",
    projects: "loading",
    tournaments: "loading",
    submissions: "loading",
  },
};

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function toAssetType(assetType: unknown): DashboardTournament["asset_type"] {
  const value = String(assetType ?? "").toLowerCase();
  if (value === "crypto") return "crypto";
  if (value === "stock" || value === "stocks" || value === "equities") return "stock";
  return "any";
}

function toDashboardTournament(tournament: Tournament, dataset: MlDataset): DashboardTournament {
  const symbols = Array.isArray(tournament.symbols)
    ? tournament.symbols.map(stringOrNull).filter((symbol): symbol is string => Boolean(symbol))
    : [];

  return {
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    id: tournament.id,
    name: stringOrNull(tournament.name) ?? "Nombre no disponible",
    type: tournament.type === "ml" ? "ml" : "code",
    asset_type: dataset.mode === "sintetico" ? "synthetic" : toAssetType(tournament.asset_type),
    symbol: symbols[0] ?? null,
    qp_prize: 0,
    deadline: dataset.closes_at,
    participants: numberOrNull(tournament.submission_count),
    metric_label: "Spearman medio por era",
    submission: null,
    submissionState: "loading",
  };
}

async function loadOpenMlRounds() {
  const [tournaments, datasets] = await Promise.all([listTournaments({ type: "ml" }), listDatasets()]);
  const latest = new Map<string, MlDataset>();
  for (const dataset of datasets) {
    if (dataset.kind !== "live" || dataset.score_version !== "spearman_era_v1") continue;
    const previous = latest.get(dataset.tournament_id);
    if (!previous || previous.round_number < dataset.round_number) latest.set(dataset.tournament_id, dataset);
  }
  return tournaments.flatMap((tournament) => {
    const dataset = latest.get(tournament.id);
    return dataset?.status === "ready" && dataset.closes_at && Date.parse(dataset.closes_at) > Date.now()
      ? [toDashboardTournament(tournament, dataset)] : [];
  }).sort((a, b) => Date.parse(a.deadline!) - Date.parse(b.deadline!));
}

function messageForFailedSources(labels: string[]): string | null {
  if (labels.length === 0) return null;
  return `No se pudo cargar ${labels.join(", ")}. Las demás secciones siguen disponibles.`;
}

function appendSubmissionError(existing: string | null): string {
  const detail = "No se pudo cargar el estado de algunos envíos.";
  return existing ? `${existing} ${detail}` : detail;
}

export function useDashboardData(): DashboardData {
  const [data, setData] = useState<DashboardData>(INITIAL_DATA);
  const [retryKey, setRetryKey] = useState(0);
  // Marcar carga y disparar recarga sin setState dentro del efecto
  // (evita el anti-patrón set-state-in-effect).
  const retry = useCallback(() => {
    setData((current) => ({ ...current, loading: true, error: null, errorDetail: null }));
    setRetryKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      const [balanceResult, projectsResult, tournamentsResult, courseResult, rankingResult] =
        await Promise.allSettled([
          getBalance(),
          projectList(0),
          loadOpenMlRounds(),
          getMyCourseProgress(),
          getMyQpRanking(),
        ]);

      if (!active) return;

      const qp =
        balanceResult.status === "fulfilled"
          ? numberOrNull(balanceResult.value.balance)
          : null;
      // Preservar y loguear el error real: antes se descartaba el motivo
      // del allSettled y la UI solo mostraba "No se pudo cargar los QP".
      const rejectedReasons: Record<string, unknown> = {};
      if (balanceResult.status === "rejected") rejectedReasons.qp = balanceResult.reason;
      if (projectsResult.status === "rejected") rejectedReasons.projects = projectsResult.reason;
      if (tournamentsResult.status === "rejected") rejectedReasons.tournaments = tournamentsResult.reason;
      if (courseResult.status === "rejected") rejectedReasons.course = courseResult.reason;
      if (rankingResult.status === "rejected") rejectedReasons.ranking = rankingResult.reason;
      if (Object.keys(rejectedReasons).length > 0) {
        console.error("[dashboard] error cargando fuentes:", rejectedReasons);
      }
      const errorDetail =
        Object.keys(rejectedReasons).length > 0
          ? Object.entries(rejectedReasons)
              .map(([source, reason]) => {
                const msg =
                  reason instanceof Error
                    ? reason.message
                    : typeof reason === "string"
                      ? reason
                      : JSON.stringify(reason);
                return `${source}: ${msg}`;
              })
              .join(" | ")
          : null;
      const projects =
        projectsResult.status === "fulfilled" && Array.isArray(projectsResult.value.entries)
          ? projectsResult.value.entries
          : [];
      const rawTournaments =
        tournamentsResult.status === "fulfilled" && Array.isArray(tournamentsResult.value)
          ? tournamentsResult.value
          : [];
      const tournaments = rawTournaments;
      const course = courseResult.status === "fulfilled" ? courseResult.value : null;
      const ranking = rankingResult.status === "fulfilled" ? rankingResult.value : null;

      const sourceStates: DashboardData["sources"] = {
        qp: qp != null ? "ready" : "error",
        course: courseResult.status === "fulfilled" ? "ready" : "error",
        ranking: rankingResult.status === "fulfilled" ? "ready" : "error",
        projects:
          projectsResult.status === "fulfilled" && Array.isArray(projectsResult.value.entries)
            ? "ready"
            : "error",
        tournaments:
          tournamentsResult.status === "fulfilled" && Array.isArray(tournamentsResult.value)
            ? "ready"
            : "error",
        submissions: tournaments.length ? "loading" : "ready",
      };
      // 401 (sin sesión) no es fallo de red: se informa como "inicia sesión"
      // en vez de mezclarlo con el error de conectividad. CORS/Failed to fetch
      // en torneos mantiene sus reintentos de red en call(), pero el mensaje
      // aclara que puede ser CORS o un bloqueador.
      const qpAuthFailed =
        balanceResult.status === "rejected" && isAuthError(balanceResult.reason);
      const tournamentsCorsFailed =
        tournamentsResult.status === "rejected" &&
        isCorsLikeError(tournamentsResult.reason);
      const failedSources = [
        !qpAuthFailed && sourceStates.qp === "error" ? "los QP" : null,
        sourceStates.course === "error" ? "el progreso del curso" : null,
        sourceStates.ranking === "error" ? "el ranking" : null,
        sourceStates.projects === "error" ? "tus proyectos ML" : null,
        sourceStates.tournaments === "error"
          ? tournamentsCorsFailed
            ? "los torneos (puede ser CORS o bloqueador del navegador)"
            : "los torneos"
          : null,
      ].filter((label): label is string => label !== null);
      const baseError = messageForFailedSources(failedSources);
      const error =
        qpAuthFailed && baseError
          ? `Para ver tus QP, inicia sesión e inténtalo de nuevo. ${baseError}`
          : qpAuthFailed
            ? "Para ver tus QP, inicia sesión e inténtalo de nuevo."
            : baseError;

      setData({
        qp,
        course,
        ranking,
        projects,
        tournaments,
        loading: false,
        error,
        errorDetail,
        authRequired: qpAuthFailed,
        retry,
        sources: sourceStates,
      });

      if (tournaments.length === 0) return;

      const codeTournamentIds = tournaments
        .filter((tournament) => tournament.type === "code")
        .map((tournament) => tournament.id);
      const mlTournamentIds = tournaments
        .filter((tournament) => tournament.type === "ml")
        .map((tournament) => tournament.id);
      const [codeSubmissionsResult, mlSubmissionsResult] = await Promise.allSettled([
        codeTournamentIds.length
          ? getMyTournamentSubmissions(codeTournamentIds)
          : Promise.resolve<TournamentSubmissionSnapshot[]>([]),
        mlTournamentIds.length
          ? getMyMlTournamentSubmissions(mlTournamentIds)
          : Promise.resolve<MlTournamentSubmissionLookup[]>([]),
      ]);

      if (!active) return;

      const codeSubmissions =
        codeSubmissionsResult.status === "fulfilled"
          ? new Map(
              codeSubmissionsResult.value.map((submission) => [
                submission.tournament_id,
                submission,
              ]),
            )
          : new Map<string, TournamentSubmissionSnapshot>();
      const mlSubmissions =
        mlSubmissionsResult.status === "fulfilled"
          ? new Map(
              mlSubmissionsResult.value.map((lookup) => [lookup.tournament_id, lookup]),
            )
          : new Map<string, MlTournamentSubmissionLookup>();
      const submissionLoadFailed =
        codeSubmissionsResult.status === "rejected" ||
        mlSubmissionsResult.status === "rejected";
      if (submissionLoadFailed) {
        console.error("[dashboard] error cargando envíos:", {
          code: codeSubmissionsResult.status === "rejected" ? codeSubmissionsResult.reason : null,
          ml: mlSubmissionsResult.status === "rejected" ? mlSubmissionsResult.reason : null,
        });
      }

      setData((current) => ({
        ...current,
        tournaments: current.tournaments.map((tournament) => {
          if (tournament.type === "ml") {
            const lookup = mlSubmissions.get(tournament.id);
            if (!lookup) {
              return {
                ...tournament,
                submissionState: "unavailable",
              };
            }
            return {
              ...tournament,
              submission: lookup.submission,
              submissionState: lookup.has_ready_round ? "ready" : "round-unavailable",
            };
          }

          return {
            ...tournament,
            submission: codeSubmissions.get(tournament.id) ?? null,
            submissionState:
              codeSubmissionsResult.status === "fulfilled" ? "ready" : "unavailable",
          };
        }),
        error: submissionLoadFailed
          ? appendSubmissionError(current.error)
          : current.error,
        sources: {
          ...current.sources,
          submissions: submissionLoadFailed ? "error" : "ready",
        },
      }));
    }

    void load().catch((err: unknown) => {
      if (!active) return;
      console.error("[dashboard] error fatal cargando dashboard:", err);
      setData({
        ...INITIAL_DATA,
        loading: false,
        error: "No se pudo cargar el dashboard. Intenta recargar.",
        errorDetail: err instanceof Error ? err.message : String(err),
        retry,
        sources: {
          qp: "error",
          course: "error",
          ranking: "error",
          projects: "error",
          tournaments: "error",
          submissions: "error",
        },
      });
    });

    return () => {
      active = false;
    };
  }, [retryKey, retry]);

  return { ...data, retry };
}
