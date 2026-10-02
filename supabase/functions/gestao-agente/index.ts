// ============================================================
// Agente de prospecção da Sala de Gestão Astrovia
//
// Ações (POST { acao, ... }):
//   status             → quais chaves estão configuradas
//   garimpar_google    → busca negócios no Google Maps (Places API New), filtrando pelo cliente ideal
//   garimpar_instagram → hashtag e/ou lista de @ via Graph API (Business Discovery)
//   investigar         → lê avaliações do Google + site do lead e monta o dossiê (dono, dores, momento quente)
//   gerar_abordagem    → escreve a mensagem (Gemini grátis; Poe só como reserva)
//   responder          → o lead respondeu: sugere a próxima mensagem e, se for a hora, a proposta
//   criar_conteudo     → legenda/roteiro com Gemini + imagem/vídeo com bot de mídia da Poe
//   gerar_midia        → (re)gera a imagem/vídeo de um conteúdo
//   publicar           → publica feed/story/reels no Instagram (Graph API)
//
// Segurança: exige login E ser membro da equipe (gestao_membro()).
// Todas as leituras/escritas usam o token de quem chamou, então as
// mesmas regras de RLS da sala valem aqui dentro.
// ============================================================
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const env = (k: string) => Deno.env.get(k) || "";
const GEMINI_MODEL = () => env("GEMINI_MODEL") || "gemini-2.5-flash";
const POE_MODEL = () => env("POE_MODEL") || "Claude-Sonnet-4.6";
const GRAPH = () => `https://graph.facebook.com/${env("IG_GRAPH_VERSION") || "v25.0"}`;
const SITE = "https://astrovia-solutions.vercel.app";

class Falha extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST" }, 405);

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!/^Bearer\s+\S+/.test(auth)) throw new Falha("Faça login na Sala de Gestão.", 401);
    const apikey = env("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
    const sb = createClient(env("SUPABASE_URL"), apikey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: membro, error: eMembro } = await sb.rpc("gestao_membro");
    if (eMembro || membro !== true) throw new Falha("Acesso restrito à equipe da Astrovia.", 403);

    const body = await req.json().catch(() => ({}));
    switch (body.acao) {
      case "status":
        return json({
          gemini: !!env("GEMINI_API_KEY"),
          poe: !!env("POE_API_KEY"),
          poe_modelo: POE_MODEL(),
          google: !!env("GOOGLE_PLACES_KEY"),
          instagram: !!(env("IG_ACCESS_TOKEN") && env("IG_USER_ID")),
          modelo: GEMINI_MODEL(),
        });
      case "garimpar_google":
        return json(await garimparGoogle(sb, body));
      case "garimpar_instagram":
        return json(await garimparInstagram(sb, body));
      case "investigar":
        return json(await investigar(sb, body));
      case "responder":
        return json(await responder(sb, body));
      case "gerar_abordagem":
        return json(await gerarAbordagem(sb, body));
      case "criar_conteudo":
        return json(await criarConteudo(sb, body));
      case "gerar_midia":
        return json(await pedirMidia(sb, body));
      case "publicar":
        return json(await publicar(sb, body));
      default:
        throw new Falha("Ação desconhecida.");
    }
  } catch (e) {
    const status = e instanceof Falha ? e.status : 500;
    console.error(e);
    const msg = (e as { message?: string })?.message || String(e);
    return json({ erro: msg }, status);
  }
});

/* ============================================================
   NOTA DO LEAD (0–100) — regras simples e explicáveis, sem IA
   ============================================================ */
type Lead = {
  fonte: "google" | "instagram" | "manual";
  externo_id: string;
  nome: string;
  nicho?: string | null;
  cidade?: string | null;
  endereco?: string | null;
  telefone?: string | null;
  site?: string | null;
  instagram?: string | null;
  maps_url?: string | null;
  nota_google?: number | null;
  avaliacoes?: number | null;
  seguidores?: number | null;
  publicacoes?: number | null;
  bio?: string | null;
  score?: number;
  motivos?: string[];
  raw?: unknown;
};

const SITE_FRACO = /(instagram\.com|linktr\.ee|linktree|wa\.me|whatsapp\.com|facebook\.com|beacons\.ai|bio\.link|taplink|linkbio)/i;
const AGENDA_MANUAL = /(agend|marque|marcar|hor[aá]rio|chama no|chame no|whats|direct|dm\b|me chama)/i;
const AGENDA_ONLINE = /(booksy|trinks|avec|agendor|simplesagenda|appbarber|agendafacil|calendly|gendo|salaovip|belasis)/i;

type Icp = {
  bairros?: string; avaliacoes_min?: number; avaliacoes_max?: number; nota_min?: number;
  precos?: string[]; excluir?: string; excluir_redes?: boolean;
};
const PRECO: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: "barato", PRICE_LEVEL_MODERATE: "moderado", PRICE_LEVEL_EXPENSIVE: "caro", PRICE_LEVEL_VERY_EXPENSIVE: "muito caro",
};
const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/* devolve o motivo de estar fora do perfil ideal, ou null se serve */
function foraDoPerfil(l: Lead, icp: Icp, repetidos: Set<string>): string | null {
  const nome = semAcento(l.nome);
  const proibidas = listaPalavras(icp.excluir).map(semAcento);
  const hit = proibidas.find((w) => nome.includes(w));
  if (hit) return `Nome contém "${hit}"`;
  if (icp.excluir_redes && repetidos.has(nome)) return "Rede/franquia (várias unidades)";
  const n = l.avaliacoes ?? null;
  if (n !== null && icp.avaliacoes_min && n < icp.avaliacoes_min) return `Só ${n} avaliações`;
  if (n !== null && icp.avaliacoes_max && n > icp.avaliacoes_max) return `${n} avaliações (grande demais)`;
  if (l.nota_google && icp.nota_min && l.nota_google < icp.nota_min) return `Nota ${l.nota_google}`;
  const preco = (l.raw as { preco?: string } | undefined)?.preco;
  if (preco && icp.precos?.length && !icp.precos.includes(preco)) return `Faixa de preço ${PRECO[preco] || preco}`;
  return null;
}

