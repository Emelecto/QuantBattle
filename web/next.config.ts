import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La URL es pública. El preview y la entrega académica usan el worker
  // oficial si no existe un override en Vercel; nunca localhost en producción.
  env: {
    NEXT_PUBLIC_WORKER_URL: process.env.NEXT_PUBLIC_WORKER_URL ||
      (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "https://quantlab2.onrender.com"),
  },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
