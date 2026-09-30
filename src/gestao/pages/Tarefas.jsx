import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  useG, Card, Btn, Field, Input, Textarea, Select, Badge, Modal, PageHead, Avatar, Empty,
  PRIORIDADES, find, today, isLate, useConfirm,
} from "../ui";
import { Prazo } from "./Painel";

export default function Tarefas() {
  const { db, save, uid } = useG();
  const [aba, setAba] = useState("minhas");
  const [edit, setEdit] = useState(null);
  const [rapida, setRapida] = useState({ titulo: "", responsavel: uid, prazo: "", prioridade: "media" });

  const outros = db.perfis.filter((p) => p.id !== uid);
  const abas = [
    { id: "minhas", label: "Minhas" },
    ...outros.map((p) => ({ id: p.id, label: (p.nome || p.email).split(" ")[0] })),
    { id: "todas", label: "Todas" },
    { id: "feitas", label: "Concluídas" },
  ];

  const ordem = { alta: 0, media: 1, baixa: 2 };
  const lista = db.tarefas
    .filter((t) => {
      if (aba === "feitas") return t.concluida;
      if (t.concluida) return false;
      if (aba === "minhas") return t.responsavel === uid;
      if (aba === "todas") return true;
      return t.responsavel === aba;
    })
    .sort((a, b) =>
      aba === "feitas"
        ? (b.concluida_em || "").localeCompare(a.concluida_em || "")
        : (a.prazo || "9999").localeCompare(b.prazo || "9999") || ordem[a.prioridade] - ordem[b.prioridade]
    );

  const criarRapida = async (e) => {
    e.preventDefault();
    if (!rapida.titulo.trim()) return;
    await save("tarefas", rapida);
    setRapida({ ...rapida, titulo: "" });
  };
  const toggle = (t) => save("tarefas", { id: t.id, concluida: !t.concluida, concluida_em: t.concluida ? null : new Date().toISOString() });

  return (
    <>
      <PageHead kicker="Dupla" title="Tarefas">
        <Btn variant="neon" onClick={() => setEdit({ responsavel: uid, prioridade: "media" })}><Plus size={15} /> Nova tarefa</Btn>
      </PageHead>

      <Card className="mb-4 p-3">
        <form onSubmit={criarRapida} className="flex flex-col gap-2 lg:flex-row">
          <Input value={rapida.titulo} onChange={(e) => setRapida({ ...rapida, titulo: e.target.value })} placeholder="Adicionar tarefa rápida e apertar Enter…" />
          <div className="grid grid-cols-3 gap-2 lg:w-[460px]">
            <Select value={rapida.responsavel} onChange={(e) => setRapida({ ...rapida, responsavel: e.target.value })} options={db.perfis.map((p) => ({ value: p.id, label: p.id === uid ? "Eu" : (p.nome || p.email).split(" ")[0] }))} />
            <Input type="date" value={rapida.prazo} onChange={(e) => setRapida({ ...rapida, prazo: e.target.value })} />
            <Select value={rapida.prioridade} onChange={(e) => setRapida({ ...rapida, prioridade: e.target.value })} options={PRIORIDADES.map((p) => ({ value: p.id, label: p.label }))} />
          </div>
          <Btn type="submit" variant="neon" className="justify-center"><Plus size={15} /></Btn>
        </form>
      </Card>

      <div className="mb-3 flex flex-wrap gap-1 rounded-xl border border-white/10 p-1">
        {abas.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)} className={`rounded-lg px-3 py-1.5 text-xs ${aba === a.id ? "bg-white/10 text-white" : "text-titanium hover:text-white"}`}>{a.label}</button>
        ))}
      </div>

      {lista.length === 0 ? (
        <Empty>{aba === "feitas" ? "Nada concluído ainda." : "Tudo em dia por aqui ✦"}</Empty>
      ) : (
        <Card className="divide-y divide-white/[0.05]">
          {lista.map((t) => {
            const p = PRIORIDADES.find((x) => x.id === t.prioridade);
            const r = find(db.perfis, t.responsavel);
            const c = find(db.clientes, t.cliente_id);
            const pr = find(db.projetos, t.projeto_id);
            return (
              <div key={t.id} className={`flex items-center gap-3 px-4 py-3 ${!t.concluida && isLate(t.prazo) ? "bg-[#ff2fd0]/[0.04]" : ""}`}>
                <button
                  onClick={() => toggle(t)}
                  aria-label={t.concluida ? "Reabrir tarefa" : "Concluir tarefa"}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.6rem] ${t.concluida ? "border-[#34d399] bg-[#34d399] text-[#030305]" : "border-white/30 text-transparent hover:border-[#34d399]"}`}
                >
                  ✓
                </button>
                <button className="min-w-0 flex-1 text-left" onClick={() => setEdit(t)}>
                  <p className={`truncate text-sm ${t.concluida ? "text-titanium line-through" : "text-titanium-bright"}`}>{t.titulo}</p>
                  {(c || pr) && <p className="truncate text-xs text-titanium">{[c?.empresa || c?.nome, pr?.nome].filter(Boolean).join(" · ")}</p>}
                </button>
                <Badge color={p.color}>{p.label}</Badge>
                <span className="hidden w-20 text-right sm:block"><Prazo d={t.prazo} /></span>
                {r && <Avatar perfil={r} size={24} />}
              </div>
            );
          })}
        </Card>
      )}

      {edit && <TarefaModal tarefa={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function TarefaModal({ tarefa, onClose }) {
  const { db, save, remove } = useG();
  const [f, setF] = useState(tarefa);
  const [erro, setErro] = useState("");
  const [ask, confirmNode] = useConfirm();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const salvar = async () => {
    if (!f.titulo?.trim()) return setErro("Informe a tarefa.");
    try {
      await save("tarefas", f);
      onClose();
    } catch (e) { setErro(e.message); }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={f.id ? "Editar tarefa" : "Nova tarefa"}
      footer={
        <>
          {f.id && <Btn variant="danger" className="mr-auto" onClick={async () => { if (await ask("Apagar esta tarefa?")) { await remove("tarefas", f.id); onClose(); } }}><Trash2 size={14} /></Btn>}
          {erro && <span className="text-sm text-[#ff9be9]">{erro}</span>}
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant="neon" onClick={salvar}>Salvar</Btn>
        </>
      }
    >
      {confirmNode}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tarefa *" className="sm:col-span-2"><Input value={f.titulo} onChange={set("titulo")} autoFocus /></Field>
        <Field label="Responsável"><Select value={f.responsavel} onChange={set("responsavel")} options={db.perfis.map((p) => ({ value: p.id, label: p.nome || p.email }))} placeholder="—" /></Field>
        <Field label="Prazo"><Input type="date" value={f.prazo} onChange={set("prazo")} min={f.id ? undefined : today()} /></Field>
        <Field label="Prioridade"><Select value={f.prioridade} onChange={set("prioridade")} options={PRIORIDADES.map((p) => ({ value: p.id, label: p.label }))} /></Field>
        <Field label="Cliente"><Select value={f.cliente_id} onChange={set("cliente_id")} placeholder="—" options={db.clientes.map((c) => ({ value: c.id, label: c.empresa || c.nome }))} /></Field>
        <Field label="Projeto" className="sm:col-span-2"><Select value={f.projeto_id} onChange={set("projeto_id")} placeholder="—" options={db.projetos.map((p) => ({ value: p.id, label: p.nome }))} /></Field>
        <Field label="Detalhes" className="sm:col-span-2"><Textarea rows={4} value={f.descricao} onChange={set("descricao")} /></Field>
      </div>
    </Modal>
  );
}
