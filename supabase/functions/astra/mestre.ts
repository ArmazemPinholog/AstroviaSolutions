// Modo dono: a conversa do dono com a própria IA (o "Jarvis" da empresa).
// Só é alcançado por: WhatsApp de alguém da equipe (webhook assinado pela Meta) ou login na Sala de Gestão.
// Cada ferramenta age apenas sobre o tenant do dono.
import { aprendizados, sb } from "./nucleo.ts";
import { conversar } from "./gemini.ts";
import { limpar } from "./seguranca.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { executarGestao, ferramentasGestao } from "./gestao.ts";
import { executarProspeccao, ferramentasProspeccao, nomesProspeccao } from "./prospeccao.ts";
import { METODO_VENDAS } from "../_shared/vendas.ts";

const TIPOS = ["regra", "informacao", "preco", "resposta", "tom"];

const ferramentasBase = [
  {
    name: "resumo_negocio",
    description:
      "Panorama dos atendimentos: contatos por status, leads mais quentes, reuniões marcadas, perguntas sem resposta e feedbacks pendentes. Use para 'como estamos?', 'bom dia', relatórios.",
    parameters: { type: "object", properties: { dias: { type: "integer", description: "Período em dias (padrão 7)" } } },
  },
  {
    name: "buscar_contato",
    description: "Procura um contato por nome, telefone ou palavra do resumo e devolve os dados e as últimas mensagens.",
    parameters: { type: "object", properties: { termo: { type: "string" } }, required: ["termo"] },
  },
  {
    name: "ensinar",
    description:
      "Grava um aprendizado permanente que passa a valer imediatamente no atendimento aos clientes. Use quando o dono ensinar algo, corrigir um comportamento, mudar preço ou regra.",
    parameters: {
      type: "object",
      properties: {
        conteudo: { type: "string", description: "O aprendizado, escrito como instrução clara e autossuficiente" },
        tipo: { type: "string", enum: TIPOS },
      },
      required: ["conteudo", "tipo"],
    },
  },
  {
    name: "listar_aprendizados",
    description: "Lista os aprendizados ativos com seus números, para revisar ou desativar.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "esquecer",
    description: "Desativa um aprendizado pelo número. Só use quando o dono pedir explicitamente para esquecer ou remover.",
    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
  },
  {
    name: "perguntas_sem_resposta",
    description: "Lista as perguntas de clientes que a IA não soube responder, com números.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "responder_pergunta",
    description: "Registra a resposta do dono para uma pergunta sem resposta; vira aprendizado.",
    parameters: { type: "object", properties: { id: { type: "string" }, resposta: { type: "string" } }, required: ["id", "resposta"] },
  },
  {
    name: "feedbacks_pendentes",
    description: "Lista correções marcadas pela equipe em respostas da IA.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "aplicar_feedback",
    description: "Transforma uma correção em aprendizado permanente (ou descarta, se o dono não concordar).",
    parameters: { type: "object", properties: { id: { type: "string" }, aplicar: { type: "boolean" } }, required: ["id", "aplicar"] },
  },
  {
    name: "revisar_atendimentos",
    description:
      "Traz as conversas recentes com clientes (resumo, status, pontuação e as últimas mensagens de cada uma), as perguntas sem resposta e as correções da equipe. Use para avaliar a qualidade do atendimento e sugerir melhorias em você mesma, nos preços, na oferta ou no processo.",
    parameters: { type: "object", properties: { quantidade: { type: "integer", description: "Quantas conversas (padrão 10, máx. 20)" } } },
  },
  {
    name: "devolver_para_ia",
    description: "Devolve para a IA uma conversa que estava com a equipe humana.",
    parameters: { type: "object", properties: { contato_id: { type: "string" } }, required: ["contato_id"] },
  },
];

const uuid = (s: unknown) => /^[0-9a-f-]{36}$/i.test(String(s)) ? String(s) : null;

