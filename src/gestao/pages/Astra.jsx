import React, { useCallback, useEffect, useRef, useState } from "react";
import { Send, Mic, Square, Brain, Settings2, MessagesSquare, Trash2, RotateCcw, Save, Plus, UserRound, Sparkles, Volume2, VolumeX, Cpu } from "lucide-react";
import { sb } from "../supabase";
import { useG, Card, Btn, Field, Input, Textarea, Select, Badge, PageHead, Empty, fmtDate } from "../ui";

/* ============================================================
   ASTRA — a consciência da Astrovia
   • Conversar: modo dono (relatórios, ensinar, operar a sala)
   • Testar atendimento: simula um cliente falando com a Astra
   • Memória · Atendimentos · Ajustes
   Tudo passa pela Edge Function "astra" com o login da sala.
   ============================================================ */

const TENANT = "astrovia";

async function astra(body) {
  const { data, error } = await sb.functions.invoke("astra", { body: { tenant: TENANT, ...body } });
  if (error) {
    let msg = error.message;
    try {
      const j = await error.context?.json?.();
      if (j?.erro) msg = j.erro;
    } catch { /* sem JSON */ }
    throw new Error(msg);
  }
  return data;
}

const ATALHOS = [
  "Bom dia, Astra. Como estamos hoje?",
  "Ache 3 clientes novos pra mim e prepare as mensagens.",
  "Quem eu preciso abordar ou cobrar resposta hoje?",
  "O que está atrasado e o que eu faço primeiro?",
  "Quais perguntas você não soube responder?",
  "Avalie seus atendimentos e me diga o que melhorar.",
  "Liste o que você aprendeu até agora.",
];

/* voz: lê a resposta em português (voz do próprio navegador) */
function falar(texto, aoTerminar) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return aoTerminar();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(texto.replace(/[*_#`>]/g, ""));
    u.lang = "pt-BR";
    u.rate = 1.05;
    const voz = synth.getVoices().find((v) => /pt-BR/i.test(v.lang) && /google|luciana|francisca|natural/i.test(v.name)) || synth.getVoices().find((v) => /pt/i.test(v.lang));
    if (voz) u.voice = voz;
    u.onend = u.onerror = aoTerminar;
    synth.speak(u);
  } catch { aoTerminar(); }
}

// A conversa fica guardada fora da tela: se você sair da Astra enquanto ela pensa,
// a resposta chega aqui mesmo assim e aparece quando você voltar.
const loja = {
  dono: { msgs: null, estado: "idle", visivel: false },
  cliente: { msgs: [], estado: "idle", visivel: false, sessao: "sala-" + crypto.randomUUID() },
  ouvintes: new Set(),
};
const avisar = () => loja.ouvintes.forEach((f) => f());

const ESPERA = ["Consultando a sala…", "Cruzando funil, projetos e financeiro…", "Organizando a resposta…"];

const STATUS = {
  em_conversa: ["Em conversa", "#60a5fa"], qualificado: ["Qualificado", "#22d3ee"], reuniao: ["Reunião", "#34d399"],
  cliente: ["Cliente", "#34d399"], perdido: ["Sem interesse", "#8a8f98"], novo: ["Novo", "#8a8f98"],
};

/* ---------- identidade em partículas ---------- */
function Orb({ estado, nivelRef, size = 168 }) {
  const ref = useRef(null);
  const est = useRef(estado);
  est.current = estado;
  useEffect(() => {
    const cv = ref.current, ctx = cv.getContext("2d");
    const N = 520, pts = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = Math.PI * (3 - Math.sqrt(5)) * i;
      pts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r, s: Math.random() });
    }
    const dpr = window.devicePixelRatio || 1;
    cv.width = size * dpr; cv.height = size * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const V = { idle: [0.0025, 1], ouvindo: [0.004, 1.04], pensando: [0.016, 0.82], falando: [0.006, 1.06] };
    let rot = 0, vel = 0.0025, raio = 1, nivel = 0, raf;
    const quadro = (t) => {
      const e = est.current, [vAlvo, rAlvo] = V[e] || V.idle;
      let alvo = nivelRef.current;
      if (e === "falando") alvo = 0.35 + 0.35 * Math.abs(Math.sin(t / 140)) * Math.abs(Math.sin(t / 370));
      if (e === "pensando") alvo = 0.15 + 0.1 * Math.sin(t / 200);
      if (e === "idle") alvo = 0.04 + 0.03 * Math.sin(t / 1300);
      nivel += (alvo - nivel) * 0.15; vel += (vAlvo - vel) * 0.05; raio += (rAlvo + nivel * 0.5 - raio) * 0.1;
      if (!reduz) rot += vel;
      const c = size / 2, R = size * 0.4 * raio, cr = Math.cos(rot), sr = Math.sin(rot), tilt = 0.35;
      ctx.clearRect(0, 0, size, size);
      for (const p of pts) {
        const ruido = 1 + nivel * 0.55 * Math.sin(p.s * 12 + t / 260 + p.y * 4);
        const x = p.x * cr - p.z * sr;
        let z = p.x * sr + p.z * cr, y = p.y;
        const y2 = y * Math.cos(tilt) - z * Math.sin(tilt);
        z = y * Math.sin(tilt) + z * Math.cos(tilt); y = y2;
        const persp = 1.6 / (2.6 - z), a = Math.max(0.06, (z + 1.1) / 2.1), m = Math.min(1, Math.max(0, (x + 1) / 2));
        ctx.fillStyle = `rgba(${(34 + 221 * m) | 0},${(211 - 149 * m) | 0},${(238 - 73 * m) | 0},${a * (0.7 + nivel * 0.3)})`;
        const sz = (0.6 + a * 1.3) * (size / 200);
        ctx.fillRect(c + x * R * ruido * persp, c + y * R * ruido * persp, sz, sz);
      }
      raf = requestAnimationFrame(quadro);
    };
    raf = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(raf);
  }, [size, nivelRef]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />;
}

