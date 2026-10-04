// Consciência da Astra sobre a Sala de Gestão: funil, clientes, projetos, financeiro, tarefas e prospecção.
// `db` é o cliente de quem está falando (token do usuário → valem as regras de RLS da sala)
// ou o service role quando o dono fala pelo WhatsApp (identidade confirmada pelo número do perfil).
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { limpar } from "./seguranca.ts";

const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
const brl = (v: number) => Math.round(v * 100) / 100;
const uuid = (s: unknown) => /^[0-9a-f-]{36}$/i.test(String(s)) ? String(s) : null;
const dataISO = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? String(s) : null;
const ETAPAS = ["lead", "contato", "proposta", "negociacao", "fechado", "perdido"];

export const ferramentasGestao = [
  {
    name: "panorama_empresa",
    description:
      "Visão completa da Astrovia agora: funil de vendas por etapa com valores, negócios fechados no mês, projetos em andamento e prazos, tarefas atrasadas e da semana, financeiro do mês (receitas, despesas, a receber vencido), prospecção (leads quentes, sem abordagem, que responderam) e atendimentos da Astra. Use para 'bom dia', 'como estamos', 'o que faço hoje', relatórios.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "buscar_na_gestao",
    description:
      "Procura clientes, negócios, projetos e prospects pelo nome ou empresa, com o histórico relevante (etapa, valores, próximos passos, notas, tarefas).",
    parameters: { type: "object", properties: { termo: { type: "string" } }, required: ["termo"] },
  },
  {
    name: "criar_tarefa",
    description: "Cria uma tarefa na sala de gestão. Use quando o dono pedir para lembrar, agendar algo a fazer ou quando combinarem um próximo passo.",
    parameters: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        descricao: { type: "string" },
        prazo: { type: "string", description: "AAAA-MM-DD" },
        prioridade: { type: "string", enum: ["baixa", "media", "alta"] },
        cliente_id: { type: "string" },
      },
      required: ["titulo"],
    },
  },
  {
    name: "concluir_tarefa",
    description: "Marca uma tarefa como concluída pelo id.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "atualizar_negocio",
    description:
      "Atualiza um negócio do funil: etapa, próximo passo, data do próximo passo, valor, valor mensal, probabilidade ou motivo de perda. Só altere o que o dono pediu.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        etapa: { type: "string", enum: ETAPAS },
        proximo_passo: { type: "string" },
        proxima_data: { type: "string", description: "AAAA-MM-DD" },
        valor: { type: "number" },
        valor_mensal: { type: "number" },
        probabilidade: { type: "integer" },
        motivo_perda: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "registrar_nota",
    description: "Registra uma nota no histórico de um cliente (ligação, reunião, WhatsApp, e-mail ou nota).",
    parameters: {
      type: "object",
      properties: {
        cliente_id: { type: "string" },
        texto: { type: "string" },
        tipo: { type: "string", enum: ["nota", "ligacao", "reuniao", "whatsapp", "email"] },
      },
      required: ["cliente_id", "texto"],
    },
  },
];

