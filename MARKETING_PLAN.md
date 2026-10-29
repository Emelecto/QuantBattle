# Plan de Marketing y Creación de Contenido — QuantBattle

> **Versión:** 1.0 · **Fecha:** 2026-09 · **Dueño:** Emilio (EIA)
> **Audiencia:** (1) quants/ML que construyen, (2) retail curioso que copia en paper, (3) inversores/jurados EIA y sponsors de torneos.
> **Restricción:** Presupuesto $0 (solo tiempo). Canales núcleo: TikTok + Instagram + YouTube Shorts, con LinkedIn/GitHub/foros como credibilidad.
> **Disclaimer obligatorio:** QuantBattle es educativo y experimental. QP son puntos virtuales, nunca dinero real. No es asesoría financiera.

---

## 0. Resumen ejecutivo + elevator pitch

**Resumen ejecutivo.** QuantBattle es una comunidad de trading cuantitativo en español donde cualquiera puede probar ideas de trading con backtest walk-forward out-of-sample honesto (datos reales de Binance, Bybit y Yahoo Finance), publicar estrategias en un marketplace de copy-trading en paper con QP virtuales, competir en torneos semanales y subir en un ranking global ordenado por Sharpe desinflado OOS. El wedge es claro: ser el «Numerai en español para LATAM» — técnico y honesto como QuantConnect/Numerai, pero accesible, en español y con onboarding de cero instalación (editor Monaco en la web, plantillas SMA/RSI, demo sin registro). El blog ya siembra autoridad con dos piezas reales: el explicador de walk-forward OOS y el backtest del ensemble comunitario BTC/USDT de agosto 2026. El plan a 30 días convierte esas piezas en 28 contenidos accionables (regla 5x: 1 grabación → 5 cortes) para llenar el funnel descubrimiento → landing/demo → registro → primera estrategia publicada → torneo.

**Elevator pitch (30 segundos).**
> «QuantBattle es la comunidad donde los quants de habla hispana demuestran quién tiene edge real. Subes tu estrategia desde el navegador, la validamos con walk-forward out-of-sample sobre datos reales, compites en torneos semanales por QP virtuales y tu reputación se mide con Sharpe desinflado, no con capturas de pantalla. Sin humo, sin dinero real, sin promesas de retornos: puro método. Es Numerai en español, construido en público desde la EIA.»

---

## 1. Posicionamiento y mensaje central

**Categoría:** comunidad + laboratorio de trading cuantitativo (no broker, no señales, no curso).
**Wedge:** «Numerai en español para LATAM».
**Diferenciadores verificados en el repo (no inventar más):**
1. Walk-forward OOS con 5 folds por defecto, split configurable, curva de equity y etiqueta de integridad (landing `web/src/app/page.tsx` + blog `walk-forward-oos.md`).
2. Datos reales multi-fuente con fuente visible: Binance + Bybit (crypto) y Yahoo Finance (acciones); worker FastAPI `worker/README.md` con endpoints `/health`, `/backtest`, `/backtest/validate`.
3. Marketplace de copy-trading en paper con pricing en QP/semana, suscripciones, comentarios y clonación.
4. Torneos semanales con rounds, deadline fijo, evaluación automática, premios en QP virtuales y leaderboard público.
5. Ranking global por Sharpe desinflado OOS (métrica anti-humo).
6. Ensemble comunitario tipo Numerai: predicciones ponderadas por score histórico, evaluación por correlación de Spearman (blog `prediccion-btc-agosto-2026.md`).
7. Cero instalación: editor Monaco en la web, plantillas SMA/RSI, ruta `/demo` sin registro, API con claves `qbt_` + server MCP para integrar LLMs.

