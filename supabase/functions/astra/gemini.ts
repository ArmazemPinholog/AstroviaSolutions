import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const KEY = () => Deno.env.get("GEMINI_API_KEY") ?? "";
const MODELO = () => Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

async function chamar(body: unknown) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO()}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY() },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const content = d.candidates?.[0]?.content;
  if (!content?.parts) throw new Error(`gemini sem resposta (${d.candidates?.[0]?.finishReason ?? d.promptFeedback?.blockReason ?? "?"})`);
  return content;
}

/** conversa com ferramentas; devolve o conteúdo do modelo como veio (preserva assinaturas de raciocínio) */
export function conversar(system: string, contents: unknown[], tools: unknown[], temperatura = 0.6) {
  return chamar({
    systemInstruction: { parts: [{ text: system }] },
    contents,
    tools,
    generationConfig: { temperature: temperatura, maxOutputTokens: 4096 },
  });
}

/** geração simples de texto (usada pelo simulador e por tarefas internas) */
export async function gerar(system: string, prompt: string, temperatura = 0.8) {
  const content = await chamar({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: temperatura, maxOutputTokens: 4096 },
  });
  return content.parts.filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join("").trim();
}

/** transcreve um áudio do cliente (o Gemini entende áudio direto) */
export async function transcrever(bytes: Uint8Array, mime: string) {
  const content = await chamar({
    contents: [{
      role: "user",
      parts: [
        { inline_data: { mime_type: mime.split(";")[0], data: encodeBase64(bytes) } },
        {
          text:
            "Transcreva fielmente este áudio, no idioma falado. Responda só com a transcrição, sem comentários. Se não houver fala, responda exatamente: [sem fala]",
        },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 4096 },
  });
  return content.parts.filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join("").trim();
}
