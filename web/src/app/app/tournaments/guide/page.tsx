"use client";

import Link from "next/link";

export default function TournamentsGuidePage() {
  return (
    <main className="flex min-h-screen flex-col">
      <section className="border-b border-line">
        <div className="qb-page">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            Guía de Torneos
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">
            Cómo funcionan los torneos de predicción ML de QuantBattle: datasets,
            envío de predicciones, evaluación y condiciones de uso de los datos.
          </p>
        </div>
      </section>

      <section className="qb-page flex-1">
        <div className="prose prose-invert max-w-none">
          <section id="retornos-diarios" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-ink mb-4">Torneo semanal de retornos reales</h2>
            <p className="text-base leading-relaxed text-muted">Esta modalidad usa criptoactivos reales de Binance Vision. Tiene cuatro rondas, de lunes a jueves. Cada día se publica a partir de las 00:30, hora de Colombia, la información completa del día anterior. Recibes train y validation con retornos históricos y live sin respuesta futura.</p>
            <ol className="mt-5 list-decimal pl-6 space-y-3 text-sm text-muted">
              <li>El lunes envías una predicción para el retorno del martes; el martes para el miércoles; el miércoles para el jueves y el jueves para el viernes.</li>
              <li>El plazo de envío termina a las 23:59 de cada día de apertura. El retorno empieza a observarse a las 00:00 del día siguiente y termina 24 horas después.</li>
              <li>El CSV usa exactamente <code>id,prediction</code> y todos los IDs del live. Los valores son retornos decimales: 0.025 = +2,5 %, −0.02 = −2 %; cero es válido. Se aceptan valores finitos entre −1 y 10.</li>
              <li>El servidor registra huella, versión y ficha privada del modelo. Solo el último CSV válido antes del cierre compite; un intento inválido no lo reemplaza.</li>
              <li>El ranking general exige los cuatro envíos. Se promedian cuatro scores de mejora del error absoluto frente a predecir 0 %; un valor positivo mejora esa referencia. No es rentabilidad.</li>
              <li>Desde el sábado a las 00:30, tras verificar toda la semana, se publican juntos scores, símbolos, precios y evidencia de reproducción. Los resultados no se publican al terminar cada ronda.</li>
            </ol>
            <p className="mt-5 text-sm text-muted">Durante el torneo no se publican precios ni símbolos originales. Las variables se mezclan y discretizan, y las etiquetas históricas se redondean a pasos de 0,5 puntos porcentuales. Los originales permanecen cifrados y privados. Esto dificulta búsquedas por precio, pero no garantiza anonimato ni demuestra el uso de ML solo con un CSV. Se permite información pública anterior al cierre.</p>
            <p className="mt-4 text-sm text-muted">La apertura puede retrasarse si la fuente no está completa; el plazo de cierre no se desplaza. No se inventan precios ni se eliminan activos del universo a mitad del torneo para completar un resultado.</p>
            <div className="mt-5 flex flex-wrap gap-5 text-sm"><Link href="/app/tournaments" className="text-accent underline">Ver torneos y horarios</Link><a href="/ml/ejemplo_retornos_diarios.ipynb" download className="text-accent underline">Notebook de retornos diarios</a></div>
          </section>
          <h2 className="text-2xl font-semibold text-ink mb-5">Práctica sintética y protocolo Spearman anterior</h2>
          <p className="mb-8 text-sm text-muted">Las reglas 0–1 y Spearman que siguen corresponden a la práctica y al protocolo anterior. No se aplican a los CSV de retornos diarios descritos arriba. Los modos reales antiguos a cinco días no se activan con el nuevo torneo semanal.</p>
          {/* ¿Qué son los torneos? */}
          <div className="mb-10">
            <h2 className="text-xl font-semibold text-ink mb-4">¿Qué son los torneos?</h2>
            <p className="text-base leading-relaxed text-muted mb-4">
              Los torneos son competiciones periódicas donde los participantes
              envían predicciones sobre el comportamiento de mercados financieros.
              En los torneos de predicción ML no se ejecuta dinero real: descargas
              datos, entrenas un modelo y envías predicciones para una evaluación
              fuera de muestra.
            </p>
            <p className="text-base leading-relaxed text-muted">
              Las rondas ML no tienen premios QP. Los puntos de QuantBattle se usan
              en otros flujos de la plataforma, pero no en estos torneos.
            </p>
          </div>

          {/* Tipos de torneos */}
          <div className="mb-10">
            <h2 className="text-xl font-semibold text-ink mb-4">Tipos de torneos</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-line/50 p-4">
                <h3 className="text-sm font-semibold text-accent mb-2">Predicciones ML</h3>
                <p className="text-sm text-muted leading-relaxed">
                  Recibes variables ofuscadas de múltiples activos y predices
                  el rango de sus retornos futuros. Envías un CSV con un ID y una
                  predicción por fila.
                </p>
              </div>
              <div className="rounded-lg border border-line/50 p-4">
                <h3 className="text-sm font-semibold text-accent mb-2">Estrategias</h3>
                <p className="text-sm text-muted leading-relaxed">
                  Torneos de trading algorítmico. Diseña una estrategia que genere
                  señales de compra/venta y envía los resultados de tu backtest. Se
                  evalúa el rendimiento fuera de muestra (OOS).
                </p>
              </div>
            </div>
          </div>

          {/* Los Datasets */}
          <div className="mb-10">
            <h2 className="text-xl font-semibold text-ink mb-4">Los Datasets</h2>
            
            <h3 className="text-sm font-semibold text-ink mb-2">¿De dónde vienen los datos?</h3>
            <p className="text-base leading-relaxed text-muted mb-4">
              Los datasets se generan automáticamente antes de cada ronda del torneo.
              Hay rondas de práctica sintéticas y rondas reales con datos de mercado:
            </p>
            <ul className="text-sm text-muted space-y-2 mb-4 list-disc pl-5">
              <li>
                <strong className="text-ink">Datos sintéticos:</strong> Mercados
                simulados con propiedades estadísticas realistas (correlaciones,
                distribuciones de retorno, volatilidad variable).
              </li>
              <li>
                <strong className="text-ink">Datos reales:</strong> Velas diarias
                spot de pares cripto/USDT descargadas de Binance Vision. Las velas
                abiertas se excluyen del dataset.
              </li>
            </ul>

            <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 mb-5">
              <h3 className="text-sm font-semibold text-ink mb-2">Atribución y licencia</h3>
              <p className="text-base leading-relaxed text-muted">
                Los datasets reales derivados se atribuyen a Binance Vision y se
                distribuyen bajo CC BY-NC-SA 4.0 para investigación y educación no
                comercial. Las redistribuciones deben conservar esa licencia.
                No se permiten usos comerciales, señales compensadas ni premios
                QP en estas rondas.
              </p>
              <p className="mt-2 text-xs text-muted">
                <a className="text-accent underline" href="https://data.binance.vision/" target="_blank" rel="noreferrer">
                  Binance Vision
                </a>{" · "}
                <a className="text-accent underline" href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">
                  CC BY-NC-SA 4.0
                </a>{" · "}
                <a className="text-accent underline" href="https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md" target="_blank" rel="noreferrer">
                  Términos de Binance Public Data
                </a>
              </p>
            </div>

            <h3 className="text-sm font-semibold text-ink mb-2">Estructura del dataset</h3>
            <p className="text-base leading-relaxed text-muted mb-4">
              En las rondas prospectivas, los envíos se reciben durante 24 horas.
              El precio base se fija en el primer cierre diario común posterior al
              plazo y la evaluación compara ese precio con los cinco cierres que le
              siguen. La etiqueta permanece privada hasta que se complete el horizonte.
            </p>
            <p className="text-base leading-relaxed text-muted mb-3">
              Cada dataset contiene tres particiones:
            </p>
            <div className="overflow-x-auto rounded-lg border border-line/50 mb-4">
              <table className="w-full text-sm">
                <thead className="bg-line/20">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-ink">Partición</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-ink">Uso</th>
                  </tr>
                </thead>
                <tbody className="text-muted">
                  <tr className="border-t border-line/30">
                    <td className="px-4 py-2 font-medium">Train</td>
                    <td className="px-4 py-2">Entrenar tu modelo</td>
                  </tr>
                  <tr className="border-t border-line/30">
                    <td className="px-4 py-2 font-medium">Validation</td>
                    <td className="px-4 py-2">Ajustar hiperparámetros y validar localmente</td>
                  </tr>
                  <tr className="border-t border-line/30">
                    <td className="px-4 py-2 font-medium">Live</td>
                    <td className="px-4 py-2">Generar predicciones para enviar</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-sm font-semibold text-ink mb-2">Obtención del dataset</h3>
            <p className="text-base leading-relaxed text-muted">
              Los datasets se descargan desde Supabase Storage (bucket
              <code className="font-mono text-accent text-xs">tournament-datasets</code>).
              El worker expone endpoints para listar y descargar las particiones
              disponibles de cada ronda activa.
            </p>
          </div>

          {/* Las Predicciones */}
          <div className="mb-10">
            <h2 className="text-xl font-semibold text-ink mb-4">Las Predicciones</h2>
            
            <h3 className="text-sm font-semibold text-ink mb-2">¿Cómo se hacen predicciones?</h3>
            <p className="text-base leading-relaxed text-muted mb-4">
              Una vez entrenado tu modelo con la partición de train y validado con
              validation, usas el modelo final para generar predicciones sobre la
              partición live. El proceso general es:
            </p>
            <ol className="text-sm text-muted space-y-2 mb-4 list-decimal pl-5">
              <li>Descarga el dataset del torneo (train + validation)</li>
              <li>Entrena tu modelo (XGBoost, LightGBM, redes neuronales, etc.)</li>
              <li>Valida localmente con la partición de validation</li>
              <li>Genera predicciones para la partición live</li>
              <li>Formatea las predicciones como un CSV con el formato requerido</li>
              <li>Envía tu submission antes del cierre del torneo</li>
            </ol>

            <h3 className="text-sm font-semibold text-ink mb-2">Formato del CSV de predicciones</h3>
            <p className="text-base leading-relaxed text-muted mb-3">
              Para torneos de predicciones ML, el CSV debe contener al menos:
            </p>
            <ul className="text-sm text-muted space-y-1 mb-4 list-disc pl-5">
              <li>Exactamente las columnas <code className="font-mono text-accent text-xs">id,prediction</code></li>
              <li>Un ID único por cada fila del archivo <code className="font-mono text-accent text-xs">live.parquet</code></li>
              <li>Una predicción finita entre 0 y 1 para cada ID</li>
            </ul>
            <p className="text-sm text-muted">
              Para torneos de estrategias, el CSV incluye las señales generadas
              por tu estrategia en el período de evaluación.
            </p>
          </div>

          {/* El Submit */}
          <div className="mb-10">
            <h2 className="text-xl font-semibold text-ink mb-4">El Submit (Envío)</h2>
            
            <h3 className="text-sm font-semibold text-ink mb-2">¿Cómo se envía una predicción?</h3>
            <p className="text-base leading-relaxed text-muted mb-4">
              El envío se hace a través del endpoint{" "}
              <code className="font-mono text-accent text-xs">POST /ml/datasets/{'{dataset_id}'}/predictions</code>{" "}
              del worker. Tienes dos opciones:
            </p>
            <div className="grid gap-4 md:grid-cols-2 mb-4">
              <div className="rounded-lg border border-line/50 p-4">
                <h4 className="text-sm font-semibold text-ink mb-2">1. Subir CSV</h4>
                <p className="text-xs text-muted leading-relaxed">
                  Adjunta un archivo CSV directamente en el request como{" "}
                  <code className="font-mono">multipart/form-data</code>.
                </p>
              </div>
              <div className="rounded-lg border border-line/50 p-4">
                <h4 className="text-sm font-semibold text-ink mb-2">2. JSON inline</h4>
                <p className="text-xs text-muted leading-relaxed">
                  Envía un body JSON con la clave{" "}
                  <code className="font-mono">rows</code> conteniendo un array de
                  predicciones.
                </p>
              </div>
            </div>

            <h3 className="text-sm font-semibold text-ink mb-2">Reemplazo de submissions</h3>
            <p className="text-base leading-relaxed text-muted mb-4">
              Si ya enviaste una submission previamente, el nuevo envío{" "}
              <strong className="text-ink">reemplaza</strong> al anterior. Solo se
              evalúa la última submission recibida antes del cierre.
            </p>

            <h3 className="text-sm font-semibold text-ink mb-2">Validación del CSV</h3>
            <p className="text-base leading-relaxed text-muted">
              El worker comprueba columnas, IDs, valores, versión del dataset y
              número de filas. Solo el último envío válido antes del cierre se
              incluye en el ranking. No se muestra score mientras la ronda está abierta.
            </p>
          </div>

          {/* Evaluación */}
          <div className="mb-10">
            <h2 className="text-xl font-semibold text-ink mb-4">Evaluación y Scoring</h2>
            
            <h3 className="text-sm font-semibold text-ink mb-2">¿Cómo se evalúan las submissions?</h3>
            <p className="text-base leading-relaxed text-muted mb-4">
              Una vez cerrado el torneo, el worker ejecuta el proceso de scoring
              automáticamente:
            </p>
            <ol className="text-sm text-muted space-y-2 mb-4 list-decimal pl-5">
              <li>Descarga todas las submissions válidas</li>
              <li>Compara cada predicción contra los valores reales (holdout)</li>
              <li>Calcula métricas de rendimiento por participante</li>
              <li>Genera el ranking final</li>
              <li>Publica el ranking después del cierre y de la maduración de etiquetas</li>
            </ol>

            <h3 className="text-sm font-semibold text-ink mb-2">Métricas de evaluación</h3>
            <p className="text-base leading-relaxed text-muted mb-3">
              Las métricas principales son:
            </p>
            <div className="overflow-x-auto rounded-lg border border-line/50 mb-4">
              <table className="w-full text-sm">
                <thead className="bg-line/20">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-ink">Métrica</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-ink">Descripción</th>
                  </tr>
                </thead>
                <tbody className="text-muted">
                  <tr className="border-t border-line/30">
                    <td className="px-4 py-2 font-medium">Spearman por era</td>
                    <td className="px-4 py-2">Correlación entre el orden de tus predicciones y el orden de los retornos observados en cada era</td>
                  </tr>
                  <tr className="border-t border-line/30">
                    <td className="px-4 py-2 font-medium">Score final</td>
                    <td className="px-4 py-2">Media aritmética de Spearman entre las eras evaluadas; no mide rentabilidad ni incluye costos</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-sm font-semibold text-ink mb-2">Anti-trampas</h3>
            <p className="text-base leading-relaxed text-muted">
              El holdout se mantiene privado y la puntuación se calcula en el
              servidor después del plazo. Las features están ofuscadas, pero no
              cifradas; como los datos de origen son públicos, pueden ser
              susceptibles a reconstrucción.
            </p>
          </div>

          {/* Reparto de QP */}
          <div className="mb-10">
            <h2 className="text-xl font-semibold text-ink mb-4">Reparto de QP</h2>
            <p className="text-base leading-relaxed text-muted mb-4">
              Los torneos de predicción ML no reparten QP ni recompensas. Esta
              condición permite usar los datos derivados de Binance Vision bajo
              los términos no comerciales aplicables.
            </p>
            <p className="text-base leading-relaxed text-muted">
              El ranking sirve para comparar submissions dentro de la ronda. Un
              resultado positivo no demuestra rentabilidad ni garantiza que el
              modelo funcione en otros períodos.
            </p>
          </div>

          {/* Uso del MCP */}
          <div className="mb-10">
            <h2 className="text-xl font-semibold text-ink mb-4">Uso del MCP (Model Context Protocol)</h2>
            
            <h3 className="text-sm font-semibold text-ink mb-2">¿Qué es el MCP?</h3>
            <p className="text-base leading-relaxed text-muted mb-4">
              El MCP permite que cualquier agente compatible con Model Context Protocol
              interactúe con QuantBattle usando lenguaje natural. El servidor ayuda a
              descubrir torneos ML, consultar datasets, validar predicciones y registrar
              envíos. Necesitas Python para ejecutarlo localmente y una clave API para
              consultar tus comprobantes o enviar predicciones.
            </p>

            <h3 className="text-sm font-semibold text-ink mb-2">Tools disponibles</h3>
            <div className="overflow-x-auto rounded-lg border border-line/50 mb-4">
              <table className="w-full text-sm">
                <thead className="bg-line/20">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-ink">Tool</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-ink">Auth</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-ink">Descripción</th>
                  </tr>
                </thead>
                <tbody className="text-muted">
                  <tr className="border-t border-line/30">
                    <td className="px-4 py-2 font-medium text-xs">list_ml_tournaments</td>
                    <td className="px-4 py-2">—</td>
                    <td className="px-4 py-2">Lista semanas de retornos y rondas de práctica ML</td>
                  </tr>
                  <tr className="border-t border-line/30">
                    <td className="px-4 py-2 font-medium text-xs">validate_prediction_csv</td>
                    <td className="px-4 py-2">—</td>
                    <td className="px-4 py-2">Comprueba formato, rango y cobertura de IDs antes del envío</td>
                  </tr>
                  <tr className="border-t border-line/30">
                    <td className="px-4 py-2 font-medium text-xs">get_weekly_dataset_download</td>
                    <td className="px-4 py-2">—</td>
                    <td className="px-4 py-2">Enlaces de train, validation y live</td>
                  </tr>
                  <tr className="border-t border-line/30">
                    <td className="px-4 py-2 font-medium text-xs">submit_weekly_predictions</td>
                    <td className="px-4 py-2">✅</td>
                    <td className="px-4 py-2">Envía predicciones con ficha del modelo</td>
                  </tr>
                  <tr className="border-t border-line/30">
                    <td className="px-4 py-2 font-medium text-xs">get_my_weekly_submissions</td>
                    <td className="px-4 py-2">✅</td>
                    <td className="px-4 py-2">Consulta tus comprobantes de envío</td>
                  </tr>
                  <tr className="border-t border-line/30">
                    <td className="px-4 py-2 font-medium text-xs">submit_practice_predictions</td>
                    <td className="px-4 py-2">✅</td>
                    <td className="px-4 py-2">Envía CSV de predicciones a práctica ML</td>
                  </tr>
                  <tr className="border-t border-line/30">
                    <td className="px-4 py-2 font-medium text-xs">quantbattle_status</td>
                    <td className="px-4 py-2">✅</td>
                    <td className="px-4 py-2">Comprueba la conexión y el estado de los torneos</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-sm font-semibold text-ink mb-2">Ejemplos de uso</h3>
            <pre className="rounded-md border border-line bg-surface-solid p-3 font-mono text-[12px] text-muted overflow-x-auto">
{`- "Comprueba la conexión y dime qué rondas ML están abiertas"
- "Dame los enlaces train, validation y live de la ronda semanal"
- "Valida este CSV contra los IDs live de la ronda"
- "Consulta mis comprobantes de esta ronda"`}
            </pre>
          </div>

          {/* Endpoints del Worker */}
          <div className="mb-10">
            <h2 className="text-xl font-semibold text-ink mb-4">Endpoints del Worker</h2>
            <p className="text-base leading-relaxed text-muted mb-4">
              El worker de QuantBattle expone los siguientes endpoints relevantes para
              torneos:
            </p>
            <div className="space-y-3">
              <div className="rounded-lg border border-line/50 p-3">
                <code className="text-xs font-mono text-accent">GET /tournament/list</code>
                <p className="text-xs text-muted mt-1">Lista torneos abiertos con filtros opcionales</p>
              </div>
              <div className="rounded-lg border border-line/50 p-3">
                <code className="text-xs font-mono text-accent">GET /tournament/{"{id}"}</code>
                <p className="text-xs text-muted mt-1">Detalle de un torneo específico</p>
              </div>
              <div className="rounded-lg border border-line/50 p-3">
                <code className="text-xs font-mono text-accent">GET /ml/datasets</code>
                <p className="text-xs text-muted mt-1">Lista datasets, metadatos y atribución de la fuente</p>
              </div>
              <div className="rounded-lg border border-line/50 p-3">
                <code className="text-xs font-mono text-accent">POST /ml/datasets/{"{dataset_id}"}/predictions</code>
                <p className="text-xs text-muted mt-1">Enviar predicciones (CSV o JSON)</p>
              </div>
              <div className="rounded-lg border border-line/50 p-3">
                <code className="text-xs font-mono text-accent">GET /ml/predictions/mine?dataset_id={"{id}"}</code>
                <p className="text-xs text-muted mt-1">Consultar tu submission actual</p>
              </div>
              <div className="rounded-lg border border-line/50 p-3">
                <code className="text-xs font-mono text-accent">GET /ml/leaderboard?dataset_id={"{id}"}</code>
                <p className="text-xs text-muted mt-1">Ranking de la ronda</p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="qb-glass qb-elev-1 rounded-xl p-6 text-center">
            <h3 className="text-lg font-semibold text-ink mb-2">¿Listo para competir?</h3>
            <p className="text-sm text-muted mb-4">
              Explora los torneos activos y envía tu primera predicción.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/app/tournaments"
                className="inline-flex items-center justify-center rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-accent/90"
              >
                Ver torneos activos
              </Link>
              <Link
                href="/app/api-keys"
                className="inline-flex items-center justify-center rounded-md border border-line px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-line/20"
              >
                Configurar MCP
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
