import React, { useMemo, useState } from "react";
import { Plus, ChevronLeft, ChevronRight, Trash2, ArrowDownLeft, ArrowUpRight, Repeat } from "lucide-react";
import {
  useG, Card, Btn, Field, Input, Textarea, Select, Badge, Modal, PageHead, Avatar, Empty, Stat,
  money, fmtDate, today, monthKey, addMonths, isLate, find, useConfirm,
} from "../ui";

const CAT_REC = ["Projeto", "Entrada de projeto", "Parcela", "Mensalidade / manutenção", "Hospedagem", "Avulso"];
const CAT_DESP = ["Ferramentas / assinaturas", "Domínio / hospedagem", "Anúncios", "Impostos", "Freelancer", "Equipamento", "Pró-labore", "Outros"];
const FORMAS = ["Pix", "Transferência", "Boleto", "Cartão", "Dinheiro"];

const nomeMes = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export default function Financeiro() {
  const { db, save } = useG();
  const [mes, setMes] = useState(monthKey(today()));
  const [filtro, setFiltro] = useState("todos");
  const [edit, setEdit] = useState(null);

  const doMes = useMemo(
    () => db.lancamentos.filter((l) => monthKey(l.vencimento) === mes).sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
    [db.lancamentos, mes]
  );
  const soma = (arr) => arr.reduce((s, l) => s + +l.valor, 0);
  const rec = doMes.filter((l) => l.tipo === "receita");
  const desp = doMes.filter((l) => l.tipo === "despesa");
  const recebido = soma(rec.filter((l) => l.pago_em));
  const aReceber = soma(rec.filter((l) => !l.pago_em));
  const despPagas = soma(desp.filter((l) => l.pago_em));
  const despTotal = soma(desp);
  const lucro = recebido - despPagas;
  const atrasados = db.lancamentos.filter((l) => l.tipo === "receita" && !l.pago_em && isLate(l.vencimento));

  const socios = db.perfis.filter((p) => +p.participacao > 0);
  const somaPart = socios.reduce((s, p) => s + +p.participacao, 0) || 100;

  const lista = doMes.filter((l) => (filtro === "todos" ? true : filtro === "abertos" ? !l.pago_em : l.tipo === filtro));
  const mudaMes = (n) => setMes(addMonths(mes + "-01", n).slice(0, 7));
  const togglePago = (l) => save("lancamentos", { id: l.id, pago_em: l.pago_em ? null : today() });

  return (
    <>
      <PageHead kicker="Dinheiro" title="Financeiro">
        <Btn variant="ghost" onClick={() => setEdit({ tipo: "despesa", vencimento: today() })}><ArrowUpRight size={15} /> Despesa</Btn>
        <Btn variant="neon" onClick={() => setEdit({ tipo: "receita", vencimento: today() })}><Plus size={15} /> Receita</Btn>
      </PageHead>

      <div className="mb-4 flex items-center gap-2">
        <Btn variant="ghost" size="icon" onClick={() => mudaMes(-1)} aria-label="Mês anterior"><ChevronLeft size={16} /></Btn>
        <p className="min-w-[170px] text-center font-display text-lg text-white">{nomeMes(mes)}</p>
        <Btn variant="ghost" size="icon" onClick={() => mudaMes(1)} aria-label="Próximo mês"><ChevronRight size={16} /></Btn>
        {mes !== monthKey(today()) && <Btn variant="ghost" size="sm" onClick={() => setMes(monthKey(today()))}>Hoje</Btn>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Recebido" value={money(recebido)} color="#34d399" sub={`de ${money(recebido + aReceber)} previstos`} />
        <Stat label="A receber" value={money(aReceber)} color="#22d3ee" sub={`${rec.filter((l) => !l.pago_em).length} lançamentos`} />
        <Stat label="Despesas" value={money(despPagas)} color="#ff2fd0" sub={despTotal > despPagas ? `${money(despTotal - despPagas)} a pagar` : "tudo pago"} />
        <Stat label="Lucro do mês" value={money(lucro)} color={lucro >= 0 ? "#a78bfa" : "#ff2fd0"} sub="recebido − despesas pagas" />
      </div>

      {/* DIVISÃO ENTRE SÓCIOS */}
      <Card className="mt-3 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base text-white">Divisão entre sócios</h2>
          <span className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-titanium">pela % definida em cada perfil</span>
        </div>
        {socios.length === 0 ? (
          <p className="text-sm text-titanium">Defina a % de participação em “Meu perfil”.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {socios.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-3">
                <Avatar perfil={p} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{p.nome || p.email}</p>
                  <p className="font-mono text-[0.6rem] text-titanium">{+p.participacao}% · Pix: {p.pix || "—"}</p>
                </div>
                <p className="font-display text-lg tabular-nums text-white">{money(Math.max(0, lucro) * (+p.participacao / somaPart))}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {atrasados.length > 0 && (
        <Card className="mt-3 border-[#ff2fd0]/30 p-4">
          <p className="mb-2 text-sm text-[#ff9be9]">⚠ {atrasados.length} recebimento(s) em atraso · {money(soma(atrasados))}</p>
          <div className="flex flex-wrap gap-2">
            {atrasados.slice(0, 8).map((l) => (
              <button key={l.id} onClick={() => setEdit(l)} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-titanium-bright hover:border-white/30">
                {find(db.clientes, l.cliente_id)?.nome || l.descricao} · {money(l.valor)} · {fmtDate(l.vencimento)}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* LISTA */}
      <div className="mb-3 mt-6 flex flex-wrap gap-1 rounded-xl border border-white/10 p-1">
        {[["todos", "Tudo"], ["receita", "Receitas"], ["despesa", "Despesas"], ["abertos", "Em aberto"]].map(([id, l]) => (
          <button key={id} onClick={() => setFiltro(id)} className={`rounded-lg px-3 py-1.5 text-xs ${filtro === id ? "bg-white/10 text-white" : "text-titanium hover:text-white"}`}>{l}</button>
        ))}
      </div>

      {lista.length === 0 ? (
        <Empty>Nada lançado em {nomeMes(mes)}.</Empty>
      ) : (
        <Card className="divide-y divide-white/[0.05]">
          {lista.map((l) => {
            const c = find(db.clientes, l.cliente_id);
            const r = find(db.perfis, l.responsavel);
            const late = !l.pago_em && isLate(l.vencimento);
            return (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => togglePago(l)}
                  title={l.pago_em ? "Marcar como não pago" : "Marcar como pago hoje"}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${l.pago_em ? "border-[#34d399] bg-[#34d399] text-[#030305]" : "border-white/25 text-transparent hover:border-[#34d399]"}`}
                >
                  ✓
                </button>
                <span className={l.tipo === "receita" ? "text-[#34d399]" : "text-[#ff6bd8]"}>
                  {l.tipo === "receita" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                </span>
                <button className="min-w-0 flex-1 text-left" onClick={() => setEdit(l)}>
                  <p className="truncate text-sm text-titanium-bright">
                    {l.descricao} {l.recorrente && <Repeat size={11} className="ml-1 inline text-[#a78bfa]" />}
                  </p>
                  <p className="truncate text-xs text-titanium">{[c?.empresa || c?.nome, l.categoria, l.forma].filter(Boolean).join(" · ")}</p>
                </button>
                {r && <span className="hidden sm:block"><Avatar perfil={r} size={22} /></span>}
                <div className="text-right">
                  <p className={`font-display tabular-nums ${l.tipo === "despesa" ? "text-[#ff9be9]" : "text-white"}`}>{l.tipo === "despesa" ? "−" : ""}{money(l.valor)}</p>
                  <p className={`font-mono text-[0.62rem] ${late ? "text-[#ff6bd8]" : "text-titanium"}`}>
                    {l.pago_em ? `pago ${fmtDate(l.pago_em)}` : `vence ${fmtDate(l.vencimento)}`}
                  </p>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {edit && <LancamentoModal lanc={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function LancamentoModal({ lanc, onClose }) {
  const { db, save, remove, insertMany, uid } = useG();
  const [f, setF] = useState({ responsavel: uid, ...lanc });
  const [repetir, setRepetir] = useState(1);
  const [erro, setErro] = useState("");
  const [ask, confirmNode] = useConfirm();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const receita = f.tipo === "receita";

  const salvar = async () => {
    if (!f.descricao?.trim() || !(+f.valor > 0)) return setErro("Preencha descrição e valor.");
    try {
      const base = Object.fromEntries(Object.entries({ ...f, valor: +f.valor }).map(([a, b]) => [a, b === "" ? null : b]));
      const n = Math.max(1, Math.min(36, +repetir || 1));
      if (!f.id && n > 1) {
        const rows = Array.from({ length: n }, (_, i) => ({
          ...base,
          descricao: `${base.descricao} (${i + 1}/${n})`,
          vencimento: addMonths(base.vencimento, i),
          pago_em: i === 0 ? base.pago_em : null,
          recorrente: true,
        }));
        await insertMany("lancamentos", rows);
      } else {
        await save("lancamentos", base);
      }
      onClose();
    } catch (e) { setErro(e.message); }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={f.id ? "Editar lançamento" : receita ? "Nova receita" : "Nova despesa"}
      footer={
        <>
          {f.id && <Btn variant="danger" className="mr-auto" onClick={async () => { if (await ask("Apagar este lançamento?")) { await remove("lancamentos", f.id); onClose(); } }}><Trash2 size={14} /></Btn>}
          {erro && <span className="text-sm text-[#ff9be9]">{erro}</span>}
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant="neon" onClick={salvar}>Salvar</Btn>
        </>
      }
    >
      {confirmNode}
      <div className="mb-4 flex gap-1 rounded-xl border border-white/10 p-1">
        {["receita", "despesa"].map((t) => (
          <button key={t} onClick={() => setF({ ...f, tipo: t, categoria: null })} className={`flex-1 rounded-lg py-2 text-sm capitalize ${f.tipo === t ? (t === "receita" ? "bg-[#34d399]/15 text-[#34d399]" : "bg-[#ff2fd0]/15 text-[#ff9be9]") : "text-titanium"}`}>{t}</button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Descrição *" className="sm:col-span-2"><Input value={f.descricao} onChange={set("descricao")} autoFocus placeholder={receita ? "Ex.: Entrada site Barbearia Hebreus" : "Ex.: Assinatura Claude"} /></Field>
        <Field label="Valor (R$) *"><Input type="number" step="0.01" min="0" value={f.valor} onChange={set("valor")} /></Field>
        <Field label="Categoria"><Select value={f.categoria} onChange={set("categoria")} placeholder="—" options={receita ? CAT_REC : CAT_DESP} /></Field>
        <Field label="Vencimento"><Input type="date" value={f.vencimento} onChange={set("vencimento")} /></Field>
        <Field label="Pago em" hint="Deixe vazio se ainda não foi pago"><Input type="date" value={f.pago_em} onChange={set("pago_em")} /></Field>
        <Field label="Cliente"><Select value={f.cliente_id} onChange={set("cliente_id")} placeholder="—" options={db.clientes.map((c) => ({ value: c.id, label: c.empresa || c.nome }))} /></Field>
        <Field label="Projeto"><Select value={f.projeto_id} onChange={set("projeto_id")} placeholder="—" options={db.projetos.filter((p) => !f.cliente_id || p.cliente_id === f.cliente_id).map((p) => ({ value: p.id, label: p.nome }))} /></Field>
        <Field label="Forma"><Select value={f.forma} onChange={set("forma")} placeholder="—" options={FORMAS} /></Field>
        <Field label={receita ? "Quem recebeu" : "Quem pagou"}><Select value={f.responsavel} onChange={set("responsavel")} placeholder="—" options={db.perfis.map((p) => ({ value: p.id, label: p.nome || p.email }))} /></Field>
        {!f.id && (
          <Field label="Repetir por quantos meses?" hint="Para mensalidades ou parcelas (1 = só este mês)">
            <Input type="number" min="1" max="36" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
          </Field>
        )}
        <Field label="Observação" className="sm:col-span-2"><Textarea value={f.observacao} onChange={set("observacao")} /></Field>
      </div>
      {f.pago_em && <div className="mt-3"><Badge color="#34d399">pago em {fmtDate(f.pago_em)}</Badge></div>}
    </Modal>
  );
}
