GUION 4 — Cómo se pondera el ensemble (softmax + Spearman)

HOOK 0-3s:
Cinco modelos buenos hacen un ensemble mediocre si los promedias mal. Usamos Spearman más softmax.

PRUEBA 3-40s:
Cada semana los modelos envían su ranking de activos, no su predicción exacta. Medimos la correlación de Spearman contra el retorno real: importa si ordenaron bien, aunque fallen en magnitud. Un modelo con 0,09 sostenido aporta más que uno con 0,15 un mes y negativo al siguiente. Luego softmax convierte el Spearman medio recortado en pesos que suman cien por cien, premiando al consistente sin coronar a nadie. Si uno colapsa dos rondas, su peso cae solo.

TAKEAWAY:
No ponderes al que gritó más fuerte una vez. Pondera al que ordena mejor siempre.

CTA:
Comenta ENSEMBLE y te muestro el tablero de pesos con QP virtuales estilo Numerai en español.

DIRECCIÓN GRÁFICA:
0-3s: 5 curvas fundiéndose en una gruesa, etiqueta "softmax + Spearman".
3-15s: tabla rankings vs retornos reales, fórmula Spearman resaltada.
15-28s: barras Spearman 12 semanas, consistente 0,09 vs volátil marcado.
28-40s: softmax normalizando a 100%, peso del colapsado encogiéndose.
40-45s: CTA + logo QuantBattle.
