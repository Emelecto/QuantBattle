"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthGuard } from "@/lib/AuthGuard";
import { experimentHistory } from "@/lib/mlTournaments";
import { getReturnHistory } from "@/lib/returnTournaments";
import {
  addVersion,
  downloadJSON,
  downloadNotebook,
  getProject,
  linkSubmission,
  publishProject,
  protocolLabel,
  updateProject,
  type ProjectDetail as Detail,
} from "@/lib/ml-learning";
import { Workspace, Feedback, messageOf } from "./Workspace";

export function ProjectDetail({ id }: { id: string }) {
  const [data, setData] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [model, setModel] = useState(""),
    [parameters, setParameters] = useState("{}"),
    [seed, setSeed] = useState(""),
    [note, setNote] = useState(""),
    [dataset, setDataset] = useState(""),
    [mae, setMae] = useState(""),
    [spearman, setSpearman] = useState(""),
    [dependencies, setDependencies] = useState(""),
    [notebook, setNotebook] = useState<File | null>(null);
  const [versionId, setVersionId] = useState(""),
    [submissionId, setSubmissionId] = useState(""),
    [receipts, setReceipts] = useState<{ id: string; label: string }[]>([]);
  const [description, setDescription] = useState(""),
    [limitations, setLimitations] = useState(""),
    [license, setLicense] = useState("MIT");
  const [title, setTitle] = useState(""),
    [hypothesis, setHypothesis] = useState("");
  const load = useCallback(async () => {
    const value = await getProject(id);
    setData(value);
    setTitle(value.project.title);
    setHypothesis(value.project.hypothesis);
    setVersionId((current) => current || value.versions[0]?.id || "");
  }, [id]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void load().catch((e) => setError(messageOf(e)));
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);
  async function act(task: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
      await load();
      setMessage(success);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveVersion(e: FormEvent) {
    e.preventDefault();
    await act(async () => {
      const parsed: unknown = JSON.parse(parameters);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Los parámetros deben ser un objeto JSON.");
      if (notebook && notebook.size > 2_000_000)
        throw new Error("El notebook debe pesar como máximo 2 MB.");
      const version = await addVersion(id, {
        model_name: model,
        parameters: parsed,
        seed: seed === "" ? null : Number(seed),
        note,
        dataset_version: dataset,
        validation_mae: mae === "" ? null : Number(mae),
        validation_spearman: spearman === "" ? null : Number(spearman),
        dependencies,
        notebook: notebook ? JSON.parse(await notebook.text()) : null,
      });
      setVersionId(version.id);
    }, "Versión guardada. Puedes vincular un comprobante o preparar su publicación.");
  }
  async function loadReceipts() {
    setError("");
    try {
      if (data?.project.protocol === "daily_return_mae_v1") {
        const result = await getReturnHistory();
        setReceipts(
          result.entries.map((r) => ({
            id: r.id,
            label: `${r.week_name} · ronda ${r.ordinal} · ${r.dataset_version}`,
          })),
        );
      } else {
        const result = await experimentHistory();
        setReceipts(
          result.entries.map((r) => ({
            id: r.id,
            label: `${r.round.name} · ${r.dataset_version}`,
          })),
        );
      }
    } catch (e) {
      setError(messageOf(e));
    }
  }
  return (
    <AuthGuard>
      <Workspace
        title={data?.project.title || "Proyecto ML"}
        intro="Una hipótesis, sus versiones y los comprobantes de participación. Las fichas describen tu trabajo; el CSV oficial se registra en Torneos."
      >
        <Feedback error={error} message={message} />
        {!data ? (
          <>
            <p role="status">
              {error ? "No se pudo abrir el proyecto." : "Cargando proyecto…"}
            </p>
            {error && (
              <button
                onClick={() => void load().catch((e) => setError(messageOf(e)))}
              >
                Reintentar
              </button>
            )}
          </>
        ) : (
          <>
            <p className="ml-muted">
              {protocolLabel(data.project.protocol)}
              {data.project.parent_publication_id && (
                <>
                  {" "}
                  ·{" "}
                  <Link
                    href={`/app/marketplace/notebooks/${data.project.parent_publication_id}`}
                  >
                    Ver publicación de origen y licencia
                  </Link>
                </>
              )}
            </p>
            <details>
              <summary>Editar nombre e hipótesis</summary>
              <form
                className="ml-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(
                    () =>
                      updateProject(id, {
                        title,
                        hypothesis,
                        protocol: data.project.protocol,
                      }),
                    "Proyecto actualizado. Las versiones anteriores conservan su hipótesis.",
                  );
                }}
              >
                <label>
                  Nombre
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
                  />
                </label>
                <button disabled={busy}>Guardar cambios</button>
              </form>
            </details>
            <section className="ml-section">
              <h2>Registrar una versión</h2>
              <p>
                Entrena en tu entorno y anota la configuración elegida con
                validation. Cada versión conserva una ficha inmutable.
              </p>
              <form className="ml-form" onSubmit={saveVersion}>
                <div className="ml-fields">
                  <label>
                    Modelo
                    <input
                      required
                      maxLength={100}
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="HistGradientBoostingRegressor"
                    />
                  </label>
                  <label>
                    Semilla opcional
                    <input
                      type="number"
                      min={0}
                      max={4294967295}
                      step={1}
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Parámetros JSON
                  <textarea
                    required
                    value={parameters}
                    onChange={(e) => setParameters(e.target.value)}
                    spellCheck={false}
                  />
                </label>
                <label>
                  Versión del dataset
                  <input
                    maxLength={160}
                    value={dataset}
                    onChange={(e) => setDataset(e.target.value)}
                    placeholder="Copia la versión que aparece en tu ronda"
                  />
                </label>
                {data.project.protocol === "daily_return_mae_v1" && (
                  <label>
                    MAE de validation declarado (retorno decimal)
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={mae}
                      onChange={(e) => setMae(e.target.value)}
                    />
                  </label>
                )}
                {data.project.protocol === "spearman_era_v1" && (
                  <label>
                    Spearman medio de validation declarado
                    <input
                      type="number"
                      min={-1}
                      max={1}
                      step="any"
                      value={spearman}
                      onChange={(e) => setSpearman(e.target.value)}
                    />
                  </label>
                )}
                <label>
                  Dependencias y versiones
                  <textarea
                    maxLength={5000}
                    value={dependencies}
                    onChange={(e) => setDependencies(e.target.value)}
                    placeholder="Python, pandas, scikit-learn…"
                  />
                </label>
                <label>
                  Nota privada
                  <textarea
                    maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <label>
                  Notebook opcional (.ipynb, hasta 2 MB)
                  <input
                    type="file"
                    accept=".ipynb,application/json"
                    onChange={(e) => setNotebook(e.target.files?.[0] || null)}
                  />
                </label>
                <p className="ml-muted">
                  Se eliminan salidas y metadatos de ejecución. Revisa el código
                  y el texto antes de compartirlos: pueden contener información
                  privada. El notebook no se ejecuta en QuantBattle.
                </p>
                <button className="ml-primary" disabled={busy}>
                  {busy ? "Guardando…" : "Guardar versión"}
                </button>
              </form>
            </section>
            <section className="ml-section">
              <h2>Comparar versiones</h2>
              {!data.versions.length ? (
                <p>Aún no hay versiones guardadas.</p>
              ) : (
                <>
                  <div className="ml-table-wrap">
                    <table>
                      <caption>
                        Configuraciones declaradas · no son resultados oficiales
                      </caption>
                      <thead>
                        <tr>
                          <th>Versión</th>
                          <th>Modelo</th>
                          <th>Semilla</th>
                          <th>Dataset</th>
                          <th>Validation</th>
                          <th>Notebook</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.versions.map((v, i) => (
                          <tr key={v.id}>
                            <td>
                              {data.versions.length - i}
                              <details>
                                <summary>Ficha</summary>
                                <pre>{JSON.stringify(v.snapshot, null, 2)}</pre>
                              </details>
                            </td>
                            <td>{v.snapshot.model_name}</td>
                            <td>{v.snapshot.seed ?? "Sin semilla"}</td>
                            <td>
                              {v.snapshot.dataset_version || "Sin registrar"}
                            </td>
                            <td>
                              {v.snapshot.validation_mae != null
                                ? `MAE ${(v.snapshot.validation_mae * 100).toFixed(3)} pp`
                                : v.snapshot.validation_spearman != null
                                  ? `Spearman ${v.snapshot.validation_spearman.toFixed(4)}`
                                  : "Sin métrica"}
                            </td>
                            <td>
                              {v.notebook_sha256 ? (
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void act(
                                      () =>
                                        downloadNotebook(
                                          `/ml/projects/${id}/versions/${v.id}/notebook`,
                                        ),
                                      "Notebook descargado.",
                                    )
                                  }
                                >
                                  Descargar
                                </button>
                              ) : (
                                "No adjunto"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    onClick={() => downloadJSON(data, "quantbattle-proyecto.json")}
                  >
                    Exportar fichas del proyecto
                  </button>
                </>
              )}
            </section>
            {!!data.versions.length && (
              <section className="ml-section">
                <h2>Vincular un comprobante propio</h2>
                <p>
                  El vínculo registra qué versión declaras haber usado. No
                  modifica el envío seleccionado ni su puntuación.
                </p>
                <form
                  className="ml-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(
                      () => linkSubmission(id, versionId, submissionId),
                      "Comprobante vinculado.",
                    );
                  }}
                >
                  <label>
                    Versión del proyecto
                    <select
                      value={versionId}
                      onChange={(e) => setVersionId(e.target.value)}
                    >
                      {data.versions.map((v, i) => (
                        <option key={v.id} value={v.id}>
                          {data.versions.length - i} · {v.snapshot.model_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={() => void loadReceipts()}>
                    Consultar comprobantes recientes
                  </button>
                  <label>
                    ID de tu comprobante
                    <input
                      required
                      list="own-receipts"
                      value={submissionId}
                      onChange={(e) => setSubmissionId(e.target.value)}
                    />
                    <datalist id="own-receipts">
                      {receipts.map((r) => (
                        <option value={r.id} key={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </datalist>
                  </label>
                  <button disabled={busy}>Vincular comprobante</button>
                </form>
                {data.submissions.map((s) => (
                  <p className="ml-muted ml-hash" key={s.id}>
                    Comprobante {s.submission_id} · versión {s.version_id}
                  </p>
                ))}
                <Link href="/app/tournaments">
                  Ir a Torneos para enviar predicciones
                </Link>
              </section>
            )}
            {!!data.versions.length && (
              <section>
                <h2>Compartir en la Biblioteca ML</h2>
                <p>
                  Se publica una copia de la metodología y el notebook, tras
                  revisión manual. La nota privada y tus CSV no se incluyen. La
                  hipótesis, los parámetros, la semilla y las dependencias sí
                  serán públicos.
                </p>
                <form
                  className="ml-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(
                      () =>
                        publishProject(id, {
                          version_id: versionId,
                          description,
                          limitations,
                          license,
                        }),
                      "Propuesta enviada a revisión. Consulta su estado en Mis publicaciones.",
                    );
                  }}
                >
                  <label>
                    Versión a compartir
                    <select
                      value={versionId}
                      onChange={(e) => setVersionId(e.target.value)}
                    >
                      {data.versions.map((v, i) => (
                        <option
                          key={v.id}
                          value={v.id}
                          disabled={!v.notebook_sha256}
                        >
                          {data.versions.length - i} · {v.snapshot.model_name}
                          {!v.notebook_sha256 ? " · sin notebook" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Descripción del método
                    <textarea
                      required
                      minLength={30}
                      maxLength={4000}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                  <label>
                    Limitaciones
                    <textarea
                      required
                      minLength={20}
                      maxLength={2000}
                      value={limitations}
                      onChange={(e) => setLimitations(e.target.value)}
                    />
                  </label>
                  <label>
                    Licencia que autorizas para el material
                    <select
                      value={license}
                      onChange={(e) => setLicense(e.target.value)}
                    >
                      {["MIT", "BSD-3-Clause", "Apache-2.0", "CC0-1.0"].map(
                        (l) => (
                          <option key={l}>{l}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="ml-choice">
                    <input type="checkbox" required />
                    Confirmo que puedo compartir este material con esta licencia
                    y revisé que no incluya secretos ni información de otros
                    participantes.
                  </label>
                  <button
                    disabled={
                      busy ||
                      !data.versions.find((v) => v.id === versionId)
                        ?.notebook_sha256
                    }
                  >
                    Enviar a revisión
                  </button>
                  <Link href="/app/marketplace/mine">Mis publicaciones</Link>
                </form>
              </section>
            )}
          </>
        )}
      </Workspace>
    </AuthGuard>
  );
}
