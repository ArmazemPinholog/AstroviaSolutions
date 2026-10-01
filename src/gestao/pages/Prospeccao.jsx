import React, { useEffect, useMemo, useState } from "react";
import {
  Radar, Sparkles, Copy, Send, AtSign, MapPin, Globe, MessageCircle, Settings2, UserPlus, Ban, Check,
  Star, Hash, Search, Plus, Clock, Loader2, ExternalLink, Trash2,
} from "lucide-react";
import {
  useG, Card, Btn, Field, Input, Textarea, Select, Badge, Modal, Empty, PageHead, Stat,
  waLink, today, fmtDate, useConfirm,
} from "../ui";
import { sb } from "../supabase";
import { agente, STATUS_LEAD, FONTES, corScore, igLink, igDm, followupVencido } from "../agente";

const addDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function Prospeccao() {
  const { db } = useG();
  const cfg = db.agente?.[0] || {};
  const dias = cfg.followup_dias || 3;
  const [chaves, setChaves] = useState(null);
  const [aba, setAba] = useState("novo");
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(null);
  const [config, setConfig] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    agente("status").then(setChaves).catch(() => setChaves({ erro: true }));
  }, []);

  const leads = db.prospects || [];
  const cont = useMemo(() => {
    const c = Object.fromEntries(STATUS_LEAD.map((s) => [s.id, 0]));
    leads.forEach((p) => (c[p.status] = (c[p.status] || 0) + 1));
    c.followup = leads.filter((p) => followupVencido(p, dias)).length;
    return c;
  }, [leads, dias]);

  const lista = useMemo(() => {
    const s = q.trim().toLowerCase();
    return leads
      .filter((p) => (aba === "followup" ? followupVencido(p, dias) : aba === "todos" ? true : p.status === aba))
      .filter((p) => !s || [p.nome, p.nicho, p.cidade, p.instagram, p.bio].some((v) => (v || "").toLowerCase().includes(s)))
      .sort((a, b) => b.score - a.score);
  }, [leads, aba, q, dias]);

  const abas = [
    { id: "novo", label: "Novos" },
    { id: "followup", label: "Follow-up", destaque: cont.followup > 0 },
    { id: "abordado", label: "Abordados" },
    { id: "respondeu", label: "Responderam" },
    { id: "no_funil", label: "No funil" },
    { id: "descartado", label: "Descartados" },
    { id: "todos", label: "Todos" },
  ];

  return (
    <>
      <PageHead kicker="Agente" title="Prospecção">
        <Chaves chaves={chaves} />
        <Btn variant="ghost" onClick={() => setManual(true)}><Plus size={14} /> Lead manual</Btn>
        <Btn variant="ghost" onClick={() => setConfig(true)}><Settings2 size={14} /> Agente</Btn>
      </PageHead>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Novos" value={cont.novo} icon={Radar} color="#8a8f98" sub="aguardando abordagem" />
        <Stat label="Abordados" value={cont.abordado} icon={Send} color="#60a5fa" sub={`${cont.followup} com follow-up vencido`} />
        <Stat label="Responderam" value={cont.respondeu} icon={MessageCircle} color="#fbbf24" />
        <Stat label="No funil" value={cont.no_funil} icon={Check} color="#34d399" />
        <Stat
          label="Taxa de resposta"
          value={`${cont.abordado + cont.respondeu + cont.no_funil ? Math.round(((cont.respondeu + cont.no_funil) / (cont.abordado + cont.respondeu + cont.no_funil)) * 100) : 0}%`}
          icon={Sparkles}
          color="#ff2fd0"
          sub="de quem foi abordado"
        />
      </div>

      <Garimpar cfg={cfg} chaves={chaves} />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
          {abas.map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`rounded-lg px-3 py-1.5 text-xs transition ${aba === a.id ? "bg-[#22d3ee]/15 text-[#22d3ee]" : a.destaque ? "text-[#fbbf24] hover:text-white" : "text-titanium hover:text-white"}`}
            >
              {a.label}
              <span className="ml-1.5 font-mono text-[0.6rem] opacity-70">{a.id === "todos" ? leads.length : cont[a.id] || 0}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-titanium" />
          <Input placeholder="Buscar lead…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 34 }} />
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {lista.length ? lista.map((p) => <LeadLinha key={p.id} p={p} dias={dias} onOpen={() => setAberto(p.id)} />) : (
          <Empty>{leads.length ? "Nenhum lead nesta aba." : "Nenhum lead ainda. Use o garimpo acima ou adicione um lead manual."}</Empty>
        )}
      </div>

      {aberto && <LeadModal id={aberto} onClose={() => setAberto(null)} chaves={chaves} />}
      {config && <ConfigModal cfg={cfg} onClose={() => setConfig(false)} />}
      {manual && <ManualModal cfg={cfg} onClose={() => setManual(false)} onCriado={(id) => { setManual(false); setAberto(id); }} />}
    </>
  );
}

