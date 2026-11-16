import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ error: "Este catálogo fue retirado. Usa los datos históricos y las rondas diarias.", datasets_url: "/app/library" }, { status: 410 }); }
