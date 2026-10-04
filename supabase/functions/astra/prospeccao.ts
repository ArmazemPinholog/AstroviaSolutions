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
      "Escreve a primeira mensagem (ou o follow-up) para um lead e deixa em RASCUNHO na aba Prospecção para o Christian aprovar e enviar. Nunca diga que a mensagem foi enviada.",
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
      "Roda agora a rotina diária de prospecção (a mesma que roda sozinha toda manhã): garimpa, investiga e deixa leads e follow-ups em rascunho em Aprovar envios, até a meta do dia. Só use quando ele pedir.",
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
      });
      if (d.erro) return d;
      return { status: "rascunho, aguardando aprovação na aba Prospecção", mensagens: (d.abordagens ?? []).map((x: any) => x.texto).slice(0, 2) };
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
        rotina_de_hoje: rot ?? "ainda não rodou hoje",
      };
    }
    case "rodar_rotina_agora": {
      const d: any = await agente(auth, { acao: "rotina" });
      if (d.erro) return d;
      return { ok: true, nota: "Rotina iniciada em segundo plano. Leva alguns minutos; os rascunhos aparecem em Aprovar envios e eu aviso aqui quando terminar." };
    }
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