function pontuar(l: Lead, icp: Icp = {}): Lead {
  let s = 0;
  const m: string[] = [];
  const bairros = listaPalavras(icp.bairros).map(semAcento);
  const end = semAcento(l.endereco || "");
  const noBairro = bairros.find((b) => end.includes(b));
  if (noBairro) { s += 10; m.push(`No bairro-alvo (${noBairro})`); }
  const preco = (l.raw as { preco?: string } | undefined)?.preco;
  if (preco && icp.precos?.includes(preco)) { s += 6; m.push(`Faixa de preço ${PRECO[preco]}`); }
  const site = (l.site || "").trim();

  if (!site) { s += 30; m.push("Não tem site"); }
  else if (SITE_FRACO.test(site)) { s += 22; m.push("Sem site próprio (usa link de rede social/WhatsApp)"); }
  if (site && AGENDA_ONLINE.test(site)) { s -= 15; m.push("Já usa plataforma de agendamento"); }

  if (l.fonte === "google") {
    if (l.telefone) { s += 10; m.push("Tem telefone para contato"); }
    const n = l.avaliacoes || 0, r = l.nota_google || 0;
    if (n >= 30 && r >= 4.5) { s += 18; m.push(`Bem avaliado (${r}★, ${n} avaliações): negócio saudável`); }
    else if (n >= 10) { s += 8; m.push(`${n} avaliações no Google`); }
    else { s += 6; m.push("Poucas avaliações: precisa de presença digital"); }
  }

  if (l.fonte === "instagram") {
    const f = l.seguidores || 0, p = l.publicacoes || 0;
    if (f >= 500 && f <= 30000) { s += 15; m.push(`${f.toLocaleString("pt-BR")} seguidores: porte ideal`); }
    else if (f > 30000) { s += 5; m.push("Perfil grande: talvez já tenha fornecedor"); }
    if (p >= 30) { s += 10; m.push("Posta com frequência"); }
    if (AGENDA_MANUAL.test(l.bio || "")) { s += 15; m.push("Agenda pelo WhatsApp/Direct (manual)"); }
  }

  if (l.nicho) { s += 12; m.push(`Nicho-alvo: ${l.nicho}`); }

  return { ...l, score: Math.max(0, Math.min(100, s)), motivos: m };
}

/* salva só os leads novos; os já existentes são mantidos como estão */
async function salvarNovos(sb: SupabaseClient, leads: Lead[]) {
  if (!leads.length) return { novos: [], repetidos: 0 };
  const fonte = leads[0].fonte;
  const ids = leads.map((l) => l.externo_id);
  const { data: existentes, error: e1 } = await sb.from("gestao_prospects").select("externo_id").eq("fonte", fonte).in("externo_id", ids);
  if (e1) throw e1;
  const ja = new Set((existentes || []).map((x) => x.externo_id));
  const novos = leads.filter((l) => !ja.has(l.externo_id));
  if (!novos.length) return { novos: [], repetidos: leads.length };
  const { data, error } = await sb.from("gestao_prospects").insert(novos).select("id, nome, score, motivos, fonte");
  if (error) throw error;
  return { novos: data || [], repetidos: leads.length - novos.length };
}

/* ============================================================
   GOOGLE MAPS — Places API (New) · Text Search
   ============================================================ */