/* ---------- chaves configuradas ---------- */
function Chaves({ chaves }) {
  if (!chaves) return <span className="text-xs text-titanium">verificando agente…</span>;
  if (chaves.erro) return <Badge color="#ff2fd0">agente offline</Badge>;
  const item = (ok, nome) => <Badge color={ok ? "#34d399" : "#8a8f98"}>{ok ? "●" : "○"} {nome}</Badge>;
  return (
    <span className="flex flex-wrap gap-1.5" title="Chaves configuradas nos Secrets do Supabase">
      {item(chaves.gemini, "Gemini")}
      {item(chaves.poe, "Poe")}
      {item(chaves.google, "Google")}
      {item(chaves.instagram, "Instagram")}
    </span>
  );
}

/* ---------- garimpo ---------- */
function Garimpar({ cfg, chaves }) {
  const { load } = useG();
  const [fonte, setFonte] = useState("google");
  const [f, setF] = useState({ busca: "", cidade: "", paginas: 1, hashtag: "", usernames: "", nicho: "" });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [erro, setErro] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const cidade = f.cidade || cfg.cidade_padrao || "";

  const rodar = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErro("");
    setRes(null);
    try {
      const r = fonte === "google"
        ? await agente("garimpar_google", { busca: f.busca, cidade, paginas: +f.paginas })
        : await agente("garimpar_instagram", { hashtag: f.hashtag, usernames: f.usernames, nicho: f.nicho, cidade });
      setRes(r);
      await load();
    } catch (err) { setErro(err.message); }
    setBusy(false);
  };

  const pronto = fonte === "google" ? chaves?.google : chaves?.instagram;

  return (
    <Card className="mt-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-[#22d3ee]">Garimpar leads</p>
          <p className="mt-1 text-sm text-titanium">O agente busca, dá uma nota de 0 a 100 e guarda só quem ainda não está na lista.</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
          {[{ id: "google", label: "Google Maps", icon: MapPin }, { id: "instagram", label: "Instagram", icon: AtSign }].map((o) => (
            <button key={o.id} onClick={() => { setFonte(o.id); setRes(null); setErro(""); }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition ${fonte === o.id ? "bg-[#22d3ee]/15 text-[#22d3ee]" : "text-titanium hover:text-white"}`}>
              <o.icon size={13} /> {o.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={rodar} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fonte === "google" ? (
          <>
            <Field label="O que buscar *">
              <Input list="nichos-agente" required value={f.busca} onChange={set("busca")} placeholder="barbearia" />
            </Field>
            <Field label="Cidade / bairro"><Input value={f.cidade} onChange={set("cidade")} placeholder={cfg.cidade_padrao || "Curitiba, PR"} /></Field>
            <Field label="Quantidade" hint="Cada página = até 20 negócios">
              <Select value={f.paginas} onChange={set("paginas")} options={[{ value: 1, label: "20 resultados" }, { value: 2, label: "40 resultados" }, { value: 3, label: "60 resultados" }]} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Hashtag" hint="Limite do Instagram: 30 hashtags diferentes por semana">
              <div className="relative">
                <Hash size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-titanium" />
                <Input value={f.hashtag} onChange={set("hashtag")} placeholder="barbeariacuritiba" style={{ paddingLeft: 30 }} />
              </div>
            </Field>
            <Field label="E/ou perfis (@)" hint="Separe por espaço ou vírgula">
              <Input value={f.usernames} onChange={set("usernames")} placeholder="@perfil1 @perfil2" />
            </Field>
            <Field label="Nicho"><Input list="nichos-agente" value={f.nicho} onChange={set("nicho")} placeholder="barbearia" /></Field>
          </>
        )}
        <datalist id="nichos-agente">{(cfg.nichos || []).map((n) => <option key={n} value={n} />)}</datalist>
        <div className="flex items-end">
          <Btn type="submit" variant="neon" className="w-full justify-center" disabled={busy || (fonte === "instagram" && !f.hashtag.trim() && !f.usernames.trim())}>
            {busy ? <><Loader2 size={14} className="animate-spin" /> Garimpando…</> : <><Radar size={14} /> Garimpar</>}
          </Btn>
        </div>
      </form>

      {chaves && !chaves.erro && !pronto && (
        <p className="mt-3 text-xs text-[#fbbf24]">
          {fonte === "google" ? "Falta a chave GOOGLE_PLACES_KEY" : "Faltam IG_ACCESS_TOKEN e IG_USER_ID"} nos Secrets das Edge Functions do Supabase.
        </p>
      )}
      {erro && <p className="mt-3 text-sm text-[#ff9be9]">{erro}</p>}
      {res && (
        <div className="mt-4 rounded-xl border border-[#22d3ee]/20 bg-[#22d3ee]/[0.05] p-3 text-sm text-titanium-bright">
          <b className="text-white">{res.encontrados}</b> encontrados · <b className="text-[#34d399]">{res.novos.length}</b> {res.novos.length === 1 ? "novo" : "novos"} na lista · {res.repetidos} já existiam
          {res.novos.length > 0 && (
            <p className="mt-1 text-xs text-titanium">
              Melhores: {[...res.novos].sort((a, b) => b.score - a.score).slice(0, 4).map((n) => `${n.nome} (${n.score})`).join(" · ")}
            </p>
          )}
          {res.ignorados?.length > 0 && (
            <p className="mt-1 text-xs text-titanium">Ignorados (perfil pessoal ou inexistente): {res.ignorados.map((i) => "@" + i.username).join(", ")}</p>
          )}
          {res.posts?.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-[#22d3ee]">Ver {res.posts.length} posts da hashtag (o Instagram não mostra quem postou)</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {res.posts.map((p) => (
                  <li key={p.permalink}><a className="text-titanium hover:text-white" href={p.permalink} target="_blank" rel="noreferrer">↗ {p.legenda || p.permalink}</a></li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}

/* ---------- linha da lista ---------- */
function Score({ v, size = 40 }) {
  const c = corScore(v);
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full font-display text-sm tabular-nums"
      style={{ width: size, height: size, color: c, background: `conic-gradient(${c} ${v * 3.6}deg, rgba(255,255,255,0.06) 0)`, padding: 3 }}>
      <span className="flex h-full w-full items-center justify-center rounded-full bg-[#0a0a11]">{v || "—"}</span>
    </span>
  );
}

function Links({ p }) {
  const it = [
    p.instagram && { href: igLink(p.instagram), icon: AtSign, t: "Instagram" },
    p.telefone && waLink(p.telefone) && { href: waLink(p.telefone), icon: MessageCircle, t: "WhatsApp" },
    p.maps_url && { href: p.maps_url, icon: MapPin, t: "Google Maps" },
    p.site && { href: p.site, icon: Globe, t: "Site" },
  ].filter(Boolean);
  return (
    <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
      {it.map((l) => (
        <a key={l.t} href={l.href} target="_blank" rel="noreferrer" title={l.t} className="rounded-lg p-1.5 text-titanium hover:bg-white/10 hover:text-white"><l.icon size={14} /></a>
      ))}
    </span>
  );
}

function LeadLinha({ p, dias, onOpen }) {
  const st = STATUS_LEAD.find((s) => s.id === p.status);
  return (
    <Card className="flex cursor-pointer items-center gap-3 p-3 transition hover:border-white/20" onClick={onOpen}>
      <Score v={p.score} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm text-white">{p.nome}</p>
          <Badge color={st?.color}>{st?.label}</Badge>
          {followupVencido(p, dias) && <Badge color="#fbbf24"><Clock size={10} /> follow-up</Badge>}
        </div>
        <p className="mt-0.5 truncate text-xs text-titanium">
          {[FONTES[p.fonte], p.nicho, p.cidade, p.instagram && "@" + p.instagram, p.nota_google && `${p.nota_google}★ (${p.avaliacoes})`, p.seguidores && `${p.seguidores.toLocaleString("pt-BR")} seguidores`].filter(Boolean).join(" · ")}
        </p>
        {p.motivos?.length > 0 && <p className="mt-1 hidden truncate text-[0.7rem] text-titanium-dim sm:block">{p.motivos.slice(0, 3).join(" · ")}</p>}
      </div>
      <span className="hidden sm:flex"><Links p={p} /></span>
      <span className="hidden sm:block"><Btn size="sm" variant="ghost"><Sparkles size={12} /> Abordar</Btn></span>
    </Card>
  );
}

/* ---------- lead aberto: abordagem ---------- */
function LeadModal({ id, onClose, chaves }) {
  const { db, load, uid } = useG();
  const cfg = db.agente?.[0] || {};
  const p = (db.prospects || []).find((x) => x.id === id);
  const msgs = (db.abordagens || []).filter((a) => a.prospect_id === id && a.status !== "descartada");
  const temIg = !!p?.instagram, temWa = !!(p?.telefone && waLink(p.telefone));
  const [canal, setCanal] = useState(temIg ? "instagram" : temWa ? "whatsapp" : "instagram");
  const [instrucao, setInstrucao] = useState("");
  const [motor, setMotor] = useState(() => { try { const m = localStorage.getItem("gestao:motor"); return m === "gemini" ? "gemini" : "auto"; } catch { return "auto"; } });
  const escolherMotor = (v) => { setMotor(v); try { localStorage.setItem("gestao:motor", v); } catch { /* sem storage */ } };
  const [busy, setBusy] = useState("");
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(null);
  const [ask, confirmNode] = useConfirm();

  if (!p) return null;
  const tipo = p.status === "abordado" ? "followup" : "primeiro_contato";

  const gerar = async () => {
    setBusy("gerar");
    setErro("");
    try {
      await agente("gerar_abordagem", { prospect_id: p.id, canal, tipo, instrucao, motor });
      await load();
    } catch (e) { setErro(e.message); }
    setBusy("");
  };

  const copiar = async (a) => {
    try { await navigator.clipboard.writeText(a.texto); setCopiado(a.id); setTimeout(() => setCopiado(null), 1800); } catch { setErro("Não consegui copiar. Selecione o texto manualmente."); }
  };
  const abrirCanal = async (a) => {
    await copiar(a);
    const url = a.canal === "whatsapp" ? `${waLink(p.telefone)}?text=${encodeURIComponent(a.texto)}` : igDm(p.instagram);
    if (url) window.open(url, "_blank", "noopener");
  };

  const enviada = async (a) => {
    setBusy("enviar");
    try {
      const agora = new Date().toISOString();
      await sb.from("gestao_abordagens").update({ status: "enviada", enviada_em: agora }).eq("id", a.id);
      await sb.from("gestao_abordagens").update({ status: "descartada" }).eq("prospect_id", p.id).eq("status", "rascunho").neq("id", a.id);
      await sb.from("gestao_prospects").update({ status: "abordado", abordado_em: agora, responsavel: p.responsavel || uid }).eq("id", p.id);
      await sb.from("gestao_tarefas").insert({
        titulo: `Follow-up: ${p.nome}`,
        descricao: `Abordado por ${a.canal} em ${fmtDate(today())}. Se não respondeu, gere o follow-up na aba Prospecção.`,
        responsavel: p.responsavel || uid,
        prazo: addDias(cfg.followup_dias || 3),
        prioridade: "media",
      });
      await load();
    } catch (e) { setErro(e.message); }
    setBusy("");
  };

  const status = async (s) => {
    await sb.from("gestao_prospects").update({ status: s }).eq("id", p.id);
    await load();
  };

  const proFunil = async () => {
    setBusy("funil");
    setErro("");
    try {
      const origem = p.fonte === "google" ? "Google" : p.fonte === "instagram" ? "Instagram" : "Prospecção ativa";
      const { data: c, error: e1 } = await sb.from("gestao_clientes").insert({
        nome: p.nome, empresa: p.nome, segmento: p.nicho, whatsapp: p.telefone, instagram: p.instagram,
        site: p.site, cidade: p.cidade, endereco: p.endereco, origem, status: "prospect", responsavel: p.responsavel || uid,
        observacoes: p.motivos?.length ? `Agente: ${p.motivos.join("; ")}` : null,
      }).select().single();
      if (e1) throw e1;
      const { data: n, error: e2 } = await sb.from("gestao_negocios").insert({
        cliente_id: c.id, titulo: `${/barb|est[eé]t|beleza|sal[aã]o|cl[ií]nica/i.test(p.nicho || "") ? "Sistema de agendamento" : "Projeto"} · ${p.nome}`,
        etapa: "contato", probabilidade: 30, responsavel: p.responsavel || uid,
        proximo_passo: "Apresentar a demo", proxima_data: addDias(1),
      }).select().single();
      if (e2) throw e2;
      await sb.from("gestao_prospects").update({ status: "no_funil", cliente_id: c.id, negocio_id: n.id }).eq("id", p.id);
      await load();
    } catch (e) { setErro(e.message); }
    setBusy("");
  };

  const apagar = async () => {
    if (!(await ask(`Apagar ${p.nome} da prospecção? As mensagens geradas também somem.`))) return;
    await sb.from("gestao_prospects").delete().eq("id", p.id);
    await load();
    onClose();
  };

  const st = STATUS_LEAD.find((s) => s.id === p.status);

  return (
    <Modal open wide onClose={onClose} title={p.nome}
      footer={
        <>
          <Btn variant="danger" className="mr-auto" onClick={apagar}><Trash2 size={14} /></Btn>
          {erro && <span className="text-sm text-[#ff9be9]">{erro}</span>}
          {p.status !== "descartado" && p.status !== "no_funil" && <Btn variant="ghost" onClick={() => status("descartado")}><Ban size={14} /> Descartar</Btn>}
          {p.status === "abordado" && <Btn variant="ghost" onClick={() => status("respondeu")}><MessageCircle size={14} /> Respondeu</Btn>}
          {p.status === "no_funil"
            ? <Btn variant="neon" onClick={() => { onClose(); }}><Check size={14} /> Já está no funil</Btn>
            : <Btn variant="neon" disabled={!!busy} onClick={proFunil}><UserPlus size={14} /> {busy === "funil" ? "Criando…" : "Mandar pro funil"}</Btn>}
        </>
      }>
      {confirmNode}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        {/* dados */}
        <div>
          <div className="flex items-center gap-3">
            <Score v={p.score} size={52} />
            <div>
              <Badge color={st?.color}>{st?.label}</Badge>
              <p className="mt-1 text-xs text-titanium">{FONTES[p.fonte]} · adicionado {fmtDate(p.criado_em?.slice(0, 10))}</p>
            </div>
            <span className="ml-auto"><Links p={p} /></span>
          </div>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            {[
              ["Nicho", p.nicho], ["Cidade", p.cidade], ["Endereço", p.endereco], ["Telefone", p.telefone],
              ["Instagram", p.instagram && "@" + p.instagram], ["Site", p.site],
              ["Google", p.nota_google && `${p.nota_google}★ · ${p.avaliacoes} avaliações`],
              ["Seguidores", p.seguidores?.toLocaleString("pt-BR")], ["Posts", p.publicacoes],
            ].filter(([, v]) => v).map(([k, v]) => (
              <React.Fragment key={k}><dt className="text-titanium">{k}</dt><dd className="break-words text-white">{v}</dd></React.Fragment>
            ))}
          </dl>
          {p.bio && <p className="mt-3 whitespace-pre-line rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-titanium-bright">{p.bio}</p>}
          {p.motivos?.length > 0 && (
            <div className="mt-4">
              <p className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-titanium">Por que essa nota</p>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-titanium-bright">
                {p.motivos.map((m) => <li key={m} className="flex gap-2"><Star size={11} className="mt-0.5 shrink-0 text-[#22d3ee]" /> {m}</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* abordagem */}
        <div>
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-[#22d3ee]">
            {tipo === "followup" ? "Follow-up" : "Primeira mensagem"}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr]">
            <Field label="Canal">
              <Select value={canal} onChange={(e) => setCanal(e.target.value)} options={[
                { value: "instagram", label: "Instagram (Direct)" }, { value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "E-mail" },
              ]} />
            </Field>
            <Field label="Pedido extra (opcional)">
              <Input value={instrucao} onChange={(e) => setInstrucao(e.target.value)} placeholder="Ex.: mencionar que sou de Curitiba também" />
            </Field>
          </div>
          <Field label="IA" className="mt-3" hint={motor === "auto" ? "Gemini grátis; a Poe só entra se o Gemini falhar ou bater o limite." : "Só o Gemini gratuito, nunca gasta pontos."}>
            <Select value={motor} onChange={(e) => escolherMotor(e.target.value)} options={[
              { value: "auto", label: "Gemini grátis (Poe só se precisar)" },
              { value: "gemini", label: "Só Gemini (nunca gasta pontos)" },
            ]} />
          </Field>
          <Btn variant="neon" className="mt-3 w-full justify-center" onClick={gerar}
            disabled={!!busy || (motor === "gemini" ? chaves?.gemini === false : chaves?.gemini === false && chaves?.poe === false)}>
            {busy === "gerar" ? <><Loader2 size={14} className="animate-spin" /> Escrevendo…</> : <><Sparkles size={14} /> {msgs.length ? "Gerar novas versões" : "Gerar mensagem com IA"}</>}
          </Btn>
          {chaves?.gemini === false && <p className="mt-2 text-xs text-[#fbbf24]">Falta a chave GEMINI_API_KEY nos Secrets do Supabase.</p>}

          <div className="mt-4 flex flex-col gap-3">
            {msgs.map((a) => (
              <Rascunho key={a.id} a={a} copiado={copiado === a.id} busy={busy}
                onCopiar={() => copiar(a)} onAbrir={() => abrirCanal(a)} onEnviada={() => enviada(a)}
                podeAbrir={a.canal === "instagram" ? temIg : a.canal === "whatsapp" ? temWa : false} />
            ))}
            {!msgs.length && <Empty>Gere a mensagem, revise e envie você mesmo. O agente registra o envio e agenda o follow-up.</Empty>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Rascunho({ a, copiado, busy, onCopiar, onAbrir, onEnviada, podeAbrir }) {
  const { load } = useG();
  const [txt, setTxt] = useState(a.texto);
  const mudou = txt !== a.texto;
  const salvar = async () => { await sb.from("gestao_abordagens").update({ texto: txt }).eq("id", a.id); await load(); };
  const enviadaJa = a.status === "enviada";
  return (
    <Card className={`p-3 ${enviadaJa ? "border-[#34d399]/30" : ""}`}>
      <div className="mb-2 flex items-center gap-2">
        <Badge color={enviadaJa ? "#34d399" : "#8a8f98"}>{enviadaJa ? `enviada ${fmtDate(a.enviada_em?.slice(0, 10))}` : "rascunho"}</Badge>
        <Badge color="#60a5fa">{a.canal}</Badge>
        {a.tipo === "followup" && <Badge color="#fbbf24">follow-up</Badge>}
        {a.modelo && <Badge color={a.modelo.startsWith("poe") ? "#a78bfa" : "#8a8f98"}>{a.modelo.replace(/^poe:/, "Poe · ")}</Badge>}
        <span className="ml-auto font-mono text-[0.6rem] text-titanium">{txt.length} caracteres</span>
      </div>
      <Textarea rows={6} value={txt} onChange={(e) => setTxt(e.target.value)} readOnly={enviadaJa} />
      {!enviadaJa && (
        <div className="mt-2 flex flex-wrap gap-2">
          {mudou && <Btn size="sm" variant="ghost" onClick={salvar}>Salvar edição</Btn>}
          <Btn size="sm" variant="ghost" onClick={onCopiar}><Copy size={12} /> {copiado ? "Copiado!" : "Copiar"}</Btn>
          {podeAbrir && <Btn size="sm" variant="ghost" onClick={onAbrir}><ExternalLink size={12} /> Copiar e abrir {a.canal === "whatsapp" ? "WhatsApp" : "Direct"}</Btn>}
          <Btn size="sm" className="ml-auto" disabled={!!busy || mudou} onClick={onEnviada} title={mudou ? "Salve a edição antes" : ""}>
            <Send size={12} /> Marcar como enviada
          </Btn>
        </div>
      )}
    </Card>
  );
}

/* ---------- configuração do agente ---------- */
function ConfigModal({ cfg, onClose }) {
  const { save } = useG();
  const [f, setF] = useState({ ...cfg, nichos: (cfg.nichos || []).join(", ") });
  const [erro, setErro] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const salvar = async () => {
    try {
      await save("agente", {
        id: "padrao", oferta: f.oferta, tom: f.tom, assinatura: f.assinatura, portfolio_url: f.portfolio_url,
        cidade_padrao: f.cidade_padrao, followup_dias: +f.followup_dias || 3,
        nichos: String(f.nichos || "").split(",").map((s) => s.trim()).filter(Boolean),
      });
      onClose();
    } catch (e) { setErro(e.message); }
  };
  return (
    <Modal open onClose={onClose} title="Configurar o agente"
      footer={<>{erro && <span className="text-sm text-[#ff9be9]">{erro}</span>}<Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="neon" onClick={salvar}>Salvar</Btn></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="O que a Astrovia oferece" className="sm:col-span-2" hint="A IA usa isso como base para toda mensagem"><Textarea rows={3} value={f.oferta} onChange={set("oferta")} /></Field>
        <Field label="Tom de voz" className="sm:col-span-2"><Textarea rows={2} value={f.tom} onChange={set("tom")} /></Field>
        <Field label="Assinatura"><Input value={f.assinatura} onChange={set("assinatura")} /></Field>
        <Field label="Link do portfólio"><Input value={f.portfolio_url} onChange={set("portfolio_url")} /></Field>
        <Field label="Nichos-alvo" hint="Separados por vírgula" className="sm:col-span-2"><Input value={f.nichos} onChange={set("nichos")} /></Field>
        <Field label="Cidade padrão"><Input value={f.cidade_padrao} onChange={set("cidade_padrao")} /></Field>
        <Field label="Follow-up depois de (dias)"><Input type="number" min="1" max="30" value={f.followup_dias} onChange={set("followup_dias")} /></Field>
      </div>
    </Modal>
  );
}

/* ---------- lead manual ---------- */
function ManualModal({ cfg, onClose, onCriado }) {
  const { load, uid } = useG();
  const [f, setF] = useState({ nome: "", instagram: "", telefone: "", nicho: "", cidade: cfg.cidade_padrao || "", site: "", bio: "" });
  const [erro, setErro] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const salvar = async () => {
    if (!f.nome.trim()) return setErro("Dê um nome ao lead.");
    const ig = f.instagram.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "").toLowerCase() || null;
    const motivos = [!f.site.trim() && "Não tem site", f.nicho.trim() && `Nicho-alvo: ${f.nicho.trim()}`].filter(Boolean);
    const score = (f.site.trim() ? 0 : 30) + (f.nicho.trim() ? 12 : 0) + (f.telefone.trim() ? 10 : 0);
    const clean = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null]));
    const { data, error } = await sb.from("gestao_prospects").insert({
      ...clean, instagram: ig, fonte: "manual", externo_id: ig || null, score, motivos, responsavel: uid,
    }).select().single();
    if (error) return setErro(error.code === "23505" ? "Esse perfil já está na lista." : error.message);
    await load();
    onCriado(data.id);
  };
  return (
    <Modal open onClose={onClose} title="Novo lead manual"
      footer={<>{erro && <span className="text-sm text-[#ff9be9]">{erro}</span>}<Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="neon" onClick={salvar}>Adicionar</Btn></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do negócio *" className="sm:col-span-2"><Input autoFocus value={f.nome} onChange={set("nome")} /></Field>
        <Field label="Instagram"><Input value={f.instagram} onChange={set("instagram")} placeholder="@perfil" /></Field>
        <Field label="WhatsApp / telefone"><Input value={f.telefone} onChange={set("telefone")} /></Field>
        <Field label="Nicho"><Input list="nichos-agente-m" value={f.nicho} onChange={set("nicho")} /></Field>
        <Field label="Cidade"><Input value={f.cidade} onChange={set("cidade")} /></Field>
        <Field label="Site" className="sm:col-span-2"><Input value={f.site} onChange={set("site")} placeholder="deixe vazio se não tiver" /></Field>
        <Field label="O que você observou" className="sm:col-span-2" hint="Vai para a IA como contexto (ex.: agenda só pelo WhatsApp)"><Textarea value={f.bio} onChange={set("bio")} /></Field>
        <datalist id="nichos-agente-m">{(cfg.nichos || []).map((n) => <option key={n} value={n} />)}</datalist>
      </div>
    </Modal>
  );
}
