import { NextResponse } from "next/server";

/**
 * Asistente IA para crear estrategias. Recibe una idea en lenguaje natural y
 * devuelve código Python real + comisión/slippage + explicación.
 *
 * Usa GROQ_API_KEY desde el entorno del SERVIDOR (nunca expuesta al cliente).
 * Si no hay key configurada, responde 200 con un mensaje claro (no rompe).
 */
export async function POST(request: Request) {
  let body: { prompt?: string; asset_type?: string; symbol?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json(
      { error: "Describe tu idea de estrategia." },
      { status: 400 },
    );
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      code: "",
      explanation:
        "El asistente IA aún no está configurado. Añade GROQ_API_KEY en las variables de entorno del servidor para activarlo.",
    });
  }

  const system = [
    "Eres un asistente de QuantBattle que genera código Python real y funcional para estrategias de trading.",
    "El motor espera la PRIMERA línea con la directiva: fast=XX,slow=YY (XX<YY, enteros entre 2 y 400).",
    "Después de esa línea, escribe código Python limpio y comentado en español que implemente la lógica.",
    "Devuelve SIEMPRE un objeto JSON con estos campos:",
    "- code (string: PRIMERA línea = directiva fast=XX,slow=YY; líneas siguientes = código Python real con comentarios en español)",
    "- commission (número: comisión por operación en fracción. Usa 0.001 para cripto y 0.0005 para acciones)",
    "- slippage (número: slippage por lado en fracción. Usa 0.0005 para cripto y 0.0002 para acciones)",
    "- explanation (string en español, 1-2 frases explicando la lógica)",
    "Si la idea no es un cruce de medias, elige fast/slow razonables que la aproximen.",
    "No incluyas nada más que el JSON.",
  ].join(" ");

  const user = `Activo: ${body.asset_type ?? "crypto"} ${body.symbol ?? ""}. Idea: ${prompt}`;

  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return NextResponse.json(
        { error: `El modelo falló: ${resp.status}. ${txt.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: {
      code?: string;
      commission?: number;
      slippage?: number;
      explanation?: string;
    };
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { code: "", explanation: content };
    }

    return NextResponse.json({
      code: typeof parsed.code === "string" ? parsed.code : "",
      commission:
        typeof parsed.commission === "number" ? parsed.commission : undefined,
      slippage:
        typeof parsed.slippage === "number" ? parsed.slippage : undefined,
      explanation:
        typeof parsed.explanation === "string"
          ? parsed.explanation
          : "Estrategia generada.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { error: `No se pudo contactar al asistente IA: ${msg}` },
      { status: 502 },
    );
  }
}
