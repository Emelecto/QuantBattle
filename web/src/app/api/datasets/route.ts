import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ error: "Este catálogo fue retirado. Usa el histórico y las rondas de acciones de Alpaca.", datasets_url: "/app/library" }, { status: 410 }); }