**Competencia y cómo nos diferenciamos:**
| Competidor | Ellos | Nosotros |
|---|---|---|
| QuantConnect / Backtrader | potentes, en inglés, curva de aprendizaje alta | en español, demo sin registro, comunidad + torneos desde el día 1 |
| Numerai | ensemble + torneos, inglés, foco ML puro | mismo espíritu ensemble, pero estrategias de trading + copy paper + español LATAM |
| TradingView / grupos de señales | ideas sin validación, capturas, humo | toda estrategia pasa por OOS; el ranking castiga el overfitting |
| Cursos de trading | venden promesa de retornos | prohibido prometer retornos; mostramos drawdown e integridad |

### Taglines en A/B test (30 días)

| Variante | Texto | Dónde testear | Hipótesis |
|---|---|---|---|
| **A — Honestidad brutal** | «Tu backtest miente. Demuéstralo aquí.» | TikTok hook + hero secundario | El anti-humo retiene a quants escépticos; CTR alto en 3s. |
| **B — Comunidad** | «El Numerai en español: compite, copia en paper, aprende.» | Bio IG/TikTok + LinkedIn | Aclara categoría + wedge LATAM; convierte retail curioso. |
| **C — Método** | «Edge real o nada: walk-forward OOS con datos reales.» | YouTube Shorts + GitHub README | Atrae builders técnicos; mejor activación a `/demo`. |

**Regla de decisión:** gana el tagline con mejor combinación de retención 3s (video) + CTR a `/demo` en 30 días. No cambiar los tres a la vez; rotar hook manteniendo el resto del guion.

---

## 2. Pilares de mensaje (sin inventar métricas)

> Regla dura: solo afirmar lo que el repo demuestra. Nada de «miles de usuarios», «rentabilidad garantizada» o « Sharpe X». Los QP siempre se rotulan como **virtuales**.

1. **Honestidad OOS (anti-overfitting).** El 90% de los backtests sobreajustan; el walk-forward con folds y métricas deflatidas es la prueba de fuego. Fuente: blog walk-forward + landing («Si tu estrategia sobrevive al out-of-sample, tiene edge real»).
2. **Datos reales, fuente visible.** Binance/Bybit para crypto, Yahoo Finance para acciones. El worker falla explícitamente si no hay red en vez de inventar datos (`worker/README.md`). Mensaje: «si no hay datos, decimos que no hay datos».
3. **Comunidad que compite y copia en paper.** Marketplace (publicar, suscribirse, comentar, clonar) + torneos semanales con QP virtuales + ranking por Sharpe desinflado. Nunca dinero real.
4. **Ensemble comunitario.** La combinación ponderada de predicciones diversas supera en consistencia a la mayoría de individuos (blog agosto 2026: metodología Spearman, ponderación softmax, limitaciones declaradas). Mensaje: «la diversidad cancela errores».
5. **Construir sin fricción.** Editor web Monaco, plantillas SMA/RSI, demo sin registro, API `qbt_` + MCP para LLMs. Mensaje: «de la idea al backtest en minutos, sin instalar nada».
6. **Building in public desde la EIA.** Estudiante construyendo en abierto, mostrando código, errores y decisiones. Sin hype vacío.

---

## 3. Estrategia de canales

| Canal | Rol en el funnel | Frecuencia | Formato estrella | CTA |
|---|---|---|---|---|
| **TikTok** | descubrimiento masivo | 5–7/sem | POV/building in public 15–30s, pantalla + cara | «Pruébalo sin registro — link en bio» |
| **Instagram** | nutrición + comunidad | 3–4/sem | carrusel técnico + Reel (recorte del TikTok) | «Guarda este carrusel + demo en bio» |
| **YouTube Shorts** | SEO/discovery evergreen | 2–3/sem | 60s explicando 1 concepto (OOS, Sharpe, drawdown) | link a blog + `/demo` |
| **LinkedIn** | inversores/jurados/red EIA | 2/sem | storytelling founder + lección técnica | «Busco beta testers y mentores» |
| **GitHub** | credibilidad builder | 1/sem | README vivo, releases, good first issues | estrella + contribuir |
| **Foros quant** (QuantConnect forum, Elite Trader, r/algotrading, r/quant) | tráfico técnico cualificado | 1–2/sem | post «cómo validamos OOS» con código + limitaciones | link al blog, no spam |
| **Discords/Telegram LATAM** (trading, Python, ML) | comunidad semilla | diario ligero (aportar, no spamear) | compartir torneo semanal + ayudar con código | invitación al torneo |
| **Hacker News** | pico de credibilidad | 1 Show HN cuando haya demo estable | «Show HN: backtest walk-forward OOS en español, QP virtuales» | feedback, no venta |
| **Product Hunt** | lanzamiento | 1 vez (semana 5+) | video 60s + tagline B | upvotes día 1 con red EIA |