export async function executarGestao(db: SupabaseClient, nome: string, a: any, perfilId?: string) {
  switch (nome) {
    case "panorama_empresa": {
      const d = hoje(), mes = d.slice(0, 7) + "-01";
      const prox = new Date(Date.now() + 7 * 86400e3).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      const [neg, proj, tar, lanc, prosp, abord, astra] = await Promise.all([
        db.from("gestao_negocios").select("id, titulo, etapa, valor, valor_mensal, probabilidade, proximo_passo, proxima_data, fechado_em").limit(500),
        db.from("gestao_projetos").select("id, nome, status, progresso, prazo").not("status", "in", "(entregue,pausado)").order("prazo", { nullsFirst: false })
          .limit(20),
        db.from("gestao_tarefas").select("id, titulo, prazo, prioridade").eq("concluida", false).order("prazo", { nullsFirst: false }).limit(60),
        db.from("gestao_lancamentos").select("tipo, valor, vencimento, pago_em").gte(
          "vencimento",
          new Date(Date.now() - 120 * 86400e3).toISOString().slice(0, 10),
        ).limit(1000),
        db.from("gestao_prospects").select("id, nome, nicho, cidade, score, status, quente, quente_motivo").limit(1000),
        db.from("gestao_abordagens").select("id", { count: "exact", head: true }).eq("status", "rascunho"),
        db.from("astra_contatos").select("status, handoff, pontuacao, nome, resumo").neq("canal", "interno").gte(
          "atualizado_em",
          new Date(Date.now() - 7 * 86400e3).toISOString(),
        ).limit(300),
      ]);
      const N = neg.data ?? [];
      const funil: Record<string, { qtd: number; valor: number; mensal: number }> = {};
      for (const n of N) {
        const f = funil[n.etapa] ??= { qtd: 0, valor: 0, mensal: 0 };
        f.qtd++;
        f.valor += Number(n.valor) || 0;
        f.mensal += Number(n.valor_mensal) || 0;
      }
      const abertos = N.filter((n) => !["fechado", "perdido"].includes(n.etapa));
      const previsto = abertos.reduce((s, n) => s + (Number(n.valor) || 0) * (Number(n.probabilidade) || 0) / 100, 0);
      const T = tar.data ?? [];
      const L = lanc.data ?? [];
      const doMes = L.filter((l) => l.vencimento >= mes);
      const soma = (arr: typeof L, tipo: string, pago?: boolean) =>
        brl(arr.filter((l) => l.tipo === tipo && (pago === undefined || !!l.pago_em === pago)).reduce((s, l) => s + Number(l.valor), 0));
      const P = prosp.data ?? [];
      const A = astra.data ?? [];
      return {
        data: d,
        funil_por_etapa: funil,
        receita_prevista_ponderada: brl(previsto),
        fechados_no_mes: N.filter((n) => n.etapa === "fechado" && (n.fechado_em ?? "") >= mes).map((n) => ({
          titulo: n.titulo,
          valor: n.valor,
          mensal: n.valor_mensal,
        })),
        proximos_passos_atrasados: abertos.filter((n) => n.proxima_data && n.proxima_data < d).slice(0, 10).map((n) => ({
          id: n.id,
          titulo: n.titulo,
          etapa: n.etapa,
          proximo_passo: n.proximo_passo,
          data: n.proxima_data,
        })),
        negocios_sem_proximo_passo: abertos.filter((n) => !n.proximo_passo).length,
        projetos_ativos: proj.data ?? [],
        tarefas: {
          atrasadas: T.filter((t) => t.prazo && t.prazo < d).slice(0, 10),
          hoje: T.filter((t) => t.prazo === d),
          proximos_7_dias: T.filter((t) => t.prazo && t.prazo > d && t.prazo <= prox).slice(0, 10),
          sem_prazo: T.filter((t) => !t.prazo).length,
        },
        financeiro_mes: {
          receitas_recebidas: soma(doMes, "receita", true),
          receitas_a_receber: soma(doMes, "receita", false),
          despesas_pagas: soma(doMes, "despesa", true),
          despesas_a_pagar: soma(doMes, "despesa", false),
          receitas_vencidas_nao_recebidas: soma(L.filter((l) => l.vencimento < d), "receita", false),
        },
        prospeccao: {
          total: P.length,
          por_status: P.reduce((o: Record<string, number>, p) => (o[p.status] = (o[p.status] ?? 0) + 1, o), {}),
          quentes: P.filter((p) => p.quente && p.status !== "descartado").slice(0, 8).map((p) => ({
            id: p.id,
            nome: p.nome,
            nicho: p.nicho,
            cidade: p.cidade,
            motivo: p.quente_motivo,
            score: p.score,
          })),
          melhores_sem_abordagem: P.filter((p) => p.status === "novo").sort((x, y) => (y.score ?? 0) - (x.score ?? 0)).slice(0, 5).map((p) => ({
            id: p.id,
            nome: p.nome,
            nicho: p.nicho,
            score: p.score,
          })),
          abordagens_em_rascunho: abord.count ?? 0,
        },
        atendimentos_astra_7_dias: {
          total: A.length,
          aguardando_equipe: A.filter((c) => c.handoff).map((c) => ({ nome: c.nome, resumo: c.resumo })).slice(0, 8),
          qualificados: A.filter((c) => ["qualificado", "reuniao"].includes(c.status)).length,
        },
      };
    }
    case "buscar_na_gestao": {
      const termo = limpar(a.termo, 60).replace(/[%_,()]/g, " ").trim();
      if (termo.length < 2) return { erro: "termo curto demais" };
      const like = `%${termo}%`;
      const [cli, neg, proj, prosp] = await Promise.all([
        db.from("gestao_clientes").select("id, nome, empresa, segmento, cidade, status, whatsapp, observacoes").or(`nome.ilike.${like},empresa.ilike.${like}`)
          .limit(5),
        db.from("gestao_negocios").select("id, titulo, etapa, valor, valor_mensal, probabilidade, proximo_passo, proxima_data, cliente_id").ilike(
          "titulo",
          like,
        ).limit(5),
        db.from("gestao_projetos").select("id, nome, status, progresso, prazo, cliente_id").ilike("nome", like).limit(5),
        db.from("gestao_prospects").select("id, nome, nicho, cidade, status, score, quente, quente_motivo").ilike("nome", like).limit(5),
      ]);
      const clientes = [];
      for (const c of cli.data ?? []) {
        const [n2, notas, tarefas] = await Promise.all([
          db.from("gestao_negocios").select("id, titulo, etapa, valor, proximo_passo, proxima_data").eq("cliente_id", c.id).limit(5),
          db.from("gestao_notas").select("tipo, texto, criado_em").eq("cliente_id", c.id).order("criado_em", { ascending: false }).limit(5),
          db.from("gestao_tarefas").select("id, titulo, prazo, concluida").eq("cliente_id", c.id).eq("concluida", false).limit(5),
        ]);
        clientes.push({ ...c, negocios: n2.data ?? [], ultimas_notas: notas.data ?? [], tarefas_abertas: tarefas.data ?? [] });
      }
      return { clientes, negocios: neg.data ?? [], projetos: proj.data ?? [], prospects: prosp.data ?? [] };
    }
    case "criar_tarefa": {
      const titulo = limpar(a.titulo, 200);
      if (!titulo) return { erro: "título vazio" };
      const row: Record<string, unknown> = {
        titulo,
        descricao: a.descricao ? limpar(a.descricao, 1000) : null,
        prazo: dataISO(a.prazo),
        prioridade: ["baixa", "media", "alta"].includes(a.prioridade) ? a.prioridade : "media",
        cliente_id: uuid(a.cliente_id),
        responsavel: perfilId ?? null,
      };
      if (perfilId) row.criado_por = perfilId;
      const { data, error } = await db.from("gestao_tarefas").insert(row).select("id").single();
      return error ? { erro: "não consegui criar a tarefa" } : { ok: true, id: data.id };
    }
    case "concluir_tarefa": {
      const id = uuid(a.id);
      if (!id) return { erro: "id inválido" };
      const { data } = await db.from("gestao_tarefas").update({ concluida: true, concluida_em: new Date().toISOString() }).eq("id", id).select("id")
        .maybeSingle();
      return data ? { ok: true } : { erro: "tarefa não encontrada" };
    }
    case "atualizar_negocio": {
      const id = uuid(a.id);
      if (!id) return { erro: "id inválido" };
      const upd: Record<string, unknown> = {};
      if (ETAPAS.includes(a.etapa)) {
        upd.etapa = a.etapa;
        if (a.etapa === "fechado") upd.fechado_em = hoje();
      }
      if (a.proximo_passo) upd.proximo_passo = limpar(a.proximo_passo, 300);
      if (dataISO(a.proxima_data)) upd.proxima_data = a.proxima_data;
      for (const k of ["valor", "valor_mensal"]) if (Number.isFinite(Number(a[k])) && Number(a[k]) >= 0 && a[k] !== undefined) upd[k] = Number(a[k]);
      if (Number.isInteger(Number(a.probabilidade)) && a.probabilidade !== undefined) upd.probabilidade = Math.max(0, Math.min(100, Number(a.probabilidade)));
      if (a.motivo_perda) upd.motivo_perda = limpar(a.motivo_perda, 300);
      if (!Object.keys(upd).length) return { erro: "nada para atualizar" };
      const { data } = await db.from("gestao_negocios").update(upd).eq("id", id).select("id, titulo, etapa").maybeSingle();
      return data ? { ok: true, negocio: data } : { erro: "negócio não encontrado" };
    }
    case "registrar_nota": {
      const cliente_id = uuid(a.cliente_id), texto = limpar(a.texto, 2000);
      if (!cliente_id || !texto) return { erro: "dados inválidos" };
      const row: Record<string, unknown> = { cliente_id, texto, tipo: ["nota", "ligacao", "reuniao", "whatsapp", "email"].includes(a.tipo) ? a.tipo : "nota" };
      if (perfilId) row.autor = perfilId;
      const { error } = await db.from("gestao_notas").insert(row);
      return error ? { erro: "não consegui registrar" } : { ok: true };
    }
  }
  return null; // não é ferramenta da gestão
}