async function executar(t: any, nome: string, a: any, ctx: Ctx) {
  if (t.config?.integrar_gestao) {
    const r = await executarGestao(ctx.db, nome, a, ctx.perfilId);
    if (r) return r;
  }
  switch (nome) {
    case "resumo_negocio": {
      const dias = Math.min(Math.max(Number(a.dias) || 7, 1), 90);
      const desde = new Date(Date.now() - dias * 86400e3).toISOString();
      const { data: cs } = await sb.from("astra_contatos").select("id, nome, status, prioridade, pontuacao, segmento, resumo, handoff, canal, atualizado_em")
        .eq("tenant_id", t.id).neq("canal", "interno").gte("atualizado_em", desde).order("pontuacao", { ascending: false, nullsFirst: false }).limit(200);
      const porStatus: Record<string, number> = {};
      for (const c of cs ?? []) porStatus[c.status] = (porStatus[c.status] ?? 0) + 1;
      const { data: reunioes } = await sb.from("astra_reunioes").select("inicio, contato_id").eq("tenant_id", t.id).eq("status", "marcada").gte(
        "inicio",
        new Date().toISOString(),
      ).order("inicio").limit(10);
      const { count: lacunas } = await sb.from("astra_lacunas").select("id", { count: "exact", head: true }).eq("tenant_id", t.id).eq("status", "pendente");
      const { count: feedbacks } = await sb.from("astra_feedbacks").select("id", { count: "exact", head: true }).eq("tenant_id", t.id).eq("status", "pendente");
      return {
        periodo_dias: dias,
        total_contatos: cs?.length ?? 0,
        por_status: porStatus,
        aguardando_equipe: (cs ?? []).filter((c) => c.handoff).map((c) => ({ id: c.id, nome: c.nome, resumo: c.resumo })).slice(0, 10),
        mais_quentes: (cs ?? []).filter((c) => !c.handoff).slice(0, 5).map((c) => ({
          id: c.id,
          nome: c.nome,
          pontuacao: c.pontuacao,
          segmento: c.segmento,
          resumo: c.resumo,
        })),
        proximas_reunioes: reunioes ?? [],
        perguntas_sem_resposta: lacunas ?? 0,
        feedbacks_pendentes: feedbacks ?? 0,
      };
    }
    case "buscar_contato": {
      const termo = limpar(a.termo, 80).replace(/[%_,()]/g, " ").trim();
      if (!termo) return { erro: "termo vazio" };
      const { data } = await sb.from("astra_contatos").select("id, nome, canal, externo_id, status, prioridade, pontuacao, pais, escopo, resumo, handoff")
        .eq("tenant_id", t.id).neq("canal", "interno")
        .or(`nome.ilike.%${termo}%,externo_id.ilike.%${termo}%,resumo.ilike.%${termo}%`).limit(5);
      const out = [];
      for (const c of data ?? []) {
        const { data: ms } = await sb.from("astra_mensagens").select("papel, conteudo, criado_em").eq("contato_id", c.id).order("criado_em", {
          ascending: false,
        }).limit(8);
        out.push({ ...c, ultimas_mensagens: (ms ?? []).reverse() });
      }
      return out.length ? { contatos: out } : { contatos: [], nota: "nenhum contato encontrado" };
    }
    case "ensinar": {
      const conteudo = limpar(a.conteudo, 1500);
      if (conteudo.length < 3) return { erro: "aprendizado vazio" };
      const tipo = TIPOS.includes(a.tipo) ? a.tipo : "informacao";
      const { data, error } = await sb.from("astra_conhecimento").insert({ tenant_id: t.id, tipo, conteudo, origem: "dono" }).select("id").single();
      return error ? { erro: "não consegui gravar" } : { ok: true, id: data.id, nota: "já vale para os próximos atendimentos" };
    }
    case "listar_aprendizados": {
      const { data } = await sb.from("astra_conhecimento").select("id, tipo, conteudo, origem, criado_em").eq("tenant_id", t.id).eq("ativo", true).order(
        "criado_em",
        { ascending: false },
      ).limit(40);
      return { aprendizados: data ?? [] };
    }
    case "esquecer": {
      const id = Number(a.id);
      if (!Number.isInteger(id)) return { erro: "número inválido" };
      const { data } = await sb.from("astra_conhecimento").update({ ativo: false, desativado_em: new Date().toISOString() }).eq("tenant_id", t.id).eq("id", id)
        .select("id").maybeSingle();
      return data ? { ok: true } : { erro: "aprendizado não encontrado" };
    }
    case "perguntas_sem_resposta": {
      const { data } = await sb.from("astra_lacunas").select("id, pergunta, criado_em").eq("tenant_id", t.id).eq("status", "pendente").order("criado_em", {
        ascending: false,
      }).limit(20);
      return { perguntas: data ?? [] };
    }
    case "responder_pergunta": {
      const id = uuid(a.id), resposta = limpar(a.resposta, 1200);
      if (!id || !resposta) return { erro: "dados inválidos" };
      const { data: l } = await sb.from("astra_lacunas").update({ status: "respondida", resposta }).eq("tenant_id", t.id).eq("id", id).select("pergunta")
        .maybeSingle();
      if (!l) return { erro: "pergunta não encontrada" };
      await sb.from("astra_conhecimento").insert({
        tenant_id: t.id,
        tipo: "resposta",
        conteudo: `Se perguntarem "${l.pergunta.slice(0, 300)}": ${resposta}`,
        origem: "lacuna",
      });
      return { ok: true };
    }
    case "feedbacks_pendentes": {
      const { data } = await sb.from("astra_feedbacks").select("id, resposta_ia, avaliacao, correcao, criado_em").eq("tenant_id", t.id).eq("status", "pendente")
        .eq("avaliacao", "ruim").order("criado_em", { ascending: false }).limit(20);
      return { feedbacks: data ?? [] };
    }
    case "aplicar_feedback": {
      const id = uuid(a.id);
      if (!id) return { erro: "id inválido" };
      const { data: f } = await sb.from("astra_feedbacks").update({ status: a.aplicar ? "aplicado" : "descartado" }).eq("tenant_id", t.id).eq("id", id).select(
        "resposta_ia, correcao",
      ).maybeSingle();
      if (!f) return { erro: "feedback não encontrado" };
      if (a.aplicar && f.correcao) {
        await sb.from("astra_conhecimento").insert({
          tenant_id: t.id,
          tipo: "resposta",
          conteudo: `Em vez de responder "${f.resposta_ia.slice(0, 300)}", responda no estilo: ${f.correcao}`,
          origem: "feedback",
        });
      }
      return { ok: true };
    }
    case "revisar_atendimentos": {
      const qtd = Math.min(Math.max(Number(a.quantidade) || 10, 1), 20);
      const { data: cs } = await sb.from("astra_contatos").select("id, nome, canal, origem, status, pontuacao, segmento, resumo, handoff, handoff_motivo")
        .eq("tenant_id", t.id).neq("canal", "interno").order("atualizado_em", { ascending: false }).limit(qtd);
      const conversas = await Promise.all((cs ?? []).map(async (c) => {
        const { data: ms } = await sb.from("astra_mensagens").select("papel, conteudo").eq("contato_id", c.id).order("criado_em", { ascending: false }).limit(
          10,
        );
        return { ...c, mensagens: (ms ?? []).reverse().map((x) => `${x.papel}: ${x.conteudo.slice(0, 400)}`) };
      }));
      const [{ data: lac }, { data: fb }] = await Promise.all([
        sb.from("astra_lacunas").select("pergunta").eq("tenant_id", t.id).eq("status", "pendente").limit(15),
        sb.from("astra_feedbacks").select("resposta_ia, avaliacao, correcao").eq("tenant_id", t.id).order("criado_em", { ascending: false }).limit(15),
      ]);
      return { conversas, perguntas_sem_resposta: lac ?? [], correcoes_da_equipe: fb ?? [] };
    }
    case "devolver_para_ia": {
      const id = uuid(a.contato_id);
      if (!id) return { erro: "id inválido" };
      const { data } = await sb.from("astra_contatos").update({ handoff: false, handoff_motivo: null }).eq("tenant_id", t.id).eq("id", id).select("id")
        .maybeSingle();
      return data ? { ok: true } : { erro: "contato não encontrado" };
    }
  }
  return { erro: "ferramenta desconhecida" };
}

