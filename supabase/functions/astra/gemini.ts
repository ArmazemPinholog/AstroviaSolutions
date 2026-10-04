// Motores de IA da Astra: Gemini (padrão, gratuito) e Claude (opcional, via API da Anthropic).
// As conversas circulam sempre no formato do Gemini ({ role: "user"|"model", parts }) e o
// adaptador converte para o Claude quando ele é o motor escolhido. Se o Claude falhar
// (sem chave, sem crédito, fora do ar), a Astra volta sozinha para o Gemini.
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const KEY = () => Deno.env.get("GEMINI_API_KEY") ?? "";
const MODELO = () => Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const CLAUDE_KEY = () => Deno.env.get("ANTHROPIC_API_KEY") ?? "";

export type Motor = { motor?: "gemini" | "claude"; modelo?: string; pensar?: "rapido" | "normal" };

/** o modelo do Gemini aceita orçamento de raciocínio? (família 2.5) */
const aceitaOrcamento = (m: string) => /2\.5/.test(m);

// Se a cota grátis de um modelo acabar (429) ou ele estiver fora do ar, tenta o próximo:
// cada modelo do Gemini tem a sua própria cota gratuita.
// os apelidos "-latest" sempre apontam para o modelo atual da família (os 2.5 saíram do ar para contas novas)
const RESERVAS = ["gemini-flash-lite-latest", "gemini-flash-latest"];
const cadeia = () => [...new Set([MODELO(), ...RESERVAS])];
const pular = (status: number) => status === 429 || status === 503 || status === 500 || status === 404;

async function chamarGemini(body: Record<string, unknown>, pensar: "rapido" | "normal" = "normal") {
  let ultimo = "";
  for (const modelo of cadeia()) {
    const gc = { ...((body.generationConfig ?? {}) as Record<string, unknown>) };
    // pensar menos = responder mais rápido; o atendimento ao cliente não precisa de raciocínio longo
    if (aceitaOrcamento(modelo)) gc.thinkingConfig = { thinkingBudget: pensar === "rapido" ? (/pro/.test(modelo) ? 128 : 0) : 1024 };
    else if (pensar === "rapido" && /gemini-3/.test(modelo)) gc.thinkingConfig = { thinkingLevel: "low" };
    else delete gc.thinkingConfig;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": KEY() },
      body: JSON.stringify({ ...body, generationConfig: gc }),
    });
    if (!r.ok) {
      ultimo = `gemini ${modelo} ${r.status}: ${(await r.text()).slice(0, 300)}`;
      if (r.status === 400 && gc.thinkingConfig) {
        // modelo não aceitou o ajuste de raciocínio: tenta de novo sem ele
        const r2 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": KEY() },
          body: JSON.stringify({ ...body, generationConfig: { ...gc, thinkingConfig: undefined } }),
        });
        if (r2.ok) {
          const c2 = (await r2.json()).candidates?.[0]?.content;
          if (c2?.parts) return c2;
        }
      }
      if (pular(r.status)) {
        console.error("modelo indisponível, tentando o próximo:", ultimo.slice(0, 120));
        continue;
      }
      throw new Error(ultimo);
    }
    const d = await r.json();
    const content = d.candidates?.[0]?.content;
    if (!content?.parts) throw new Error(`gemini sem resposta (${d.candidates?.[0]?.finishReason ?? d.promptFeedback?.blockReason ?? "?"})`);
    return content;
  }
  throw new Error(ultimo || "gemini indisponível");
}

