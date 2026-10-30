import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Imagen social de la identidad clara y del flujo de investigación ML.
 * Las páginas de blog generan la suya propia vía metadata dinámica.
 */
export default async function OgImage() {
  const logo = await readFile(join(process.cwd(), "public", "quantbattle-logo.jpg"));
  const logoSrc = `data:image/jpeg;base64,${logo.toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#f5f8fb",
          color: "#172840",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 28, color: "#245ce5", letterSpacing: 4 }}>
          <img src={logoSrc} alt="" width={64} height={64} style={{ objectFit: "cover" }} />
          QUANTBATTLE
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 64, fontWeight: 700, marginTop: 16, lineHeight: 1.1 }}>
          Del dataset a una
          <br />
          predicción verificable
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#52677d", marginTop: 24 }}>
          Torneos ML · Datos versionados · Evaluación documentada
        </div>
      </div>
    ),
    { ...size },
  );
}
