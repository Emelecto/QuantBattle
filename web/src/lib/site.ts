// Los previews conservan la URL canónica de producción, no la URL temporal.
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) return `https://${productionHost}`;
  return process.env.NODE_ENV === "production"
    ? "https://quant-lab-nine.vercel.app"
    : "http://localhost:3000";
}

export const SITE_NAME = "QuantLab";
export const SITE_LOCALE = "es_ES";