// ---------- adaptador Claude ----------
function paraClaude(contents: any[]) {
  const msgs: { role: "user" | "assistant"; content: any[] }[] = [];
  let ids: string[] = [];
  contents.forEach((c, i) => {
    const role = c.role === "model" ? "assistant" : "user";
    const blocos: any[] = [];
    let j = 0;
    for (const p of c.parts ?? []) {
      if (p.thought) continue;
      // raciocínio do Claude volta intacto na mesma rodada de ferramentas (a API exige)
      if (p.claudeBloco) { if (role === "assistant") blocos.push(p.claudeBloco); continue; }
      if (p.text) blocos.push({ type: "text", text: p.text });
      else if (p.functionCall) {
        const id = p.functionCall.id ?? `t${i}_${j++}`;
        p.functionCall.id = id;
        blocos.push({ type: "tool_use", id, name: p.functionCall.name, input: p.functionCall.args ?? {} });
      } else if (p.functionResponse) {
        const id = ids.shift() ?? `t${i}_${j++}`;
        blocos.push({ type: "tool_result", tool_use_id: id, content: JSON.stringify(p.functionResponse.response ?? {}) });
      }
    }
    if (role === "assistant") ids = blocos.filter((b) => b.type === "tool_use").map((b) => b.id);
    if (!blocos.length) return;
    const ult = msgs.at(-1);
    if (ult && ult.role === role) ult.content.push(...blocos);
    else msgs.push({ role, content: blocos });
  });
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs;
}

async function chamarClaude(system: string, contents: any[], tools: any[], temperatura: number, modelo: string) {
  const declaracoes = (tools?.[0]?.functionDeclarations ?? []).map((f: any) => ({
    name: f.name,
    description: f.description,
    input_schema: f.parameters ?? { type: "object", properties: {} },
  }));
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": CLAUDE_KEY(), "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 4096,
      // Sonnet/Opus 5.x não aceitam temperature (a API devolve 400); Haiku 4.5 aceita
      ...(/claude-(sonnet|opus|fable)-5/.test(modelo) ? { output_config: { effort: "low" } } : { temperature: temperatura }),
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: paraClaude(contents),
      ...(declaracoes.length ? { tools: declaracoes } : {}),
    }),
  });
  if (!r.ok) throw new Error(`claude ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  if (d.stop_reason === "refusal") throw new Error("claude recusou");
  const parts = (d.content ?? []).map((b: any) =>
    b.type === "tool_use" ? { functionCall: { id: b.id, name: b.name, args: b.input ?? {} } }
    : b.type === "text" ? { text: b.text }
    : b.type === "thinking" || b.type === "redacted_thinking" ? { claudeBloco: b }
    : null
  ).filter(Boolean);
  if (!parts.some((p: any) => p.text || p.functionCall)) throw new Error("claude sem resposta");
  return { role: "model", parts };
}

/** o Gemini não entende os blocos de raciocínio do Claude */
const semBlocosClaude = (contents: any[]) =>
  contents.map((c) => ({ ...c, parts: (c.parts ?? []).filter((p: any) => !p.claudeBloco) })).filter((c) => c.parts.length);

/** conversa com ferramentas no motor escolhido; devolve sempre no formato do Gemini */
export async function conversar(system: string, contents: unknown[], tools: unknown[], temperatura = 0.6, m: Motor = {}) {
  if (m.motor === "claude" && CLAUDE_KEY()) {
    try {
      return await chamarClaude(system, contents as any[], tools as any[], temperatura, m.modelo || "claude-haiku-4-5-20251001");
    } catch (e) {
      console.error("claude falhou, usando gemini:", String(e).slice(0, 200));
    }
  }
  try {
    return await chamarGemini({
      systemInstruction: { parts: [{ text: system }] },
      contents: semBlocosClaude(contents as any[]),
      tools,
      generationConfig: { temperature: temperatura, maxOutputTokens: 4096 },
    }, m.pensar);
  } catch (e) {
    // todos os Gemini sem cota: se houver chave do Claude, ele cobre
    if (m.motor !== "claude" && CLAUDE_KEY()) {
      console.error("gemini esgotado, usando claude:", String(e).slice(0, 160));
      return await chamarClaude(system, contents as any[], tools as any[], temperatura, "claude-haiku-4-5-20251001");
    }
    throw e;
  }
}

/** geração simples de texto (usada pelo simulador e por tarefas internas) */
export async function gerar(system: string, prompt: string, temperatura = 0.8) {
  const content = await chamarGemini({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: temperatura, maxOutputTokens: 4096 },
  }, "rapido");
  return content.parts.filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join("").trim();
}

/** transcreve um áudio (o Gemini entende áudio direto) */
export async function transcrever(bytes: Uint8Array, mime: string) {
  const content = await chamarGemini({
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
    generationConfig: { temperature: 0, maxOutputTokens: 2048 },
  }, "rapido");
  return content.parts.filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join("").trim();
}