async function garimparGoogle(sb: SupabaseClient, b: { busca?: string; cidade?: string; paginas?: number }) {
  const key = env("GOOGLE_PLACES_KEY");
  if (!key) throw new Falha("Configure o secret GOOGLE_PLACES_KEY para garimpar no Google Maps.");
  const busca = (b.busca || "").trim();
  const cidade = (b.cidade || "").trim();
  if (!busca) throw new Falha("Diga o que buscar (ex.: barbearia).");
  const paginas = Math.min(3, Math.max(1, Number(b.paginas) || 1));

  const campos = [
    "places.id", "places.displayName", "places.formattedAddress", "places.nationalPhoneNumber",
    "places.websiteUri", "places.rating", "places.userRatingCount", "places.googleMapsUri",
    "places.businessStatus", "places.primaryTypeDisplayName", "places.priceLevel", "nextPageToken",
  ].join(",");

  const { data: cfg } = await sb.from("gestao_agente_config").select("prefs").eq("id", "padrao").maybeSingle();
  const icp: Icp = (cfg?.prefs as { icp?: Icp } | null)?.icp || {};
  const achados: Lead[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < paginas; i++) {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": campos },
      body: JSON.stringify({
        textQuery: cidade ? `${busca} em ${cidade}` : busca,
        languageCode: "pt-BR",
        regionCode: "BR",
        pageSize: 20,
        ...(pageToken ? { pageToken } : {}),
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Falha(`Google Places: ${d?.error?.message || r.statusText}`, 502);
    for (const p of d.places || []) {
      if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
      const site = p.websiteUri || null;
      const ig = site?.match(/instagram\.com\/([A-Za-z0-9._]+)/i)?.[1] || null;
      achados.push(({
        fonte: "google",
        externo_id: p.id,
        nome: p.displayName?.text || "Sem nome",
        nicho: busca,
        cidade: cidade || null,
        endereco: p.formattedAddress || null,
        telefone: p.nationalPhoneNumber || null,
        site,
        instagram: ig,
        maps_url: p.googleMapsUri || null,
        nota_google: p.rating ?? null,
        avaliacoes: p.userRatingCount ?? null,
        raw: { tipo: p.primaryTypeDisplayName?.text || null, preco: p.priceLevel || null },
      }));
    }
    pageToken = d.nextPageToken;
    if (!pageToken) break;
  }

  // nomes que aparecem mais de uma vez na busca = rede/franquia
  const cont = new Map<string, number>();
  achados.forEach((l) => { const k = semAcento(l.nome); cont.set(k, (cont.get(k) || 0) + 1); });
  const repetidos = new Set([...cont].filter(([, n]) => n > 1).map(([k]) => k));
  const fora: { nome: string; motivo: string }[] = [];
  const bons = achados.filter((l) => {
    const motivo = foraDoPerfil(l, icp, repetidos);
    if (motivo) fora.push({ nome: l.nome, motivo });
    return !motivo;
  }).map((l) => pontuar(l, icp));

  const r = await salvarNovos(sb, bons);
  return { encontrados: achados.length, fora_perfil: fora, ...r };
}

/* ============================================================
   INSTAGRAM — Graph API (Facebook Login)
   Hashtag não devolve quem postou, então extraímos os @ citados
   nas legendas e enriquecemos cada um via Business Discovery.
   ============================================================ */
const BLOQUEIO_META = /\(#10\)|\(#200\)|permission|API access blocked|not have permission/i;

async function graph(path: string, params: Record<string, string>) {
  const u = new URL(`${GRAPH()}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("access_token", env("IG_ACCESS_TOKEN"));
  const r = await fetch(u);
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d?.error?.message || r.statusText);
  return d;
}

async function garimparInstagram(
  sb: SupabaseClient,
  b: { hashtag?: string; usernames?: string[] | string; nicho?: string; cidade?: string },
) {
  const igUser = env("IG_USER_ID");
  if (!env("IG_ACCESS_TOKEN") || !igUser) throw new Falha("Configure os secrets IG_ACCESS_TOKEN e IG_USER_ID para garimpar no Instagram.");

  const limpar = (u: string) => u.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "").toLowerCase();
  const lista = Array.isArray(b.usernames) ? b.usernames : String(b.usernames || "").split(/[\s,;]+/);
  const candidatos = new Set(lista.map(limpar).filter((u) => /^[a-z0-9._]{2,30}$/.test(u)));
  const posts: { permalink: string; legenda: string }[] = [];

  const tag = (b.hashtag || "").trim().replace(/^#/, "").toLowerCase();
  if (tag) {
    let h;
    try { h = await graph("ig_hashtag_search", { user_id: igUser, q: tag }); }
    catch (e) {
      if (!BLOQUEIO_META.test(String((e as Error).message))) throw e;
      if (!candidatos.size) throw new Falha("A busca por hashtag ainda está bloqueada pela Meta (precisa da aprovação do app). Enquanto isso, cole os @ dos perfis no campo ao lado: o agente salva e você completa o que observar.", 403);
      h = null;
    }
    const hid = h?.data?.[0]?.id;
    if (h && !hid) throw new Falha(`Hashtag #${tag} não encontrada.`);
    if (hid) for (const tipo of ["recent_media", "top_media"]) {
      const m = await graph(`${hid}/${tipo}`, { user_id: igUser, fields: "caption,permalink", limit: "50" });
      for (const p of m.data || []) {
        const cap = p.caption || "";
        if (posts.length < 20) posts.push({ permalink: p.permalink, legenda: cap.slice(0, 140) });
        for (const at of cap.matchAll(/@([A-Za-z0-9._]{2,30})/g)) candidatos.add(limpar(at[1]));
      }
    }
  }

  const alvo = [...candidatos].slice(0, 25);
  const achados: Lead[] = [];
  let bloqueado = false;
  const ignorados: { username: string; motivo: string }[] = [];
  const campos = "username,name,biography,website,followers_count,media_count,profile_picture_url";

  for (const username of alvo) {
    try {
      const d = await graph(igUser, { fields: `business_discovery.username(${username}){${campos}}` });
      const p = d.business_discovery;
      achados.push(pontuar({
        fonte: "instagram",
        externo_id: p.username.toLowerCase(),
        nome: p.name || p.username,
        nicho: b.nicho?.trim() || null,
        cidade: b.cidade?.trim() || null,
        site: p.website || null,
        instagram: p.username,
        seguidores: p.followers_count ?? null,
        publicacoes: p.media_count ?? null,
        bio: p.biography || null,
        raw: { foto: p.profile_picture_url || null, hashtag: tag || null },
      }));
    } catch (e) {
      if (BLOQUEIO_META.test(String((e as Error).message))) {
        // sem permissão da Meta para ler o perfil: salva o @ mesmo assim, para não perder o lead
        achados.push(pontuar({
          fonte: "instagram", externo_id: username, nome: "@" + username, instagram: username,
          nicho: b.nicho?.trim() || null, cidade: b.cidade?.trim() || null,
          raw: { sem_dados: true, hashtag: tag || null },
        }));
        bloqueado = true;
        continue;
      }
      ignorados.push({ username, motivo: /not.*(business|found)|cannot be found|does not exist/i.test(String(e)) ? "Perfil pessoal ou inexistente" : String((e as Error).message || e) });
    }
  }

  const r = await salvarNovos(sb, achados);
  return { encontrados: achados.length, ignorados, posts, bloqueado, ...r };
}

/* ============================================================
   ABORDAGEM — Gemini escreve, você revisa e envia
   ============================================================ */
type Prefs = {
  tamanho?: "curta" | "media" | "longa";
  formalidade?: "informal" | "equilibrada" | "formal";
  emoji?: "nenhum" | "um";
  criatividade?: "precisa" | "equilibrada" | "criativa";
  cta?: string; sempre?: string; nunca?: string; exemplos?: string; extra?: string;
  ofertas_nicho?: { nicho: string; oferta?: string; link?: string }[];
};
const listaPalavras = (t?: string) => String(t || "").split(/[\n,;]+/).map((w) => w.trim()).filter((w) => w.length > 1);

function demoPara(nicho: string) {
  const n = nicho.toLowerCase();
  if (/barb/.test(n)) return { nome: "Barber Berserker (sistema de agendamento e gestão para barbearias)", url: `${SITE}/demos/barber-berserker/` };
  if (/est[eé]t|beleza|sal[aã]o|sobrancelha|unha|spa|cl[ií]nica/.test(n)) return { nome: "LUXE (sistema de agendamento e gestão para clínicas de estética)", url: `${SITE}/demos/luxe/` };
  if (/brech|moda|roupa|loja/.test(n)) return { nome: "Lobas Brechó (loja online premium feita pela Astrovia)", url: SITE };
  return { nome: "portfólio da Astrovia", url: SITE };
}

async function gerarAbordagem(sb: SupabaseClient, b: { prospect_id?: string; canal?: string; tipo?: string; instrucao?: string; motor?: string }) {
  if (!b.prospect_id) throw new Falha("Informe o lead.");
  const canal = ["instagram", "whatsapp", "email"].includes(b.canal || "") ? b.canal! : "instagram";
  const tipo = b.tipo === "followup" ? "followup" : "primeiro_contato";

  const [{ data: p, error: e1 }, { data: cfg }, { data: hist }] = await Promise.all([
    sb.from("gestao_prospects").select("*").eq("id", b.prospect_id).single(),
    sb.from("gestao_agente_config").select("*").eq("id", "padrao").maybeSingle(),
    sb.from("gestao_abordagens").select("texto, tipo, status, criado_em").eq("prospect_id", b.prospect_id).order("criado_em", { ascending: false }).limit(3),
  ]);
  if (e1 || !p) throw new Falha("Lead não encontrado.", 404);

  const prefs = (cfg?.prefs || {}) as Prefs;
  const nichoLead = (p.nicho || "").toLowerCase();
  const doNicho = (prefs.ofertas_nicho || []).find((o) => o.nicho && nichoLead.includes(o.nicho.toLowerCase().trim()));
  const demo = doNicho
    ? { nome: doNicho.oferta || doNicho.nicho, url: doNicho.link || cfg?.portfolio_url || SITE }
    : demoPara(p.nicho || "");
  const enviada = (hist || []).find((h) => h.status === "enviada");
  const base = canal === "instagram" ? 450 : canal === "whatsapp" ? 600 : 1200;
  const limite = Math.round(base * (prefs.tamanho === "curta" ? 0.6 : prefs.tamanho === "longa" ? 1.4 : 1));

  // mensagens que já funcionaram (lead respondeu ou foi para o funil) viram exemplo para a IA
  const { data: ganhas } = await sb.from("gestao_abordagens")
    .select("texto, canal, gestao_prospects!inner(status)")
    .eq("status", "enviada").eq("tipo", "primeiro_contato")
    .in("gestao_prospects.status", ["respondeu", "no_funil"])
    .order("criado_em", { ascending: false }).limit(3);
  const exemplos = [prefs.exemplos?.trim(), ...(ganhas || []).map((g) => g.texto)].filter(Boolean) as string[];
  const nunca = listaPalavras(prefs.nunca);

  if (/\/demos\//.test(demo.url)) demo.url = `${demo.url}?nome=${encodeURIComponent(p.nome)}`;
  const dz = p.dossie || {};
  const dados = {
    nome: p.nome, nicho: p.nicho, cidade: p.cidade, instagram: p.instagram, site: p.site,
    nota_google: p.nota_google, avaliacoes_google: p.avaliacoes, seguidores: p.seguidores,
    bio_instagram: p.bio, pontos_observados: p.motivos,
    ...(p.investigado_em ? {
      dono_provavel: p.dono && dz.dono_confianca !== "baixa" ? p.dono : null,
      dores_reais: dz.dores, gancho_sugerido: dz.gancho, diagnostico_site: dz.site_resumo,
      momento_quente: p.quente ? p.quente_motivo : null,
    } : {}),
  };

  const prompt = `Você escreve mensagens de prospecção para a Astrovia Solutions, agência de tecnologia de Curitiba.

SOBRE A ASTROVIA
Oferta: ${cfg?.oferta || "sistemas, sites e automações com IA para pequenos negócios"}
Tom de voz: ${cfg?.tom || "próximo, direto, respeitoso"}
Assinatura: ${cfg?.assinatura || "Christian · Astrovia Solutions"}
Demo mais relevante para este lead: ${demo.nome} — ${demo.url}

DADOS REAIS DO LEAD (use somente estes, não invente nada)
${JSON.stringify(dados, null, 2)}

TAREFA
Canal: ${canal}. Tipo: ${tipo === "followup" ? "follow-up de quem ainda não respondeu" : "primeiro contato"}.
${tipo === "followup" && enviada ? `Mensagem enviada antes:\n"""${enviada.texto}"""\n` : ""}
${b.instrucao ? `Pedido extra do Christian: ${b.instrucao}\n` : ""}
REGRAS
- Português do Brasil, natural, como uma pessoa escreveria. ${prefs.emoji === "nenhum" ? "Não use emoji." : "No máximo 1 emoji."}
- Formalidade: ${prefs.formalidade === "formal" ? "formal e profissional (trate por você, sem gírias)" : prefs.formalidade === "informal" ? "bem informal, como conversa entre conhecidos" : "equilibrada: profissional, mas leve"}.
- Abra citando algo concreto e verdadeiro do negócio (a partir dos dados). Nunca elogio genérico.
- Se houver dono_provavel, cumprimente pelo primeiro nome. Se houver gancho_sugerido ou dores_reais, use UMA delas como ponto de partida, com tato: nunca exponha avaliação negativa de cliente nem pareça crítica; fale como oportunidade.
- A demo foi personalizada com o nome do negócio: quando oferecer, diga que já deixou uma versão com o nome dele.
- Aponte UMA oportunidade ligada aos pontos observados (ex.: agendamento manual pelo WhatsApp, falta de site).
- Termine com ${prefs.cta?.trim() ? `este tipo de chamada: ${prefs.cta.trim()}` : 'uma pergunta simples e de baixo compromisso (ex.: "posso te mandar uma demo de 2 minutos?")'}.
${prefs.sempre?.trim() ? `- Sempre: ${prefs.sempre.trim()}\n` : ""}${nunca.length ? `- NUNCA use estas palavras ou expressões: ${nunca.map((w) => `"${w}"`).join(", ")}.\n` : ""}${prefs.extra?.trim() ? `- ${prefs.extra.trim()}\n` : ""}
- ${canal === "instagram" ? "No Instagram, NÃO coloque link na primeira mensagem; ofereça mandar a demo." : "Pode incluir o link da demo."}
- ${tipo === "followup" ? "Follow-up curto (até 250 caracteres), leve, sem cobrar resposta." : `Até ${limite} caracteres.`}
- Não prometa resultados em números, não fale de preço, não use "Prezado".
${canal === "email" ? "- Inclua um assunto curto." : ""}

${exemplos.length ? `\nEXEMPLOS DE MENSAGENS NO ESTILO CERTO (copie o jeito, não o texto; adapte ao lead)\n${exemplos.map((e, i) => `${i + 1}) """${e.slice(0, 700)}"""`).join("\n")}\n` : ""}
Responda em JSON no formato {"assunto": "...", "mensagem": "...", "alternativa": "..."} (alternativa = segunda versão com outro gancho).`;

  const temp = prefs.criatividade === "precisa" ? 0.35 : prefs.criatividade === "criativa" ? 0.95 : 0.65;
  const motor = b.motor === "gemini" ? "gemini" : "auto";
  let { dados: out, modelo } = await ia(prompt, motor, SCHEMA_ABORDAGEM, temp);
  if (!out.mensagem) throw new Falha("A IA não devolveu mensagem. Tente de novo.", 502);

  // conferência: se escapou palavra proibida ou passou muito do tamanho, pede de novo uma vez
  const problemas = (t = "") => [
    ...nunca.filter((w) => t.toLowerCase().includes(w.toLowerCase())).map((w) => `usou "${w}"`),
    ...(t.length > limite * 1.25 ? [`passou de ${limite} caracteres`] : []),
  ];
  const falhas = [...problemas(out.mensagem), ...problemas(out.alternativa)];
  if (falhas.length) {
    const nova = await ia(`${prompt}\n\nATENÇÃO: a versão anterior ${[...new Set(falhas)].join(" e ")}. Corrija isso.`, motor, SCHEMA_ABORDAGEM, Math.min(temp, 0.5)).catch(() => null);
    if (nova?.dados?.mensagem) ({ dados: out, modelo } = nova);
  }

  const monta = (t: string) => (out.assunto && canal === "email" ? `Assunto: ${out.assunto}\n\n${t}` : t);
  const linhas = [out.mensagem, out.alternativa].filter(Boolean).map((t) => ({
    prospect_id: p.id, canal, tipo, texto: monta(t!.trim()), status: "rascunho", modelo,
  }));
  const { data: salvas, error: e2 } = await sb.from("gestao_abordagens").insert(linhas).select();
  if (e2) throw e2;
  return { abordagens: salvas };
}

/* ============================================================
   INVESTIGAR — avaliações do Google + diagnóstico do site + IA
   monta um dossiê: dono provável, dores reais, momento quente
   ============================================================ */
async function diagnosticarSite(url: string) {
  const d: Record<string, unknown> = { url };
  try {
    const t0 = Date.now();
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(9000), headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 13) AstroviaBot" } });
    const html = (await r.text()).slice(0, 400_000);
    const low = html.toLowerCase();
    d.ok = r.ok;
    d.tempo_ms = Date.now() - t0;
    d.https = r.url.startsWith("https://");
    d.mobile = /<meta[^>]+name=["']viewport/i.test(html);
    d.agenda_online = AGENDA_ONLINE.test(low) || /agendar online|agende online|reserve online/.test(low);
    d.whatsapp = /wa\.me|api\.whatsapp|whatsapp\.com\/send/.test(low);
    d.instagram = low.match(/instagram\.com\/([a-z0-9._]{2,30})/)?.[1] || null;
    d.titulo = html.match(/<title[^>]*>([^<]{0,120})/i)?.[1]?.trim() || null;
    d.plataforma = /wix\.com|wixsite/.test(low) ? "Wix" : /wp-content/.test(low) ? "WordPress" : /squarespace/.test(low) ? "Squarespace" : null;
    d.texto = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2500);
  } catch (e) {
    d.ok = false;
    d.erro = /timeout|aborted/i.test(String(e)) ? "Site não abriu em 9 segundos" : "Site fora do ar ou com erro";
  }
  try {
    const ps = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance`, { signal: AbortSignal.timeout(45000) });
    if (ps.ok) {
      const j = await ps.json();
      d.nota_celular = Math.round((j?.lighthouseResult?.categories?.performance?.score ?? 0) * 100);
      d.carrega_em = j?.lighthouseResult?.audits?.["largest-contentful-paint"]?.displayValue || null;
    }
  } catch { /* PageSpeed é opcional */ }
  return d;
}

const SCHEMA_DOSSIE = {
  type: "OBJECT",
  properties: {
    dono: { type: "STRING" },
    dono_confianca: { type: "STRING", enum: ["alta", "media", "baixa", "nenhuma"] },
    dono_evidencia: { type: "STRING" },
    dores: { type: "ARRAY", items: { type: "OBJECT", properties: { dor: { type: "STRING" }, evidencia: { type: "STRING" } }, required: ["dor", "evidencia"] } },
    pontos_fortes: { type: "ARRAY", items: { type: "STRING" } },
    momento_quente: { type: "BOOLEAN" },
    motivo_quente: { type: "STRING" },
    site_resumo: { type: "STRING" },
    gancho: { type: "STRING" },
    resumo: { type: "STRING" },
  },
  required: ["dono_confianca", "dores", "momento_quente", "gancho", "resumo"],
};

async function investigar(sb: SupabaseClient, b: { prospect_id?: string }) {
  const { data: p, error } = await sb.from("gestao_prospects").select("*").eq("id", b.prospect_id || "").single();
  if (error || !p) throw new Falha("Lead não encontrado.", 404);
  const { data: cfg } = await sb.from("gestao_agente_config").select("*").eq("id", "padrao").maybeSingle();
  const icp: Icp = (cfg?.prefs as { icp?: Icp } | null)?.icp || {};

  const key = env("GOOGLE_PLACES_KEY");
  const siteProprio = p.site && !SITE_FRACO.test(p.site) ? p.site : null;
  const [lugar, site] = await Promise.all([
    p.fonte === "google" && key && p.externo_id
      ? fetch(`https://places.googleapis.com/v1/places/${p.externo_id}?languageCode=pt-BR`, {
          headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "reviews,priceLevel,regularOpeningHours.weekdayDescriptions,editorialSummary" },
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      : Promise.resolve(null),
    siteProprio ? diagnosticarSite(siteProprio) : Promise.resolve(null),
  ]);

  const avaliacoes = (lugar?.reviews || []).map((r: { rating?: number; text?: { text?: string }; originalText?: { text?: string }; relativePublishTimeDescription?: string; publishTime?: string }) => ({
    nota: r.rating, quando: r.relativePublishTimeDescription, data: r.publishTime?.slice(0, 10),
    texto: (r.text?.text || r.originalText?.text || "").slice(0, 600),
  }));
  const recentes = avaliacoes.filter((a: { data?: string }) => a.data && Date.now() - Date.parse(a.data) < 90 * 864e5).length;

  const prompt = `Você é um analista de vendas da Astrovia Solutions (sistemas de agendamento, sites e automações com IA para pequenos negócios).
Analise este negócio e monte um dossiê para a primeira abordagem. Use SOMENTE os dados abaixo; se algo não aparecer, diga que não há.

NEGÓCIO
${JSON.stringify({ nome: p.nome, nicho: p.nicho, endereco: p.endereco, nota_google: p.nota_google, total_avaliacoes: p.avaliacoes, instagram: p.instagram, site: p.site, bio: p.bio, faixa_preco: PRECO[lugar?.priceLevel] || null, horarios: lugar?.regularOpeningHours?.weekdayDescriptions || null, resumo_google: lugar?.editorialSummary?.text || null }, null, 2)}

AVALIAÇÕES DO GOOGLE (as mais relevantes; ${recentes} delas dos últimos 90 dias)
${avaliacoes.length ? avaliacoes.map((a: { nota?: number; quando?: string; texto: string }, i: number) => `${i + 1}) ${a.nota}★ · ${a.quando}: ${a.texto}`).join("\n") : "nenhuma disponível"}

SITE
${site ? JSON.stringify({ ...site, texto: undefined }, null, 2) + "\nTexto do site: " + (site.texto || "") : p.site ? `Usa link de rede social/WhatsApp como site: ${p.site}` : "Não tem site."}

DEVOLVA
- dono: primeiro nome do provável dono ou responsável. Pistas: texto do site ("sobre", "fundador"), bio, nome do negócio ("Barbearia do Kaue" → Kaue), ou alguém que várias avaliações citam como dono. Se não houver pista, deixe vazio.
- dono_confianca: alta (dito explicitamente), media (forte indício), baixa (palpite) ou nenhuma. dono_evidencia: de onde tirou.
- dores: até 3 problemas reais que a Astrovia resolve (agendamento difícil, demora no WhatsApp, fila/espera, site lento ou ruim no celular, sem agendamento online, sem site...), cada um com a evidência (trecho curto da avaliação ou do diagnóstico). Não invente.
- pontos_fortes: até 3 coisas que os clientes elogiam (para abrir a conversa com algo verdadeiro).
- momento_quente: true se houver sinal de que a dor é atual (reclamações recentes de agendamento/atendimento, muitas avaliações recentes = movimento crescendo, site fora do ar, inauguração/nova unidade). motivo_quente: explique em 1 frase.
- site_resumo: 1 frase sobre o site (ou a falta dele), com o dado mais forte (ex.: "nota 38/100 no celular, carrega em 7,2 s, sem botão de agendar").
- gancho: UMA frase de abertura, natural e respeitosa, baseada no ponto mais forte do dossiê.
- resumo: 2 frases para o vendedor.
Responda em JSON.`;

  const { dados: ia_, modelo } = await ia(prompt, "auto", SCHEMA_DOSSIE, 0.3);
  const dores = Array.isArray(ia_.dores) ? ia_.dores.slice(0, 3) : [];
  const temDono = ia_.dono && ia_.dono_confianca && ia_.dono_confianca !== "nenhuma";

  // nota: base + perfil ideal + momento quente + dores comprovadas
  const base = pontuar({ ...p, raw: { ...(p.raw || {}), preco: lugar?.priceLevel || p.raw?.preco || null } }, icp);
  const motivos = [...(base.motivos || [])];
  let score = base.score || 0;
  if (ia_.momento_quente) { score += 15; motivos.unshift(`🔥 ${ia_.motivo_quente || "Momento quente"}`); }
  if (dores.length) { score += Math.min(12, dores.length * 4); motivos.push(...dores.map((d: { dor: string }) => `Dor: ${d.dor}`)); }
  if (site?.nota_celular !== undefined && (site.nota_celular as number) < 50) { score += 6; motivos.push(`Site lento no celular (${site.nota_celular}/100)`); }
  if (site && site.ok === false) { score += 8; motivos.push(String(site.erro)); }
  if (site?.agenda_online) { score -= 10; motivos.push("Site já tem agendamento online"); }

  const dossie = {
    ...ia_, dores, modelo, avaliacoes: avaliacoes.slice(0, 5), avaliacoes_recentes: recentes,
    site: site ? { ...site, texto: undefined } : null, preco: PRECO[lugar?.priceLevel] || null,
  };
  const { data: novo, error: e2 } = await sb.from("gestao_prospects").update({
    dono: temDono ? String(ia_.dono).trim() : null,
    quente: !!ia_.momento_quente, quente_motivo: ia_.motivo_quente || null,
    dossie, investigado_em: new Date().toISOString(),
    score: Math.max(0, Math.min(100, score)), motivos,
  }).eq("id", p.id).select().single();
  if (e2) throw e2;
  return { prospect: novo };
}

