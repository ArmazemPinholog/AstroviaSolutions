// Prospecção pela Astra: ela comanda o motor de garimpo da Sala (função gestao-agente)
// com o login de quem está falando com ela, então valem as mesmas regras de acesso da sala.
// Nada é enviado ao lead daqui: a Astra só garimpa, investiga e deixa a mensagem em rascunho.
// O envio continua sendo aprovado pelo Christian em "Aprovar envios".
// A rotina diária (gestao-agente, ação "rotina") faz o mesmo sozinha toda manhã, pelo pg_cron.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { limpar } from "./seguranca.ts";

const uuid = (v: unknown) => /^[0-9a-f-]{36}$/i.test(String(v ?? "")) ? String(v) : null;

export const ferramentasProspeccao = [
  {
    name: "garimpar_clientes",
    description:
      "Busca novos negócios no Google Maps para prospectar (ex.: 'barbearia' em 'Curitiba') e salva os que se encaixam no cliente ideal, com nota de 0 a 100. Use quando ele pedir para achar clientes ou leads.",
    parameters: {
      type: "object",
      properties: {
        busca: { type: "string", description: "Tipo de negócio, ex.: barbearia, clínica de estética, oficina mecânica" },
        cidade: { type: "string", description: "Cidade ou bairro, ex.: Curitiba, Batel Curitiba" },
        paginas: { type: "integer", description: "1 a 3 (cada página traz até 20 negócios). Padrão 1." },
      },
      required: ["busca"],
    },
  },
  {
    name: "leads_para_abordar",
    description: "Lista os melhores leads ainda não abordados (maior nota primeiro), dizendo se já foram investigados e se já têm mensagem pronta.",
    parameters: {
      type: "object",
      properties: { limite: { type: "integer", description: "Padrão 8" }, nicho: { type: "string", description: "Filtrar por tipo de negócio (opcional)" } },
    },
  },
  {
    name: "investigar_lead",
    description: "Lê avaliações do Google e o site do lead e monta o dossiê: quem é o dono, dores, se é um bom momento. Faça antes de preparar a abordagem.",
    parameters: { type: "object", properties: { prospect_id: { type: "string" } }, required: ["prospect_id"] },
  },
  {
    name: "preparar_abordagem",
    description:
      "Escreve (ou REESCREVE) a primeira mensagem ou o follow-up de um lead e deixa em RASCUNHO em Aprovar envios. Se o lead já tinha rascunho, o antigo é substituído pelo novo. Use também para 'refazer/atualizar a mensagem' com uma instrução. Nunca diga que a mensagem foi enviada.",
    parameters: {
      type: "object",
      properties: {
        prospect_id: { type: "string" },
        canal: { type: "string", enum: ["whatsapp", "instagram", "email"] },
        tipo: { type: "string", enum: ["primeiro_contato", "followup"] },
        instrucao: { type: "string", description: "Orientação extra do Christian, se houver" },
      },
      required: ["prospect_id"],
    },
  },
  {
    name: "resultados_prospeccao",
    description:
      "Números da prospecção num período: leads novos (por fonte), abordados, respostas, reuniões, taxa de resposta e como foi a rotina automática de hoje. Use para 'como está a prospecção', relatórios e balanços.",
    parameters: { type: "object", properties: { dias: { type: "integer", description: "Período em dias (padrão 7)" } } },
  },
  {
    name: "rodar_rotina_agora",
    description:
      "Roda agora um lote extra da rotina de prospecção: garimpa, investiga e enche a fila de Aprovar envios até a meta (conta só o que ainda espera aprovação, então funciona mesmo depois de ele já ter enviado os do dia). Só use quando ele pedir.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "editar_mensagem",
    description:
      "Troca o texto do rascunho de um lead por um texto exato (quando o Christian ditar a mensagem ou pedir um ajuste pontual que você mesma reescreveu). As outras versões desse lead saem da fila. Continua em rascunho para ele aprovar.",
    parameters: { type: "object", properties: { prospect_id: { type: "string" }, texto: { type: "string" } }, required: ["prospect_id", "texto"] },
  },
  {
    name: "descartar_rascunhos",
    description: "Tira mensagens da fila de Aprovar envios (marca como descartadas). Passe os prospect_ids, ou todos=true para limpar a fila inteira. O lead continua salvo.",
    parameters: {
      type: "object",
      properties: { prospect_ids: { type: "array", items: { type: "string" } }, todos: { type: "boolean" } },
    },
  },
  {
    name: "descartar_leads",
    description:
      "Exclui leads que não servem: marca como descartados (somem das listas e da rotina, e não voltam em garimpos futuros) e tira os rascunhos deles da fila. Só mexe em leads ainda não abordados. Passe prospect_ids, ou nicho (ex.: barbearia), ou todos_novos=true. Confirme com o Christian antes de usar todos_novos.",
    parameters: {
      type: "object",
      properties: {
        prospect_ids: { type: "array", items: { type: "string" } },
        nicho: { type: "string" },
        todos_novos: { type: "boolean" },
        motivo: { type: "string" },
      },
    },
  },
  {
    name: "ver_regras_prospeccao",
    description: "Mostra as regras que o gerador de mensagens segue (sempre, nunca, chamada final, tamanho, emoji, formalidade, exemplo) e a configuração da rotina diária (meta, nichos, cidade, nota mínima).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "ajustar_regras_prospeccao",
    description:
      "Ajusta as regras das mensagens de prospecção e a rotina diária quando o Christian pedir (ex.: 'pare de falar de logo', 'procure só clínicas', '15 leads por dia'). Mande só os campos que mudam. sempre/nunca/extra substituem o texto inteiro do campo: leia antes com ver_regras_prospeccao e reescreva preservando o que continua valendo.",
    parameters: {
      type: "object",
      properties: {
        sempre: { type: "string" },
        nunca: { type: "string" },
        cta: { type: "string", description: "Como terminar a mensagem" },
        extra: { type: "string" },
        exemplo: { type: "string", description: "Mensagem modelo no estilo certo" },
        tamanho: { type: "string", enum: ["curta", "media", "longa"] },
        emoji: { type: "string", enum: ["nenhum", "um"] },
        formalidade: { type: "string", enum: ["informal", "equilibrada", "formal"] },
        nichos_rotina: { type: "array", items: { type: "string" }, description: "Tipos de negócio que a rotina garimpa, em ordem" },
        meta_diaria: { type: "integer" },
        nota_minima: { type: "integer" },
        rotina_ativa: { type: "boolean" },
        cidade: { type: "string" },
      },
    },
  },
  {
    name: "pedir_melhoria",
    description:
      "Pede uma melhoria no CÓDIGO do site ou da Sala de Gestão (telas, textos, layout, comportamento). Um agente de código faz a mudança e abre uma proposta com link de prévia em Astra → Melhorias. Você não publica: só o Christian, no botão. Escreva o pedido completo e específico (onde, o quê, como deve ficar). Use quando ele pedir mudanças no sistema que as outras ferramentas não fazem.",
    parameters: { type: "object", properties: { pedido: { type: "string" } }, required: ["pedido"] },
  },
  {
    name: "ver_melhorias",
    description: "Situação das melhorias de código: em andamento, propostas esperando aprovação (com link de prévia), as que não deram certo e as já publicadas.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "abordagens_pendentes",
    description: "Mensagens em rascunho esperando aprovação do Christian, e leads abordados há mais de 3 dias sem resposta (precisam de follow-up).",
    parameters: { type: "object", properties: {} },
  },
];