**Regla 5x (presupuesto $0):** 1 grabación semanal → TikTok 15s + IG Reel + YouTube Short 60s + carrusel IG (frames) + clip LinkedIn con reflexión. Todo el contenido técnico largo vive en el blog (`web/src/content/blog/`); el video solo distribuye.

---

## 4. Calendario 30 días — accionable semana a semana

Convención: cada idea trae **hook real en español** + pilar + formato + CTA. Total: **28 ideas** (7 por semana). Las marcadas con `SEED` están listas para sembrarse como `SEED_IDEAS` en planners (TikTok/IG).

### Semana 1 — El problema (el backtest miente)

1. `SEED` «Tu backtest con 300% miente. Te muestro por qué en 20 segundos» — pilar honestidad — TikTok POV pantalla — CTA `/demo`.
2. `SEED` «Overfitting explicado con un ejemplo que duele: SMA mágica que solo funciona en 2021» — honestidad — Reel/tutorial — CTA blog walk-forward.
3. `SEED` «Carrusel: 5 señales de que tu estrategia está sobreajustada» — honestidad — carrusel IG — CTA guardar.
4. `SEED` «In-sample vs out-of-sample: la única gráfica que importa» — honestidad — Short 60s — CTA blog.
5. «POV: calibras con todos los datos y celebras antes del OOS» — honestidad — TikTok story — CTA «no seas ese quant».
6. «Qué es el Sharpe desinflado y por qué el Sharpe normal te engaña» — honestidad — carrusel IG — CTA `/demo`.
7. LinkedIn: «Por qué construí validación OOS antes que cualquier feature bonita» — building in public — texto + captura — CTA beta testers.

### Semana 2 — El producto (de la idea al backtest sin instalar nada)

8. `SEED` «De cero a tu primer backtest en 2 minutos (sin instalar nada)» — fricción cero — TikTok tutorial pantalla — CTA `/demo`.
9. `SEED` «Tour del editor Monaco: plantilla SMA/RSI y autocompletado» — fricción cero — Reel — CTA registro.
10. `SEED` «Datos reales o nada: Binance + Bybit + Yahoo, fuente visible» — datos reales — Short 60s — CTA blog.
11. `SEED` «Si se cae la red, el worker dice la verdad: sin datos no hay backtest» — datos reales — TikTok story — CTA GitHub/worker README.
12. «Carrusel: anatomía de un resultado (equity, drawdown, integridad)» — honestidad — carrusel IG — CTA guardar.
13. «API con claves `qbt_` + MCP: conecta tu LLM a tu investigación» — fricción cero/builders — Reel técnico — CTA docs.
14. LinkedIn: «Demo sin registro: la decisión que más activaciones nos dio» — producto — texto + métrica real de activación (solo si se mide) — CTA feedback.

### Semana 3 — Versus + ensemble (comunidad y método)

15. `SEED` «QuantBattle vs grupo de señales: aquí el ranking castiga el humo» — comunidad — TikTok comparativa — CTA torneo.
16. `SEED` «Numerai en español: así funciona nuestro ensemble comunitario» — ensemble — Short 60s — CTA blog agosto 2026.
17. `SEED` «El ensemble no siempre gana, pero casi siempre queda top 30%: por qué la diversidad cancela errores» — ensemble — carrusel IG — CTA blog (con limitaciones declaradas).
18. `SEED` «Marketplace en paper: publica, te copian con QP virtuales, recibes comentarios» — comunidad — Reel demo — CTA publicar estrategia.
19. «Cómo se pondera el ensemble: softmax de scores + Spearman (sin magia)» — ensemble — Short técnico — CTA torneo ML.
20. «Tabla honesta: QuantBattle vs QuantConnect vs TradingView vs curso de trading» — versus — carrusel IG — CTA guardar.
21. Foros quant + HN borrador: «Cómo validamos OOS con 5 folds (código, limitaciones y qué no prometemos)» — credibilidad — post largo — CTA blog + repo.