/* ============================================================
   ASSISTENTE DE RESPOSTA — o lead respondeu: a IA entende,
   sugere a próxima mensagem e, se for a hora, monta a proposta
   ============================================================ */
const SCHEMA_RESPOSTA = {
  type: "OBJECT",
  properties: {
    intencao: { type: "STRING", enum: ["interessado", "pediu_preco", "objecao", "duvida", "sem_interesse", "outro"] },
    leitura: { type: "STRING" },
    proximo_passo: { type: "STRING" },
    mensagem: { type: "STRING" },
    alternativa: { type: "STRING" },
    novo_status: { type: "STRING", enum: ["respondeu", "no_funil", "descartado"] },
    gerar_proposta: { type: "BOOLEAN" },
    proposta: {
      type: "OBJECT",
      properties: {
        titulo: { type: "STRING" }, contexto: { type: "STRING" },
        solucao: { type: "ARRAY", items: { type: "STRING" } },
        entregaveis: { type: "ARRAY", items: { type: "STRING" } },
        prazo: { type: "STRING" }, investimento: { type: "STRING" }, condicoes: { type: "STRING" }, proximo_passo: { type: "STRING" },
      },
    },
  },
  required: ["intencao", "leitura", "proximo_passo", "mensagem", "novo_status", "gerar_proposta"],
};

