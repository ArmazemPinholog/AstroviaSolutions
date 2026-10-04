// Astra — inteligência da Astrovia dentro da Sala de Gestão.
// Entradas:
//   • WhatsApp (webhook assinado pela Meta): clientes → atendimento; número de alguém da equipe → modo dono
//   • Sala de Gestão (login + gestao_membro): { modo: "dono", mensagem|audio } ou teste do atendimento
//   • Chat público de demonstração (x-demo-key), para o site
// Secrets: GEMINI_API_KEY (já existe), GEMINI_MODEL?, DEMO_KEY?, WA_VERIFY_TOKEN, WA_APP_SECRET, WA_TOKEN,
//          GOOGLE_CLIENT_ID?, GOOGLE_CLIENT_SECRET?
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { atender, sb } from "./nucleo.ts";
import { mestre } from "./mestre.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { iguais, limpar } from "./seguranca.ts";
import { transcrever } from "./gemini.ts";
import { assinaturaValida, baixarMidia, digitando, dividir, enviar, pausa } from "./whatsapp.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const ORIGENS = (Deno.env.get("ORIGENS_PERMITIDAS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function cors(req: Request) {
  const origem = req.headers.get("origin") ?? "";
  const permitida = ORIGENS.length === 0 || ORIGENS.includes(origem);
  return {
    "Access-Control-Allow-Origin": permitida ? (origem || "*") : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-demo-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (req: Request, b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors(req), "Content-Type": "application/json" } });

async function jaProcessada(id: string) {
  const { error } = await sb.from("astra_processadas").insert({ externo_id: id });
  return !!error; // conflito de chave = já recebida antes
}

const digitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
async function membroPorWhatsApp(de: string) {
  const fim = digitos(de).slice(-10);
  if (fim.length < 10) return null;
  const { data } = await sb.from("gestao_perfis").select("id, nome, email, whatsapp, telefone").limit(50);
  const p = (data ?? []).find((x) => [x.whatsapp, x.telefone].some((n) => digitos(n).length >= 10 && digitos(n).slice(-10) === fim));
  if (!p) return null;
  const { data: eq } = await sb.from("gestao_equipe").select("email").eq("email", String(p.email).toLowerCase()).maybeSingle();
  return eq ? p : null; // só quem ainda faz parte da equipe
}

/** usuário logado na Sala de Gestão e membro da equipe? devolve o cliente com o token dele (RLS da sala vale) */
async function membroDaSala(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+/.test(auth)) return null;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: ok } = await db.rpc("gestao_membro");
  if (ok !== true) return null;
  const { data: u } = await db.auth.getUser();
  if (!u?.user) return null;
  const { data: perfil } = await db.from("gestao_perfis").select("id, nome").eq("id", u.user.id).maybeSingle();
  return { db, auth, perfilId: u.user.id, nome: perfil?.nome ?? u.user.email ?? undefined };
}

