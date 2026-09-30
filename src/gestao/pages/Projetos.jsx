import React, { useState } from "react";
import { Plus, ExternalLink, Trash2, GitBranch, LayoutDashboard } from "lucide-react";
import {
  useG, Card, Btn, Field, Input, Textarea, Select, Badge, Modal, PageHead, Avatar, Empty,
  STATUS_PROJETO, find, isLate, useConfirm,
} from "../ui";
import { Prazo } from "./Painel";

const TIPOS = ["Site / landing page", "E-commerce", "Sistema de gestão", "Agendamento", "Cartão digital", "Automação / IA", "Dashboard", "App", "Manutenção", "Outro"];

export default function Projetos() {
  const { db, save } = useG();
  const [filtro, setFiltro] = useState("ativos");
  const [edit, setEdit] = useState(null);

  const lista = db.projetos.filter((p) =>
    filtro === "ativos" ? !["entregue", "pausado"].includes(p.status) : filtro === "todos" ? true : p.status === filtro
  );

  return (
    <>
      <PageHead kicker="Entregas" title="Projetos">
        <Btn variant="neon" onClick={() => setEdit({ status: "briefing", progresso: 0 })}><Plus size={15} /> Novo projeto</Btn>
      </PageHead>

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-white/10 p-1">
        {[{ id: "ativos", label: "Em andamento" }, ...STATUS_PROJETO, { id: "todos", label: "Todos" }].map((s) => (
          <button key={s.id} onClick={() => setFiltro(s.id)} className={`rounded-lg px-3 py-1.5 text-xs ${filtro === s.id ? "bg-white/10 text-white" : "text-titanium hover:text-white"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <Empty>Nenhum projeto aqui. Feche um negócio no Funil ou crie um projeto.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((p) => {
            const s = STATUS_PROJETO.find((x) => x.id === p.status);
            const c = find(db.clientes, p.cliente_id);
            const r = find(db.perfis, p.responsavel);
            const atrasado = isLate(p.prazo) && !["entregue", "manutencao"].includes(p.status);
            return (
              <Card key={p.id} className={`p-4 ${atrasado ? "border-[#ff2fd0]/35" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <button className="min-w-0 text-left" onClick={() => setEdit(p)}>
                    <p className="truncate font-display text-base text-white hover:text-[#22d3ee]">{p.nome}</p>
                    <p className="truncate text-xs text-titanium">{[c?.empresa || c?.nome, p.tipo].filter(Boolean).join(" · ") || "—"}</p>
                  </button>
                  <Badge color={s.color}>{s.label}</Badge>
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex justify-between font-mono text-[0.6rem] text-titanium">
                    <span>PROGRESSO</span><span className="text-white">{p.progresso}%</span>
                  </div>
                  <input
                    type="range" min="0" max="100" step="5" value={p.progresso}
                    onChange={(e) => save("projetos", { id: p.id, progresso: +e.target.value })}
                    className="w-full accent-[#22d3ee]"
                    aria-label="Progresso"
                  />
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {r && <Avatar perfil={r} size={22} />}
                    <span className="text-xs text-titanium">prazo</span> <Prazo d={p.prazo} />
                  </div>
                  <div className="flex gap-1">
                    {p.url_site && <IconLink href={p.url_site} title="Site"><ExternalLink size={14} /></IconLink>}
                    {p.url_painel && <IconLink href={p.url_painel} title="Painel"><LayoutDashboard size={14} /></IconLink>}
                    {p.url_repo && <IconLink href={p.url_repo} title="Repositório"><GitBranch size={14} /></IconLink>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {edit && <ProjetoModal projeto={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function IconLink({ href, title, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" title={title} className="rounded-lg p-1.5 text-titanium hover:bg-white/10 hover:text-[#22d3ee]">
      {children}
    </a>
  );
}

function ProjetoModal({ projeto, onClose }) {
  const { db, save, remove, uid } = useG();
  const [f, setF] = useState({ responsavel: uid, ...projeto });
  const [erro, setErro] = useState("");
  const [ask, confirmNode] = useConfirm();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const salvar = async () => {
    if (!f.nome?.trim()) return setErro("Informe o nome do projeto.");
    try {
      await save("projetos", { ...f, progresso: +f.progresso || 0 });
      onClose();
    } catch (e) { setErro(e.message); }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={f.id ? f.nome : "Novo projeto"}
      footer={
        <>
          {f.id && <Btn variant="danger" className="mr-auto" onClick={async () => { if (await ask("Apagar este projeto?")) { await remove("projetos", f.id); onClose(); } }}><Trash2 size={14} /></Btn>}
          {erro && <span className="text-sm text-[#ff9be9]">{erro}</span>}
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant="neon" onClick={salvar}>Salvar</Btn>
        </>
      }
    >
      {confirmNode}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do projeto *" className="sm:col-span-2"><Input value={f.nome} onChange={set("nome")} autoFocus /></Field>
        <Field label="Cliente"><Select value={f.cliente_id} onChange={set("cliente_id")} placeholder="—" options={db.clientes.map((c) => ({ value: c.id, label: c.empresa || c.nome }))} /></Field>
        <Field label="Tipo"><Select value={f.tipo} onChange={set("tipo")} placeholder="—" options={TIPOS} /></Field>
        <Field label="Status"><Select value={f.status} onChange={set("status")} options={STATUS_PROJETO.map((s) => ({ value: s.id, label: s.label }))} /></Field>
        <Field label={`Progresso (${f.progresso || 0}%)`}><input type="range" min="0" max="100" step="5" value={f.progresso || 0} onChange={set("progresso")} className="mt-3 accent-[#22d3ee]" /></Field>
        <Field label="Início"><Input type="date" value={f.inicio} onChange={set("inicio")} /></Field>
        <Field label="Prazo de entrega"><Input type="date" value={f.prazo} onChange={set("prazo")} /></Field>
        <Field label="Responsável"><Select value={f.responsavel} onChange={set("responsavel")} options={db.perfis.map((p) => ({ value: p.id, label: p.nome || p.email }))} placeholder="—" /></Field>
        <Field label="Negócio de origem"><Select value={f.negocio_id} onChange={set("negocio_id")} placeholder="—" options={db.negocios.map((n) => ({ value: n.id, label: n.titulo }))} /></Field>
        <Field label="Link do site / app"><Input value={f.url_site} onChange={set("url_site")} placeholder="https://…" /></Field>
        <Field label="Link do painel / admin"><Input value={f.url_painel} onChange={set("url_painel")} placeholder="https://…" /></Field>
        <Field label="Repositório (GitHub)" className="sm:col-span-2"><Input value={f.url_repo} onChange={set("url_repo")} placeholder="https://github.com/…" /></Field>
        <Field label="Escopo / anotações" className="sm:col-span-2"><Textarea rows={4} value={f.descricao} onChange={set("descricao")} /></Field>
      </div>
    </Modal>
  );
}
