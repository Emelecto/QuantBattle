# Pensum C5 ML para Mercados (gate 1200 QP) y C6 Torneos y Trading Real (gate 1800 QP)
# Formato fijo: video + texto + quiz + lab con demo Binance real. QP virtuales. Español con ñ/tildes.
## C5 — ML para Mercados
### 5.1 Features sin leakage
Obj: construir features temporales sin fuga de información.
Guion: qué es leakage; lags y ventanas; embargo/purgado; etiquetado; errores con BTC.
Lab: demo Binance BTC 1h → 5 lags + embargo 2 velas, baseline walk-forward 3 folds, Sharpe OOS.
Quiz: ¿usar high de la vela actual como feature? a) leakage b) válido / ¿para qué el embargo? a) evitar solape b) acelerar — XP100/QP150 · Skill: dataset con embargo auditable.
### 5.2 Walk-forward y overfitting
Obj: validar modelos con walk-forward honesto.
Guion: k-fold vs walk-forward; métricas OOS (Sharpe, drawdown); deflated Sharpe; selección honesta; caso sobreajuste.
Lab: compara split aleatorio vs walk-forward del mismo modelo, tabla Sharpe IS/OOS y veredicto.
Quiz: ¿por qué k-fold aleatorio engaña en series? / ¿qué indica Sharpe IS 3.0 y OOS 0.2? — XP120/QP150 · Skill: reporte IS/OOS reproducible.
### 5.3 Modelos: lineal → árboles → ensemble
Obj: entrenar y comparar 3 familias con mismo protocolo.
Guion: baseline logístico/ridge; random forest/XGBoost; ensemble y softmax; calibración; costos de turnover.
Lab: mismo dataset 5.1, entrena 3 modelos walk-forward, elige por Sharpe OOS neto de fee 0.05%.
Quiz: ¿cuándo un ensemble ayuda? / ¿qué hace softmax sobre scores? — XP150/QP200 · Skill: tabla comparativa con costos.
### 5.4 De señal ML a estrategia
Obj: convertir predicción en reglas operables con riesgo.
Guion: umbral de señal; sizing por Kelly fraccional; stop/límite diario; turnover; monitoreo de degradación.
Lab: estrategia long/short BTC con umbral 0.55 + sizing 0.5 Kelly en demo, bitácora 20 trades.
Quiz: ¿subir umbral reduce o aumenta trades? / Kelly completo vs fraccional en rachas — XP150/QP200 · Skill: estrategia con sizing y bitácora.
## C6 — Torneos y Trading Real
### 6.1 Torneos quant: reglas y métricas
Obj: entender formato torneo y cómo se puntúa.
Guion: envíos semanales; Spearman/TC; neutralización; staking; ejemplo Numerai-like.
Lab: genera 3 carteras demo, calcula Spearman vs retorno futuro y elige una con justificación.
Quiz: ¿qué mide Spearman en torneo? / ¿para qué neutralizar por sector? — XP100/QP150 · Skill: ranking Spearman reproducible.
### 6.2 Estrategia de torneo
Obj: diseñar entrada de torneo robusta y diversificada.
Guion: diversificar vs concentrar; control de turnover; réplicas con semillas; cuándo no enviar; gestión de stake.
Lab: ensemble de 2 modelos 5.3 con semillas distintas, backtest walk-forward + plan de stake ficticio.
Quiz: ¿por qué varias semillas? / ¿stake alto con Sharpe OOS bajo? — XP150/QP200 · Skill: submission con reporte de riesgo.
### 6.3 Trading real en demo Binance
Obj: operar 1 semana en demo con disciplina profesional.
Guion: conexión demo; checklist pre-trade; bitácora (entrada/salida/motivo/emoción); revisión diaria; corte por pérdida máxima.
Lab: bitácora 10 trades demo con captura de señal, PnL, drawdown y lección por trade.
Quiz: ¿qué hacer al tocar pérdida máxima diaria? / ¿qué campo de bitácora evita repetir errores? — XP150/QP200 · Skill: bitácora demo completa.
## Examen final y badge Quant Verificado
Examen (70% mínimo): 20 quiz mixto C5–C6 + entrega: modelo walk-forward OOS + estrategia torneo + bitácora demo 10 trades.
Badge Quant Verificado: examen ≥70%, Sharpe OOS reportado honesto (aunque sea ≤0 con análisis), bitácora completa, sin leakage detectado, quiz de ética/riesgo aprobado.
Recompensa: +500 XP / +300 QP, badge visible en vitrina, desbloquea pista torneos live.