async function processarWhatsApp(corpo: string) {
  const d = JSON.parse(corpo);
  for (const entry of d.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      const v = ch.value ?? {};
      const phoneId = v.metadata?.phone_number_id;
      if (!phoneId || !v.messages) continue;
      const { data: t } = await sb.from("astra_tenants").select("slug, config").eq("config->>whatsapp_phone_id", phoneId).eq("ativo", true).maybeSingle();
      if (!t) continue;

      for (const m of v.messages) {
        if (!m.id || await jaProcessada(m.id)) continue;
        await digitando(phoneId, m.id);

        let texto = "";
        if (m.type === "text") texto = m.text?.body ?? "";
        else if (m.type === "audio" && m.audio?.id) {
          const midia = await baixarMidia(m.audio.id);
          const trans = midia ? await transcrever(midia.bytes, midia.mime).catch(() => "") : "";
          if (!trans || trans === "[sem fala]") {
            await enviar(phoneId, m.from, "Não consegui ouvir bem o seu áudio. Pode me enviar de novo ou escrever?");
            continue;
          }
          texto = `[áudio transcrito] ${trans}`;
        } else if (m.type === "interactive" || m.type === "button") {
          texto = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? m.button?.text ?? "";
        } else {
          await enviar(phoneId, m.from, "Por enquanto consigo entender textos e áudios. Pode me escrever ou mandar um áudio?");
          continue;
        }

        // mensagem de alguém da equipe (WhatsApp do perfil na sala) → modo dono
        const membro = t.config?.integrar_gestao ? await membroPorWhatsApp(m.from) : null;
        if (membro) {
          const r = await mestre(t.slug, texto, { db: sb, perfilId: membro.id, nomeDono: membro.nome ?? undefined });
          for (const parte of dividir(r.resposta)) await enviar(phoneId, m.from, parte);
          continue;
        }

        const nome = v.contacts?.find((x: any) => x.wa_id === m.from)?.profile?.name;
        const r = await atender({ tenant: t.slug, canal: "whatsapp", externoId: m.from, texto, nome });
        if (!r.resposta) continue;
        for (const parte of dividir(r.resposta)) {
          await pausa(parte);
          await enviar(phoneId, m.from, parte);
        }
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  const url = new URL(req.url);

  // verificação do webhook pela Meta
  if (req.method === "GET") {
    const esperado = Deno.env.get("WA_VERIFY_TOKEN") ?? "";
    const ok = url.searchParams.get("hub.mode") === "subscribe" && !!esperado && iguais(url.searchParams.get("hub.verify_token") ?? "", esperado);
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("método não permitido", { status: 405 });

  const tamanho = Number(req.headers.get("content-length") ?? 0);
  if (tamanho > 2_200_000) return new Response("grande demais", { status: 413 });
  const corpo = await req.text();
  if (corpo.length > 2_200_000) return new Response("grande demais", { status: 413 });

  // webhook do WhatsApp
  const assinatura = req.headers.get("x-hub-signature-256");
  if (assinatura) {
    if (!(await assinaturaValida(assinatura, corpo))) return new Response("assinatura inválida", { status: 401 });
    // responde 200 já e processa em segundo plano (a Meta reenvia se demorar)
    EdgeRuntime.waitUntil(processarWhatsApp(corpo).catch((e) => console.error("whatsapp", e)));
    return new Response("ok");
  }

  // Sala de Gestão: membro logado fala com a Astra (modo dono) ou testa o atendimento
  const membro = await membroDaSala(req);
  let corpoJson: any = {};
  try {
    corpoJson = JSON.parse(corpo);
  } catch {
    return json(req, { erro: "corpo inválido" }, 400);
  }
  if (corpoJson.modo === "dono") {
    if (!membro) return json(req, { erro: "Faça login na Sala de Gestão." }, 401);
    try {
      let texto = limpar(corpoJson.mensagem, 4000), transcricao = "";
      const audio = corpoJson.audio;
      if (audio?.dados && /^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)/.test(String(audio.tipo)) && String(audio.dados).length <= 2_000_000) {
        transcricao = await transcrever(Uint8Array.from(atob(String(audio.dados)), (ch) => ch.charCodeAt(0)), String(audio.tipo)).catch(() => "");
        if (transcricao && transcricao !== "[sem fala]") texto = transcricao;
      }
      if (!texto) return json(req, { erro: "mensagem vazia" }, 400);
      const r = await mestre(limpar(corpoJson.tenant, 60) || "astrovia", texto, { db: membro.db, auth: membro.auth, perfilId: membro.perfilId, nomeDono: membro.nome });
      return json(req, { ...r, transcricao: transcricao || undefined, partes: dividir(r.resposta) });
    } catch (e) {
      console.error("mestre", e);
      return json(req, { erro: "falha no modo dono" }, 500);
    }
  }

  // chat de teste / demo
  const demo = Deno.env.get("DEMO_KEY") ?? "";
  const chaveDemoOk = !!demo && iguais(req.headers.get("x-demo-key") ?? "", demo);
  if (!membro && !chaveDemoOk) return json(req, { erro: "não autorizado" }, 401);
  try {
    const { tenant, sessao, mensagem, nome, reiniciar, simulacao, audio, acao, resposta_ia, avaliacao, correcao } = corpoJson;
    const slug = limpar(tenant, 60), id = limpar(sessao, 80);
    if (!slug || !id) return json(req, { erro: "tenant e sessao são obrigatórios" }, 400);

    // feedback da equipe sobre uma resposta da IA
    if (acao === "feedback") {
      if (!membro) return json(req, { erro: "Faça login na Sala de Gestão." }, 401);
      if (!["boa", "ruim"].includes(avaliacao)) return json(req, { erro: "avaliação inválida" }, 400);
      const { data: t } = await sb.from("astra_tenants").select("id").eq("slug", slug).maybeSingle();
      if (!t) return json(req, { erro: "tenant não encontrado" }, 404);
      const { data: c } = await sb.from("astra_contatos").select("id").eq("tenant_id", t.id).eq("canal", "web").eq("externo_id", id).maybeSingle();
      await sb.from("astra_feedbacks").insert({
        tenant_id: t.id,
        contato_id: c?.id ?? null,
        resposta_ia: limpar(resposta_ia, 1500),
        avaliacao,
        correcao: correcao ? limpar(correcao, 1500) : null,
      });
      return json(req, { ok: true });
    }

    // áudio gravado no navegador: transcreve e segue como texto
    let textoAudio = "";
    if (audio?.dados && audio?.tipo) {
      const tipo = String(audio.tipo);
      if (!/^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)/.test(tipo)) return json(req, { erro: "formato de áudio não aceito" }, 400);
      const b64 = String(audio.dados);
      if (b64.length > 2_000_000) return json(req, { erro: "áudio longo demais" }, 413); // ~1,5 MB
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      textoAudio = await transcrever(bytes, tipo).catch(() => "");
      if (!textoAudio || textoAudio === "[sem fala]") return json(req, { erro: "não entendi o áudio", transcricao: "" }, 422);
    }

    if (reiniciar) {
      const { data: t } = await sb.from("astra_tenants").select("id").eq("slug", slug).maybeSingle();
      if (t) await sb.from("astra_contatos").delete().eq("tenant_id", t.id).eq("canal", "web").eq("externo_id", id);
      return json(req, { ok: true });
    }
    const texto = textoAudio ? `[áudio transcrito] ${textoAudio}` : mensagem;
    if (!texto) return json(req, { erro: "mensagem vazia" }, 400);

    const r = await atender({ tenant: slug, canal: "web", externoId: id, texto, nome, origem: simulacao ? "simulador" : "demo" });
    return json(req, { ...r, transcricao: textoAudio || undefined, partes: r.resposta ? dividir(r.resposta) : [] });
  } catch (e) {
    console.error("demo", e);
    return json(req, { erro: "falha no atendimento" }, 500);
  }
});