async function responder(sb: SupabaseClient, b: { prospect_id?: string; texto?: string; canal?: string; motor?: string }) {
  const texto = (b.texto || "").trim();
  if (!texto) throw new Falha("Cole a resposta do lead.");
  const canal = ["instagram", "whatsapp", "email"].includes(b.canal || "") ? b.canal! : "instagram";
  const [{ data: p, error }, { data: cfg }, { data: hist }] = await Promise.all([
    sb.from("gestao_prospects").select("*").eq("id", b.prospect_id || "").single(),
    sb.from("gestao_agente_config").select("*").eq("id", "padrao").maybeSingle(),
    sb.from("gestao_abordagens").select("texto, tipo, status, criado_em").eq("prospect_id", b.prospect_id || "").in("status", ["enviada"]).order("criado_em").limit(8),
  ]);
  if (error || !p) throw new Falha("Lead não encontrado.", 404);
  const prefs = (cfg?.prefs || {}) as Prefs & { precos?: string };

  await sb.from("gestao_abordagens").insert({ prospect_id: p.id, canal, tipo: "recebida", texto, status: "enviada", enviada_em: new Date().toISOString() });

  const conversa = [...(hist || []).map((h) => `${h.tipo === "recebida" ? "LEAD" : "ASTROVIA"}: ${h.texto}`), `LEAD (agora): ${texto}`].join("\n\n");
  const demo = demoPara(p.nicho || "");
  const prompt = `Você é o vendedor da Astrovia Solutions conversando com um pequeno negócio. Ajude o Christian a responder.

ASTROVIA
Oferta: ${cfg?.oferta || "sistemas, sites e automações com IA"}
Tom: ${cfg?.tom || "próximo, direto"} · Assinatura: ${cfg?.assinatura || "Christian · Astrovia Solutions"}
Tabela de preços e condições (use SOMENTE isto para valores): ${prefs.precos?.trim() || "não informada — nunca invente valores; escreva 'a definir na conversa'"}
Demo com o nome do lead: ${/\/demos\//.test(demo.url) ? `${demo.url}?nome=${encodeURIComponent(p.nome)}` : demo.url}

LEAD
${JSON.stringify({ nome: p.nome, nicho: p.nicho, dono: p.dono, cidade: p.cidade, dores: p.dossie?.dores, resumo: p.dossie?.resumo }, null, 2)}

CONVERSA ATÉ AGORA
${conversa}

TAREFA
- intencao e leitura: o que o lead quis dizer de verdade (1 frase).
- proximo_passo: a melhor jogada agora (ex.: marcar call de 15 min, mandar demo, mandar proposta, encerrar com elegância).
- mensagem e alternativa: duas respostas prontas para o canal ${canal}, curtas, naturais, sem pressão. Objeção de preço: mostre valor e ofereça opção menor/parcelada antes de dar desconto. "Já tenho sistema": pergunte o que mais incomoda no atual. "Sem tempo": proponha algo de 10 minutos.
${prefs.emoji === "nenhum" ? "- Sem emoji." : "- No máximo 1 emoji."}${listaPalavras(prefs.nunca).length ? `\n- Nunca use: ${listaPalavras(prefs.nunca).join(", ")}.` : ""}
- novo_status: respondeu (conversa segue), no_funil (quer avançar: proposta/reunião) ou descartado (não quer).
- gerar_proposta: true só se ele demonstrou interesse real ou pediu preço/proposta. Nesse caso preencha proposta: titulo, contexto (a dor dele em 2 frases), solucao (itens), entregaveis, prazo, investimento (da tabela), condicoes, proximo_passo.
Responda em JSON.`;

  const { dados: out, modelo } = await ia(prompt, b.motor === "gemini" ? "gemini" : "auto", SCHEMA_RESPOSTA, 0.5);
  if (!out.mensagem) throw new Falha("A IA não devolveu a resposta. Tente de novo.", 502);
  await sb.from("gestao_abordagens").insert([out.mensagem, out.alternativa].filter(Boolean).map((t: string) => ({
    prospect_id: p.id, canal, tipo: "resposta", texto: t.trim(), status: "rascunho", modelo,
  })));
  const upd: Record<string, unknown> = { status: p.status === "no_funil" ? "no_funil" : "respondeu" };
  if (out.gerar_proposta && out.proposta?.titulo) upd.proposta = { ...out.proposta, gerada_em: new Date().toISOString() };
  await sb.from("gestao_prospects").update(upd).eq("id", p.id);
  return { intencao: out.intencao, leitura: out.leitura, proximo_passo: out.proximo_passo, sugestao_status: out.novo_status, proposta: upd.proposta || null };
}

