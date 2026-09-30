import React, { useMemo, useState } from "react";
import { Plus, Search, MessageCircle, Mail, Trash2, ExternalLink } from "lucide-react";
import {
  useG, Card, Btn, Field, Input, Textarea, Select, Badge, Modal, Empty, PageHead, Avatar,
  STATUS_CLIENTE, ETAPAS, STATUS_PROJETO, money, fmtDate, waLink, find, useConfirm,
} from "../ui";

const ORIGENS = ["Instagram", "Indicação", "Workana", "WhatsApp", "Google", "Prospecção ativa", "Outro"];
const TIPOS_NOTA = [
  { value: "nota", label: "Nota" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "ligacao", label: "Ligação" },
  { value: "reuniao", label: "Reunião" },
  { value: "email", label: "E-mail" },
];

export default function Clientes() {
  const { db } = useG();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [edit, setEdit] = useState(null);

  const lista = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.clientes.filter(
      (c) =>
        (!status || c.status === status) &&
        (!s || [c.nome, c.empresa, c.segmento, c.cidade, c.email, c.whatsapp].some((v) => (v || "").toLowerCase().includes(s)))
    );
  }, [db.clientes, q, status]);

  const totais = (id) => {
    const rec = db.lancamentos.filter((l) => l.cliente_id === id && l.tipo === "receita");
    return {
      pago: rec.filter((l) => l.pago_em).reduce((s, l) => s + +l.valor, 0),
      aberto: rec.filter((l) => !l.pago_em).reduce((s, l) => s + +l.valor, 0),
    };
  };

  return (
    <>
      <PageHead kicker="Carteira" title="Clientes">
        <Btn variant="neon" onClick={() => setEdit({ status: "prospect" })}><Plus size={15} /> Novo cliente</Btn>
      </PageHead>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-titanium" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, empresa, cidade, segmento…"
            className="h-10 w-full rounded-xl border border-white/10 bg-[#05050a] pl-9 pr-3 text-sm text-white outline-none focus:border-[#22d3ee]/60"
          />
        </div>
        <div className="flex gap-1 rounded-xl border border-white/10 p-1">
          {[{ id: "", label: "Todos" }, ...STATUS_CLIENTE].map((s) => (
            <button
              key={s.id}
              onClick={() => setStatus(s.id)}
              className={`rounded-lg px-3 py-1.5 text-xs ${status === s.id ? "bg-white/10 text-white" : "text-titanium hover:text-white"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {lista.length === 0 ? (
        <Empty>{db.clientes.length ? "Nenhum cliente encontrado." : "Cadastre o primeiro cliente para começar."}</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((c) => {
            const st = STATUS_CLIENTE.find((s) => s.id === c.status);
            const t = totais(c.id);
            const resp = find(db.perfis, c.responsavel);
            return (
              <Card key={c.id} className="cursor-pointer p-4 transition hover:border-white/20" onClick={() => setEdit(c)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-base text-white">{c.nome}</p>
                    <p className="truncate text-xs text-titanium">{[c.empresa, c.segmento, c.cidade].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <Badge color={st.color}>{st.label}</Badge>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-titanium">
                    Pago <b className="text-[#34d399]">{money(t.pago)}</b>
                    {t.aberto > 0 && <> · aberto <b className="text-[#22d3ee]">{money(t.aberto)}</b></>}
                  </span>
                  {resp && <Avatar perfil={resp} size={22} />}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {edit && <ClienteModal cliente={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ClienteModal({ cliente, onClose }) {
  const { db, save, remove, uid } = useG();
  const [f, setF] = useState({ responsavel: uid, ...cliente });
  const [tab, setTab] = useState("dados");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [nota, setNota] = useState({ tipo: "nota", texto: "" });
  const [ask, confirmNode] = useConfirm();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const novo = !f.id;

  const salvar = async () => {
    if (!f.nome?.trim()) return setErro("Informe o nome.");
    setBusy(true);
    try {
      const row = await save("clientes", f);
      if (novo && row) setF(row);
      if (!novo) onClose();
      else setTab("historico");
    } catch (e) { setErro(e.message); }
    setBusy(false);
  };
  const apagar = async () => {
    if (!(await ask(`Apagar ${f.nome}? Negócios, projetos e histórico dele também serão apagados.`))) return;
    await remove("clientes", f.id);
    onClose();
  };
  const addNota = async () => {
    if (!nota.texto.trim()) return;
    await save("notas", { ...nota, cliente_id: f.id });
    setNota({ tipo: nota.tipo, texto: "" });
  };

  const negocios = db.negocios.filter((n) => n.cliente_id === f.id);
  const projetos = db.projetos.filter((p) => p.cliente_id === f.id);
  const lanc = db.lancamentos.filter((l) => l.cliente_id === f.id);
  const notas = db.notas.filter((n) => n.cliente_id === f.id);
  const wa = waLink(f.whatsapp || f.telefone);

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={novo ? "Novo cliente" : f.nome}
      footer={
        tab === "dados" && (
          <>
            {!novo && <Btn variant="danger" onClick={apagar} className="mr-auto"><Trash2 size={14} /> Apagar</Btn>}
            {erro && <span className="text-sm text-[#ff9be9]">{erro}</span>}
            <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
            <Btn variant="neon" disabled={busy} onClick={salvar}>{busy ? "Salvando…" : "Salvar"}</Btn>
          </>
        )
      }
    >
      {confirmNode}
      {!novo && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {[["dados", "Dados"], ["historico", `Histórico (${notas.length})`], ["relacionados", "Negócios, projetos e $"]].map(([id, l]) => (
            <button key={id} onClick={() => setTab(id)} className={`rounded-lg px-3 py-1.5 text-xs ${tab === id ? "bg-[#22d3ee]/15 text-[#22d3ee]" : "text-titanium hover:text-white"}`}>{l}</button>
          ))}
          <span className="ml-auto flex gap-2">
            {wa && <a href={wa} target="_blank" rel="noreferrer"><Btn variant="ghost" size="sm"><MessageCircle size={13} /> WhatsApp</Btn></a>}
            {f.email && <a href={`mailto:${f.email}`}><Btn variant="ghost" size="sm"><Mail size={13} /> E-mail</Btn></a>}
          </span>
        </div>
      )}

      {tab === "dados" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do contato *"><Input value={f.nome} onChange={set("nome")} autoFocus /></Field>
          <Field label="Empresa / marca"><Input value={f.empresa} onChange={set("empresa")} /></Field>
          <Field label="Segmento"><Input value={f.segmento} onChange={set("segmento")} placeholder="Barbearia, estética, brechó…" /></Field>
          <Field label="CPF / CNPJ"><Input value={f.documento} onChange={set("documento")} /></Field>
          <Field label="WhatsApp"><Input value={f.whatsapp} onChange={set("whatsapp")} placeholder="(41) 99999-9999" /></Field>
          <Field label="Telefone"><Input value={f.telefone} onChange={set("telefone")} /></Field>
          <Field label="E-mail"><Input type="email" value={f.email} onChange={set("email")} /></Field>
          <Field label="Instagram"><Input value={f.instagram} onChange={set("instagram")} placeholder="@perfil" /></Field>
          <Field label="Site"><Input value={f.site} onChange={set("site")} /></Field>
          <Field label="Cidade"><Input value={f.cidade} onChange={set("cidade")} /></Field>
          <Field label="Endereço" className="sm:col-span-2"><Input value={f.endereco} onChange={set("endereco")} /></Field>
          <Field label="Status"><Select value={f.status} onChange={set("status")} options={STATUS_CLIENTE.map((s) => ({ value: s.id, label: s.label }))} /></Field>
          <Field label="Origem"><Select value={f.origem} onChange={set("origem")} options={ORIGENS} placeholder="—" /></Field>
          <Field label="Responsável"><Select value={f.responsavel} onChange={set("responsavel")} options={db.perfis.map((p) => ({ value: p.id, label: p.nome || p.email }))} placeholder="—" /></Field>
          <Field label="Observações" className="sm:col-span-2"><Textarea value={f.observacoes} onChange={set("observacoes")} /></Field>
        </div>
      )}

      {tab === "historico" && (
        <div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="sm:w-40"><Select value={nota.tipo} onChange={(e) => setNota({ ...nota, tipo: e.target.value })} options={TIPOS_NOTA} /></div>
            <Input value={nota.texto} onChange={(e) => setNota({ ...nota, texto: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addNota()} placeholder="O que aconteceu? Ex.: enviei a proposta, ficou de responder sexta" />
            <Btn variant="neon" onClick={addNota}>Registrar</Btn>
          </div>
          <div className="mt-5 flex flex-col gap-3">
            {notas.length === 0 && <Empty>Nenhum registro ainda.</Empty>}
            {notas.map((n) => {
              const a = find(db.perfis, n.autor);
              return (
                <div key={n.id} className="flex gap-3">
                  <Avatar perfil={a} size={28} />
                  <div className="min-w-0 flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs text-titanium">
                      <Badge color="#22d3ee">{TIPOS_NOTA.find((t) => t.value === n.tipo)?.label}</Badge>
                      {a?.nome} · {new Date(n.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      <button className="ml-auto text-titanium-dim hover:text-[#ff9be9]" onClick={() => remove("notas", n.id)} aria-label="Apagar registro"><Trash2 size={12} /></button>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-titanium-bright">{n.texto}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "relacionados" && (
        <div className="grid gap-5">
          <Rel titulo="Negócios / propostas" vazio="Nenhum negócio.">
            {negocios.map((n) => {
              const e = ETAPAS.find((x) => x.id === n.etapa);
              return <Row key={n.id} a={n.titulo} b={<><Badge color={e.color}>{e.label}</Badge><span>{money(n.valor)}{+n.valor_mensal ? ` + ${money(n.valor_mensal)}/mês` : ""}</span></>} />;
            })}
          </Rel>
          <Rel titulo="Projetos" vazio="Nenhum projeto.">
            {projetos.map((p) => {
              const s = STATUS_PROJETO.find((x) => x.id === p.status);
              return <Row key={p.id} a={<>{p.nome}{p.url_site && <a href={p.url_site} target="_blank" rel="noreferrer" className="ml-2 inline-flex text-[#22d3ee]"><ExternalLink size={12} /></a>}</>} b={<><Badge color={s.color}>{s.label}</Badge><span>{p.progresso}%</span></>} />;
            })}
          </Rel>
          <Rel titulo="Financeiro" vazio="Nenhum lançamento.">
            {lanc.map((l) => (
              <Row key={l.id} a={`${l.descricao} · venc. ${fmtDate(l.vencimento)}`} b={<><span className={l.tipo === "despesa" ? "text-[#ff9be9]" : ""}>{money(l.valor)}</span><Badge color={l.pago_em ? "#34d399" : "#22d3ee"}>{l.pago_em ? "pago" : "aberto"}</Badge></>} />
            ))}
          </Rel>
        </div>
      )}
    </Modal>
  );
}

function Rel({ titulo, vazio, children }) {
  const has = React.Children.count(children) > 0;
  return (
    <div>
      <p className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-titanium">{titulo}</p>
      {has ? <div className="flex flex-col divide-y divide-white/[0.05] rounded-xl border border-white/[0.06] px-3">{children}</div> : <p className="text-sm text-titanium-dim">{vazio}</p>}
    </div>
  );
}
function Row({ a, b }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <span className="min-w-0 truncate text-titanium-bright">{a}</span>
      <span className="flex shrink-0 items-center gap-2 text-xs text-titanium">{b}</span>
    </div>
  );
}