### Semana 4 — Torneos + sponsors + inversores (comunidad viva)

22. `SEED` «Así es un torneo semanal: deadline, evaluación automática y QP virtuales» — comunidad — TikTok day-in-life — CTA participar.
23. `SEED` «Ranking por Sharpe desinflado: aquí no gana quien más grita» — comunidad — Reel — CTA leaderboard.
24. `SEED` «Copy-trading en paper: sigue una estrategia sin arriesgar un peso» — comunidad — Short — CTA marketplace (aclarar: nunca dinero real).
25. `SEED` «Lo que aprendimos del ensemble BTC/USDT de agosto (con limitaciones)» — ensemble — carrusel IG — CTA blog.
26. «Encuesta: ¿qué torneo quieres la próxima semana? (BTC, ETH, acciones)» — comunidad — story IG/TikTok — CTA comentar.
27. LinkedIn/EIA: «Estudiante EIA construyendo el Numerai en español: busco mentores y jurados que me reten» — inversores — texto + demo — CTA mentoría.
28. Product Hunt/HN prep: «Show HN borrador + video 60s del torneo en vivo» — lanzamiento — post + video — CTA feedback (no venta).

### Bloques SEED_IDEAS listos para sembrar

```ts
// SEED_IDEAS_TIKTOK (12) — pilar/formato incluidos
export const SEED_IDEAS_TIKTOK = [
  { text: "Tu backtest con 300% miente. Te muestro por qué en 20 segundos", pilar: "honestidad", formato: "story" },
  { text: "Overfitting explicado con un ejemplo que duele: SMA mágica que solo funciona en 2021", pilar: "honestidad", formato: "reel" },
  { text: "De cero a tu primer backtest en 2 minutos (sin instalar nada)", pilar: "producto", formato: "tutorial" },
  { text: "Tour del editor Monaco: plantilla SMA/RSI y autocompletado", pilar: "producto", formato: "reel" },
  { text: "Datos reales o nada: Binance + Bybit + Yahoo, fuente visible", pilar: "datos", formato: "reel" },
  { text: "Si se cae la red, el worker dice la verdad: sin datos no hay backtest", pilar: "datos", formato: "story" },
  { text: "QuantBattle vs grupo de señales: aquí el ranking castiga el humo", pilar: "comunidad", formato: "comparativa" },
  { text: "Numerai en español: así funciona nuestro ensemble comunitario", pilar: "ensemble", formato: "tutorial" },
  { text: "Así es un torneo semanal: deadline, evaluación automática y QP virtuales", pilar: "comunidad", formato: "dayinlife" },
  { text: "Ranking por Sharpe desinflado: aquí no gana quien más grita", pilar: "comunidad", formato: "reel" },
  { text: "Copy-trading en paper: sigue una estrategia sin arriesgar un peso", pilar: "comunidad", formato: "reel" },
  { text: "API con claves qbt_ + MCP: conecta tu LLM a tu investigación", pilar: "producto", formato: "tutorial" },
];

// SEED_IDEAS_INSTAGRAM (12) — pilar incluido
export const SEED_IDEAS_INSTAGRAM = [
  { text: "Carrusel: 5 señales de que tu estrategia está sobreajustada", pilar: "honestidad" },
  { text: "In-sample vs out-of-sample: la única gráfica que importa", pilar: "honestidad" },
  { text: "Qué es el Sharpe desinflado y por qué el Sharpe normal te engaña", pilar: "honestidad" },
  { text: "Carrusel: anatomía de un resultado (equity, drawdown, integridad)", pilar: "honestidad" },
  { text: "El ensemble no siempre gana, pero casi siempre queda top 30%: por qué la diversidad cancela errores", pilar: "ensemble" },
  { text: "Cómo se pondera el ensemble: softmax de scores + Spearman (sin magia)", pilar: "ensemble" },
  { text: "Lo que aprendimos del ensemble BTC/USDT de agosto (con limitaciones)", pilar: "ensemble" },
  { text: "Marketplace en paper: publica, te copian con QP virtuales, recibes comentarios", pilar: "comunidad" },
  { text: "Tabla honesta: QuantBattle vs QuantConnect vs TradingView vs curso de trading", pilar: "versus" },
  { text: "Datos reales o nada: Binance + Bybit + Yahoo, fuente visible", pilar: "datos" },
  { text: "De la idea al backtest en minutos, sin instalar nada", pilar: "producto" },
  { text: "Encuesta: ¿qué torneo quieres la próxima semana? (BTC, ETH, acciones)", pilar: "comunidad" },
];
```

