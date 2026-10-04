import { sb } from "./supabase";

/* Chama a Edge Function do agente e devolve o JSON (ou lança o erro legível). */
export async function agente(acao, dados = {}) {
  const { data, error } = await sb.functions.invoke("gestao-agente", { body: { acao, ...dados } });
  if (error) {
    let msg = error.message;
    try {
      const j = await error.context?.json?.();
      if (j?.erro) msg = j.erro;
    } catch { /* resposta sem JSON */ }
    throw new Error(msg);
  }
  return data;
}

export const STATUS_LEAD = [
  { id: "novo", label: "Novo", color: "#8a8f98" },
  { id: "abordado", label: "Abordado", color: "#60a5fa" },
  { id: "respondeu", label: "Respondeu", color: "#fbbf24" },
  { id: "no_funil", label: "No funil", color: "#34d399" },
  { id: "descartado", label: "Descartado", color: "#ff2fd0" },
];

export const FONTES = { google: "Google Maps", instagram: "Instagram", manual: "Manual", receita: "CNPJ novo (Receita)" };

export const corScore = (s) => (s >= 70 ? "#34d399" : s >= 45 ? "#22d3ee" : s >= 25 ? "#fbbf24" : "#8a8f98");

export const igLink = (u) => (u ? `https://instagram.com/${String(u).replace(/^@/, "")}` : null);
export const igDm = (u) => (u ? `https://ig.me/m/${String(u).replace(/^@/, "")}` : null);

/* follow-up vencido: abordado há X dias e ainda sem resposta */
export const followupVencido = (p, dias = 3) =>
  p.status === "abordado" && p.abordado_em && Date.now() - new Date(p.abordado_em).getTime() >= dias * 864e5;
