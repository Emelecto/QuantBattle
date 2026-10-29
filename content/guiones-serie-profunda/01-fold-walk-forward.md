GUION 1 — Anatomía de un fold walk-forward

HOOK 0-3s:
El 68% de las estrategias que brillan en backtest mueren en real. No es el mercado, es tu validación.

PRUEBA 3-40s:
Cada fold tiene tres bloques que no se tocan: entrenas de enero a junio, validas julio y testeas agosto sin mirar adelante. Luego ruedas la ventana un mes y repites. En QuantBattle exigimos cinco folds. Si tu Sharpe pasa de 2,1 en muestra a 0,4 fuera de muestra en tres folds, no hay edge, hay sobreajuste. La regla de oro: congelas parámetros antes del tramo OOS y no los retocas jamás.

TAKEAWAY:
Un backtest es una anécdota. Cinco folds OOS son evidencia.

CTA:
Comenta FOLD y te paso la plantilla de 5 folds con QP virtuales para romper tu estrategia antes de que lo haga el mercado.

DIRECCIÓN GRÁFICA:
0-3s: texto "68% muere en real" sobre curva que sube y se desploma, flash rojo.
3-12s: timeline Train/Valid/Test en 3 colores, flecha rodando un mes.
12-28s: tabla 5 folds Sharpe IS vs OOS, resaltar caída 2,1→0,4 en rojo.
28-40s: candado sobre parámetros + etiqueta "congelado antes de OOS".
40-45s: logo QuantBattle + "Comenta FOLD".