/* ============================================================
   IA DE TEXTO — sempre Gemini grátis primeiro. A Poe só entra
   como reserva (limite/erro do Gemini). motor: "auto" | "gemini"
   ============================================================ */
// deno-lint-ignore no-explicit-any
type Saida = Record<string, any>;
const SCHEMA_ABORDAGEM = {
  type: "OBJECT",
  properties: { assunto: { type: "STRING" }, mensagem: { type: "STRING" }, alternativa: { type: "STRING" } },
  required: ["mensagem", "alternativa"],
};

function lerJson(texto: string): Saida {
  const limpo = texto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(limpo); } catch { /* tenta achar o objeto */ }
  const m = limpo.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* texto puro */ } }
  return { mensagem: limpo };
}

async function gemini(prompt: string, schema: unknown, temperature = 0.7): Promise<Saida> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env("GEMINI_API_KEY") },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Falha(r.status === 429 ? "Limite gratuito do Gemini atingido." : `Gemini: ${d?.error?.message || r.statusText}`, 502);
    (e as Falha & { reserva?: boolean }).reserva = r.status === 429 || r.status >= 500;
    throw e;
  }
  const texto = d?.candidates?.[0]?.content?.parts?.map((x: { text?: string }) => x.text || "").join("") || "";
  let out: Saida | null = null;
  try { out = JSON.parse(texto); } catch { /* resposta inválida */ }
  if (!out || typeof out !== "object") {
    const e = new Falha("O Gemini não devolveu uma resposta válida.", 502);
    (e as Falha & { reserva?: boolean }).reserva = true;
    throw e;
  }
  return out;
}