export type Ctx = { db: SupabaseClient; perfilId?: string; nomeDono?: string; auth?: string };

export async function mestre(tenantSlug: string, texto: string, ctx: Ctx) {
  const { data: t } = await sb.from("astra_tenants").select("*").eq("slug", tenantSlug).eq("ativo", true).maybeSingle();
  if (!t) throw new Error("tenant não encontrado");

  // conversa do dono fica num contato interno, separado dos clientes
  let { data: c } = await sb.from("astra_contatos").select("id").eq("tenant_id", t.id).eq("canal", "interno").eq("externo_id", "dono").maybeSingle();
  if (!c) {
    c =
      (await sb.from("astra_contatos").insert({ tenant_id: t.id, canal: "interno", externo_id: "dono", nome: "Dono", status: "cliente" }).select("id").single())
        .data;
  }
  await sb.from("astra_mensagens").insert({ tenant_id: t.id, contato_id: c!.id, papel: "equipe", conteudo: limpar(texto) });

  const { data: hist } = await sb.from("astra_mensagens").select("papel, conteudo").eq("contato_id", c!.id).order("criado_em", { ascending: false }).limit(20);
  const contents: any[] = (hist ?? []).reverse().map((m) => ({ role: m.papel === "agente" ? "model" : "user", parts: [{ text: m.conteudo }] }));
  while (contents.length && contents[0].role !== "user") contents.shift();

  const nomeIA = t.config?.nome_ia ?? "a assistente";
  const gestao = !!t.config?.integrar_gestao;
  const ferramentas = [{ functionDeclarations: gestao ? [...ferramentasBase, ...ferramentasGestao, ...ferramentasProspeccao] : ferramentasBase }];
  const system = `Você é ${nomeIA}, a inteligência interna de ${t.nome}. Agora você está conversando com ${
    ctx.nomeDono ? ctx.nomeDono + ", da equipe dona da empresa" : "o DONO da empresa"
  }, não com um cliente.${
    gestao
      ? "\nVocê é a consciência da empresa: enxerga e opera a Sala de Gestão inteira (funil de vendas, clientes, projetos, financeiro, tarefas, prospecção e os atendimentos que você mesma faz). Cruze essas informações para aconselhar: o que está atrasado, onde está o dinheiro, quem está quente, o que fazer primeiro. Ao criar tarefas ou mudar negócios, confirme o que fez."
      : ""
  }
Seu papel: ser o braço direito dele, como uma funcionária exemplar e leal. Relate com precisão, aprenda o que ele ensinar, aponte oportunidades e problemas, sugira próximos passos.
- Respostas diretas e úteis, em português, sem enrolação. Use números quando tiver.
- Use as ferramentas para consultar dados reais; nunca invente números, nomes ou conversas.
- Quando ele ensinar algo, corrigir um comportamento ou mudar uma regra/preço: reescreva como instrução clara e chame ensinar. Confirme em uma frase o que gravou.
- Antes de esquecer um aprendizado, confirme qual é. Nunca apague dados de clientes.
- Se ele pedir algo que você não consegue fazer pelas ferramentas, diga com clareza.
- Seja proativa como uma funcionária de confiança: em relatórios e balanços, termine com UMA sugestão concreta de melhoria (no negócio, no processo de vendas ou em você mesma), dizendo o porquê. Quando ele pedir avaliação do atendimento, use revisar_atendimentos e aponte o que mudar na sua base, no tom ou na oferta, propondo o texto exato para ele aprovar.
- Prospecção: você acha clientes novos para a empresa. Quando ele pedir leads ou clientes, garimpe (garimpar_clientes), escolha os melhores, investigue (investigar_lead) e prepare a mensagem (preparar_abordagem), no máximo 3 por vez. As mensagens ficam em rascunho na aba Prospecção para ele aprovar e enviar: nunca diga que enviou. Ao apresentar, diga por que cada lead é bom em uma frase. Lembre dos follow-ups pendentes (abordagens_pendentes).
- Você tem autonomia sobre a prospecção: quando ele pedir, descarte leads ruins (descartar_leads), limpe a fila (descartar_rascunhos), refaça mensagens (preparar_abordagem substitui o rascunho antigo) ou troque o texto (editar_mensagem), e mude as regras das mensagens e os nichos/meta da rotina (ajustar_regras_prospeccao, lendo antes com ver_regras_prospeccao). Quando ele corrigir como as mensagens devem falar, além de ensinar, ajuste as regras e refaça os rascunhos pendentes. Nunca diga que fez algo que nenhuma ferramenta confirmou.
- Melhorias no próprio sistema: quando ele pedir mudança em tela, texto, layout ou comportamento do site ou da sala, use pedir_melhoria com um pedido claro e completo. Um agente de código faz e abre uma proposta com prévia em Astra → Melhorias; ele aprova no botão (você nunca publica). Acompanhe com ver_melhorias. Também pode sugerir melhorias que você perceber, mas só peça depois que ele concordar.
- Você também é a gerente comercial dele: quando ele perguntar como responder um lead, como contornar uma objeção ou qual o próximo passo, responda pelo método de vendas abaixo, dizendo a etapa em que a conversa está e sugerindo a mensagem exata.
- Rotina diária: toda manhã, sozinha, você garimpa (Google Maps e CNPJs recém-abertos da Receita), investiga e deixa até 10 leads com mensagem e os follow-ups da cadência (leve no 3º dia, com valor 7 dias depois, despedida 10 dias depois), tudo em rascunho em Aprovar envios. Para números e balanço da prospecção use resultados_prospeccao. Só rode a rotina fora de hora (rodar_rotina_agora) se ele pedir.
- Preços reais da Astrovia: sistema próprio R$ 500 pagamento único, 7 dias de teste grátis, manutenção opcional R$ 80/mês. Nunca prometa economia nem diga que o WhatsApp vai cobrar. O primeiro contato com qualquer lead é sempre aprovado por ele.
- Escreva para ser lida em voz alta também: frases curtas, sem tabelas, sem markdown, números por extenso quando forem poucos.
Data e hora: ${
    new Intl.DateTimeFormat("pt-BR", { timeZone: t.config?.agenda?.fuso ?? "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" }).format(new Date())
  }.

# Método de vendas
${METODO_VENDAS}

# O que você sabe sobre a empresa (base usada no atendimento aos clientes)
<base>
${t.base_conhecimento}
</base>
# Aprendizados ativos
<aprendizados>
${await aprendizados(t.id) || "(nenhum ainda)"}
</aprendizados>`;

  let resposta = "";
  const acoes: string[] = [], ensinados: string[] = [];
  for (let rodada = 0; rodada < 6; rodada++) {
    let content: any;
    try {
      content = await conversar(system, contents, ferramentas, 0.4, {
        motor: t.config?.motor?.dono,
        modelo: t.config?.motor?.modelo_dono,
        pensar: "normal",
      });
    } catch (e) {
      console.error("mestre sem IA", String(e).slice(0, 200));
      if (!resposta) {
        resposta = "Estou sem cota de inteligência artificial agora: o limite gratuito do Gemini acabou por hoje. " +
          "Ele volta sozinho em algumas horas. Para não depender disso, ative o faturamento no Google AI Studio ou cadastre a chave do Claude.";
      }
      break;
    }
    contents.push(content);
    const chamadas = content.parts.filter((p: any) => p.functionCall);
    const textos = content.parts.filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join("").trim();
    if (textos) resposta = textos;
    if (!chamadas.length) break;
    // ferramentas da mesma rodada rodam em paralelo (respostas mais rápidas)
    const respostas = await Promise.all(
      chamadas.slice(0, 5).map(async (p: any) => {
        let r: unknown;
        acoes.push(p.functionCall.name);
        try {
          r = nomesProspeccao.has(p.functionCall.name)
            ? await executarProspeccao(ctx.db, p.functionCall.name, p.functionCall.args ?? {}, ctx.auth)
            : await executar(t, p.functionCall.name, p.functionCall.args ?? {}, ctx);
          if (p.functionCall.name === "ensinar" && (r as any)?.ok) ensinados.push(limpar(p.functionCall.args?.conteudo, 300));
        } catch (e) {
          console.error("mestre", p.functionCall.name, e);
          r = { erro: "falha interna" };
        }
        return { functionResponse: { name: p.functionCall.name, response: r } };
      }),
    );
    contents.push({ role: "user", parts: respostas });
  }
  resposta = (resposta || "Pronto.").slice(0, 3000);
  await sb.from("astra_mensagens").insert({ tenant_id: t.id, contato_id: c!.id, papel: "agente", conteudo: resposta });
  return { resposta, acoes, ensinados };
}