---

## 5. Funnel de crecimiento + KPIs medibles

**Funnel:** descubrimiento (video/foro) → landing o `/demo` → registro → primera estrategia con backtest válido → publicación en marketplace y/o envío a torneo → retención semanal (segundo torneo).

| Etapa | Métrica | Cómo medirla | Meta 30 días (realista, $0) |
|---|---|---|---|
| Descubrimiento | alcance + retención 3s por video | analytics TikTok/IG/Shorts | 8–12 videos con retención 3s ≥ 35% |
| Interés | CTR bio → `/demo` o blog | UTM `?utm_source=tiktok` + logs | CTR ≥ 1,5% en links |
| Activación | backtests válidos / visitas `/demo` | evento worker `/backtest` válido | ≥ 20% de visitantes corren 1 backtest |
| Conversión | registros / activados | auth + evento primer backtest | ≥ 30% de activados se registran |
| Contribución | estrategias publicadas + envíos a torneo | conteo marketplace/torneos | ≥ 10 estrategias y ≥ 15 envíos/semana 4 |
| Retención | % que repite torneo semana siguiente | envíos por usuario/semana | ≥ 25% repite |
| Referidos | invitaciones / menciones | código o UTM referral | ≥ 5 referidos orgánicos |

**CAC = $0.** Costo = horas founder. Tablero mínimo: hoja con fecha, pieza, canal, alcance, retención 3s, clics, backtests, registros, envíos. Revisión semanal de 30 min: matar el tagline/formato con peor CTR, doblar el mejor.

---

## 6. Ángulos para sponsors de torneos e inversores/jurados EIA

### Sponsors (exchanges crypto LATAM, proveedores de datos)
1. **Audiencia que sí opera datos:** quants y builders que consumen APIs reales; el sponsor pone premios (créditos API, fee discounts, merch) y recibe branding en torneo + post técnico. QP siguen siendo virtuales: el sponsor nunca financia trading real.
2. **Contenido co-brandeado honesto:** «Torneo BTC/USDT presentado por X — datos provistos por Y», con metodología pública y limitaciones. Nada de promesas de retornos.
3. **Pipeline de talento:** leaderboard por Sharpe desinflado = ranking de habilidad verificable; el sponsor accede a talento (con consentimiento) para hackatones o hiring.
4. **Costo cero, riesgo cero:** premios en especie o créditos, sin custodia de fondos, sin dinero real en la plataforma.

