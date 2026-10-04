// ============================================================
// Agente de prospecção da Sala de Gestão Astrovia
//
// Ações (POST { acao, ... }):
//   status             → quais chaves estão configuradas
//   garimpar_google    → busca negócios no Google Maps (Places API New), filtrando pelo cliente ideal
//   garimpar_instagram → hashtag e/ou lista de @ via Graph API (Business Discovery)
//   investigar         → lê avaliações do Google + site do lead e monta o dossiê (dono, dores, momento quente)
//   gerar_abordagem    → escreve a mensagem (Claude; Gemini e Poe como reserva)
//   responder          → o lead respondeu: sugere a próxima mensagem e, se for a hora, a proposta
//   rotina             → rotina diária da Astra: garimpa, investiga e deixa leads + follow-ups em rascunho
//   importar_cnpj      → recebe CNPJs recém-abertos (dados abertos da Receita) e salva como leads
//   melhoria_pedir     → pede uma melhoria de código: Claude Code no GitHub abre PR com prévia (admin)
//   melhorias          → propostas da Astra (PRs), prévias e pedidos em andamento
//   melhoria_publicar  → aprova e publica uma proposta (merge na main; só admin, só pelo botão)
//   melhoria_descartar → fecha uma proposta (admin)
//   criar_conteudo     → legenda/roteiro + imagem/vídeo com bot de mídia da Poe
//   gerar_midia        → (re)gera a imagem/vídeo de um conteúdo
//   publicar           → publica feed/story/reels no Instagram (Graph API)
//
// Segurança: exige login E ser membro da equipe (gestao_membro()).
// Todas as leituras/escritas usam o token de quem chamou, então as
// mesmas regras de RLS da sala valem aqui dentro.
// Exceção: "rotina" e "importar_cnpj" também aceitam uma chave interna
// (header x-astra-chave) guardada só no Vault do banco, cada uma com a
// sua chave e nenhuma outra ação. Nada é enviado a lead: tudo vira rascunho.
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
// Claude: Sonnet escreve (mensagens, respostas, conteúdo); Haiku analisa (dossiê), mais rápido e barato
const CLAUDE_ESCRITA = () => env("CLAUDE_MODEL") || "claude-sonnet-5-5";
const CLAUDE_ANALISE = () => env("CLAUDE_MODEL_ANALISE") || "claude-haiku-4-5";
const GRAPH = () => `https://graph.facebook.com/${env("IG_GRAPH_VERSION") || "v25.0"}`;
const SITE = "https://astrovia-solutions.vercel.app";
// tabela real de preços (vale quando as preferências não trazem outra)
// (o sistema já existe e está pronto para o segmento; a marca do cliente PODE ser aplicada, nunca dizer que já foi)
const PRECOS_REAIS = "Sistema de agendamento e gestão já pronto para o segmento do lead: R$ 500 pagamento único. 7 dias de teste grátis, sem compromisso. Manutenção opcional: R$ 80/mês (não é obrigatória). Se fechar, dá para aplicar a logo e as cores do cliente.";