async function poe(prompt: string): Promise<Saida> {
  const r = await fetch("https://api.poe.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("POE_API_KEY")}` },
    body: JSON.stringify({
      model: POE_MODEL(),
      stream: false,
      messages: [{ role: "user", content: prompt + "\n\nResponda SOMENTE com o JSON, sem texto antes ou depois." }],
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 402) throw new Falha("Os pontos da Poe acabaram. Recarregue em poe.com ou use o Gemini.", 402);
  if (!r.ok) throw new Falha(`Poe: ${d?.error?.message || r.statusText}`, 502);
  return lerJson(d?.choices?.[0]?.message?.content || "");
}

async function ia(prompt: string, motor = "auto", schema: unknown = SCHEMA_ABORDAGEM, temperature = 0.7): Promise<{ dados: Saida; modelo: string }> {
  const temGemini = !!env("GEMINI_API_KEY"), temPoe = !!env("POE_API_KEY");
  if (!temGemini) {
    if (motor === "auto" && temPoe) return { dados: await poe(prompt), modelo: `poe:${POE_MODEL()}` };
    throw new Falha("Configure o secret GEMINI_API_KEY para gerar mensagens.");
  }
  try {
    return { dados: await gemini(prompt, schema, temperature), modelo: GEMINI_MODEL() };
  } catch (e) {
    const podeReserva = motor === "auto" && temPoe && (!(e instanceof Falha) || (e as { reserva?: boolean }).reserva);
    if (!podeReserva) throw e;
    console.log("Gemini indisponível, usando Poe:", (e as Error).message);
    return { dados: await poe(prompt), modelo: `poe:${POE_MODEL()} (reserva)` };
  }
}

/* ============================================================
   CONTEÚDO — texto com Gemini (grátis), mídia com bots da Poe.
   A mídia roda em segundo plano (EdgeRuntime.waitUntil): a tela
   mostra "gerando" e atualiza sozinha quando termina.
   ============================================================ */
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
const emSegundoPlano = (p: Promise<unknown>) => {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p);
  else p.catch(console.error);
};

const FORMATOS: Record<string, { nome: string; aspecto: string; video: boolean; dica: string }> = {
  feed: { nome: "post de feed", aspecto: "3:4", video: false, dica: "imagem vertical 4:5 para o feed do Instagram" },
  story: { nome: "story", aspecto: "9:16", video: false, dica: "imagem vertical 9:16 para story, deixe espaço livre no topo e na base" },
  reels: { nome: "reels", aspecto: "9:16", video: true, dica: "vídeo vertical 9:16 de poucos segundos para Reels" },
};

const SCHEMA_CONTEUDO = {
  type: "OBJECT",
  properties: {
    legenda: { type: "STRING" },
    hashtags: { type: "ARRAY", items: { type: "STRING" } },
    texto_arte: { type: "STRING" },
    roteiro: { type: "STRING" },
    prompt_midia: { type: "STRING" },
  },
  required: ["legenda", "hashtags", "prompt_midia"],
};

async function criarConteudo(
  sb: SupabaseClient,
  b: { formato?: string; tema?: string; briefing?: string; gerar_midia?: boolean },
) {
  const formato = FORMATOS[b.formato || ""] ? b.formato! : "feed";
  const f = FORMATOS[formato];
  const tema = (b.tema || "").trim();
  if (!tema) throw new Falha("Diga o tema do conteúdo.");
  if (b.gerar_midia && !env("POE_API_KEY")) throw new Falha("Configure o secret POE_API_KEY para gerar imagens e vídeos.");

  const { data: cfg } = await sb.from("gestao_agente_config").select("*").eq("id", "padrao").maybeSingle();

  const prompt = `Você é o social media da Astrovia Solutions, agência de tecnologia de Curitiba.
Oferta: ${cfg?.oferta || "sistemas, sites e automações com IA para pequenos negócios"}
Tom de voz: ${cfg?.tom || "próximo, direto"}
Identidade visual: ${cfg?.identidade_visual || "tecnológica, escura, neon ciano e magenta"}
Portfólio: ${cfg?.portfolio_url || SITE}

Crie um ${f.nome} para o Instagram da Astrovia.
Tema: ${tema}
${b.briefing ? `Briefing: ${b.briefing}` : ""}

Devolva:
- legenda: em português do Brasil, com gancho forte na primeira linha, parágrafos curtos e uma chamada para ação no final. ${formato === "story" ? "Curta (até 2 linhas)." : "Até 1.200 caracteres."}
- hashtags: 8 a 15 hashtags relevantes, sem o símbolo #, misturando nicho e Curitiba.
- texto_arte: frase curta (até 7 palavras) para aparecer na arte, ou vazio se não precisar.
- roteiro: ${formato === "reels" ? "roteiro do reels em cenas com tempo (ex.: 0-2s: ...), incluindo texto na tela e sugestão de áudio." : formato === "story" ? "sugestão de figurinha/enquete/link para o story." : "vazio."}
- prompt_midia: prompt em INGLÊS, detalhado, para gerar ${f.dica}. Respeite a identidade visual. Descreva cena, luz, composição e estilo. Evite texto escrito na imagem (no máximo a frase de texto_arte, se fizer sentido). Não use marcas ou pessoas famosas.

Responda em JSON.`;

  const { dados, modelo } = await ia(prompt, "auto", SCHEMA_CONTEUDO);
  if (!dados.legenda) throw new Falha("A IA não devolveu a legenda. Tente de novo.", 502);
  const hashtags = (Array.isArray(dados.hashtags) ? dados.hashtags : String(dados.hashtags || "").split(/[\s,]+/))
    .map((h: string) => String(h).replace(/^#/, "").trim()).filter(Boolean).slice(0, 20);

  const { data: row, error } = await sb.from("gestao_conteudos").insert({
    formato, tema, briefing: b.briefing || null,
    legenda: String(dados.legenda).trim(), hashtags,
    texto_arte: dados.texto_arte || null, roteiro: dados.roteiro || null, prompt_midia: dados.prompt_midia || null,
    modelo_texto: modelo, status: b.gerar_midia ? "gerando" : "rascunho",
  }).select().single();
  if (error) throw error;

  if (b.gerar_midia) emSegundoPlano(gerarMidia(sb, row, cfg));
  return { conteudo: row };
}

async function pedirMidia(sb: SupabaseClient, b: { id?: string; prompt_midia?: string }) {
  if (!env("POE_API_KEY")) throw new Falha("Configure o secret POE_API_KEY para gerar imagens e vídeos.");
  const { data: row, error } = await sb.from("gestao_conteudos").select("*").eq("id", b.id || "").single();
  if (error || !row) throw new Falha("Conteúdo não encontrado.", 404);
  if (row.status === "gerando") throw new Falha("Essa mídia já está sendo gerada.");
  const prompt_midia = (b.prompt_midia || row.prompt_midia || "").trim();
  if (!prompt_midia) throw new Falha("Escreva o prompt da mídia.");
  const { data: cfg } = await sb.from("gestao_agente_config").select("*").eq("id", "padrao").maybeSingle();
  const { data: atual } = await sb.from("gestao_conteudos").update({ prompt_midia, status: "gerando", erro: null }).eq("id", row.id).select().single();
  emSegundoPlano(gerarMidia(sb, atual, cfg));
  return { ok: true };
}

// deno-lint-ignore no-explicit-any
async function gerarMidia(sb: SupabaseClient, row: any, cfg: any) {
  const f = FORMATOS[row.formato] || FORMATOS.feed;
  const bot = f.video ? (cfg?.bot_video || "Veo-3.1") : (cfg?.bot_imagem || "Imagen-4");
  try {
    const url = await poeMidia(bot, `${row.prompt_midia}\n\nAspect ratio ${f.aspecto}, vertical.`, f.aspecto, f.video);
    const arq = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!arq.ok) throw new Error(`Não consegui baixar a mídia gerada (${arq.status}).`);
    const tipo = arq.headers.get("content-type")?.split(";")[0] || (f.video ? "video/mp4" : "image/png");
    const ext = tipo.includes("mp4") ? "mp4" : tipo.includes("quicktime") ? "mov" : tipo.includes("jpeg") ? "jpg" : tipo.includes("webp") ? "webp" : f.video ? "mp4" : "png";
    const path = `${row.id}/${Date.now()}.${ext}`;
    const up = await sb.storage.from("gestao-conteudo").upload(path, await arq.arrayBuffer(), { contentType: tipo, upsert: true });
    if (up.error) throw up.error;
    if (row.midia_path) await sb.storage.from("gestao-conteudo").remove([row.midia_path]);
    await sb.from("gestao_conteudos").update({
      midia_path: path, midia_tipo: tipo.startsWith("video") ? "video" : "imagem", modelo_midia: `poe:${bot}`, status: "pronto", erro: null,
    }).eq("id", row.id);
  } catch (e) {
    console.error("gerarMidia", e);
    await sb.from("gestao_conteudos").update({ status: "erro", erro: (e as Error).message || String(e) }).eq("id", row.id);
  }
}

async function poeMidia(bot: string, prompt: string, aspecto: string, video: boolean): Promise<string> {
  const corpo: Record<string, unknown> = {
    model: bot,
    stream: false,
    messages: [{ role: "user", content: prompt }],
    aspect_ratio: aspecto,
  };
  if (/sora/i.test(bot)) corpo.aspect = aspecto === "9:16" ? "720x1280" : "1024x1024";
  const r = await fetch("https://api.poe.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("POE_API_KEY")}` },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(video ? 380_000 : 180_000),
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 402) throw new Error("Os pontos da Poe acabaram.");
  if (!r.ok) throw new Error(`Poe (${bot}): ${d?.error?.message || r.statusText}`);
  const bruto = JSON.stringify(d?.choices?.[0]?.message || d);
  const urls = [...bruto.matchAll(/https?:\/\/[^\s"'<>()\[\]\\]+/g)].map((m) => m[0]);
  const midia = urls.find((u) => /\.(png|jpe?g|webp|mp4|mov)(\?|$)/i.test(u)) || urls.find((u) => /poecdn|poe\.com/i.test(u)) || urls[0];
  if (!midia) throw new Error(`O bot ${bot} não devolveu arquivo. Resposta: ${String(d?.choices?.[0]?.message?.content || "").slice(0, 200)}`);
  return midia;
}

/* ============================================================
   PUBLICAR NO INSTAGRAM — Content Publishing API
   Precisa da permissão instagram_content_publish no token.
   ============================================================ */
async function graphPost(path: string, params: Record<string, string>) {
  const corpo = new URLSearchParams({ ...params, access_token: env("IG_ACCESS_TOKEN") });
  const r = await fetch(`${GRAPH()}/${path}`, { method: "POST", body: corpo });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d?.error?.error_user_msg || d?.error?.message || r.statusText);
  return d;
}

async function publicar(sb: SupabaseClient, b: { id?: string }) {
  if (!env("IG_ACCESS_TOKEN") || !env("IG_USER_ID")) throw new Falha("Configure IG_ACCESS_TOKEN e IG_USER_ID para publicar no Instagram.");
  const { data: row, error } = await sb.from("gestao_conteudos").select("*").eq("id", b.id || "").single();
  if (error || !row) throw new Falha("Conteúdo não encontrado.", 404);
  if (!row.midia_path) throw new Falha("Esse conteúdo ainda não tem imagem ou vídeo.");
  if (["publicando", "publicado", "gerando"].includes(row.status)) throw new Falha("Esse conteúdo não pode ser publicado agora.");
  if (row.formato === "reels" && row.midia_tipo !== "video") throw new Falha("Reels precisa de vídeo.");

  const { data: link, error: e2 } = await sb.storage.from("gestao-conteudo").createSignedUrl(row.midia_path, 3600);
  if (e2 || !link) throw new Falha("Não consegui gerar o link da mídia.", 500);
  await sb.from("gestao_conteudos").update({ status: "publicando", erro: null }).eq("id", row.id);
  emSegundoPlano(publicarBg(sb, row, link.signedUrl));
  return { ok: true };
}

// deno-lint-ignore no-explicit-any
async function publicarBg(sb: SupabaseClient, row: any, url: string) {
  const ig = env("IG_USER_ID");
  try {
    const video = row.midia_tipo === "video";
    const legenda = [row.legenda, (row.hashtags || []).map((h: string) => "#" + h).join(" ")].filter(Boolean).join("\n\n");
    const p: Record<string, string> = {};
    if (row.formato === "story") p.media_type = "STORIES";
    else if (video) { p.media_type = "REELS"; p.share_to_feed = "true"; }
    p[video ? "video_url" : "image_url"] = url;
    if (row.formato !== "story") p.caption = legenda;

    const cont = await graphPost(`${ig}/media`, p);
    const limite = Date.now() + (video ? 110_000 : 30_000);
    let st = "IN_PROGRESS";
    while (Date.now() < limite) {
      const s = await graph(cont.id, { fields: "status_code,status" });
      st = s.status_code;
      if (st === "FINISHED") break;
      if (st === "ERROR" || st === "EXPIRED") throw new Error(`Instagram recusou a mídia: ${s.status || st}`);
      await new Promise((ok) => setTimeout(ok, 5000));
    }
    if (st !== "FINISHED") throw new Error("O Instagram demorou para processar o vídeo. Tente publicar de novo em alguns minutos.");
    const pub = await graphPost(`${ig}/media_publish`, { creation_id: cont.id });
    await sb.from("gestao_conteudos").update({ status: "publicado", publicado_em: new Date().toISOString(), ig_media_id: pub.id, erro: null }).eq("id", row.id);
  } catch (e) {
    console.error("publicar", e);
    await sb.from("gestao_conteudos").update({ status: "erro", erro: `Publicação: ${(e as Error).message || e}` }).eq("id", row.id);
  }
}
