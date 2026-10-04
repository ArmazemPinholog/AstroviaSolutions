// Proteções do agente: comparação segura de chaves, limites de uso e validação do que a IA pede.

export const LIMITES = {
  tamanhoMensagem: 2000, // caracteres por mensagem do cliente
  msgsPorJanela: 12, // mensagens do mesmo contato...
  janelaMin: 5, // ...em 5 minutos
  respostasPorDiaPadrao: 800, // teto diário de respostas por cliente da Astrovia (protege cota e custo)
  audioMaxBytes: 8 * 1024 * 1024,
};

/** compara dois textos sem vazar o tamanho do acerto pelo tempo de resposta */
export function iguais(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** remove caracteres de controle e limita o tamanho */
export function limpar(texto: unknown, max = LIMITES.tamanhoMensagem) {
  return String(texto ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

const ENUMS: Record<string, string[]> = {
  segmento: ["clinica", "residencial", "comercial", "produto", "mentoria", "evento", "consultoria", "obra", "outro"],
  status: ["em_conversa", "qualificado", "reuniao", "perdido"],
  prioridade: ["alta", "media", "baixa"],
  idioma: ["pt", "en", "es"],
};

/** só deixa passar campos conhecidos, com valores válidos — a IA nunca escreve fora disso */
export function validarLead(args: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of ["nome", "interesse", "resumo", "pais", "escopo"]) {
    if (args[k] != null && String(args[k]).trim()) out[k] = limpar(args[k], k === "resumo" ? 1200 : 300);
  }
  for (const [k, ok] of Object.entries(ENUMS)) {
    const v = String(args[k] ?? "");
    if (ok.includes(v)) out[k] = v;
  }
  const p = Number(args.pontuacao);
  if (Number.isFinite(p)) out.pontuacao = Math.max(0, Math.min(100, Math.round(p)));
  return out;
}

export function emailValido(e: unknown) {
  const s = String(e ?? "").trim();
  return /^[^\s@<>()]{1,64}@[^\s@<>()]{1,190}\.[a-z]{2,}$/i.test(s) ? s : null;
}
