# QuantLab · aplicación web

Interfaz de investigación de QuantLab para el semillero DeepFin de la Universidad EIA. La entrega evaluada se concentra en torneos de predicción ML con datos sintéticos: descarga de `train`, `validation` y `live`, envío de `id,prediction`, validación del CSV, comprobante y puntuación posterior al cierre.

- [Plataforma publicada](https://quant-lab-nine.vercel.app/)
- [Protocolo y evidencia del piloto](https://quant-lab-nine.vercel.app/docs#evaluacion)
- [Guía para evaluadores](../docs/evaluation-guide.md)
- [Protocolo técnico ML](../docs/ml-tournaments.md)

El piloto publicado usa una cuenta técnica y datos artificiales. Su puntuación Spearman mide orden relativo dentro de cada era; no mide rentabilidad ni demuestra adopción externa. El [nuevo torneo semanal de retornos reales](../docs/daily-return-tournaments.md) usa cuatro rondas y una puntuación de error distinta. Los pagos permanecen desactivados.

## Ejecutar localmente

Requiere Node.js 22 y el worker configurado según el [README principal](../README.md).

1. Copiar `.env.local.example` a `.env.local` y configurar la URL del worker y las variables públicas de Supabase.
2. Ejecutar `npm ci`.
3. Ejecutar `npm run dev` y abrir la dirección indicada por Next.js.

Las claves privadas de Supabase y del programador de rondas pertenecen al worker o a GitHub Actions; nunca a variables `NEXT_PUBLIC_*`.

## Verificación

```text
npx tsc --noEmit
npm run build
npm run test:e2e
npm run lint
```

La CI ejecuta comprobación de tipos, auditoría de dependencias de producción, compilación y pruebas de navegador. El lint completo se revisa por separado; los problemas heredados que no afecten el recorrido de torneos se registran antes de introducir cambios en esos módulos.

## Alcance

La portada incluye una vista interactiva **guiada** del piloto registrado. Sus controles muestran dataset, modelo, envío y resultado; no realizan un envío real. Para participar, entrar en **Torneos** y consultar la fecha de cierre que muestra la ronda vigente. La guía y el notebook público explican cómo formar el CSV.