/* ---------- conversa ---------- */
function Conversa({ modo }) {
  const [, redesenhar] = useState(0);
  const slot = loja[modo];
  const msgs = slot.msgs || [];
  const estado = slot.estado;
  const setMsgs = (fn) => { slot.msgs = fn(slot.msgs || []); avisar(); };
  const setEstado = (v) => { slot.estado = v; avisar(); };
  const [texto, setTexto] = useState("");
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState("");
  const [voz, setVoz] = useState(() => { try { return localStorage.getItem("astra:voz") === "1"; } catch { return false; } });
  const [espera, setEspera] = useState(0);
  const nivel = useRef(0);
  const fim = useRef(null);
  const rec = useRef(null);

  useEffect(() => {
    const f = () => redesenhar((n) => n + 1);
    loja.ouvintes.add(f);
    slot.visivel = true;
    return () => { loja.ouvintes.delete(f); slot.visivel = false; };
  }, [slot]);

  // histórico do modo dono vem do banco (a mesma conversa do WhatsApp);
  // se ainda há uma resposta a caminho, mantém o que está na tela
  useEffect(() => {
    setErro("");
    if (modo !== "dono" || slot.estado === "pensando") return;
    (async () => {
      const { data: t } = await sb.from("astra_tenants").select("id").eq("slug", TENANT).maybeSingle();
      if (!t) return;
      const { data: c } = await sb.from("astra_contatos").select("id").eq("tenant_id", t.id).eq("canal", "interno").eq("externo_id", "dono").maybeSingle();
      if (!c) { if (!slot.msgs) setMsgs(() => []); return; }
      const { data } = await sb.from("astra_mensagens").select("papel, conteudo, criado_em").eq("contato_id", c.id).order("criado_em", { ascending: false }).limit(30);
      if (slot.estado === "pensando") return;
      setMsgs(() => (data || []).reverse().map((m) => ({ de: m.papel === "agente" ? "astra" : "eu", txt: m.conteudo })));
    })();
  }, [modo]); // eslint-disable-line react-hooks/exhaustive-deps
  // rola só a caixa da conversa (nunca a página inteira)
  useEffect(() => { const el = fim.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [msgs, estado]);

  useEffect(() => {
    if (estado !== "pensando") return;
    setEspera(0);
    const id = setInterval(() => setEspera((n) => Math.min(n + 1, ESPERA.length - 1)), 4000);
    return () => clearInterval(id);
  }, [estado]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  const alternarVoz = () => {
    const v = !voz;
    setVoz(v);
    if (!v) window.speechSynthesis?.cancel();
    try { localStorage.setItem("astra:voz", v ? "1" : "0"); } catch { /* sem storage */ }
  };

  const enviar = async (txt, audio) => {
    if (estado === "pensando") return;
    setErro("");
    if (txt) setMsgs((m) => [...m, { de: "eu", txt }]);
    setEstado("pensando");
    try {
      const body = modo === "dono"
        ? { modo: "dono", ...(audio ? { audio } : { mensagem: txt }) }
        : { sessao: loja.cliente.sessao, ...(audio ? { audio } : { mensagem: txt }) };
      const d = await astra(body);
      if (d.transcricao) setMsgs((m) => [...m, { de: "eu", txt: "🎙 " + d.transcricao }]);
      setEstado("falando");
      const partes = d.partes?.length ? d.partes : d.resposta ? [d.resposta] : [];
      for (let i = 0; i < partes.length; i++) {
        if (i) await new Promise((r) => setTimeout(r, Math.min(600 + partes[i].length * 12, 2000)));
        setMsgs((m) => [...m, { de: "astra", txt: partes[i], ensinou: i === partes.length - 1 ? d.ensinados : null, contato: d.contato }]);
      }
      if (!partes.length && d.handoff) setMsgs((m) => [...m, { de: "sis", txt: "Conversa passada para a equipe." }]);
      if (voz && d.resposta && slot.visivel) falar(d.resposta, () => setEstado("idle"));
      else setTimeout(() => setEstado("idle"), 900);
    } catch (e) {
      setErro(e.message);
      setEstado("idle");
    }
  };

  const submit = (e) => {
    e.preventDefault();
    const v = texto.trim();
    if (!v) return;
    setTexto("");
    enviar(v);
  };

  const microfone = async () => {
    if (gravando) { rec.current?.stop(); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { setErro("Sem acesso ao microfone neste navegador."); return; }
    const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => window.MediaRecorder?.isTypeSupported(t)) || "";
    const r = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined), partes = [];
    const ac = new (window.AudioContext || window.webkitAudioContext)(), an = ac.createAnalyser();
    an.fftSize = 512; ac.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize); let raf;
    const medir = () => { an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) s += ((v - 128) / 128) ** 2; nivel.current = Math.min(1, Math.sqrt(s / buf.length) * 5); raf = requestAnimationFrame(medir); };
    r.ondataavailable = (e) => e.data.size && partes.push(e.data);
    r.onstop = async () => {
      cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); ac.close(); nivel.current = 0; setGravando(false);
      const blob = new Blob(partes, { type: r.mimeType || "audio/webm" });
      if (blob.size < 2000) { setEstado("idle"); return; }
      if (blob.size > 1_400_000) { setErro("Áudio longo demais. Tente uma mensagem mais curta."); setEstado("idle"); return; }
      const dados = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
      enviar("", { dados, tipo: blob.type.split(";")[0] });
    };
    rec.current = r; r.start(); setGravando(true); setEstado("ouvindo"); medir();
  };

  const rotulo = { idle: "em espera", ouvindo: "ouvindo", pensando: "pensando", falando: "respondendo" }[estado];

  return (
    <Card className="flex h-[min(80vh,780px)] min-h-[520px] flex-col overflow-hidden">
      <div className="flex items-center gap-4 border-b border-white/[0.06] p-4">
        <Orb estado={estado} nivelRef={nivel} size={92} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl font-semibold tracking-[0.14em]">
            <span className="bg-gradient-to-r from-[#22d3ee] to-[#ff2fd0] bg-clip-text text-transparent">ASTRA</span>
          </p>
          <p className="text-sm text-titanium">{modo === "dono" ? "Converse, ensine e peça relatórios. Ela enxerga a sala inteira." : "Fale como um cliente para testar o atendimento. Não entra no funil."}</p>
          <p className="mt-1 flex items-center gap-2 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-[#22d3ee]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22d3ee] shadow-[0_0_8px_#22d3ee]" /> {rotulo}
          </p>
        </div>
        <Btn size="sm" variant={voz ? "neon" : "ghost"} onClick={alternarVoz} aria-pressed={voz} title="Ouvir as respostas em voz">
          {voz ? <Volume2 size={14} /> : <VolumeX size={14} />} {voz ? "Voz ligada" : "Voz"}
        </Btn>
      </div>

      <div ref={fim} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4" aria-live="polite">
        {!msgs.length && (
          <p className="pt-6 text-center text-sm text-titanium">
            {modo === "dono" ? "Comece com um dos atalhos abaixo, ou fale pelo microfone." : "Escreva como um cliente escreveria, por exemplo: \"Oi, tenho uma barbearia e quero organizar a agenda\"."}
          </p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.de === "eu" ? "flex justify-end" : m.de === "sis" ? "text-center" : ""}>
            {m.de === "sis" ? (
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-titanium">{m.txt}</span>
            ) : m.de === "eu" ? (
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-br from-[#22d3ee] to-[#ff2fd0] px-4 py-2.5 text-sm text-[#030305]">{m.txt}</p>
            ) : (
              <div className="max-w-[90%]">
                <p className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-titanium">Astra</p>
                <p className="whitespace-pre-wrap font-display text-[1.02rem] leading-relaxed text-white">{m.txt}</p>
                {m.ensinou?.map((e, k) => (
                  <p key={k} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[#22d3ee]/30 bg-[#22d3ee]/10 px-2.5 py-1 text-xs text-[#a5f3fc]">
                    <Brain size={12} /> Aprendido: {e}
                  </p>
                ))}
                {modo === "cliente" && m.contato?.pontuacao != null && (
                  <p className="mt-2 flex flex-wrap gap-2">
                    <Badge color="#22d3ee">Pontuação {m.contato.pontuacao}</Badge>
                    {m.contato.status && <Badge color={(STATUS[m.contato.status] || STATUS.novo)[1]}>{(STATUS[m.contato.status] || STATUS.novo)[0]}</Badge>}
                    {m.contato.prioridade === "alta" && <Badge color="#ff2fd0">Alta prioridade</Badge>}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
        {estado === "pensando" && <p className="animate-pulse font-mono text-[0.62rem] uppercase tracking-[0.2em] text-titanium">{modo === "dono" ? ESPERA[espera] : "Astra está digitando…"}</p>}
      </div>

      <div className="border-t border-white/[0.06] p-4">
        {modo === "dono" && (
          <div className="mb-3 flex flex-wrap gap-2">
            {ATALHOS.map((a) => (
              <button key={a} onClick={() => enviar(a)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-titanium transition hover:border-[#22d3ee]/50 hover:text-white">{a}</button>
            ))}
          </div>
        )}
        {erro && <p className="mb-2 text-sm text-[#ff9be9]">{erro}</p>}
        <form onSubmit={submit} className="flex items-end gap-2">
          <Textarea
            rows={1}
            placeholder={modo === "dono" ? "Fale com a Astra… (ex.: aprenda que…)" : "Escreva como um cliente…"}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(e); } }}
          />
          <Btn size="icon" variant={gravando ? "danger" : "ghost"} onClick={microfone} aria-label={gravando ? "Parar e enviar áudio" : "Gravar áudio"}>
            {gravando ? <Square size={15} /> : <Mic size={15} />}
          </Btn>
          <Btn size="icon" variant="neon" type="submit" aria-label="Enviar" disabled={estado === "pensando"}><Send size={15} /></Btn>
        </form>
      </div>
    </Card>
  );
}

/* ---------- memória ---------- */
function Memoria({ tenant }) {
  const [itens, setItens] = useState([]);
  const [novo, setNovo] = useState({ tipo: "informacao", conteudo: "" });
  const [lacunas, setLacunas] = useState([]);
  const carregar = useCallback(async () => {
    if (!tenant) return;
    const [k, l] = await Promise.all([
      sb.from("astra_conhecimento").select("id, tipo, conteudo, origem, criado_em").eq("tenant_id", tenant.id).eq("ativo", true).order("criado_em", { ascending: false }),
      sb.from("astra_lacunas").select("id, pergunta, criado_em").eq("tenant_id", tenant.id).eq("status", "pendente").order("criado_em", { ascending: false }).limit(20),
    ]);
    setItens(k.data || []); setLacunas(l.data || []);
  }, [tenant]);
  useEffect(() => { carregar(); }, [carregar]);

  const ensinar = async () => {
    const c = novo.conteudo.trim();
    if (c.length < 3) return;
    await sb.from("astra_conhecimento").insert({ tenant_id: tenant.id, tipo: novo.tipo, conteudo: c, origem: "painel" });
    setNovo({ ...novo, conteudo: "" }); carregar();
  };
  const esquecer = async (id) => {
    await sb.from("astra_conhecimento").update({ ativo: false, desativado_em: new Date().toISOString() }).eq("id", id);
    carregar();
  };
  const descartar = async (id) => { await sb.from("astra_lacunas").update({ status: "descartada" }).eq("id", id); carregar(); };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="mb-3 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-[#22d3ee]">Ensinar direto</p>
        <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
          <Select value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}
            options={[{ value: "informacao", label: "Informação" }, { value: "regra", label: "Regra" }, { value: "preco", label: "Preço" }, { value: "resposta", label: "Resposta pronta" }, { value: "tom", label: "Tom de voz" }]} />
          <Textarea rows={2} placeholder="Ex.: Barbearias com mais de 3 profissionais ganham 1 mês de manutenção grátis." value={novo.conteudo} onChange={(e) => setNovo({ ...novo, conteudo: e.target.value })} />
        </div>
        <div className="mt-3 flex justify-end"><Btn variant="neon" size="sm" onClick={ensinar}><Plus size={13} /> Ensinar</Btn></div>
      </Card>

      {lacunas.length > 0 && (
        <Card className="p-4">
          <p className="mb-3 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-[#fbbf24]">Perguntas que ela não soube responder</p>
          <ul className="space-y-2">
            {lacunas.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] p-3 text-sm">
                <span className="text-titanium-bright">{l.pergunta}</span>
                <span className="flex shrink-0 gap-1">
                  <Btn size="sm" variant="ghost" onClick={() => setNovo({ tipo: "resposta", conteudo: `Se perguntarem "${l.pergunta}": ` })}>Responder</Btn>
                  <Btn size="icon" variant="ghost" onClick={() => descartar(l.id)} aria-label="Descartar"><Trash2 size={13} /></Btn>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {itens.length === 0 ? <Empty>Ela ainda não aprendeu nada além da base. Ensine aqui ou pela conversa.</Empty> : (
        <ul className="space-y-2">
          {itens.map((k) => (
            <li key={k.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] border-l-2 border-l-[#22d3ee] bg-[#0a0a11] p-3">
              <div className="min-w-0">
                <p className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-titanium">#{k.id} · {k.tipo} · {k.origem} · {fmtDate(k.criado_em.slice(0, 10))}</p>
                <p className="mt-1 text-sm text-white">{k.conteudo}</p>
              </div>
              <Btn size="icon" variant="ghost" onClick={() => esquecer(k.id)} aria-label="Esquecer" title="Esquecer"><Trash2 size={13} /></Btn>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- atendimentos ---------- */
function Atendimentos({ tenant }) {
  const [lista, setLista] = useState([]);
  const [aberto, setAberto] = useState(null);
  const [conversa, setConversa] = useState([]);
  const carregar = useCallback(async () => {
    if (!tenant) return;
    const { data } = await sb.from("astra_contatos").select("*").eq("tenant_id", tenant.id).neq("canal", "interno").order("atualizado_em", { ascending: false }).limit(60);
    setLista(data || []);
  }, [tenant]);
  useEffect(() => { carregar(); }, [carregar]);
  const abrir = async (c) => {
    setAberto(c.id === aberto ? null : c.id);
    const { data } = await sb.from("astra_mensagens").select("papel, conteudo, criado_em").eq("contato_id", c.id).order("criado_em").limit(80);
    setConversa(data || []);
  };
  const devolver = async (id) => { await sb.from("astra_contatos").update({ handoff: false, handoff_motivo: null }).eq("id", id); carregar(); };

  if (!lista.length) return <Empty>Nenhum atendimento ainda. Os testes e as conversas do WhatsApp aparecem aqui.</Empty>;
  return (
    <ul className="space-y-2">
      {lista.map((c) => {
        const [st, cor] = STATUS[c.status] || STATUS.novo;
        return (
          <li key={c.id} className="rounded-xl border border-white/[0.06] bg-[#0a0a11]">
            <button onClick={() => abrir(c)} className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left">
              <span className="min-w-0">
                <span className="block truncate text-sm text-white">{c.nome || c.externo_id}</span>
                <span className="block truncate text-xs text-titanium">{c.resumo || c.interesse || "Sem resumo ainda"}</span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                <Badge color="#8a8f98">{c.canal}{c.origem === "demo" ? " · teste" : ""}</Badge>
                {c.pontuacao != null && <Badge color="#22d3ee">{c.pontuacao}</Badge>}
                <Badge color={cor}>{st}</Badge>
                {c.handoff && <Badge color="#ff2fd0">Com a equipe</Badge>}
              </span>
            </button>
            {aberto === c.id && (
              <div className="space-y-2 border-t border-white/[0.06] p-3">
                {conversa.map((m, i) => (
                  <p key={i} className="text-sm"><span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-titanium">{m.papel === "agente" ? "Astra" : m.papel}</span><br /><span className="whitespace-pre-wrap text-titanium-bright">{m.conteudo}</span></p>
                ))}
                {c.handoff && <Btn size="sm" variant="ghost" onClick={() => devolver(c.id)}><RotateCcw size={13} /> Devolver para a Astra</Btn>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- ajustes ---------- */
function Ajustes({ tenant, onSalvo }) {
  const { me, uid, email, save, admin } = useG();
  const [cfg, setCfg] = useState(() => ({ ...(tenant?.config || {}) }));
  const [agenda, setAgenda] = useState(() => ({ fuso: "America/Sao_Paulo", inicio: "09:00", fim: "20:00", duracao_min: 30, ...(tenant?.config?.agenda || {}) }));
  const [texto, setTexto] = useState(() => ({ persona: tenant?.persona || "", base: tenant?.base_conhecimento || "", ativo: tenant?.ativo ?? true }));
  const [meuWhats, setMeuWhats] = useState(me?.whatsapp || "");
  const [motor, setMotor] = useState(() => {
    const m = tenant?.config?.motor || {};
    return { dono: m.dono === "claude" ? (m.modelo_dono || "claude-sonnet-5-5") : "gemini", cliente: m.cliente === "claude" ? (m.modelo_cliente || "claude-haiku-4-5-20251001") : "gemini" };
  });
  const [msg, setMsg] = useState("");

  const salvar = async () => {
    setMsg("");
    const config = {
      ...cfg,
      nome_ia: (cfg.nome_ia || "Astra").trim(),
      telefone_equipe: (cfg.telefone_equipe || "").replace(/\D/g, "") || undefined,
      whatsapp_phone_id: (cfg.whatsapp_phone_id || "").replace(/\D/g, "") || undefined,
      limite_respostas_dia: Number(cfg.limite_respostas_dia) || undefined,
      agenda: { ...agenda, duracao_min: Number(agenda.duracao_min) || 30 },
      motor: {
        dono: motor.dono === "gemini" ? "gemini" : "claude", modelo_dono: motor.dono === "gemini" ? undefined : motor.dono,
        cliente: motor.cliente === "gemini" ? "gemini" : "claude", modelo_cliente: motor.cliente === "gemini" ? undefined : motor.cliente,
      },
    };
    const { error } = await sb.from("astra_tenants").update({ config, persona: texto.persona, base_conhecimento: texto.base, ativo: texto.ativo }).eq("id", tenant.id);
    setMsg(error ? error.message : "Ajustes salvos ✓");
    if (!error) onSalvo();
  };
  const salvarWhats = async () => {
    await save("perfis", { ...(me || {}), id: uid, email, whatsapp: meuWhats, atualizado_em: new Date().toISOString() });
    setMsg("Seu WhatsApp foi salvo ✓");
  };
  const c = (k) => (e) => setCfg({ ...cfg, [k]: e.target.value });
  const a = (k) => (e) => setAgenda({ ...agenda, [k]: e.target.value });

  return (
    <div className="space-y-4">
      {msg && <p className="text-sm text-[#22d3ee]">{msg}</p>}
      <Card className="p-4">
        <p className="mb-1 flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-[#22d3ee]"><UserRound size={12} /> Seu número</p>
        <p className="mb-3 text-sm text-titanium">Quando o WhatsApp da Astra estiver ligado, mensagens deste número abrem o modo dono, como aqui na sala.</p>
        <div className="flex gap-2">
          <Input placeholder="(41) 99999-9999" value={meuWhats} onChange={(e) => setMeuWhats(e.target.value)} />
          <Btn variant="ghost" onClick={salvarWhats}><Save size={14} /> Salvar</Btn>
        </div>
      </Card>

      {!admin && <Empty>Só o administrador altera as configurações da Astra.</Empty>}
      {admin && (
        <>
          <Card className="grid gap-4 p-4 sm:grid-cols-2">
            <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-[#22d3ee] sm:col-span-2">WhatsApp e alertas</p>
            <Field label="Nome da IA"><Input value={cfg.nome_ia || "Astra"} onChange={c("nome_ia")} /></Field>
            <Field label="Número que recebe os alertas" hint="Leads quentes, reuniões marcadas, pedidos de atendimento humano."><Input placeholder="5541999999999" value={cfg.telefone_equipe || ""} onChange={c("telefone_equipe")} /></Field>
            <Field label="ID do número no WhatsApp oficial" hint="Meta Business → WhatsApp → Configuração da API → Phone number ID."><Input value={cfg.whatsapp_phone_id || ""} onChange={c("whatsapp_phone_id")} /></Field>
            <Field label="Limite de respostas por dia" hint="Protege a cota gratuita do Gemini. Padrão: 800."><Input type="number" min="10" value={cfg.limite_respostas_dia || ""} onChange={c("limite_respostas_dia")} /></Field>
            <label className="flex items-center gap-2 text-sm text-titanium-bright sm:col-span-2">
              <input type="checkbox" checked={texto.ativo} onChange={(e) => setTexto({ ...texto, ativo: e.target.checked })} /> Astra atendendo clientes
            </label>
          </Card>
          <Card className="grid gap-4 p-4 sm:grid-cols-2">
            <p className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-[#22d3ee] sm:col-span-2"><Cpu size={12} /> Cérebro</p>
            <Field label="Conversando com você" hint="Sonnet é o mais inteligente; Haiku é rápido e barato.">
              <Select value={motor.dono} onChange={(e) => setMotor({ ...motor, dono: e.target.value })}
                options={[{ value: "gemini", label: "Gemini (grátis)" }, { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" }, { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" }]} />
            </Field>
            <Field label="Atendendo clientes" hint="Atendimento pede rapidez: Gemini ou Haiku.">
              <Select value={motor.cliente} onChange={(e) => setMotor({ ...motor, cliente: e.target.value })}
                options={[{ value: "gemini", label: "Gemini (grátis)" }, { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" }, { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" }]} />
            </Field>
            <p className="text-xs leading-relaxed text-titanium sm:col-span-2">O Claude usa a API da Anthropic, cobrada à parte e separada da assinatura Pro, então não mexe na sua cota de programação. Precisa do secret <span className="font-mono text-titanium-bright">ANTHROPIC_API_KEY</span> no Supabase. Sem ele, ou se faltar crédito, a Astra volta sozinha para o Gemini.</p>
          </Card>
          <Card className="grid gap-4 p-4 sm:grid-cols-4">
            <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-[#22d3ee] sm:col-span-4">Agenda para calls</p>
            <Field label="Início"><Input type="time" value={agenda.inicio} onChange={a("inicio")} /></Field>
            <Field label="Fim"><Input type="time" value={agenda.fim} onChange={a("fim")} /></Field>
            <Field label="Duração (min)"><Input type="number" min="15" step="5" value={agenda.duracao_min} onChange={a("duracao_min")} /></Field>
            <Field label="Fuso"><Input value={agenda.fuso} onChange={a("fuso")} /></Field>
          </Card>
          <Card className="space-y-4 p-4">
            <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-[#22d3ee]">Personalidade e base de conhecimento</p>
            <Field label="Quem ela é e como fala"><Textarea rows={5} value={texto.persona} onChange={(e) => setTexto({ ...texto, persona: e.target.value })} /></Field>
            <Field label="Base: serviços, preços, como qualificar" hint="Os aprendizados da aba Memória complementam este texto."><Textarea rows={14} value={texto.base} onChange={(e) => setTexto({ ...texto, base: e.target.value })} /></Field>
          </Card>
          <div className="flex justify-end"><Btn variant="neon" onClick={salvar}><Save size={14} /> Salvar ajustes</Btn></div>
        </>
      )}
    </div>
  );
}

/* ---------- página ---------- */
export default function Astra() {
  const [tenant, setTenant] = useState(null);
  const [modo, setModo] = useState("dono");
  const [aba, setAba] = useState("memoria");
  const carregar = useCallback(async () => {
    const { data } = await sb.from("astra_tenants").select("*").eq("slug", TENANT).maybeSingle();
    setTenant(data);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const ABAS = [
    { id: "memoria", label: "Memória", icon: Brain },
    { id: "atendimentos", label: "Atendimentos", icon: MessagesSquare },
    { id: "ajustes", label: "Ajustes", icon: Settings2 },
  ];

  return (
    <>
      <PageHead kicker="Inteligência" title="Astra">
        <div className="flex rounded-xl border border-white/10 p-1">
          {[["dono", "Conversar"], ["cliente", "Testar atendimento"]].map(([id, l]) => (
            <button key={id} onClick={() => setModo(id)} className={`rounded-lg px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] transition ${modo === id ? "bg-white text-[#030305]" : "text-titanium hover:text-white"}`}>{l}</button>
          ))}
        </div>
      </PageHead>
      {!tenant ? <Empty><Sparkles size={16} className="mx-auto mb-2" />Carregando a Astra…</Empty> : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Conversa key={modo} modo={modo} />
          <div className="min-w-0">
            <div className="mb-4 flex gap-1 rounded-xl border border-white/10 p-1">
              {ABAS.map((x) => (
                <button key={x.id} onClick={() => setAba(x.id)} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition ${aba === x.id ? "bg-[#22d3ee]/10 text-[#22d3ee]" : "text-titanium hover:text-white"}`}>
                  <x.icon size={14} /> {x.label}
                </button>
              ))}
            </div>
            {aba === "memoria" && <Memoria tenant={tenant} />}
            {aba === "atendimentos" && <Atendimentos tenant={tenant} />}
            {aba === "ajustes" && <Ajustes key={tenant.id} tenant={tenant} onSalvo={carregar} />}
          </div>
        </div>
      )}
    </>
  );
}
