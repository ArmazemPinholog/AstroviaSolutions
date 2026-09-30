import React, { useMemo } from "react";
import { Wallet, TrendingUp, AlertTriangle, FolderKanban, ListChecks, SquareKanban, CalendarDays } from "lucide-react";
import { useG, Card, Stat, PageHead, money, fmtDate, today, monthKey, isLate, ETAPAS, STATUS_PROJETO, find, Badge, Avatar, Empty } from "../ui";

export default function Painel() {
  const { db, uid, me, go } = useG();
  const hoje = today();
  const mes = monthKey(hoje);

  const k = useMemo(() => {
    const L = db.lancamentos;
    const receitasMes = L.filter((l) => l.tipo === "receita" && monthKey(l.vencimento) === mes);
    const recebido = L.filter((l) => l.tipo === "receita" && l.pago_em && monthKey(l.pago_em) === mes).reduce((s, l) => s + +l.valor, 0);
    const aReceber = receitasMes.filter((l) => !l.pago_em).reduce((s, l) => s + +l.valor, 0);
    const atrasado = L.filter((l) => l.tipo === "receita" && !l.pago_em && isLate(l.vencimento)).reduce((s, l) => s + +l.valor, 0);
    const despesas = L.filter((l) => l.tipo === "despesa" && l.pago_em && monthKey(l.pago_em) === mes).reduce((s, l) => s + +l.valor, 0);
    const abertos = db.negocios.filter((n) => !["fechado", "perdido"].includes(n.etapa));
    const funil = abertos.reduce((s, n) => s + +n.valor, 0);
    const funilPond = abertos.reduce((s, n) => s + (+n.valor * (n.probabilidade || 0)) / 100, 0);
    const mrr = db.negocios.filter((n) => n.etapa === "fechado").reduce((s, n) => s + +(n.valor_mensal || 0), 0);
    const ativos = db.projetos.filter((p) => !["entregue", "pausado"].includes(p.status));
    const minhas = db.tarefas.filter((t) => !t.concluida && t.responsavel === uid);
    return { recebido, aReceber, atrasado, despesas, lucro: recebido - despesas, funil, funilPond, abertos, mrr, ativos, minhas };
  }, [db, mes, uid]);

  const proxRec = db.lancamentos
    .filter((l) => l.tipo === "receita" && !l.pago_em)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .slice(0, 6);
  const minhasTarefas = [...k.minhas].sort((a, b) => (a.prazo || "9999").localeCompare(b.prazo || "9999")).slice(0, 6);
  const proxPassos = k.abertos.filter((n) => n.proxima_data).sort((a, b) => a.proxima_data.localeCompare(b.proxima_data)).slice(0, 6);
  const prazos = k.ativos.filter((p) => p.prazo).sort((a, b) => a.prazo.localeCompare(b.prazo)).slice(0, 6);
  const cli = (id) => find(db.clientes, id)?.nome || "—";

  return (
    <>
      <PageHead kicker="Visão geral" title={`Olá, ${(me?.nome || "").split(" ")[0] || "time"} 👋`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Recebido no mês" value={money(k.recebido)} icon={Wallet} color="#34d399" sub={`Lucro: ${money(k.lucro)}`} />
        <Stat label="A receber no mês" value={money(k.aReceber)} icon={CalendarDays} color="#22d3ee" sub={k.atrasado ? `${money(k.atrasado)} em atraso` : "nada atrasado"} />
        <Stat label="Mensalidades (MRR)" value={money(k.mrr)} icon={TrendingUp} color="#a78bfa" sub="contratos fechados" />
        <Stat label="Funil aberto" value={money(k.funil)} icon={SquareKanban} color="#ff2fd0" sub={`${k.abertos.length} negócios · previsão ${money(k.funilPond)}`} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Clientes" value={db.clientes.length} sub={`${db.clientes.filter((c) => c.status === "ativo").length} ativos`} color="#60a5fa" />
        <Stat label="Projetos ativos" value={k.ativos.length} icon={FolderKanban} color="#22d3ee" sub={`${k.ativos.filter((p) => isLate(p.prazo)).length} com prazo vencido`} />
        <Stat label="Minhas tarefas" value={k.minhas.length} icon={ListChecks} color="#fbbf24" sub={`${k.minhas.filter((t) => isLate(t.prazo)).length} atrasadas`} />
        <Stat label="Despesas pagas no mês" value={money(k.despesas)} icon={AlertTriangle} color="#ff2fd0" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Bloco titulo="Minhas próximas tarefas" onMore={() => go("tarefas")}>
          {minhasTarefas.length ? minhasTarefas.map((t) => (
            <Linha key={t.id} left={t.titulo} sub={t.cliente_id ? cli(t.cliente_id) : null} right={<Prazo d={t.prazo} />} />
          )) : <Empty>Nenhuma tarefa pendente para você.</Empty>}
        </Bloco>

        <Bloco titulo="Próximos recebimentos" onMore={() => go("financeiro")}>
          {proxRec.length ? proxRec.map((l) => (
            <Linha key={l.id} left={l.descricao} sub={l.cliente_id ? cli(l.cliente_id) : l.categoria} right={<><span className="tabular-nums text-white">{money(l.valor)}</span><Prazo d={l.vencimento} /></>} />
          )) : <Empty>Nenhum recebimento em aberto.</Empty>}
        </Bloco>

        <Bloco titulo="Próximos passos do funil" onMore={() => go("funil")}>
          {proxPassos.length ? proxPassos.map((n) => {
            const e = ETAPAS.find((x) => x.id === n.etapa);
            return <Linha key={n.id} left={n.titulo} sub={`${cli(n.cliente_id)} · ${n.proximo_passo || "sem próximo passo"}`} right={<><Badge color={e.color}>{e.label}</Badge><Prazo d={n.proxima_data} /></>} />;
          }) : <Empty>Nenhum follow-up agendado.</Empty>}
        </Bloco>

        <Bloco titulo="Prazos de projetos" onMore={() => go("projetos")}>
          {prazos.length ? prazos.map((p) => {
            const s = STATUS_PROJETO.find((x) => x.id === p.status);
            const resp = find(db.perfis, p.responsavel);
            return <Linha key={p.id} left={p.nome} sub={cli(p.cliente_id)} right={<>{resp && <Avatar perfil={resp} size={22} />}<Badge color={s.color}>{p.progresso}%</Badge><Prazo d={p.prazo} /></>} />;
          }) : <Empty>Nenhum projeto com prazo definido.</Empty>}
        </Bloco>
      </div>
    </>
  );
}

function Bloco({ titulo, children, onMore }) {
  return (
    <Card className="min-w-0 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-base text-white">{titulo}</h2>
        <button onClick={onMore} className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[#22d3ee] hover:text-white">ver tudo →</button>
      </div>
      <div className="flex flex-col divide-y divide-white/[0.05]">{children}</div>
    </Card>
  );
}

export function Linha({ left, sub, right }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm text-titanium-bright">{left}</p>
        {sub && <p className="truncate text-xs text-titanium">{sub}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs">{right}</div>
    </div>
  );
}

export function Prazo({ d }) {
  if (!d) return <span className="text-titanium-dim">sem prazo</span>;
  const late = isLate(d);
  const hoje = d === today();
  return <span className={`font-mono text-[0.68rem] ${late ? "text-[#ff6bd8]" : hoje ? "text-[#fbbf24]" : "text-titanium"}`}>{hoje ? "hoje" : fmtDate(d)}</span>;
}