**Paquetes sugeridos:** Torneo nombrado (logo + post + Short) / Proveedor oficial de datos (fuente visible + docs) / Premio ensemble (premia diversidad, no solo al #1).

### Inversores / jurados EIA (emprendimiento + innovación)
1. **Moat comunitario + método:** el foso no es un modelo, es el loop torneos → ranking OOS → ensemble → retención. Cada envío mejora el ensemble y la reputación.
2. **Ciencia antes que humo:** métricas deflatidas, integridad in-sample/OOS y limitaciones declaradas en el blog. Moat de confianza en un mercado lleno de humo.
3. **Wedge LATAM en español:** Numerai/QuantConnect no hablan español ni hacen onboarding sin instalación; QuantBattle sí.
4. **Modelo freemium → B2B:** comunidad gratis; monetización futura en datos agregados anonimizados, hiring/torneos patrocinados y API/MCP pro — sin tocar dinero de usuarios.
5. **Historia founder relatable:** estudiante EIA construyendo en público, con demo funcional (landing + worker + blog + API/MCP), no slides.
6. **Foso de datos propio:** cada backtest y envío genera datos de comportamiento y scores que mejoran el ensemble y la detección de overfitting.

**Ask para EIA:** mentoría técnica (validación estadística), acceso a jurados/red y micro-grant para infra (worker + datos). Nunca prometer retornos.

---

## 7. Checklist de implementación

- [x] Landing con hero + features + CTA + nota «No es asesoría financiera» (`web/src/app/page.tsx`).
- [x] Blog con 2 piezas semilla: walk-forward OOS + ensemble BTC agosto 2026 (`web/src/content/blog/`).
- [x] Worker FastAPI con `/health`, `/backtest`, `/backtest/validate` y errores honestos (`worker/README.md`).
- [x] Editor Monaco + plantillas SMA/RSI + ruta `/demo` sin registro.
- [x] Marketplace paper con QP/semana + torneos semanales + ranking Sharpe desinflado + API `qbt_` + MCP.
- [ ] UTM en bio/links (`?utm_source=tiktok|instagram|youtube|linkedin`) y eventos: backtest válido, registro, publicación, envío a torneo.
- [ ] Cuentas TikTok/IG/YouTube con bio tagline B + link a `/demo`; LinkedIn founder con tagline C.
- [ ] Sembrar `SEED_IDEAS_TIKTOK` + `SEED_IDEAS_INSTAGRAM` en planners (cuando existan páginas `/tiktok`, `/instagram`).
- [ ] Grabar video madre semanal (regla 5x) y publicar según calendario §4.
- [ ] 1 post semanal en foro quant + aporte diario ligero en Discords LATAM (sin spam).
- [ ] Hoja de KPIs §5 + revisión semanal 30 min (matar/duplicar formatos).
- [ ] Kit sponsor 1-pager (torneo nombrado, datos oficiales, premio ensemble) + lista 10 prospects LATAM.
- [ ] Deck EIA 5 slides (problema, método, demo, comunidad, ask) con disclaimer QP virtuales.
- [ ] Preparar Show HN + Product Hunt para semana 5+ (solo con demo estable).

---

## 8. Voice & brand guidelines

- **Español siempre**, con ñ y tildes correctas: señal, validación, conexión, métrica, predicción. Nada de spanglish innecesario (edge, drawdown y Sharpe se permiten por ser términos técnicos).
- **Tono:** building in public, honesto, técnico-profesional. Cercano pero preciso. Mostrar el proceso (código, errores, decisiones) genera más confianza que el pulido corporativo.
- **Prohibido:** prometer dinero o retornos («gana X%», «señales seguras»); presentar QP como dinero real (siempre «QP virtuales»); hype vacío («revolucionario», «el mejor»); inventar métricas de usuarios, retornos o precisión.
- **Obligatorio:** disclaimer educativo/experimental + «No es asesoría financiera» en landing, videos y posts de torneos; declarar limitaciones (pasado ≠ futuro, correlaciones bajas son normales).
- **Visual:** sobrio quant (fondo oscuro, curvas de equity reales, tablas de métricas). Nada de lambos, billetes o capturas de PnL. Inspiración: Numerai + QuantConnect.
- **Estructura de guion (video 15–60s):** hook (0–3s, tagline A/B) → prueba en pantalla (demo/blog real) → 1 lección → CTA único a `/demo` o torneo.

---

*Documento vivo: actualizar tagline ganador, KPIs reales y kit sponsor tras cada revisión semanal. Sin push/commit — solo este archivo.*
