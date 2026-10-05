import React, { useState } from "react";
import { Check, MessageCircle, X } from "lucide-react";
import { sb } from "./supabase";
import { agente } from "./agente";
import { Btn, Textarea } from "./ui";

/* ============================================================
   Classificar um contato depois de mandar a mensagem.
   Usado em Astra → Aprovar envios e na Prospecção: o lead só muda
   de situação pela sua classificação (nunca só por abrir o WhatsApp).
   ============================================================ */

export async function marcarEnviada(a, p, via, uid) {
  const agora = new Date().toISOString();
  await sb.from("gestao_abordagens").update({ status: "enviada", enviada_em: agora, canal: via === "outro" ? a.canal : via }).eq("id", a.id);
  await sb.from("gestao_abordagens").update({ status: "descartada" }).eq("prospect_id", p.id).eq("status", "rascunho");
  // resposta a quem já respondeu não volta o lead para "abordado"
  if (a.tipo !== "resposta") await sb.from("gestao_prospects").update({ status: "abordado", abordado_em: agora, responsavel: p.responsavel || uid }).eq("id", p.id);
  if (a.tipo === "primeiro_contato") {
    const prazo = new Date(Date.now() + 3 * 86400e3).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    await sb.from("gestao_tarefas").insert({ titulo: `Follow-up: ${p.nome}`, descricao: `Abordado por ${via}. Se não responder, a Astra prepara o follow-up sozinha.`, responsavel: p.responsavel || uid, prazo, prioridade: "media" });
  }
}

export async function tirarDaLista(p, motivo) {
  await sb.from("gestao_abordagens").update({ status: "descartada" }).eq("prospect_id", p.id).eq("status", "rascunho");
  await sb.from("gestao_prospects").update({ status: "descartado", quente_motivo: `Descartado: ${motivo}` }).eq("id", p.id);
}

/** canal do envio: o que você abriu; senão o principal do lead */
export const canalDoLead = (p, aberto, temWa, fixo) => aberto || (temWa && !(fixo && p.instagram) ? "whatsapp" : p.instagram ? "instagram" : "outro");

/** botões de classificação. onFeito(texto) recebe o aviso para mostrar na tela. */
export function ClassificarContato({ a, p, via, uid, destaque, onFeito }) {
  const [salvando, setSalvando] = useState(false);
  const [respondendo, setRespondendo] = useState(false);
  const [resposta, setResposta] = useState("");

  const classificar = async (op) => {
    setSalvando(true);
    let aviso = "";
    try {
      if (op === "enviei") { await marcarEnviada(a, p, via, uid); aviso = `${p.nome}: enviada. Se não responder, o follow-up aparece em Aprovar envios sozinho.`; }
      if (op === "respondeu") {
        await marcarEnviada(a, p, via, uid);
        if (resposta.trim()) {
          const r = await agente("responder", { prospect_id: p.id, texto: resposta.trim(), canal: via === "instagram" ? "instagram" : "whatsapp" });
          aviso = `${p.nome} respondeu. ${r.leitura || ""} Próximo passo: ${r.proximo_passo || "seguir a conversa"}. A sugestão de resposta já está na fila.`;
        } else {
          await sb.from("gestao_prospects").update({ status: "respondeu" }).eq("id", p.id);
          aviso = `${p.nome} marcado como "respondeu".`;
        }
      }
      if (op === "sem_whatsapp") { await tirarDaLista(p, "telefone sem WhatsApp"); aviso = `${p.nome} saiu da lista (sem WhatsApp). A rotina põe outro lead no lugar.`; }
      if (op === "errado") { await tirarDaLista(p, "número errado ou não é desse negócio"); aviso = `${p.nome} saiu da lista.`; }
      if (op === "nao_contatar") { await tirarDaLista(p, "pediu para não ser contatado"); aviso = `${p.nome} não será mais contatado.`; }
      setRespondendo(false); setResposta("");
      onFeito?.(aviso, true);
    } catch (e) { onFeito?.(e.message, false); }
    setSalvando(false);
  };

  const op = (id, rotulo, Icone, neon) => (
    <Btn size="sm" variant={neon ? "neon" : "ghost"} disabled={salvando} onClick={() => classificar(id)}>{Icone && <Icone size={13} />} {rotulo}</Btn>
  );
  return (
    <div className={`mt-3 rounded-xl border p-3 ${destaque ? "border-[#22d3ee]/50 bg-[#22d3ee]/[0.05]" : "border-white/[0.07]"}`}>
      <p className="mb-2 font-mono text-[0.58rem] uppercase tracking-[0.16em] text-titanium">{destaque ? "Como foi? Classifique para a Astra seguir" : "Já falou com esse lead? Classifique"}</p>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {op("enviei", "Enviei", Check, destaque)}
        <Btn size="sm" variant="ghost" disabled={salvando} onClick={() => { setRespondendo((v) => !v); setResposta(""); }}><MessageCircle size={13} /> Respondeu</Btn>
        {p.telefone && op("sem_whatsapp", "Sem WhatsApp", X)}
        {op("errado", "Número errado", X)}
        {op("nao_contatar", "Não contatar", X)}
      </div>
      {respondendo && (
        <div className="mt-2 space-y-2">
          <Textarea rows={2} placeholder="Cole aqui o que a pessoa respondeu (opcional)" value={resposta} onChange={(e) => setResposta(e.target.value)} />
          {op("respondeu", "Salvar resposta", Check, true)}
        </div>
      )}
      {salvando && <p className="mt-2 text-xs text-titanium">Salvando…</p>}
    </div>
  );
}
