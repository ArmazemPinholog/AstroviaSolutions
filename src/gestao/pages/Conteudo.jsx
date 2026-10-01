import React, { useEffect, useMemo, useState } from "react";
import {
  Image as ImageIcon, Film, Smartphone, Download, CircleCheck, Palette, WandSparkles,
  Copy, Send, Loader2, Trash2, TriangleAlert, RefreshCw,
} from "lucide-react";
import { useG, Card, Btn, Field, Input, Textarea, Badge, Modal, Empty, PageHead, fmtDate, useConfirm } from "../ui";
import { sb } from "../supabase";
import { agente } from "../agente";

const BUCKET = "gestao-conteudo";

export const FORMATOS = [
  { id: "feed", label: "Feed", sub: "imagem 4:5", icon: ImageIcon, ratio: "4 / 5" },
  { id: "story", label: "Story", sub: "imagem 9:16", icon: Smartphone, ratio: "9 / 16" },
  { id: "reels", label: "Reels", sub: "vídeo 9:16", icon: Film, ratio: "9 / 16" },
];
const STATUS = {
  rascunho: { label: "Só texto", color: "#8a8f98" },
  gerando: { label: "Gerando mídia", color: "#fbbf24" },
  pronto: { label: "Pronto p/ revisar", color: "#22d3ee" },
  aprovado: { label: "Aprovado", color: "#34d399" },
  publicando: { label: "Publicando", color: "#fbbf24" },
  publicado: { label: "Publicado", color: "#a78bfa" },
  erro: { label: "Erro", color: "#ff2fd0" },
};
const ABAS = [
  { id: "todos", label: "Todos", f: () => true },
  { id: "producao", label: "Em produção", f: (c) => ["rascunho", "gerando", "erro"].includes(c.status) },
  { id: "pronto", label: "Para revisar", f: (c) => c.status === "pronto" },
  { id: "aprovado", label: "Aprovados", f: (c) => c.status === "aprovado" },
  { id: "publicado", label: "Publicados", f: (c) => ["publicando", "publicado"].includes(c.status) },
];

