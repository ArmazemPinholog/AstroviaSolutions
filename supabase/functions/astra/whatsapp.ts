// WhatsApp Cloud API: enviar, mostrar "digitando...", baixar áudio e validar assinatura da Meta.
import { LIMITES } from "./seguranca.ts";

const V = "v21.0";
const TOKEN = () => Deno.env.get("WA_TOKEN") ?? "";

export async function enviar(phoneId: string, para: string, texto: string) {
  if (!TOKEN() || !phoneId) return;
  const r = await fetch(`https://graph.facebook.com/${V}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { body: texto } }),
  });
  // o motivo da Meta ajuda na configuração (ex.: número fora da lista de teste, janela de 24h fechada, token vencido)
  if (!r.ok) console.error("wa enviar", r.status, (await r.text().catch(() => "")).slice(0, 300));
}

/** marca como lida e mostra "digitando..." ao cliente */
export async function digitando(phoneId: string, mensagemId: string) {
  if (!TOKEN() || !phoneId) return;
  await fetch(`https://graph.facebook.com/${V}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: mensagemId, typing_indicator: { type: "text" } }),
  }).catch(() => {});
}

export async function baixarMidia(mediaId: string) {
  const meta = await fetch(`https://graph.facebook.com/${V}/${mediaId}`, { headers: { Authorization: `Bearer ${TOKEN()}` } });
  if (!meta.ok) return null;
  const { url, mime_type, file_size } = await meta.json();
  if (!url || (file_size && file_size > LIMITES.audioMaxBytes)) return null;
  // a URL de mídia da Meta só é baixada do domínio dela
  if (!/^https:\/\/([a-z0-9-]+\.)*(fbsbx|facebook|whatsapp)\.(com|net)\//i.test(url)) return null;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN()}` } });
  if (!r.ok) return null;
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > LIMITES.audioMaxBytes) return null;
  return { bytes, mime: String(mime_type ?? "audio/ogg") };
}

export async function assinaturaValida(cabecalho: string, corpo: string) {
  const segredo = Deno.env.get("WA_APP_SECRET");
  if (!segredo || !cabecalho.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(corpo)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  const esperado = cabecalho.slice(7);
  let diff = hex.length ^ esperado.length;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ (esperado.charCodeAt(i) || 0);
  return diff === 0;
}

/** divide a resposta em até 2 mensagens, como uma pessoa faria */
export function dividir(texto: string): string[] {
  const blocos = texto.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (blocos.length >= 2) return [blocos[0], blocos.slice(1).join("\n\n")];
  if (texto.length < 320) return [texto];
  const frases = texto.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [texto];
  if (frases.length < 2) return [texto];
  const meio = Math.ceil(frases.length / 2);
  return [frases.slice(0, meio).join("").trim(), frases.slice(meio).join("").trim()];
}

/** pausa proporcional ao tamanho, para soar natural (máx. 4s) */
export const pausa = (texto: string) => new Promise((r) => setTimeout(r, Math.min(900 + texto.length * 22, 4000)));
