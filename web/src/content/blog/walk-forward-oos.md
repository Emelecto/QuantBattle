---
title: "Cómo funciona el walk-forward OOS: la prueba de fuego de toda estrategia"
description: "El walk-forward out-of-sample es el método más honesto para validar una estrategia de trading. Aprende por qué el 90% de los backtests mienten y cómo evitar el overfitting."
slug: "walk-forward-oos"
date: "2026-08-28"
readTime: "8 min"
---

# Cómo funciona el walk-forward OOS

Si alguna vez viste un backtest con una curva de equity perfecta que sube sin parar, desconfía. El 90% de los backtests están sobreajustados (overfitted) al pasado. El walk-forward out-of-sample (OOS) es la prueba de fuego que separa las estrategias con edge real de las que solo funcionan en el historial.

## ¿Qué es el overfitting?

El overfitting es aprender de memoria el pasado. Imagina que creas una estrategia que compra cuando el precio sube 3 días seguidos y vende cuando baja 2. En el histórico puede verse genial, pero en la vida real falla porque el mercado no se repite.

**El problema:** cuando calibras una estrategia usando TODOS los datos históricos, estás optimizando para un pasado que no se va a repetir exactamente.

## ¿Cómo funciona el walk-forward?

El walk-forward divide los datos en múltiples "pliegues" (folds). En cada pliegue:

1. **Entrenas** en un período de tiempo (ej: 70% inicial)
2. **Pruebas** en el período siguiente (ej: 30% restante)
3. Aventanas la ventana y repites

```
Fold 1: [====TRAIN====][==TEST==]
Fold 2: [======TRAIN======][==TEST==]
Fold 3: [========TRAIN========][==TEST==]
```

La clave: el **test siempre ocurre después del train**. Nunca usas datos del futuro para entrenar. Esto simula lo que pasa en la vida real: tomas decisiones con información disponible en ese momento.

## Métricas que importan

| Métrica | Qué mide |
|---------|----------|
| **Sharpe OOS** | Retorno ajustado por riesgo en datos nunca vistos |
| **Deflated Sharpe** | Sharpe ajustado por el número de intentos (evita el data snooping) |
| **Max Drawdown** | Peor caída desde un máximo |
| **Integridad** | Ratio entre Sharpe in-sample y OOS (si es bajo, hay overfitting) |

## La regla de oro

Si tu estrategia tiene un Sharpe in-sample de 2.5 pero un Sharpe OOS de 0.3, **no sirve**. La integridad es baja. Una estrategia con integridad "Alta" mantiene al menos el 70% de su rendimiento cuando enfrenta datos nuevos.

## En QuantBattle

Cada backtest en QuantBattle usa walk-forward con 5 folds por defecto. Puedes ajustar los parámetros (número de folds, porcentaje de split) y ver cómo cambia la curva de equity out-of-sample. Si sobrevive al OOS, tu estrategia tiene edge real.

**Recuerda:** el pasado no garantiza el futuro. Pero un buen walk-forward es la mejor herramienta que tenemos para no mentirnos a nosotros mismos.