// ---------- integração automática do atendimento com a sala ----------
const digitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** contato novo no WhatsApp: se for um prospect que a Astrovia abordou, liga os dois e marca que respondeu */
export async function ligarProspect(sb: SupabaseClient, contatoId: string, telefone: string) {
  const fim = digitos(telefone).slice(-10);
  if (fim.length < 10) return null;
  const { data } = await sb.from("gestao_prospects").select("id, nome, status, telefone").not("telefone", "is", null).limit(2000);
  const p = (data ?? []).find((x) => digitos(x.telefone).slice(-10) === fim);
  if (!p) return null;
  await sb.from("astra_contatos").update({ prospect_id: p.id, origem: "prospeccao" }).eq("id", contatoId);
  if (["novo", "abordado"].includes(p.status)) await sb.from("gestao_prospects").update({ status: "respondeu" }).eq("id", p.id);
  return p;
}

/** lead qualificado vira cliente + negócio no funil (uma vez); depois só atualiza a probabilidade e o próximo passo */
export async function sincronizarFunil(sb: SupabaseClient, c: any) {
  if (!["qualificado", "reuniao"].includes(c.status)) return c;
  const proximo = c.status === "reuniao" ? "Call marcada pela Astra" : "Retomar contato: lead qualificado pela Astra";
  if (c.negocio_id) {
    await sb.from("gestao_negocios").update({ probabilidade: c.pontuacao ?? 50, proximo_passo: proximo }).eq("id", c.negocio_id);
    return c;
  }
  let clienteId = c.cliente_id;
  if (!clienteId) {
    const { data: cli } = await sb.from("gestao_clientes").insert({
      nome: c.nome || "Lead da Astra",
      segmento: c.segmento,
      cidade: c.pais,
      whatsapp: c.canal === "whatsapp" ? c.externo_id : null,
      origem: c.origem === "prospeccao" ? "Prospecção + Astra" : "Astra",
      status: "prospect",
      observacoes: [c.resumo, c.escopo].filter(Boolean).join("\n"),
    }).select("id").single();
    clienteId = cli?.id;
  }
  if (!clienteId) return c;
  const { data: neg } = await sb.from("gestao_negocios").insert({
    cliente_id: clienteId,
    titulo: `${c.interesse || c.segmento || "Novo lead"} — ${c.nome || "lead da Astra"}`.slice(0, 160),
    etapa: "contato",
    probabilidade: c.pontuacao ?? 50,
    proximo_passo: proximo,
    proxima_data: new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }),
  }).select("id").single();
  const { data: atualizado } = await sb.from("astra_contatos").update({ cliente_id: clienteId, negocio_id: neg?.id ?? null }).eq("id", c.id).select().single();
  if (c.prospect_id && neg?.id) {
    await sb.from("gestao_prospects").update({ status: "no_funil", cliente_id: clienteId, negocio_id: neg.id }).eq("id", c.prospect_id);
  }
  return atualizado ?? c;
}
