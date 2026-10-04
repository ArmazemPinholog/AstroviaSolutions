// Voz neural da Astra: Google Cloud Text-to-Speech (vozes Chirp 3 HD em português do Brasil).
// Secret: GOOGLE_TTS_KEY (chave do Google Cloud com a "Cloud Text-to-Speech API" ativada).
// Se faltar a chave ou a API falhar, o navegador usa a própria voz (nada quebra).

export const VOZES = [
  { id: "pt-BR-Chirp3-HD-Aoede", nome: "Aoede (feminina, natural)" },
  { id: "pt-BR-Chirp3-HD-Kore", nome: "Kore (feminina, firme)" },
  { id: "pt-BR-Chirp3-HD-Leda", nome: "Leda (feminina, jovem)" },
  { id: "pt-BR-Chirp3-HD-Charon", nome: "Charon (masculina, grave)" },
  { id: "pt-BR-Chirp3-HD-Puck", nome: "Puck (masculina, animada)" },
  { id: "pt-BR-Neural2-A", nome: "Neural2 A (feminina, clássica)" },
  { id: "pt-BR-Neural2-B", nome: "Neural2 B (masculina, clássica)" },
];
const PADRAO = "pt-BR-Chirp3-HD-Aoede";
const RESERVA = "pt-BR-Neural2-A";

/** tira o que não deve ser lido em voz alta (markdown, links, emojis) */
export function textoParaFala(t: string) {
  return String(t ?? "")
    .replace(/https?:\/\/\S+/g, "o link")
    .replace(/[*_#`>~|]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2400); // limite da API: 5000 bytes por pedido
}

async function sintetizar(texto: string, voz: string, velocidade: number) {
  const r = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": Deno.env.get("GOOGLE_TTS_KEY") ?? "" },
    body: JSON.stringify({
      input: { text: texto },
      voice: { languageCode: "pt-BR", name: voz },
      audioConfig: { audioEncoding: "MP3", speakingRate: velocidade },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.audioContent) throw new Error(`tts ${r.status}: ${String(d?.error?.message ?? "").slice(0, 200)}`);
  return d.audioContent as string; // MP3 em base64
}

/** devolve { audio (base64 mp3), voz } ou null (o navegador lê com a voz dele) */
export async function falar(texto: string, cfg: { voz?: string; velocidade?: number } = {}) {
  if (!Deno.env.get("GOOGLE_TTS_KEY")) return null;
  const t = textoParaFala(texto);
  if (!t) return null;
  const voz = VOZES.some((v) => v.id === cfg.voz) ? cfg.voz! : PADRAO;
  const vel = Math.min(1.4, Math.max(0.8, Number(cfg.velocidade) || 1.05));
  try {
    return { audio: await sintetizar(t, voz, vel), voz };
  } catch (e) {
    console.error("voz", String(e).slice(0, 200));
    if (voz === RESERVA) return null;
    try {
      return { audio: await sintetizar(t, RESERVA, vel), voz: RESERVA };
    } catch {
      return null;
    }
  }
}
