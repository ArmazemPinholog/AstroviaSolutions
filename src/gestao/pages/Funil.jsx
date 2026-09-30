import React, { useState } from "react";
import { Plus, ChevronLeft, ChevronRight, Trash2, FolderKanban, ExternalLink } from "lucide-react";
import {
  useG, Card, Btn, Field, Input, Textarea, Select, Badge, Modal, PageHead, Avatar, ETAPAS,
  money, today, find, useConfirm,
} from "../ui";
import { Prazo } from "./Painel";

export default function Funil() {
  const { db, save } = useG();
  const [edit, setEdit] = useState(null);

  const mover = async (n, dir) => {
    const i = ETAPAS.findIndex((e) => e.id === n.etapa);
    const nova = ETAPAS[Math.min(ETAPAS.length - 1, Math.max(0, i + dir))].id;
    if (nova === n.etapa) return;
    await save("negocios", { id: n.id, etapa: nova, fechado_em: nova === "fechado" ? today() : n.fechado_em });
  };

  const abertos = db.negocios.filter((n) => !["fechado", "perdido"].includes(n.etapa));
  const fechados = db.negocios.filter((n) => n.etapa === "fechado");
  const perdidos = db.negocios.filter((n) => n.etapa === "perdido");
  const conv = fechados.length + perdidos.length ? Math.round((fechados.length / (fechados.length + perdidos.length)) * 100) : 0;

  return (
    <>
      <PageHead kicker="Propostas" title="Funil de vendas">
        <span className="text-xs text-titanium">
          Aberto <b className="text-white">{money(abertos.reduce((s, n) => s + +n.valor, 0))}</b> · conversão <b className="text-white">{conv}%</b>
        </span>
        <Btn variant="neon" onClick={() => setEdit({ etapa: "lead", probabilidade: 30 })}><Plus size={15} /> Novo negócio</Btn>
      </PageHead>

      <div className="-mx-4 overflow-x-auto px-4 pb-4 lg:mx-0 lg:px-0">
        <div className="grid min-w-[1100px] grid-cols-6 gap-3">
          {ETAPAS.map((e) => {
            const itens = db.negocios.filter((n) => n.etapa === e.id);
            const total = itens.reduce((s, n) => s + +n.valor, 0);
            return (
              <div key={e.id} className="flex flex-col rounded-2xl border border-white/[0.06] bg-white/[0.015] p-2.5">
                <div className="mb-2 px-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-titanium-bright">
                      <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
                      {e.label}
                    </span>
                    <span className="font-mono text-[0.65rem] text-titanium">{itens.length}</span>
                  </div>
                  <p className="mt-0.5 font-mono text-[0.62rem] text-titanium">{money(total)}</p>
                </div>
                <div className="flex flex-col gap-2">
                  {itens.map((n) => {
                    const c = find(db.clientes, n.cliente_id);
                    const r = find(db.perfis, n.responsavel);
                    return (
                      <Card key={n.id} className="cursor-pointer p-3 transition hover:border-white/20" onClick={() => setEdit(n)}>
                        <p className="text-sm leading-snug text-white">{n.titulo}</p>
                        <p className="mt-0.5 truncate text-xs text-titanium">{c?.empresa || c?.nome || "—"}</p>
                        <p className="mt-2 font-display text-sm text-white tabular-nums">
                          {money(n.valor)}
                          {+n.valor_mensal > 0 && <span className="text-xs text-[#a78bfa]"> + {money(n.valor_mensal)}/mês</span>}
                        </p>
                        {n.proximo_passo && <p className="mt-1 line-clamp-2 text-[0.7rem] text-titanium">↳ {n.proximo_passo}</p>}
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {r && <Avatar perfil={r} size={20} />}
                            {n.proxima_data && <Prazo d={n.proxima_data} />}
                          </div>
                          <div className="flex" onClick={(ev) => ev.stopPropagation()}>
                            <button className="rounded p-1 text-titanium hover:bg-white/10 hover:text-white" onClick={() => mover(n, -1)} aria-label="Voltar etapa"><ChevronLeft size={14} /></button>
                            <button className="rounded p-1 text-titanium hover:bg-white/10 hover:text-white" onClick={() => mover(n, 1)} aria-label="Avançar etapa"><ChevronRight size={14} /></button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {edit && <NegocioModal negocio={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

export function NegocioModal({ negocio, onClose }) {
  const { db, save, remove, uid, go } = useG();
  const [f, setF] = useState({ responsavel: uid, ...negocio });
  const [novoCliente, setNovoCliente] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [ask, confirmNode] = useConfirm();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const salvar = async () => {
    if (!f.titulo?.trim()) return setErro("Dê um título (ex.: Site + sistema de agendamento).");
    setBusy(true);
    try {
      let cliente_id = f.cliente_id;
      if (!cliente_id && novoCliente.trim()) {
        const c = await save("clientes", { nome: novoCliente.trim(), status: "prospect", responsavel: uid });
        cliente_id = c.id;
      }
      const row = { ...f, cliente_id };
      if (row.etapa === "fechado" && !row.fechado_em) row.fechado_em = today();
      await save("negocios", row);
      onClose();
    } catch (e) { setErro(e.message); }
    setBusy(false);
  };

  const criarProjeto = async () => {
    await save("projetos", { nome: f.titulo, cliente_id: f.cliente_id, negocio_id: f.id, status: "briefing", inicio: today(), responsavel: f.responsavel });
    if (f.cliente_id) await save("clientes", { id: f.cliente_id, status: "ativo" });
    onClose();
    go("projetos");
  };

  const temProjeto = f.id && db.projetos.some((p) => p.negocio_id === f.id);

  return (
    <Modal
      open
      onClose={onClose}
      title={f.id ? "Editar negócio" : "Novo negócio"}
      footer={
        <>
          {f.id && <Btn variant="danger" className="mr-auto" onClick={async () => { if (await ask("Apagar este negócio?")) { await remove("negocios", f.id); onClose(); } }}><Trash2 size={14} /></Btn>}
          {erro && <span className="text-sm text-[#ff9be9]">{erro}</span>}
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant="neon" onClick={salvar} disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Btn>
        </>
      }
    >
      {confirmNode}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Título *" className="sm:col-span-2"><Input value={f.titulo} onChange={set("titulo")} autoFocus placeholder="Ex.: Sistema de agendamento Barbearia Hebreus" /></Field>
        <Field label="Cliente">
          <Select value={f.cliente_id} onChange={set("cliente_id")} placeholder="— novo cliente —" options={db.clientes.map((c) => ({ value: c.id, label: c.empresa ? `${c.empresa} (${c.nome})` : c.nome }))} />
        </Field>
        {!f.cliente_id ? (
          <Field label="Nome do novo cliente"><Input value={novoCliente} onChange={(e) => setNovoCliente(e.target.value)} placeholder="Cria o cliente junto" /></Field>
        ) : <div />}
        <Field label="Etapa"><Select value={f.etapa} onChange={set("etapa")} options={ETAPAS.map((e) => ({ value: e.id, label: e.label }))} /></Field>
        <Field label="Chance de fechar (%)"><Input type="number" min="0" max="100" value={f.probabilidade} onChange={set("probabilidade")} /></Field>
        <Field label="Valor do projeto (R$)"><Input type="number" step="0.01" min="0" value={f.valor} onChange={set("valor")} /></Field>
        <Field label="Mensalidade (R$/mês)" hint="Manutenção / assinatura, se tiver"><Input type="number" step="0.01" min="0" value={f.valor_mensal} onChange={set("valor_mensal")} /></Field>
        <Field label="Próximo passo" className="sm:col-span-2"><Input value={f.proximo_passo} onChange={set("proximo_passo")} placeholder="Ex.: ligar para apresentar a demo" /></Field>
        <Field label="Data do próximo passo"><Input type="date" value={f.proxima_data} onChange={set("proxima_data")} /></Field>
        <Field label="Responsável"><Select value={f.responsavel} onChange={set("responsavel")} options={db.perfis.map((p) => ({ value: p.id, label: p.nome || p.email }))} placeholder="—" /></Field>
        <Field label="Link da proposta" className="sm:col-span-2">
          <div className="flex gap-2">
            <Input value={f.proposta_url} onChange={set("proposta_url")} placeholder="https://…" />
            {f.proposta_url && <a href={f.proposta_url} target="_blank" rel="noreferrer"><Btn variant="ghost" size="icon"><ExternalLink size={14} /></Btn></a>}
          </div>
        </Field>
        {f.etapa === "perdido" && <Field label="Motivo da perda" className="sm:col-span-2"><Textarea value={f.motivo_perda} onChange={set("motivo_perda")} /></Field>}
      </div>

      {f.id && f.etapa === "fechado" && (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-[#34d399]/30 bg-[#34d399]/10 p-3">
          <span className="text-sm text-[#a7f3d0]">{temProjeto ? "Projeto já criado para este negócio." : "Negócio fechado! Criar o projeto agora?"}</span>
          {!temProjeto && <Btn size="sm" onClick={criarProjeto}><FolderKanban size={13} /> Criar projeto</Btn>}
        </div>
      )}
      {f.etapa && <div className="mt-4"><Badge color={ETAPAS.find((e) => e.id === f.etapa).color}>{ETAPAS.find((e) => e.id === f.etapa).label}</Badge></div>}
    </Modal>
  );
}