export const nomesProspeccao = new Set(ferramentasProspeccao.map((f) => f.name));

async function agente(auth: string | undefined, corpo: Record<string, unknown>) {
  if (!auth) return { erro: "A prospecção só funciona pela Sala de Gestão por enquanto (precisa do seu login). Peça por lá." };
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/gestao-agente`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
    body: JSON.stringify(corpo),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { erro: String(d?.erro ?? `falha ${r.status}`).slice(0, 300) };
  return d;
}

const resumoLead = (p: any) => ({
  id: p.id,
  nome: p.nome,
  nicho: p.nicho,
  cidade: p.cidade,
  nota: p.score,
  motivos: (p.motivos ?? []).slice(0, 3),
  google: p.nota_google ? `${p.nota_google} (${p.avaliacoes ?? 0} avaliações)` : null,
  tem_whatsapp: !!p.telefone,
  instagram: p.instagram,
  quente: p.quente || undefined,
  fonte: p.fonte === "receita" ? `CNPJ novo${p.aberto_em ? `, aberto em ${String(p.aberto_em).split("-").reverse().join("/")}` : ""}` : undefined,
});

export async function executarProspeccao(db: SupabaseClient, nome: string, a: any, auth?: string) {
  switch (nome) {
    case "garimpar_clientes": {
      const busca = limpar(a.busca, 80);
      if (!busca) return { erro: "diga o tipo de negócio" };
      const d: any = await agente(auth, { acao: "garimpar_google", busca, cidade: limpar(a.cidade, 80), paginas: Math.min(3, Math.max(1, Number(a.paginas) || 1)) });
      if (d.erro) return d;
      const novos = (d.novos ?? []).sort((x: any, y: any) => (y.score ?? 0) - (x.score ?? 0));
      return {
        encontrados: d.encontrados,
        novos_salvos: novos.length,
        ja_tinhamos: d.repetidos ?? 0,
        fora_do_perfil: d.fora_perfil ?? 0,
        melhores: novos.slice(0, 8).map(resumoLead),
      };
    }
    case "leads_para_abordar": {
      const limite = Math.min(20, Math.max(1, Number(a.limite) || 8));
      let q = db.from("gestao_prospects").select("id, nome, nicho, cidade, score, motivos, nota_google, avaliacoes, telefone, instagram, quente, investigado_em, fonte, aberto_em")
        .eq("status", "novo").order("quente", { ascending: false }).order("score", { ascending: false }).limit(limite);
      if (a.nicho) q = q.ilike("nicho", `%${limpar(a.nicho, 60)}%`);
      const { data } = await q;
      const ids = (data ?? []).map((p) => p.id);
      const { data: rasc } = ids.length
        ? await db.from("gestao_abordagens").select("prospect_id").in("prospect_id", ids).eq("status", "rascunho")
        : { data: [] as { prospect_id: string }[] };
      const comRascunho = new Set((rasc ?? []).map((r) => r.prospect_id));
      return {
        leads: (data ?? []).map((p) => ({ ...resumoLead(p), investigado: !!p.investigado_em, mensagem_pronta: comRascunho.has(p.id) })),
      };
    }
    case "investigar_lead": {
      const id = uuid(a.prospect_id);
      if (!id) return { erro: "id inválido" };
      const d: any = await agente(auth, { acao: "investigar", prospect_id: id });
      if (d.erro) return d;
      const p = d.prospect ?? {};
      return { id, nome: p.nome, dono: p.dono, quente: p.quente, motivo_quente: p.quente_motivo, dossie: p.dossie };
    }
    case "preparar_abordagem": {
      const id = uuid(a.prospect_id);
      if (!id) return { erro: "id inválido" };
      const d: any = await agente(auth, {
        acao: "gerar_abordagem",
        prospect_id: id,
        canal: ["whatsapp", "instagram", "email"].includes(a.canal) ? a.canal : "whatsapp",
        tipo: a.tipo === "followup" ? "followup" : "primeiro_contato",
        instrucao: a.instrucao ? limpar(a.instrucao, 500) : undefined,
        substituir: true,
      });
      if (d.erro) return d;
      return { status: "rascunho em Aprovar envios (o antigo, se havia, foi substituído)", mensagens: (d.abordagens ?? []).map((x: any) => x.texto).slice(0, 2) };
    }
    case "resultados_prospeccao": {
      const dias = Math.min(Math.max(Number(a.dias) || 7, 1), 90);
      const desde = new Date(Date.now() - dias * 86400e3).toISOString();
      const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      const [{ data: novos }, { data: envios }, { data: recebidas }, { count: reunioes }, { data: rot }, { count: rascunhos }] = await Promise.all([
        db.from("gestao_prospects").select("fonte").gte("criado_em", desde).limit(2000),
        db.from("gestao_abordagens").select("prospect_id, tipo").eq("status", "enviada").in("tipo", ["primeiro_contato", "followup"]).gte("enviada_em", desde).limit(2000),
        db.from("gestao_abordagens").select("prospect_id").eq("tipo", "recebida").gte("criado_em", desde).limit(2000),
        db.from("astra_reunioes").select("id", { count: "exact", head: true }).neq("status", "cancelada").gte("criado_em", desde),
        db.from("astra_rotinas").select("status, leads_preparados, followups, garimpos").eq("dia", hoje).maybeSingle(),
        db.from("gestao_abordagens").select("id", { count: "exact", head: true }).eq("status", "rascunho").in("tipo", ["primeiro_contato", "followup"]),
      ]);
      const porFonte: Record<string, number> = {};
      for (const n of novos ?? []) porFonte[n.fonte] = (porFonte[n.fonte] ?? 0) + 1;
      const abordados = new Set((envios ?? []).filter((e) => e.tipo === "primeiro_contato").map((e) => e.prospect_id)).size;
      const responderam = new Set((recebidas ?? []).map((e) => e.prospect_id)).size;
      return {
        periodo_dias: dias,
        leads_novos: novos?.length ?? 0,
        leads_por_fonte: porFonte,
        abordados,
        followups_enviados: (envios ?? []).filter((e) => e.tipo === "followup").length,
        responderam,
        taxa_resposta: abordados ? `${Math.round((responderam / abordados) * 100)}%` : "sem abordagens no período",
        reunioes: reunioes ?? 0,
        esperando_aprovacao: rascunhos ?? 0,
        // leads_preparados conta tudo o que a rotina fez hoje, inclusive o que ele já enviou ou classificou
        rotina_de_hoje: rot ? { ...rot, nota: "leads_preparados inclui os que ele já enviou hoje; o que falta aprovar agora é esperando_aprovacao" } : "ainda não rodou hoje",
      };
    }
    case "rodar_rotina_agora": {
      const d: any = await agente(auth, { acao: "rotina" });
      if (d.erro) return d;
      return { ok: true, nota: "Rotina iniciada em segundo plano. Cada rodada leva até uns 3 minutos e pode não completar a meta de uma vez; os rascunhos vão aparecendo em Aprovar envios. Você NÃO recebe aviso quando termina: diga para ele olhar a fila em alguns minutos e, se vier pouco, pedir de novo." };
    }
    case "editar_mensagem": {
      const id = uuid(a.prospect_id), texto = limpar(a.texto, 1500);
      if (!id || texto.length < 10) return { erro: "lead ou texto inválido" };
      const { data: rasc } = await db.from("gestao_abordagens").select("id, canal, tipo").eq("prospect_id", id).eq("status", "rascunho")
        .in("tipo", ["primeiro_contato", "followup"]).order("criado_em", { ascending: false });
      if (!rasc?.length) return { erro: "esse lead não tem rascunho; use preparar_abordagem" };
      const { error } = await db.from("gestao_abordagens").update({ texto, modelo: "editado pela Astra" }).eq("id", rasc[0].id);
      if (error) return { erro: "não consegui salvar" };
      const outros = rasc.slice(1).map((r) => r.id);
      if (outros.length) await db.from("gestao_abordagens").update({ status: "descartada" }).in("id", outros);
      return { ok: true, nota: "texto trocado; continua em rascunho para aprovação" };
    }
    case "descartar_rascunhos": {
      const ids = (Array.isArray(a.prospect_ids) ? a.prospect_ids : []).map(uuid).filter(Boolean).slice(0, 100) as string[];
      if (!ids.length && a.todos !== true) return { erro: "diga quais leads (prospect_ids) ou todos=true" };
      let q = db.from("gestao_abordagens").update({ status: "descartada" }).eq("status", "rascunho").in("tipo", ["primeiro_contato", "followup", "resposta"]);
      if (ids.length) q = q.in("prospect_id", ids);
      const { data, error } = await q.select("id");
      return error ? { erro: "não consegui descartar" } : { ok: true, mensagens_descartadas: data?.length ?? 0 };
    }
    case "descartar_leads": {
      const ids = (Array.isArray(a.prospect_ids) ? a.prospect_ids : []).map(uuid).filter(Boolean).slice(0, 100) as string[];
      const nicho = limpar(a.nicho, 60).replace(/[%_,()]/g, " ").trim();
      if (!ids.length && !nicho && a.todos_novos !== true) return { erro: "diga quais leads (prospect_ids), um nicho ou todos_novos=true" };
      // só leads ainda não abordados: conversas em andamento nunca são apagadas por aqui
      let q = db.from("gestao_prospects").select("id").eq("status", "novo").limit(200);
      if (ids.length) q = q.in("id", ids);
      if (nicho) q = q.ilike("nicho", `%${nicho}%`);
      const { data: alvo } = await q;
      const lista = (alvo ?? []).map((x) => x.id);
      if (!lista.length) return { ok: true, leads_descartados: 0, nota: "nenhum lead novo bateu com o pedido (leads já abordados não são descartados por aqui)" };
      await db.from("gestao_abordagens").update({ status: "descartada" }).in("prospect_id", lista).eq("status", "rascunho");
      const motivo = limpar(a.motivo, 200);
      const { error } = await db.from("gestao_prospects").update({ status: "descartado", ...(motivo ? { quente_motivo: `Descartado: ${motivo}` } : {}) }).in("id", lista);
      return error ? { erro: "não consegui descartar" } : { ok: true, leads_descartados: lista.length, nota: "saíram das listas e da rotina e não voltam em garimpos futuros" };
    }
    case "ver_regras_prospeccao": {
      const { data: c } = await db.from("gestao_agente_config").select("prefs, nichos, cidade_padrao").eq("id", "padrao").maybeSingle();
      const p: any = c?.prefs ?? {};
      return {
        mensagens: { sempre: p.sempre ?? "", nunca: p.nunca ?? "", cta: p.cta ?? "", extra: p.extra ?? "", exemplo: p.exemplos ?? "", tamanho: p.tamanho, emoji: p.emoji, formalidade: p.formalidade },
        rotina: { ativa: p.rotina?.ativa !== false, meta_diaria: p.rotina?.meta ?? 10, nota_minima: p.rotina?.nota_min ?? 40, nichos: p.rotina?.nichos ?? c?.nichos ?? [], cidade: c?.cidade_padrao },
      };
    }
    case "ajustar_regras_prospeccao": {
      const { data: c } = await db.from("gestao_agente_config").select("prefs, cidade_padrao").eq("id", "padrao").maybeSingle();
      if (!c) return { erro: "configuração não encontrada" };
      const prefs: any = { ...(c.prefs ?? {}) }, rotina: any = { ...(prefs.rotina ?? {}) };
      const mudou: string[] = [];
      for (const [campo, chave, max] of [["sempre", "sempre", 1200], ["nunca", "nunca", 1200], ["cta", "cta", 300], ["extra", "extra", 1200], ["exemplo", "exemplos", 1500]] as const) {
        if (typeof a[campo] === "string") { prefs[chave] = limpar(a[campo], max); mudou.push(campo); }
      }
      if (["curta", "media", "longa"].includes(a.tamanho)) { prefs.tamanho = a.tamanho; mudou.push("tamanho"); }
      if (["nenhum", "um"].includes(a.emoji)) { prefs.emoji = a.emoji; mudou.push("emoji"); }
      if (["informal", "equilibrada", "formal"].includes(a.formalidade)) { prefs.formalidade = a.formalidade; mudou.push("formalidade"); }
      if (Array.isArray(a.nichos_rotina)) {
        const n = a.nichos_rotina.map((x: unknown) => limpar(x, 60)).filter(Boolean).slice(0, 12);
        if (n.length) { rotina.nichos = n; mudou.push("nichos da rotina"); }
      }
      if (Number.isFinite(Number(a.meta_diaria)) && a.meta_diaria != null) { rotina.meta = Math.min(30, Math.max(1, Math.round(Number(a.meta_diaria)))); mudou.push("meta diária"); }
      if (Number.isFinite(Number(a.nota_minima)) && a.nota_minima != null) { rotina.nota_min = Math.min(90, Math.max(0, Math.round(Number(a.nota_minima)))); mudou.push("nota mínima"); }
      if (typeof a.rotina_ativa === "boolean") { rotina.ativa = a.rotina_ativa; mudou.push(a.rotina_ativa ? "rotina ligada" : "rotina desligada"); }
      const cidade = limpar(a.cidade, 80);
      if (!mudou.length && !cidade) return { erro: "nada para mudar" };
      const { error } = await db.from("gestao_agente_config").update({ prefs: { ...prefs, rotina }, ...(cidade ? { cidade_padrao: cidade } : {}) }).eq("id", "padrao");
      return error ? { erro: "não consegui salvar" } : { ok: true, mudou: cidade ? [...mudou, "cidade"] : mudou, nota: "vale para as próximas mensagens e para a rotina de amanhã" };
    }
    case "pedir_melhoria": {
      const pedido = limpar(a.pedido, 3000);
      if (pedido.length < 15) return { erro: "descreva melhor a melhoria" };
      return await agente(auth, { acao: "melhoria_pedir", pedido });
    }
    case "ver_melhorias":
      return await agente(auth, { acao: "melhorias" });
    case "abordagens_pendentes": {
      const tres = new Date(Date.now() - 3 * 86400e3).toISOString();
      const [{ data: rasc }, { data: parados }] = await Promise.all([
        db.from("gestao_abordagens").select("canal, tipo, texto, criado_em, gestao_prospects(id, nome, nicho)").eq("status", "rascunho").order("criado_em", {
          ascending: false,
        }).limit(15),
        db.from("gestao_prospects").select("id, nome, nicho, abordado_em").eq("status", "abordado").lt("abordado_em", tres).order("abordado_em").limit(15),
      ]);
      return {
        rascunhos_para_aprovar: (rasc ?? []).map((r: any) => ({ lead: r.gestao_prospects?.nome, prospect_id: r.gestao_prospects?.id, canal: r.canal, tipo: r.tipo, texto: r.texto })),
        sem_resposta_ha_3_dias: (parados ?? []).map((p) => ({ id: p.id, nome: p.nome, nicho: p.nicho, abordado_em: p.abordado_em })),
      };
    }
  }
  return { erro: "ferramenta desconhecida" };
}