/* links temporários (o bucket é privado) */
function useLinks(itens) {
  const [links, setLinks] = useState({});
  const paths = itens.map((c) => c.midia_path).filter(Boolean);
  const chave = paths.join("|");
  useEffect(() => {
    const faltam = paths.filter((p) => !links[p]);
    if (!faltam.length) return;
    sb.storage.from(BUCKET).createSignedUrls(faltam, 3600).then(({ data }) => {
      if (!data) return;
      setLinks((l) => ({ ...l, ...Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl])) }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return links;
}

export default function Conteudo() {
  const { db, load } = useG();
  const cfg = db.agente?.[0] || {};
  const itens = db.conteudos || [];
  const [chaves, setChaves] = useState(null);
  const [aba, setAba] = useState("todos");
  const [aberto, setAberto] = useState(null);
  const [estudio, setEstudio] = useState(false);
  const links = useLinks(itens);

  useEffect(() => { agente("status").then(setChaves).catch(() => setChaves({ erro: true })); }, []);

  // enquanto algo estiver gerando/publicando, atualiza sozinho
  const ocupado = itens.some((c) => ["gerando", "publicando"].includes(c.status));
  useEffect(() => {
    if (!ocupado) return;
    const t = setInterval(() => load().catch(() => {}), 6000);
    return () => clearInterval(t);
  }, [ocupado, load]);

  const lista = itens.filter((ABAS.find((a) => a.id === aba) || ABAS[0]).f);

  return (
    <>
      <PageHead kicker="Marketing" title="Conteúdo">
        {chaves && !chaves.erro && (
          <span className="flex flex-wrap gap-1.5">
            <Badge color={chaves.gemini ? "#34d399" : "#8a8f98"}>{chaves.gemini ? "●" : "○"} Gemini · texto</Badge>
            <Badge color={chaves.poe ? "#34d399" : "#8a8f98"}>{chaves.poe ? "●" : "○"} Poe · mídia</Badge>
            <Badge color={chaves.instagram ? "#34d399" : "#8a8f98"}>{chaves.instagram ? "●" : "○"} Instagram</Badge>
          </span>
        )}
        <Btn variant="ghost" onClick={() => setEstudio(true)}><Palette size={14} /> Estúdio</Btn>
      </PageHead>

      <Criar cfg={cfg} chaves={chaves} onCriado={(id) => setAberto(id)} />

      <div className="mt-6 flex flex-wrap gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1 sm:w-fit">
        {ABAS.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${aba === a.id ? "bg-[#22d3ee]/15 text-[#22d3ee]" : "text-titanium hover:text-white"}`}>
            {a.label}<span className="ml-1.5 font-mono text-[0.6rem] opacity-70">{itens.filter(a.f).length}</span>
          </button>
        ))}
      </div>

      {lista.length ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {lista.map((c) => <Miniatura key={c.id} c={c} url={links[c.midia_path]} onOpen={() => setAberto(c.id)} />)}
        </div>
      ) : (
        <div className="mt-3"><Empty>{itens.length ? "Nada nesta aba." : "Nenhum conteúdo ainda. Diga um tema acima e o agente monta legenda, hashtags e a arte."}</Empty></div>
      )}

      {aberto && <ConteudoModal id={aberto} url={links} chaves={chaves} cfg={cfg} onClose={() => setAberto(null)} />}
      {estudio && <EstudioModal cfg={cfg} onClose={() => setEstudio(false)} />}
    </>
  );
}

/* ---------- criar ---------- */
function Criar({ cfg, chaves, onCriado }) {
  const { load } = useG();
  const [formato, setFormato] = useState("feed");
  const [tema, setTema] = useState("");
  const [briefing, setBriefing] = useState("");
  const [midia, setMidia] = useState(true);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const semPoe = chaves && !chaves.erro && !chaves.poe;
  const bot = formato === "reels" ? cfg.bot_video || "Veo-3.1" : cfg.bot_imagem || "Imagen-4";

  const criar = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErro("");
    try {
      const r = await agente("criar_conteudo", { formato, tema, briefing, gerar_midia: midia && !semPoe });
      setTema("");
      setBriefing("");
      await load();
      onCriado(r.conteudo.id);
    } catch (err) { setErro(err.message); }
    setBusy(false);
  };

  return (
    <Card className="p-5">
      <p className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-[#22d3ee]">Criar com IA</p>
      <form onSubmit={criar} className="mt-4 grid gap-4 lg:grid-cols-[auto_1fr]">
        <div className="grid grid-cols-3 gap-2 lg:w-[300px]">
          {FORMATOS.map((f) => (
            <button type="button" key={f.id} onClick={() => setFormato(f.id)}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs transition ${formato === f.id ? "border-[#22d3ee]/60 bg-[#22d3ee]/10 text-[#22d3ee]" : "border-white/10 text-titanium hover:text-white"}`}>
              <f.icon size={18} />
              <span className="text-sm">{f.label}</span>
              <span className="font-mono text-[0.55rem] opacity-70">{f.sub}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tema *"><Input required value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex.: barbearia que perde cliente sem agenda online" /></Field>
          <Field label="Briefing (opcional)"><Input value={briefing} onChange={(e) => setBriefing(e.target.value)} placeholder="Ex.: mostrar o Barber Berserker, CTA pro direct" /></Field>
          <label className={`flex items-start gap-2 text-xs ${semPoe ? "text-titanium-dim" : "text-titanium-bright"}`}>
            <input type="checkbox" className="mt-0.5 accent-[#22d3ee]" checked={midia && !semPoe} disabled={semPoe} onChange={(e) => setMidia(e.target.checked)} />
            <span>
              Gerar {formato === "reels" ? "o vídeo" : "a imagem"} com a Poe ({bot})
              <span className="block text-titanium-dim">{semPoe ? "Falta POE_API_KEY nos Secrets do Supabase." : "Gasta pontos da Poe. O texto sai sempre do Gemini grátis."}</span>
            </span>
          </label>
          <Btn type="submit" variant="neon" className="justify-center self-end" disabled={busy || chaves?.gemini === false && !chaves?.poe}>
            {busy ? <><Loader2 size={14} className="animate-spin" /> Escrevendo…</> : <><WandSparkles size={14} /> Criar {FORMATOS.find((f) => f.id === formato).label}</>}
          </Btn>
        </div>
      </form>
      {formato === "reels" && !semPoe && (
        <p className="mt-3 text-xs text-titanium">Vídeos levam alguns minutos e custam mais pontos. Você pode fechar a tela: o card atualiza sozinho quando ficar pronto.</p>
      )}
      {erro && <p className="mt-3 text-sm text-[#ff9be9]">{erro}</p>}
    </Card>
  );
}

/* ---------- grade ---------- */
function Previa({ c, url, className = "", controls }) {
  const f = FORMATOS.find((x) => x.id === c.formato) || FORMATOS[0];
  return (
    <div className={`relative w-full overflow-hidden rounded-xl bg-[#05050a] ${className}`} style={{ aspectRatio: f.ratio }}>
      {url && c.midia_tipo === "video" ? (
        <video src={url} className="h-full w-full object-cover" muted playsInline loop controls={controls} autoPlay={controls} />
      ) : url ? (
        <img src={url} alt={c.tema} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center text-titanium">
          {c.status === "gerando" ? <Loader2 size={20} className="animate-spin text-[#fbbf24]" /> : c.status === "erro" ? <TriangleAlert size={20} className="text-[#ff2fd0]" /> : <f.icon size={20} />}
          <span className="text-[0.7rem]">{c.status === "gerando" ? "Gerando na Poe…" : c.status === "erro" ? "Falhou" : "Sem mídia"}</span>
        </div>
      )}
    </div>
  );
}

function Miniatura({ c, url, onOpen }) {
  const st = STATUS[c.status] || STATUS.rascunho;
  const f = FORMATOS.find((x) => x.id === c.formato) || FORMATOS[0];
  return (
    <Card className="cursor-pointer p-2 transition hover:border-white/20" onClick={onOpen}>
      <Previa c={c} url={url} />
      <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
        <Badge color="#60a5fa">{f.label}</Badge>
        <Badge color={st.color}>{st.label}</Badge>
      </div>
      <p className="mt-1.5 line-clamp-2 px-1 text-xs text-white">{c.tema}</p>
      <p className="mt-0.5 px-1 pb-1 font-mono text-[0.58rem] text-titanium">{fmtDate((c.agendado_para || c.criado_em || "").slice(0, 10))}</p>
    </Card>
  );
}

/* ---------- conteúdo aberto ---------- */
function ConteudoModal({ id, url: links, chaves, cfg, onClose }) {
  const { db, load } = useG();
  const c = (db.conteudos || []).find((x) => x.id === id);
  const [f, setF] = useState(() => (c ? { ...c, hashtags: (c.hashtags || []).map((h) => "#" + h).join(" "), agendado_para: c.agendado_para?.slice(0, 16) || "" } : {}));
  const [busy, setBusy] = useState("");
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [ask, confirmNode] = useConfirm();

  // quando a mídia/status mudar no servidor, atualiza só esses campos
  useEffect(() => {
    if (c) setF((v) => ({ ...v, status: c.status, erro: c.erro, midia_path: c.midia_path, midia_tipo: c.midia_tipo, modelo_midia: c.modelo_midia }));
  }, [c?.status, c?.midia_path, c?.erro]); // eslint-disable-line react-hooks/exhaustive-deps

  const [link, setLink] = useState(null);
  useEffect(() => {
    if (!f.midia_path) return setLink(null);
    if (links[f.midia_path]) return setLink(links[f.midia_path]);
    sb.storage.from(BUCKET).createSignedUrl(f.midia_path, 3600).then(({ data }) => setLink(data?.signedUrl || null));
  }, [f.midia_path, links]);

  const legendaFinal = useMemo(() => [f.legenda, f.hashtags].filter(Boolean).join("\n\n"), [f.legenda, f.hashtags]);
  if (!c) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const st = STATUS[f.status] || STATUS.rascunho;
  const fmt = FORMATOS.find((x) => x.id === c.formato) || FORMATOS[0];
  const bot = c.formato === "reels" ? cfg.bot_video || "Veo-3.1" : cfg.bot_imagem || "Imagen-4";

  const dados = () => ({
    legenda: f.legenda || null,
    hashtags: String(f.hashtags || "").split(/[\s,]+/).map((h) => h.replace(/^#/, "").trim()).filter(Boolean),
    roteiro: f.roteiro || null, texto_arte: f.texto_arte || null, prompt_midia: f.prompt_midia || null,
    agendado_para: f.agendado_para ? new Date(f.agendado_para).toISOString() : null,
  });
  const rodar = async (nome, fn) => {
    setBusy(nome);
    setErro("");
    try { await fn(); await load(); } catch (e) { setErro(e.message); }
    setBusy("");
  };
  const salvar = () => rodar("salvar", async () => {
    const { error } = await sb.from("gestao_conteudos").update(dados()).eq("id", c.id);
    if (error) throw error;
  });
  const aprovar = () => rodar("aprovar", async () => {
    const { error } = await sb.from("gestao_conteudos").update({ ...dados(), status: "aprovado" }).eq("id", c.id);
    if (error) throw error;
  });
  const regerar = () => rodar("midia", async () => {
    await sb.from("gestao_conteudos").update(dados()).eq("id", c.id);
    await agente("gerar_midia", { id: c.id, prompt_midia: f.prompt_midia });
  });
  const publicar = () => rodar("publicar", async () => {
    await sb.from("gestao_conteudos").update(dados()).eq("id", c.id);
    await agente("publicar", { id: c.id });
  });
  const copiar = async () => {
    try { await navigator.clipboard.writeText(legendaFinal); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { setErro("Não consegui copiar."); }
  };
  const apagar = async () => {
    if (!(await ask("Apagar este conteúdo e a mídia gerada?"))) return;
    if (c.midia_path) await sb.storage.from(BUCKET).remove([c.midia_path]);
    await sb.from("gestao_conteudos").delete().eq("id", c.id);
    await load();
    onClose();
  };

  const ocupado = ["gerando", "publicando"].includes(f.status);
  const podePublicar = chaves?.instagram && f.midia_path && !ocupado && f.status !== "publicado" && !(c.formato === "reels" && f.midia_tipo !== "video");

  return (
    <Modal open wide onClose={onClose} title={c.tema}
      footer={
        <>
          <Btn variant="danger" className="mr-auto" onClick={apagar}><Trash2 size={14} /></Btn>
          {erro && <span className="text-sm text-[#ff9be9]">{erro}</span>}
          <Btn variant="ghost" onClick={salvar} disabled={!!busy}>{busy === "salvar" ? "Salvando…" : "Salvar"}</Btn>
          {f.status !== "publicado" && f.status !== "aprovado" && <Btn variant="ghost" onClick={aprovar} disabled={!!busy || ocupado}><CircleCheck size={14} /> Aprovar</Btn>}
          {chaves?.instagram
            ? <Btn variant="neon" onClick={publicar} disabled={!!busy || !podePublicar}><Send size={14} /> {f.status === "publicando" ? "Publicando…" : f.status === "publicado" ? "Publicado" : "Publicar no Instagram"}</Btn>
            : <span className="text-xs text-titanium">Para publicar direto, configure o Instagram.</span>}
        </>
      }>
      {confirmNode}
      <div className="grid gap-6 md:grid-cols-[minmax(0,300px)_1fr]">
        <div>
          <Previa c={{ ...c, ...f }} url={link} controls />
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge color="#60a5fa">{fmt.label}</Badge>
            <Badge color={st.color}>{st.label}</Badge>
            {f.modelo_midia && <Badge color="#a78bfa">{f.modelo_midia.replace(/^poe:/, "Poe · ")}</Badge>}
            {c.modelo_texto && <Badge color="#8a8f98">texto: {c.modelo_texto.replace(/^poe:/, "Poe · ")}</Badge>}
          </div>
          {f.status === "erro" && f.erro && <p className="mt-3 rounded-xl border border-[#ff2fd0]/30 bg-[#ff2fd0]/10 p-3 text-xs text-[#ff9be9]">{f.erro}</p>}
          {f.status === "publicado" && <p className="mt-3 text-xs text-[#c4b5fd]">Publicado em {fmtDate(c.publicado_em?.slice(0, 10))}.</p>}
          {link && (
            <a href={link} download target="_blank" rel="noreferrer" className="mt-3 block">
              <Btn variant="ghost" size="sm" className="w-full justify-center"><Download size={13} /> Baixar {f.midia_tipo === "video" ? "vídeo" : "imagem"}</Btn>
            </a>
          )}
          <Field label={`Prompt da ${c.formato === "reels" ? "cena (vídeo)" : "imagem"} · em inglês`} className="mt-4">
            <Textarea rows={5} value={f.prompt_midia} onChange={set("prompt_midia")} />
          </Field>
          <Btn variant="ghost" className="mt-2 w-full justify-center" onClick={regerar} disabled={!!busy || ocupado || !chaves?.poe}>
            {f.status === "gerando" ? <><Loader2 size={13} className="animate-spin" /> Gerando…</> : <><RefreshCw size={13} /> {f.midia_path ? "Gerar outra versão" : `Gerar ${c.formato === "reels" ? "vídeo" : "imagem"}`} · Poe {bot}</>}
          </Btn>
        </div>

        <div className="flex flex-col gap-4">
          <Field label="Legenda">
            <Textarea rows={9} value={f.legenda} onChange={set("legenda")} />
          </Field>
          <Field label="Hashtags"><Textarea rows={2} value={f.hashtags} onChange={set("hashtags")} /></Field>
          <div className="flex flex-wrap items-center gap-2">
            <Btn size="sm" variant="ghost" onClick={copiar}><Copy size={12} /> {copiado ? "Copiado!" : "Copiar legenda + hashtags"}</Btn>
            <span className="font-mono text-[0.6rem] text-titanium">{legendaFinal.length} / 2.200 caracteres</span>
          </div>
          {f.texto_arte && <Field label="Frase da arte"><Input value={f.texto_arte} onChange={set("texto_arte")} /></Field>}
          {(c.formato !== "feed" || f.roteiro) && (
            <Field label={c.formato === "reels" ? "Roteiro do reels" : "Ideia para o story"}><Textarea rows={6} value={f.roteiro} onChange={set("roteiro")} /></Field>
          )}
          <Field label="Data planejada" hint="Organização do calendário. A publicação é feita pelo botão.">
            <Input type="datetime-local" value={f.agendado_para} onChange={set("agendado_para")} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- estúdio: bots e identidade visual ---------- */
function EstudioModal({ cfg, onClose }) {
  const { save } = useG();
  const [f, setF] = useState({ bot_imagem: cfg.bot_imagem || "Imagen-4", bot_video: cfg.bot_video || "Veo-3.1", identidade_visual: cfg.identidade_visual || "" });
  const [erro, setErro] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const salvar = async () => {
    try { await save("agente", { id: "padrao", ...f }); onClose(); } catch (e) { setErro(e.message); }
  };
  return (
    <Modal open onClose={onClose} title="Estúdio de conteúdo"
      footer={<>{erro && <span className="text-sm text-[#ff9be9]">{erro}</span>}<Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="neon" onClick={salvar}>Salvar</Btn></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bot de imagem (Poe)" hint="Ex.: Imagen-4, Nano-Banana, GPT-Image-1">
          <Input list="bots-img" value={f.bot_imagem} onChange={set("bot_imagem")} />
        </Field>
        <Field label="Bot de vídeo (Poe)" hint="Ex.: Veo-3.1, Sora-2, Kling">
          <Input list="bots-vid" value={f.bot_video} onChange={set("bot_video")} />
        </Field>
        <datalist id="bots-img">{["Imagen-4", "Imagen-4-Ultra", "Nano-Banana", "GPT-Image-1", "FLUX-pro-1.1", "Ideogram-v3"].map((b) => <option key={b} value={b} />)}</datalist>
        <datalist id="bots-vid">{["Veo-3.1", "Veo-3", "Sora-2", "Kling-2.1-Master", "Runway-Gen-4-Turbo"].map((b) => <option key={b} value={b} />)}</datalist>
        <Field label="Identidade visual" className="sm:col-span-2" hint="Vai em todo prompt de imagem e vídeo">
          <Textarea rows={4} value={f.identidade_visual} onChange={set("identidade_visual")} />
        </Field>
        <p className="text-xs text-titanium sm:col-span-2">
          Use o nome exato do bot como aparece na Poe. Cada bot gasta uma quantidade diferente de pontos; vídeo costuma ser bem mais caro que imagem.
        </p>
      </div>
    </Modal>
  );
}