class Falha extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/* compara sem vazar pelo tempo de resposta */
function iguais(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// cada chave interna libera uma única ação
const CHAVES_INTERNAS: Record<string, string> = { rotina: "astra_chave_rotina", importar_cnpj: "astra_chave_cnpj" };

const clienteAdmin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

/* chave interna válida para esta ação? devolve o cliente service role */
async function acessoInterno(chave: string, acao: string) {
  const nome = CHAVES_INTERNAS[acao];
  if (!nome || chave.length < 32) return null;
  const admin = clienteAdmin();
  const { data } = await admin.rpc("astra_segredo", { nome });
  return typeof data === "string" && data.length >= 32 && iguais(chave, data) ? admin : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST" }, 405);

  try {
    const tamanho = Number(req.headers.get("content-length") || 0);
    if (tamanho > 3_000_000) throw new Falha("Pedido grande demais.", 413);
    const body = await req.json().catch(() => ({}));

    // rotina (pg_cron) e importador de CNPJs (GitHub Actions): chave interna, só a ação dela
    const chave = req.headers.get("x-astra-chave") || "";
    if (chave) {
      const admin = await acessoInterno(chave, String(body.acao || ""));
      if (!admin) throw new Falha("Chave interna inválida.", 401);
      if (body.acao === "rotina") return rotinaEmSegundoPlano(admin);
      return json(await importarCnpj(admin, body));
    }

    const auth = req.headers.get("Authorization") || "";
    if (!/^Bearer\s+\S+/.test(auth)) throw new Falha("Faça login na Sala de Gestão.", 401);
    const apikey = env("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
    const sb = createClient(env("SUPABASE_URL"), apikey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: membro, error: eMembro } = await sb.rpc("gestao_membro");
    if (eMembro || membro !== true) throw new Falha("Acesso restrito à equipe da Astrovia.", 403);

    switch (body.acao) {
      case "status":
        return json({
          claude: !!env("ANTHROPIC_API_KEY"),
          claude_modelo: CLAUDE_ESCRITA(),
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
      case "rotina":
        // "rodar agora" pela sala (membro já conferido acima): mesma rotina do cron
        return rotinaEmSegundoPlano(clienteAdmin(), true);
      case "melhoria_pedir":
      case "melhoria_publicar":
      case "melhoria_descartar": {
        const { data: admin } = await sb.rpc("gestao_admin");
        if (admin !== true) throw new Falha("Só o administrador mexe nas melhorias do sistema.", 403);
        if (body.acao === "melhoria_pedir") return json(await pedirMelhoria(body));
        return json(await decidirMelhoria(Number(body.numero), body.acao === "melhoria_publicar"));
      }
      case "melhorias":
        return json(await listarMelhorias());
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
  fonte: "google" | "instagram" | "manual" | "receita";
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
  cnpj?: string | null;
  aberto_em?: string | null;
  email?: string | null;
  dono?: string | null;
  quente?: boolean;
  quente_motivo?: string | null;
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

  if (l.fonte === "receita") {
    // CNPJ recém-aberto: ainda montando a estrutura, a hora certa de ter sistema próprio
    const dias = l.aberto_em ? Math.round((Date.now() - Date.parse(l.aberto_em)) / 864e5) : null;
    if (dias !== null && dias <= 45) { s += 30; m.push(`Abriu há ${dias} dias`); }
    else if (dias !== null) { s += 22; m.push(`Aberto há ${dias} dias`); }
    if (l.telefone) { s += 10; m.push("Telefone do cadastro na Receita (confira se não é do contador)"); }
    if (l.dono) { s += 5; m.push(`Dono: ${l.dono}`); }
  }
  else if (!site) { s += 30; m.push("Não tem site"); }
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
  if (/est[eé]t|beleza|sal[aã]o|sobrancelha|unha|spa/.test(n)) return { nome: "LUXE (sistema de agendamento e gestão para clínicas de estética)", url: `${SITE}/demos/luxe/` };
  if (/cl[ií]nica|odonto|dent|biom[eé]d|fisio|consult[oó]rio|harmoniza/.test(n)) return { nome: "LUXE (sistema de agendamento e gestão para clínicas)", url: `${SITE}/demos/luxe/` };
  if (/brech|moda|roupa|loja/.test(n)) return { nome: "Lobas Brechó (loja online premium feita pela Astrovia)", url: SITE };
  return { nome: "portfólio da Astrovia", url: SITE };
}

async function gerarAbordagem(sb: SupabaseClient, b: { prospect_id?: string; canal?: string; tipo?: string; instrucao?: string; motor?: string; origem?: string; substituir?: boolean }) {
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
  const nichoLead = semAcento(p.nicho || "");
  const doNicho = (prefs.ofertas_nicho || []).find((o) => o.nicho && nichoLead.includes(semAcento(o.nicho).trim()));
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
  // o que o Christian ensinou à Astra (regras, tom, preços) também vale para a prospecção
  const { data: tenant } = await sb.from("astra_tenants").select("id").eq("slug", "astrovia").maybeSingle();
  const { data: ensinado } = tenant
    ? await sb.from("astra_conhecimento").select("conteudo").eq("tenant_id", tenant.id).eq("ativo", true).in("tipo", ["regra", "tom", "preco"]).order("criado_em").limit(30)
    : { data: [] as { conteudo: string }[] };
  const nunca = listaPalavras(prefs.nunca);

  if (/\/demos\//.test(demo.url)) demo.url = `${demo.url}?nome=${encodeURIComponent(p.nome)}`;
  const dz = p.dossie || {};
  const dados = {
    nome: p.nome, nicho: p.nicho, cidade: p.cidade, instagram: p.instagram, site: p.site,
    nota_google: p.nota_google, avaliacoes_google: p.avaliacoes, seguidores: p.seguidores,
    bio_instagram: p.bio, pontos_observados: p.motivos,
    ...(p.fonte === "receita" && p.aberto_em ? { negocio_recem_aberto: `abriu em ${String(p.aberto_em).split("-").reverse().join("/")}`, dono_provavel: p.dono || null } : {}),
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
COMO ESCREVER (o mais importante: tem que parecer o Christian digitando no celular, não uma IA nem um vendedor)
- Escreva como dono de pequena empresa falando com outro dono: frases curtas, conversa de verdade, português do dia a dia do WhatsApp ("pra", "tá", "dar uma olhada" são bem-vindos). ${prefs.emoji === "nenhum" ? "Sem emoji." : "No máximo 1 emoji, e só se couber naturalmente."}
- Formalidade: ${prefs.formalidade === "formal" ? "educado e profissional, mas ainda natural (sem gírias)" : prefs.formalidade === "informal" ? "bem informal, como conversa entre conhecidos" : "leve e respeitosa, como alguém da cidade puxando conversa"}.
- Comece com "Oi" ou "Olá" (+ primeiro nome, se houver dono_provavel). Não use "Bom dia/Boa tarde": a mensagem pode ser enviada em qualquer horário.
- Diga quem é de um jeito simples (ex.: "aqui é o Christian, sou de Curitiba também"). Sem assinatura no fim, sem nome da empresa em destaque.
- Mostre que olhou o negócio com UMA observação humana, do jeito que uma pessoa falaria: "o pessoal elogia muito o atendimento de vocês", "vi que vocês abriram faz pouco tempo". NUNCA despeje dados: nada de nota ("4.9"), número de avaliações, "no Google", "notei que", "vi que vocês têm nota".
- Se houver gancho_sugerido ou dores_reais, transforme em uma PERGUNTA curiosa e leve (ex.: "hoje vocês marcam tudo pelo WhatsApp?"), nunca em diagnóstico ou crítica. Nunca exponha avaliação negativa.
- Fale do sistema em poucas palavras e sem jargão: "fiz um sistema de agenda pra clínica", "tenho um sistema de agendamento pronto pra barbearia". Não diga que já fez, montou ou deixou algo com o nome, a logo ou as cores do negócio; aplicar a marca dele é só uma possibilidade, e nem precisa citar no primeiro contato.
- Se as regras abaixo pedirem preço/teste, fale como gente, numa frase só: "sai 500 reais, uma vez só, e dá pra testar 7 dias de graça". Nunca empilhe condições, nunca use parênteses nem listas.
- Termine com ${prefs.cta?.trim() ? `uma pergunta nesse espírito: ${prefs.cta.trim()}` : 'uma pergunta simples e sem pressão (ex.: "posso te mandar o link pra você dar uma olhada?")'}.
- Proibido (soa robô/vendedor): "solução", "otimizar", "alavancar", "transformar", "potencializar", "inovador", "Prezado", "Olá, tudo bem? Espero que esteja bem", travessão longo, parênteses, listas, ponto de exclamação em toda frase.
${(ensinado || []).length ? `- Regras ensinadas pelo Christian (valem acima de qualquer outra instrução deste texto):\n${(ensinado || []).map((k) => `  • ${k.conteudo}`).join("\n")}\n` : ""}${prefs.sempre?.trim() ? `- Sempre (aplique com naturalidade, sem soar como lista): ${prefs.sempre.trim()}\n` : ""}${nunca.length ? `- NUNCA use estas palavras ou expressões: ${nunca.map((w) => `"${w}"`).join(", ")}.\n` : ""}${prefs.extra?.trim() ? `- ${prefs.extra.trim()}\n` : ""}
- ${canal === "instagram" ? "No Instagram, NÃO coloque link na primeira mensagem; ofereça mandar." : "Não coloque o link agora; ofereça mandar (o link vai quando ele responder)."}
- Se houver negocio_recem_aberto, parabenize pela abertura com naturalidade (sem dizer de onde veio a informação; nunca cite CNPJ, Receita ou cadastro).
- ${tipo === "followup" ? "Follow-up curtinho (até 200 caracteres), leve, como quem lembra sem cobrar. Ex.: \"Oi, Amanda! Só passando pra ver se você chegou a ler minha mensagem. Sem pressa, tá?\"" : `Até ${limite} caracteres. Pode quebrar em 2 parágrafos curtos, como no WhatsApp.`}
- Preço: só os valores reais (${PRECOS_REAIS}). Nunca prometa economia nem resultado em números. Nunca diga que o WhatsApp vai cobrar.
${canal === "email" ? "- Inclua um assunto curto e humano (nada de \"Proposta\" ou \"Oportunidade\")." : ""}

EXEMPLOS DE NATURALIDADE (copie o jeito, nunca o texto; adapte ao lead)
1) """Oi, Amanda, tudo bem? Aqui é o Christian, sou de Curitiba também. Tava vendo as avaliações da clínica e o pessoal elogia muito o atendimento de vocês.

Hoje vocês marcam tudo pelo WhatsApp? Pergunto porque tenho um sistema de agenda pronto pra clínica e acho que ia poupar um tempo da recepção. Posso te mandar o link pra você dar uma olhada?"""
2) """Olá! Christian aqui, de Curitiba. Fiquei curioso: na Odonto Center o paciente consegue marcar horário sozinho ou é tudo por mensagem? Tenho um sistema de agendamento pronto pra consultório, sai 500 reais uma vez só e dá pra testar 7 dias de graça. Quer que eu te mande pra ver?"""
${exemplos.length ? `\nMENSAGENS QUE JÁ FUNCIONARAM (referência de assunto e abordagem; o jeito de escrever segue os exemplos acima)\n${exemplos.map((e, i) => `${i + 1}) """${e.slice(0, 700)}"""`).join("\n")}\n` : ""}
Responda em JSON no formato {"assunto": "...", "mensagem": "...", "alternativa": "..."} (alternativa = segunda versão com outro gancho).`;

  const temp = prefs.criatividade === "precisa" ? 0.35 : prefs.criatividade === "criativa" ? 0.95 : 0.65;
  const motor = b.motor === "gemini" ? "gemini" : "auto";
  let { dados: out, modelo } = await ia(prompt, motor, SCHEMA_ABORDAGEM, temp);
  if (!out.mensagem) throw new Falha("A IA não devolveu mensagem. Tente de novo.", 502);

  // conferência: se escapou palavra proibida ou passou muito do tamanho, pede de novo uma vez
  const ROBO: [RegExp, string][] = [
    [/\d[.,]\d\s*(estrelas|★|no google)?|\d+\s+avalia/i, "citou nota ou número de avaliações (soa como robô)"],
    [/[()]/, "usou parênteses"],
    [/\b(solu[çc][ãa]o|otimizar|alavancar|potencializar|inovador|prezad[oa])\b/i, "usou palavra de vendedor/robô"],
    [/\b(notei que|vi que .{0,30}tem nota)\b/i, "abriu com dado em vez de conversa"],
    [/\b(bom dia|boa tarde|boa noite)\b/i, "usou saudação de horário"],
  ];
  const problemas = (t = "") => [
    ...ROBO.filter(([re]) => re.test(t)).map(([, m]) => m),
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
    prospect_id: p.id, canal, tipo, texto: monta(t!.trim()), status: "rascunho", modelo, origem: b.origem === "rotina" ? "rotina" : "manual",
  }));
  // "refazer a mensagem": os rascunhos antigos deste lead saem da fila de aprovação
  if (b.substituir) await sb.from("gestao_abordagens").update({ status: "descartada" }).eq("prospect_id", p.id).eq("status", "rascunho").in("tipo", ["primeiro_contato", "followup"]);
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

/* acha no Google Maps um negócio que veio sem place_id (ex.: CNPJ novo da Receita) */
async function acharNoMaps(key: string, p: { nome: string; endereco?: string | null; cidade?: string | null }) {
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri,places.nationalPhoneNumber,places.formattedAddress",
    },
    body: JSON.stringify({ textQuery: `${p.nome} ${p.endereco || p.cidade || "Curitiba"}`, languageCode: "pt-BR", regionCode: "BR", pageSize: 3 }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return null;
  const d = await r.json();
  // só aceita se o nome bater (evita confundir com o vizinho)
  const palavras = semAcento(p.nome).split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  return (d.places || []).find((x: { displayName?: { text?: string } }) => {
    const n = semAcento(x.displayName?.text || "");
    return palavras.length > 0 && palavras.filter((w) => n.includes(w)).length >= Math.min(2, palavras.length);
  }) || null;
}

async function investigar(sb: SupabaseClient, b: { prospect_id?: string }) {
  const { data: p, error } = await sb.from("gestao_prospects").select("*").eq("id", b.prospect_id || "").single();
  if (error || !p) throw new Falha("Lead não encontrado.", 404);
  const { data: cfg } = await sb.from("gestao_agente_config").select("*").eq("id", "padrao").maybeSingle();
  const icp: Icp = (cfg?.prefs as { icp?: Icp } | null)?.icp || {};

  const key = env("GOOGLE_PLACES_KEY");
  // lead da Receita: procura o negócio no Google Maps para ter avaliações, site e nota
  let placeId: string | null = p.fonte === "google" ? p.externo_id : p.raw?.place_id || null;
  const extra: Record<string, unknown> = {};
  if (!placeId && key && p.fonte === "receita") {
    const achado = await acharNoMaps(key, p).catch(() => null);
    if (achado) {
      placeId = achado.id;
      Object.assign(extra, {
        site: p.site || achado.websiteUri || null, maps_url: achado.googleMapsUri || null,
        nota_google: achado.rating ?? null, avaliacoes: achado.userRatingCount ?? null,
        telefone: p.telefone || achado.nationalPhoneNumber || null,
        raw: { ...(p.raw || {}), place_id: achado.id },
      });
      Object.assign(p, extra);
    }
  }
  const siteProprio = p.site && !SITE_FRACO.test(p.site) ? p.site : null;
  const [lugar, site] = await Promise.all([
    key && placeId
      ? fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=pt-BR`, {
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

  const { dados: ia_, modelo } = await ia(prompt, "auto", SCHEMA_DOSSIE, 0.3, true);
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
    quente: !!ia_.momento_quente || (p.fonte === "receita" && !!p.quente),
    quente_motivo: ia_.motivo_quente || (p.fonte === "receita" ? p.quente_motivo : null) || null,
    dossie, investigado_em: new Date().toISOString(),
    score: Math.max(0, Math.min(100, score)), motivos, ...extra,
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
Tabela de preços e condições (use SOMENTE isto para valores): ${prefs.precos?.trim() || PRECOS_REAIS}
Nunca prometa economia nem resultados em números; nunca diga que o WhatsApp vai cobrar.
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
   IA DE TEXTO — Claude primeiro (Sonnet escreve, Haiku analisa);
   Gemini grátis e Poe como reserva. motor: "auto" | "gemini"
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

/* esquema do Gemini (OBJECT, STRING...) → JSON Schema das saídas estruturadas do Claude */
function paraJsonSchema(sc: Saida): Saida {
  const t = String(sc.type || "").toLowerCase();
  const out: Saida = { type: t };
  if (sc.enum) out.enum = sc.enum;
  if (sc.description) out.description = sc.description;
  if (t === "object") {
    out.properties = Object.fromEntries(Object.entries(sc.properties || {}).map(([k, v]) => [k, paraJsonSchema(v as Saida)]));
    out.required = sc.required || [];
    out.additionalProperties = false;
  }
  if (t === "array") out.items = paraJsonSchema(sc.items || { type: "STRING" });
  return out;
}

async function claude(prompt: string, schema: unknown, temperature: number, modelo: string): Promise<Saida> {
  // Sonnet/Opus 5.x: sem temperature (a API recusa) e raciocínio leve; Haiku 4.5: temperature normal
  const nova = /claude-(sonnet|opus|fable)-5/.test(modelo);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 8000,
      ...(nova ? { output_config: { effort: "medium", format: { type: "json_schema", schema: paraJsonSchema(schema as Saida) } } }
        : { temperature, output_config: { format: { type: "json_schema", schema: paraJsonSchema(schema as Saida) } } }),
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(80000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Claude ${r.status}: ${d?.error?.message || r.statusText}`);
  if (d.stop_reason === "refusal") throw new Error("Claude recusou o pedido");
  const texto = (d.content || []).filter((x: { type: string }) => x.type === "text").map((x: { text: string }) => x.text).join("");
  const out = lerJson(texto);
  if (!out || typeof out !== "object") throw new Error("Claude não devolveu JSON");
  return out;
}

// Ordem: Claude (se houver ANTHROPIC_API_KEY) → Gemini grátis → Poe. motor "gemini" pula o Claude.
async function ia(prompt: string, motor = "auto", schema: unknown = SCHEMA_ABORDAGEM, temperature = 0.7, analise = false): Promise<{ dados: Saida; modelo: string }> {
  const temClaude = !!env("ANTHROPIC_API_KEY"), temGemini = !!env("GEMINI_API_KEY"), temPoe = !!env("POE_API_KEY");
  if (temClaude && motor !== "gemini") {
    const modelo = analise ? CLAUDE_ANALISE() : CLAUDE_ESCRITA();
    try {
      return { dados: await claude(prompt, schema, temperature, modelo), modelo };
    } catch (e) {
      console.error("Claude indisponível, usando Gemini:", String((e as Error).message).slice(0, 200));
    }
  }
  if (!temGemini) {
    if (motor === "auto" && temPoe) return { dados: await poe(prompt), modelo: `poe:${POE_MODEL()}` };
    throw new Falha("Configure o secret ANTHROPIC_API_KEY (ou GEMINI_API_KEY) para gerar mensagens.");
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

/* ============================================================
   ROTINA DIÁRIA DA ASTRA — o pg_cron chama a cada 5 min de manhã.
   Cada rodada faz um pedaço (garimpar, investigar, escrever) até a
   meta do dia; as mensagens ficam em RASCUNHO em "Aprovar envios".
   Nada é enviado a ninguém daqui.
   Preferências (gestao_agente_config.prefs.rotina): ativa, meta,
   nota_min, followups, max_followups, garimpos_dia, nichos
   ============================================================ */
type PrefsRotina = { ativa: boolean; meta: number; nota_min: number; followups: boolean; max_followups: number; garimpos_dia: number; nichos?: string[] };
const hojeBR = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const horaBR = () => Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", minute: "numeric", hour12: false }).replace(":", "."));
const LIMITE_RODADA_S = 85; // a função tem ~150 s: não começa nada novo depois disso

function rotinaEmSegundoPlano(sb: SupabaseClient, manual = false) {
  emSegundoPlano(rotina(sb, manual).catch((e) => console.error("rotina", e)));
  return json({ ok: true, mensagem: "Rotina iniciada. Os rascunhos aparecem em Aprovar envios." }, 202);
}

async function avisarDono(sb: SupabaseClient, texto: string) {
  const { data: t } = await sb.from("astra_tenants").select("id").eq("slug", "astrovia").maybeSingle();
  if (!t) return;
  let { data: c } = await sb.from("astra_contatos").select("id").eq("tenant_id", t.id).eq("canal", "interno").eq("externo_id", "dono").maybeSingle();
  if (!c) c = (await sb.from("astra_contatos").insert({ tenant_id: t.id, canal: "interno", externo_id: "dono", nome: "Dono", status: "cliente" }).select("id").single()).data;
  if (c) await sb.from("astra_mensagens").insert({ tenant_id: t.id, contato_id: c.id, papel: "agente", conteudo: texto.slice(0, 3000) });
}

async function rotina(sb: SupabaseClient, manual: boolean) {
  const t0 = Date.now();
  const passou = () => (Date.now() - t0) / 1000;
  const dia = hojeBR();
  const desde = new Date(`${dia}T00:00:00-03:00`).toISOString();

  const { data: cfg } = await sb.from("gestao_agente_config").select("*").eq("id", "padrao").maybeSingle();
  const pr = ((cfg?.prefs || {}) as { rotina?: Partial<PrefsRotina> }).rotina || {};
  const r: PrefsRotina = {
    ativa: pr.ativa !== false,
    meta: Math.min(30, Math.max(1, Number(pr.meta) || 10)),
    nota_min: Math.min(90, Math.max(0, Number(pr.nota_min ?? 40))),
    followups: pr.followups !== false,
    max_followups: Math.min(3, Math.max(0, Number(pr.max_followups ?? 2))),
    garimpos_dia: Math.min(8, Math.max(0, Number(pr.garimpos_dia ?? 4))),
    nichos: Array.isArray(pr.nichos) && pr.nichos.length ? pr.nichos : undefined,
  };
  if (!r.ativa && !manual) return;

  // trava: uma rodada por vez (a próxima do cron sai na hora se esta ainda estiver rodando)
  await sb.from("astra_rotinas").upsert({ dia }, { onConflict: "dia", ignoreDuplicates: true });
  const agora = new Date().toISOString();
  const { data: reg } = await sb.from("astra_rotinas").update({ ocupada_ate: new Date(Date.now() + 170e3).toISOString(), atualizado_em: agora })
    .eq("dia", dia).or(`ocupada_ate.is.null,ocupada_ate.lt."${agora}"`).select().maybeSingle();
  if (!reg) return;

  const log: string[] = Array.isArray(reg.detalhes?.log) ? reg.detalhes.log : [];
  const anotar = (m: string) => { log.push(`${new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }).slice(0, 5)} ${m}`); console.log("rotina:", m); };
  let garimpos = reg.garimpos || 0, erro: string | null = null, semLeads = false;

  const contar = async (tipo: string) => {
    // descartadas não contam: se você descartou, a rotina repõe com outro lead
    const { data } = await sb.from("gestao_abordagens").select("prospect_id").eq("origem", "rotina").eq("tipo", tipo).in("status", ["rascunho", "enviada"]).gte("criado_em", desde);
    return new Set((data || []).map((x) => x.prospect_id)).size;
  };

  try {
    // 1) follow-ups: abordados há X dias sem resposta, até max_followups por lead
    if (r.followups && r.max_followups > 0) {
      const limite = new Date(Date.now() - (cfg?.followup_dias || 3) * 864e5).toISOString();
      const { data: parados } = await sb.from("gestao_prospects").select("id, nome, abordado_em").eq("status", "abordado").lt("abordado_em", limite).order("abordado_em").limit(30);
      for (const p of parados || []) {
        if (passou() > LIMITE_RODADA_S - 25) break;
        const { data: hist } = await sb.from("gestao_abordagens").select("tipo, status, canal, criado_em").eq("prospect_id", p.id).order("criado_em", { ascending: false }).limit(20);
        const h = hist || [];
        if (h.some((x) => x.tipo === "recebida")) continue; // respondeu: é com o Christian
        if (h.some((x) => x.tipo === "followup" && x.criado_em > p.abordado_em)) continue; // já tem (rascunho, enviado ou descartado)
        if (h.filter((x) => x.tipo === "followup" && x.status === "enviada").length >= r.max_followups) continue;
        const ultima = h.find((x) => x.status === "enviada" && (x.tipo === "primeiro_contato" || x.tipo === "followup"));
        try {
          await gerarAbordagem(sb, { prospect_id: p.id, canal: ultima?.canal || "whatsapp", tipo: "followup", origem: "rotina" });
          anotar(`follow-up pronto: ${p.nome}`);
        } catch (e) { anotar(`follow-up falhou (${p.nome}): ${String((e as Error).message).slice(0, 120)}`); }
      }
    }

    // 2) leads novos até a meta do dia
    let feitos = await contar("primeiro_contato");
    const tentados = new Set<string>();
    const nichos = r.nichos || (cfg?.nichos?.length ? cfg.nichos : ["barbearia", "clínica de estética", "salão de beleza", "oficina mecânica"]);
    const doAno = Math.floor((Date.now() - Date.parse(`${dia.slice(0, 4)}-01-01`)) / 864e5);
    while (feitos < r.meta && passou() < LIMITE_RODADA_S) {
      const { data: cands } = await sb.from("gestao_prospects").select("id, nome, nicho, telefone, instagram, investigado_em, score")
        .eq("status", "novo").gte("score", r.nota_min).or("telefone.not.is.null,instagram.not.is.null")
        .order("quente", { ascending: false }).order("score", { ascending: false }).limit(60);
      const ids = (cands || []).map((c) => c.id);
      const { data: usados } = ids.length ? await sb.from("gestao_abordagens").select("prospect_id").in("prospect_id", ids) : { data: [] as { prospect_id: string }[] };
      const ja = new Set((usados || []).map((u) => u.prospect_id));
      const c = (cands || []).find((x) => !ja.has(x.id) && !tentados.has(x.id));

      if (!c) {
        // acabaram os bons: garimpa o próximo nicho da fila (muda a cada dia)
        if (garimpos >= r.garimpos_dia) { semLeads = true; break; }
        if (passou() > 60) break;
        const busca = nichos[(doAno + garimpos) % nichos.length];
        garimpos++;
        await sb.from("astra_rotinas").update({ garimpos }).eq("dia", dia);
        try {
          const g = await garimparGoogle(sb, { busca, cidade: cfg?.cidade_padrao || "Curitiba, PR", paginas: 2 });
          anotar(`garimpo "${busca}": ${g.encontrados} achados, ${g.novos.length} novos no perfil`);
        } catch (e) { anotar(`garimpo "${busca}" falhou: ${String((e as Error).message).slice(0, 120)}`); }
        continue;
      }
      tentados.add(c.id);

      if (!c.investigado_em) {
        if (passou() > 50) break; // investigação pode levar ~1 min: fica para a próxima rodada
        try {
          const inv = await investigar(sb, { prospect_id: c.id });
          if ((inv.prospect?.score ?? 0) < r.nota_min) { anotar(`${c.nome}: fora do perfil depois do dossiê`); continue; }
        } catch (e) { anotar(`investigar ${c.nome} falhou: ${String((e as Error).message).slice(0, 120)}`); continue; }
        if (passou() > LIMITE_RODADA_S) break;
      }
      try {
        await gerarAbordagem(sb, { prospect_id: c.id, canal: c.telefone ? "whatsapp" : "instagram", tipo: "primeiro_contato", origem: "rotina" });
        feitos++;
        anotar(`mensagem pronta: ${c.nome} (${c.nicho || "sem nicho"})`);
      } catch (e) { anotar(`mensagem para ${c.nome} falhou: ${String((e as Error).message).slice(0, 120)}`); }
    }
  } catch (e) {
    erro = String((e as Error).message || e).slice(0, 300);
    anotar(`erro: ${erro}`);
  }

  // fecha a rodada
  const [leads, followups] = await Promise.all([contar("primeiro_contato"), contar("followup")]);
  const concluida = leads >= r.meta;
  const fimDaJanela = horaBR() >= 8.5;
  const status = concluida ? "concluida" : erro ? "erro" : fimDaJanela || manual ? "parcial" : "rodando";
  let avisado = !!reg.avisado;
  if (!avisado && (concluida || fimDaJanela || manual)) {
    const { data: hoje } = await sb.from("gestao_abordagens").select("gestao_prospects(nome, nicho)").eq("origem", "rotina").eq("tipo", "primeiro_contato")
      .eq("status", "rascunho").gte("criado_em", desde).order("criado_em", { ascending: false }).limit(20);
    const h = horaBR(), oi = h < 12 ? "Bom dia!" : h < 18 ? "Boa tarde!" : "Boa noite!";
    const nomes = [...new Set((hoje || []).map((x: any) => x.gestao_prospects?.nome).filter(Boolean))].slice(0, 3);
    await avisarDono(sb, leads || followups
      ? `${oi} A rotina de hoje deixou ${leads} ${leads === 1 ? "lead novo" : "leads novos"} com mensagem${followups ? ` e ${followups} follow-up${followups > 1 ? "s" : ""}` : ""} em Aprovar envios.${nomes.length ? ` Entre eles: ${nomes.join(", ")}.` : ""} Nada foi enviado: é só revisar e aprovar.${concluida ? "" : ` Fiquei abaixo da meta de ${r.meta}: ${erro ? "deu um erro no caminho" : semLeads ? "faltaram leads bons no perfil" : "o tempo da rodada acabou antes; se quiser, peça para eu rodar de novo"}.`}`
      : `${oi} Rodei a prospecção de hoje, mas não encontrei leads bons o suficiente para a meta de ${r.meta}.${erro ? " Deu um erro no caminho; vale olhar o painel de resultados." : " Posso testar outro nicho ou bairro se você quiser."}`);
    avisado = true;
  }
  await sb.from("astra_rotinas").update({
    status, leads_preparados: leads, followups, garimpos, rodadas: (reg.rodadas || 0) + 1, ocupada_ate: null, avisado, erro,
    detalhes: { log: log.slice(-40), meta: r.meta }, atualizado_em: new Date().toISOString(),
  }).eq("dia", dia);
}

/* ============================================================
   CNPJs RECÉM-ABERTOS — o GitHub Actions lê os dados abertos da
   Receita Federal todo mês, filtra Curitiba + atividades-alvo e
   manda para cá. Aqui valida, limpa (nada de CPF) e salva.
   ============================================================ */
const so = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const texto = (s: unknown, max = 120) => String(s ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\d{11}/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E|Em)\b/g, (w) => w.toLowerCase());
const NICHOS_RECEITA = ["barbearia", "salão de beleza", "clínica de estética", "clínica odontológica", "clínica médica", "fisioterapia", "oficina mecânica", "oficina de motos"];

async function importarCnpj(sb: SupabaseClient, b: { leads?: unknown[] }) {
  const lista = Array.isArray(b.leads) ? b.leads.slice(0, 300) : [];
  const leads: Lead[] = [];
  for (const x of lista as Record<string, unknown>[]) {
    const cnpj = so(x.cnpj);
    const nome = texto(x.nome);
    const aberto = /^\d{4}-\d{2}-\d{2}$/.test(String(x.aberto_em)) ? String(x.aberto_em) : null;
    if (cnpj.length !== 14 || nome.length < 2 || !aberto) continue;
    const dias = (Date.now() - Date.parse(aberto)) / 864e5;
    if (!(dias >= 0 && dias <= 150)) continue;
    const tel = so(x.telefone);
    const telefone = tel.length === 10 || tel.length === 11 ? `(${tel.slice(0, 2)}) ${tel.slice(2, -4)}-${tel.slice(-4)}` : null;
    const email = /^[^\s@<>()]{1,64}@[^\s@<>()]{1,190}\.[a-z]{2,}$/i.test(String(x.email ?? "")) ? String(x.email).toLowerCase() : null;
    const dono = /^\p{L}{2,20}$/u.test(String(x.dono ?? "")) ? titulo(String(x.dono)) : null;
    const nicho = NICHOS_RECEITA.includes(String(x.nicho)) ? String(x.nicho) : null;
    const data = aberto.split("-").reverse().join("/");
    leads.push(pontuar({
      fonte: "receita", externo_id: cnpj, cnpj, nome: titulo(nome), nicho, cidade: "Curitiba, PR",
      endereco: texto(x.endereco, 200) || null, telefone, email, dono, aberto_em: aberto,
      quente: true, quente_motivo: `Negócio aberto em ${data}`,
      raw: { cnae: so(x.cnae).slice(0, 7) || null, bairro: texto(x.bairro, 60) || null, mei: x.mei === true },
    }));
  }
  // o mesmo negócio pode já ter vindo do Google: não duplica pelo telefone
  const tels = [...new Set(leads.map((l) => l.telefone).filter(Boolean))] as string[];
  const { data: ja } = tels.length ? await sb.from("gestao_prospects").select("telefone").in("telefone", tels) : { data: [] as { telefone: string }[] };
  const usados = new Set((ja || []).map((x) => x.telefone));
  const unicos = leads.filter((l) => !l.telefone || !usados.has(l.telefone));
  const r = await salvarNovos(sb, unicos);
  return { recebidos: lista.length, validos: leads.length, ja_existiam: leads.length - unicos.length + r.repetidos, novos: r.novos.length };
}

/* ============================================================
   MELHORIAS DE CÓDIGO — a Astra pede, o Claude Code (GitHub
   Actions, workflow astra-melhoria.yml) faz a mudança e abre um
   PR com prévia da Vercel. Publicar = merge na main, só pelo
   botão do admin na sala. Token: GITHUB_TOKEN_ASTRA (fine-grained,
   só este repositório: Contents, Pull requests, Actions RW;
   Deployments R).
   ============================================================ */
const REPO = () => env("GITHUB_REPO_ASTRA") || "ArmazemPinholog/AstroviaSolutions";
const RAMO_ASTRA = /^astra\/melhoria-[a-z0-9-]+$/;

async function gh(caminho: string, init: RequestInit = {}) {
  const token = env("GITHUB_TOKEN_ASTRA");
  if (!token) throw new Falha("Falta o secret GITHUB_TOKEN_ASTRA no Supabase para a Astra mexer no código.", 400);
  const r = await fetch(`https://api.github.com/repos/${REPO()}${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "astra-astrovia", ...(init.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  if (r.status === 204) return {};
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Falha(`GitHub: ${d?.message || r.statusText}`, 502);
  return d;
}

async function pedirMelhoria(b: { pedido?: string }) {
  const pedido = String(b.pedido || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, 3000);
  if (pedido.length < 15) throw new Falha("Descreva a melhoria com um pouco mais de detalhe.");
  const id = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
  await gh("/actions/workflows/astra-melhoria.yml/dispatches", { method: "POST", body: JSON.stringify({ ref: "main", inputs: { pedido, id } }) });
  return { ok: true, id, nota: "O Claude Code está trabalhando no GitHub (leva de 3 a 15 minutos). A proposta aparece em Astra → Melhorias com um link de prévia." };
}

async function previa(ramo: string) {
  try {
    const deps = await gh(`/deployments?ref=${encodeURIComponent(ramo)}&per_page=1`);
    if (!deps?.[0]) return { estado: "aguardando" };
    const st = await gh(`/deployments/${deps[0].id}/statuses?per_page=1`);
    return { estado: st?.[0]?.state || "aguardando", url: st?.[0]?.environment_url || st?.[0]?.target_url || null };
  } catch { return { estado: "desconhecido" }; }
}

async function listarMelhorias() {
  const [prs, runs] = await Promise.all([
    gh("/pulls?state=all&per_page=30&sort=created&direction=desc"),
    gh("/actions/workflows/astra-melhoria.yml/runs?per_page=10").catch(() => ({ workflow_runs: [] })),
  ]);
  const daAstra = (prs || []).filter((p: any) => RAMO_ASTRA.test(p.head?.ref || ""));
  const ramos = new Set(daAstra.map((p: any) => p.head.ref.replace("astra/melhoria-", "")));
  const propostas = await Promise.all(daAstra.filter((p: any) => p.state === "open").map(async (p: any) => ({
    numero: p.number, titulo: String(p.title).replace(/^Astra: /, ""), resumo: String(p.body || "").split("\n---")[0].slice(0, 1200),
    criada_em: p.created_at, url: p.html_url, previa: await previa(p.head.ref),
  })));
  const pedido = (r: any) => String(r.display_title || "").replace(/^melhoria [a-z0-9-]+: /, "").slice(0, 300);
  const idDo = (r: any) => String(r.display_title || "").match(/^melhoria ([a-z0-9-]+):/)?.[1] || "";
  return {
    propostas,
    em_andamento: (runs.workflow_runs || []).filter((r: any) => r.status !== "completed").map((r: any) => ({ pedido: pedido(r), desde: r.created_at })),
    // terminou sem abrir proposta: falhou ou não havia o que mudar
    sem_proposta: (runs.workflow_runs || []).filter((r: any) => r.status === "completed" && !ramos.has(idDo(r)) && Date.now() - Date.parse(r.created_at) < 3 * 864e5)
      .map((r: any) => ({ pedido: pedido(r), resultado: r.conclusion === "success" ? "nada foi alterado (veja o motivo no GitHub)" : "falhou", url: r.html_url, quando: r.created_at })),
    publicadas: daAstra.filter((p: any) => p.merged_at).slice(0, 5).map((p: any) => ({ numero: p.number, titulo: String(p.title).replace(/^Astra: /, ""), publicada_em: p.merged_at })),
  };
}

async function decidirMelhoria(numero: number, publicar: boolean) {
  if (!Number.isInteger(numero) || numero < 1) throw new Falha("Proposta inválida.");
  const pr = await gh(`/pulls/${numero}`);
  // só propostas da Astra, abertas, apontando para a main
  if (!RAMO_ASTRA.test(pr.head?.ref || "") || pr.base?.ref !== "main" || pr.head?.repo?.full_name !== REPO()) throw new Falha("Essa proposta não é da Astra.", 403);
  if (pr.state !== "open") throw new Falha("Essa proposta já foi decidida.");
  if (publicar) {
    await gh(`/pulls/${numero}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: "squash", sha: pr.head.sha }) });
  } else {
    await gh(`/pulls/${numero}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
  }
  await gh(`/git/refs/heads/${pr.head.ref}`, { method: "DELETE" }).catch(() => null);
  return { ok: true, nota: publicar ? "Publicada: a Vercel coloca no ar em 1 a 2 minutos." : "Proposta descartada." };
}
