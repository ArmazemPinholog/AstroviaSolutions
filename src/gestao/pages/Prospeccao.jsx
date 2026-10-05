import React, { useEffect, useMemo, useState } from "react";
import {
  Radar, Sparkles, Copy, Send, AtSign, MapPin, Globe, MessageCircle, Settings2, UserPlus, Ban, Check,
  Star, Hash, Search, Plus, Clock, Loader2, ExternalLink, Trash2, Flame, ScanSearch, Reply, FileText, Link2,
} from "lucide-react";
import {
  useG, Card, Btn, Field, Input, Textarea, Select, Badge, Modal, Empty, PageHead, Stat,
  waLink, fmtDate, useConfirm, ehFixo,
} from "../ui";
import { ClassificarContato } from "../classificar";
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
  // leads que já têm mensagem esperando em Astra → Aprovar envios
  const naFila = useMemo(() => new Set((db.abordagens || []).filter((a) => a.status === "rascunho").map((a) => a.prospect_id)), [db.abordagens]);
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
        <InvestigarLote leads={lista} />
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-titanium" />
          <Input placeholder="Buscar lead…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 34 }} />
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {lista.length ? lista.map((p) => <LeadLinha key={p.id} p={p} dias={dias} naFila={naFila.has(p.id)} onOpen={() => setAberto(p.id)} />) : (
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
            <Field label="Hashtag" hint="Bloqueada até a Meta aprovar o app; use os @ ao lado">
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
          {res.fora_perfil?.length > 0 && (
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-titanium">{res.fora_perfil.length} fora do seu cliente ideal (não salvos)</summary>
              <ul className="mt-1 flex flex-col gap-0.5 text-titanium-dim">{res.fora_perfil.map((f) => <li key={f.nome + f.motivo}>{f.nome} · {f.motivo}</li>)}</ul>
            </details>
          )}
          {res.bloqueado && (
            <p className="mt-1 text-xs text-[#fbbf24]">A Meta ainda não liberou a leitura de perfis: os @ foram salvos sem seguidores e bio. Abra cada lead e anote o que observar; a IA usa isso na mensagem.</p>
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

/* manda o lead para Astra → Aprovar envios: a Astra escreve a mensagem e ela entra na fila */
function useParaAprovar(p) {
  const { load } = useG();
  const [estado, setEstado] = useState(""); // "" | "escrevendo" | "ok" | mensagem de erro
  const temWa = !!(p.telefone && waLink(p.telefone)), fixo = ehFixo(p.telefone);
  const canal = temWa && !(fixo && p.instagram) ? "whatsapp" : p.instagram ? "instagram" : temWa ? "whatsapp" : "email";
  const pode = !["descartado", "no_funil"].includes(p.status);
  const mandar = async (e) => {
    e?.stopPropagation();
    setEstado("escrevendo");
    try {
      await agente("gerar_abordagem", { prospect_id: p.id, canal, tipo: p.status === "abordado" ? "followup" : "primeiro_contato", substituir: true, origem: "manual" });
      await load();
      setEstado("ok");
    } catch (err) { setEstado(err.message || "Não deu certo"); }
  };
  return { estado, mandar, pode };
}

function LeadLinha({ p, dias, naFila, onOpen }) {
  const st = STATUS_LEAD.find((s) => s.id === p.status);
  const fila = useParaAprovar(p);
  return (
    <Card className="flex cursor-pointer items-center gap-3 p-3 transition hover:border-white/20" onClick={onOpen}>
      <Score v={p.score} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm text-white">{p.nome}</p>
          <Badge color={st?.color}>{st?.label}</Badge>
          {followupVencido(p, dias) && <Badge color="#fbbf24"><Clock size={10} /> follow-up</Badge>}
          {p.quente && <Badge color="#ff6b3d"><Flame size={10} /> quente</Badge>}
          {p.dono && <span className="text-xs text-titanium">· {p.dono}</span>}
          {!p.investigado_em && (p.fonte === "google" || p.fonte === "receita") && <span className="text-[0.65rem] text-titanium-dim">não investigado</span>}
        </div>
        <p className="mt-0.5 truncate text-xs text-titanium">
          {[FONTES[p.fonte], p.aberto_em && `aberto em ${fmtDate(p.aberto_em)}`, p.nicho, p.cidade, p.instagram && "@" + p.instagram, p.nota_google && `${p.nota_google}★ (${p.avaliacoes})`, p.seguidores && `${p.seguidores.toLocaleString("pt-BR")} seguidores`].filter(Boolean).join(" · ")}
        </p>
        {p.motivos?.length > 0 && <p className="mt-1 hidden truncate text-[0.7rem] text-titanium-dim sm:block">{p.motivos.slice(0, 3).join(" · ")}</p>}
        {fila.estado && !["escrevendo", "ok"].includes(fila.estado) && <p className="mt-1 text-[0.7rem] text-[#ff9be9]">{fila.estado}</p>}
      </div>
      <span className="hidden sm:flex"><Links p={p} /></span>
      {fila.pode && (naFila || fila.estado === "ok"
        ? <span className="shrink-0"><Badge color="#34d399"><Check size={10} /> Em Aprovar envios</Badge></span>
        : <Btn size="sm" variant="ghost" disabled={fila.estado === "escrevendo"} onClick={fila.mandar} title="A Astra escreve a mensagem e ela aparece em Astra → Aprovar envios">
            {fila.estado === "escrevendo" ? <><Loader2 size={12} className="animate-spin" /> Escrevendo…</> : <><Send size={12} /> <span className="hidden sm:inline">Para</span> Aprovar</>}
          </Btn>)}
    </Card>
  );
}

/* ---------- o que se sabe do lead (bio do perfil ou anotação sua) ---------- */
function Observacao({ p }) {
  const { load } = useG();
  const [t, setT] = useState(p.bio || "");
  const [ok, setOk] = useState(false);
  const salvar = async () => {
    if ((p.bio || "") === t) return;
    const { error } = await sb.from("gestao_prospects").update({ bio: t.trim() || null }).eq("id", p.id);
    if (!error) { setOk(true); setTimeout(() => setOk(false), 1500); load(); }
  };
  return (
    <Field className="mt-3" label={p.raw?.sem_dados ? "O que você observou no perfil" : "Bio / o que você observou"}
      hint={ok ? "Salvo ✓" : "A IA usa isso para personalizar a mensagem. Salva ao sair do campo."}>
      <Textarea rows={3} value={t} onChange={(e) => setT(e.target.value)} onBlur={salvar}
        placeholder="Ex.: agenda só pelo Direct, posta cortes todo dia, 2 unidades no Batel" />
    </Field>
  );
}

/* ---------- investigar vários de uma vez ---------- */
function InvestigarLote({ leads }) {
  const { load } = useG();
  const [prog, setProg] = useState(null);
  const alvo = leads.filter((p) => !p.investigado_em && ["novo", "abordado"].includes(p.status)).slice(0, 5);
  if (!alvo.length && !prog) return null;
  const rodar = async () => {
    for (let i = 0; i < alvo.length; i++) {
      setProg(`${i + 1}/${alvo.length}`);
      try { await agente("investigar", { prospect_id: alvo[i].id }); } catch { /* segue para o próximo */ }
    }
    setProg(null);
    await load();
  };
  return (
    <Btn variant="ghost" size="sm" disabled={!!prog} onClick={rodar} title="Lê as avaliações e o site e monta o dossiê dos melhores leads desta aba">
      {prog ? <><Loader2 size={13} className="animate-spin" /> Investigando {prog}…</> : <><ScanSearch size={13} /> Investigar os {alvo.length} melhores</>}
    </Btn>
  );
}

/* ---------- dossiê: avaliações, site, dono, momento quente ---------- */
function Dossie({ p }) {
  const { load } = useG();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const d = p.dossie;
  const rodar = async () => {
    setBusy(true); setErro("");
    try { await agente("investigar", { prospect_id: p.id }); await load(); } catch (e) { setErro(e.message); }
    setBusy(false);
  };
  const s = d?.site;
  const checks = s && [
    s.ok === false ? [false, s.erro] : null,
    s.nota_celular !== undefined && [s.nota_celular >= 50, `Celular: ${s.nota_celular}/100${s.carrega_em ? ` · carrega em ${s.carrega_em}` : ""}`],
    s.ok !== false && [s.https, s.https ? "Seguro (https)" : "Sem https"],
    s.ok !== false && [s.mobile, s.mobile ? "Adaptado ao celular" : "Não adaptado ao celular"],
    s.ok !== false && [s.agenda_online, s.agenda_online ? "Tem agendamento online" : "Sem agendamento online"],
    s.ok !== false && [s.whatsapp, s.whatsapp ? "Tem botão de WhatsApp" : "Sem botão de WhatsApp"],
    s.plataforma && [true, `Feito em ${s.plataforma}`],
  ].filter(Boolean);
  return (
    <div className="mt-4 rounded-xl border border-[#22d3ee]/15 bg-[#22d3ee]/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-[#22d3ee]">Dossiê</p>
        <Btn size="sm" variant="ghost" disabled={busy} onClick={rodar}>
          {busy ? <><Loader2 size={12} className="animate-spin" /> Lendo avaliações e site…</> : <><ScanSearch size={12} /> {d ? "Atualizar" : "Investigar"}</>}
        </Btn>
      </div>
      {erro && <p className="mt-2 text-xs text-[#ff9be9]">{erro}</p>}
      {!d && !busy && <p className="mt-2 text-xs text-titanium">O agente lê as avaliações do Google e abre o site para achar o dono, as dores reais e se é um momento quente. Leva uns 30 segundos.</p>}
      {d && (
        <div className="mt-2 flex flex-col gap-3 text-xs">
          {p.quente && <p className="flex gap-1.5 rounded-lg bg-[#ff6b3d]/10 p-2 text-[#ffb59c]"><Flame size={13} className="shrink-0" /> {p.quente_motivo}</p>}
          {d.resumo && <p className="text-titanium-bright">{d.resumo}</p>}
          {p.dono && <p><span className="text-titanium">Dono provável: </span><b className="text-white">{p.dono}</b> <span className="text-titanium-dim">({d.dono_confianca}{d.dono_evidencia ? ` · ${d.dono_evidencia}` : ""})</span></p>}
          {d.gancho && <p className="rounded-lg border border-white/[0.06] p-2 italic text-titanium-bright">“{d.gancho}”</p>}
          {d.dores?.length > 0 && (
            <div><p className="text-titanium">Dores com evidência</p>
              <ul className="mt-1 flex flex-col gap-1">{d.dores.map((x) => <li key={x.dor}><b className="text-white">{x.dor}</b> <span className="text-titanium-dim">— {x.evidencia}</span></li>)}</ul></div>
          )}
          {d.pontos_fortes?.length > 0 && <p><span className="text-titanium">Clientes elogiam: </span><span className="text-titanium-bright">{d.pontos_fortes.join(" · ")}</span></p>}
          {checks?.length > 0 && (
            <div><p className="text-titanium">Site</p>
              <ul className="mt-1 grid gap-0.5 sm:grid-cols-2">{checks.map(([ok, t]) => <li key={t} className={ok ? "text-[#34d399]" : "text-[#fbbf24]"}>{ok ? "✓" : "✗"} {t}</li>)}</ul></div>
          )}
          <p className="text-titanium-dim">{d.avaliacoes?.length || 0} avaliações lidas ({d.avaliacoes_recentes || 0} recentes) · {fmtDate(p.investigado_em?.slice(0, 10))}</p>
        </div>
      )}
    </div>
  );
}

/* link da demo com o nome do lead */
const demoUrl = (p) => {
  const n = (p.nicho || "").toLowerCase();
  const slug = /barb/.test(n) ? "barber-berserker" : /est[eé]t|beleza|sal[aã]o|sobrancelha|unha|spa|cl[ií]nica/.test(n) ? "luxe" : null;
  return slug ? `${location.origin}/demos/${slug}/?nome=${encodeURIComponent(p.nome)}` : null;
};
function DemoLink({ p }) {
  const [ok, setOk] = useState(false);
  const url = demoUrl(p);
  if (!url) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Btn size="sm" variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), 1600); } catch { /* sem clipboard */ } }}>
        <Link2 size={12} /> {ok ? "Link copiado!" : "Copiar demo com o nome dele"}
      </Btn>
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#22d3ee] hover:underline"><ExternalLink size={12} /> ver demo</a>
    </div>
  );
}

/* ---------- o lead respondeu: assistente ---------- */
const INTENCAO = { interessado: ["Interessado", "#34d399"], pediu_preco: ["Pediu preço", "#fbbf24"], objecao: ["Objeção", "#ff9be9"], duvida: ["Dúvida", "#60a5fa"], sem_interesse: ["Sem interesse", "#8a8f98"], outro: ["Outro", "#8a8f98"] };
function Respondeu({ p, canal, motor }) {
  const { load } = useG();
  const [txt, setTxt] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [erro, setErro] = useState("");
  const rodar = async () => {
    setBusy(true); setErro("");
    try { const r = await agente("responder", { prospect_id: p.id, texto: txt, canal, motor }); setRes(r); setTxt(""); await load(); } catch (e) { setErro(e.message); }
    setBusy(false);
  };
  const aplicar = async (s) => { await sb.from("gestao_prospects").update({ status: s }).eq("id", p.id); await load(); setRes({ ...res, sugestao_status: null }); };
  const [rot, cor] = INTENCAO[res?.intencao] || [];
  return (
    <div className="rounded-xl border border-[#fbbf24]/20 bg-[#fbbf24]/[0.03] p-3">
      <p className="flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-[#fbbf24]"><Reply size={12} /> Ele respondeu?</p>
      <div className="mt-2"><Textarea rows={3} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Cole aqui a resposta do lead" /></div>
      <Btn size="sm" className="mt-2" disabled={busy || !txt.trim()} onClick={rodar}>
        {busy ? <><Loader2 size={12} className="animate-spin" /> Pensando…</> : <><Sparkles size={12} /> Sugerir resposta</>}
      </Btn>
      {erro && <p className="mt-2 text-xs text-[#ff9be9]">{erro}</p>}
      {res && (
        <div className="mt-3 flex flex-col gap-1.5 text-xs">
          <p className="flex flex-wrap items-center gap-2">{rot && <Badge color={cor}>{rot}</Badge>}<span className="text-titanium-bright">{res.leitura}</span></p>
          <p><span className="text-titanium">Próximo passo: </span><span className="text-white">{res.proximo_passo}</span></p>
          {res.sugestao_status && res.sugestao_status !== p.status && (
            <Btn size="sm" variant="ghost" className="self-start" onClick={() => aplicar(res.sugestao_status)}>
              Mover para "{STATUS_LEAD.find((s) => s.id === res.sugestao_status)?.label || res.sugestao_status}"
            </Btn>
          )}
          <p className="text-titanium-dim">As respostas sugeridas estão logo abaixo, junto com as mensagens.</p>
        </div>
      )}
    </div>
  );
}

function Proposta({ p }) {
  const [ok, setOk] = useState(false);
  const x = p.proposta;
  if (!x?.titulo) return null;
  const lista = (t, arr) => (arr?.length ? `${t}\n${arr.map((i) => `• ${i}`).join("\n")}\n\n` : "");
  const texto = `${x.titulo}\n\n${x.contexto ? x.contexto + "\n\n" : ""}${lista("O que vamos fazer", x.solucao)}${lista("O que você recebe", x.entregaveis)}${x.prazo ? `Prazo: ${x.prazo}\n` : ""}${x.investimento ? `Investimento: ${x.investimento}\n` : ""}${x.condicoes ? `Condições: ${x.condicoes}\n` : ""}${x.proximo_passo ? `\nPróximo passo: ${x.proximo_passo}` : ""}`;
  return (
    <div className="rounded-xl border border-[#34d399]/25 bg-[#34d399]/[0.04] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-[#34d399]"><FileText size={12} /> Proposta sugerida</p>
        <Btn size="sm" variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1600); } catch { /* sem clipboard */ } }}>
          <Copy size={12} /> {ok ? "Copiada!" : "Copiar"}
        </Btn>
      </div>
      <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-titanium-bright">{texto}</pre>
      <p className="mt-2 text-[0.65rem] text-titanium-dim">Revise os valores antes de enviar. Os preços vêm da aba "Preços" da configuração do agente.</p>
    </div>
  );
}

/* ---------- lead aberto: abordagem ---------- */
function LeadModal({ id, onClose, chaves }) {
  const { db, load, uid } = useG();
  const cfg = db.agente?.[0] || {};
  const p = (db.prospects || []).find((x) => x.id === id);
  const msgs = (db.abordagens || []).filter((a) => a.prospect_id === id && a.status !== "descartada");
  const conversou = msgs.some((a) => a.status === "enviada" && a.tipo !== "recebida");
  const temIg = !!p?.instagram, temWa = !!(p?.telefone && waLink(p.telefone));
  const [canal, setCanal] = useState(temIg ? "instagram" : temWa ? "whatsapp" : "instagram");
  const [instrucao, setInstrucao] = useState("");
  const [motor, setMotor] = useState(() => { try { const m = localStorage.getItem("gestao:motor"); return m === "gemini" ? "gemini" : "auto"; } catch { return "auto"; } });
  const escolherMotor = (v) => { setMotor(v); try { localStorage.setItem("gestao:motor", v); } catch { /* sem storage */ } };
  const [busy, setBusy] = useState("");
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(null);
  const [abertos, setAbertos] = useState({}); // rascunhos que você abriu no WhatsApp/Direct
  const [aviso, setAviso] = useState("");
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
    setAbertos((m) => ({ ...m, [a.id]: true }));
  };

  const status = async (s) => {
    await sb.from("gestao_prospects").update({ status: s }).eq("id", p.id);
    await load();
  };

  const proFunil = async () => {
    setBusy("funil");
    setErro("");
    try {
      const origem = p.fonte === "google" ? "Google" : p.fonte === "instagram" ? "Instagram" : p.fonte === "receita" ? "CNPJ novo (Receita)" : "Prospecção ativa";
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
          <Observacao p={p} />
          {(p.fonte === "google" || p.fonte === "receita" || p.site) && <Dossie p={p} />}
          <DemoLink p={p} />
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
            {aviso && <p className="text-sm text-[#22d3ee]">{aviso}</p>}
            {(conversou || p.status === "respondeu") && <Respondeu p={p} canal={canal} motor={motor} />}
            <Proposta p={p} />
            {msgs.map((a) => a.tipo === "recebida" ? (
              <div key={a.id} className="mr-8 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-xs text-titanium-bright">
                <p className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-titanium">{p.dono || p.nome} respondeu · {fmtDate(a.criado_em?.slice(0, 10))}</p>
                <p className="whitespace-pre-line">{a.texto}</p>
              </div>
            ) : (
              <Rascunho key={a.id} a={a} copiado={copiado === a.id}
                onCopiar={() => copiar(a)} onAbrir={() => abrirCanal(a)}
                podeAbrir={a.canal === "instagram" ? temIg : a.canal === "whatsapp" ? temWa : false}
                classificar={a.status === "rascunho" && (
                  <ClassificarContato a={a} p={p} uid={uid} via={a.canal} destaque={!!abertos[a.id]}
                    onFeito={async (t, ok) => { setAviso(t); if (ok) await load(); }} />
                )} />
            ))}
            {!msgs.length && <Empty>Gere a mensagem, revise e envie você mesmo. O agente registra o envio e agenda o follow-up.</Empty>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Rascunho({ a, copiado, onCopiar, onAbrir, podeAbrir, classificar }) {
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
        {a.tipo === "resposta" && <Badge color="#34d399">resposta</Badge>}
        {a.modelo && <Badge color={a.modelo.startsWith("poe") ? "#a78bfa" : "#8a8f98"}>{a.modelo.replace(/^poe:/, "Poe · ")}</Badge>}
        <span className="ml-auto font-mono text-[0.6rem] text-titanium">{txt.length} caracteres</span>
      </div>
      <Textarea rows={6} value={txt} onChange={(e) => setTxt(e.target.value)} readOnly={enviadaJa} />
      {!enviadaJa && (
        <div className="mt-2 flex flex-wrap gap-2">
          {mudou && <Btn size="sm" variant="ghost" onClick={salvar}>Salvar edição</Btn>}
          <Btn size="sm" variant="ghost" onClick={onCopiar}><Copy size={12} /> {copiado ? "Copiado!" : "Copiar"}</Btn>
          {podeAbrir && <Btn size="sm" variant={mudou ? "ghost" : "neon"} disabled={mudou} onClick={onAbrir} title={mudou ? "Salve a edição antes" : ""}><ExternalLink size={12} /> Copiar e abrir {a.canal === "whatsapp" ? "WhatsApp" : "Direct"}</Btn>}
        </div>
      )}
      {!enviadaJa && !mudou && classificar}
    </Card>
  );
}

/* ---------- configuração do agente ---------- */
const OPC = {
  tamanho: [{ value: "curta", label: "Curta (direto ao ponto)" }, { value: "media", label: "Média" }, { value: "longa", label: "Mais completa" }],
  formalidade: [{ value: "informal", label: "Informal" }, { value: "equilibrada", label: "Equilibrada" }, { value: "formal", label: "Formal" }],
  emoji: [{ value: "um", label: "No máximo 1" }, { value: "nenhum", label: "Nenhum" }],
  criatividade: [
    { value: "precisa", label: "Precisa: segue as regras à risca" },
    { value: "equilibrada", label: "Equilibrada" },
    { value: "criativa", label: "Criativa: mais variação" },
  ],
};

function ConfigModal({ cfg, onClose }) {
  const { save } = useG();
  const p0 = cfg.prefs || {};
  const [f, setF] = useState({ ...cfg, nichos: (cfg.nichos || []).join(", ") });
  const [p, setP] = useState({
    tamanho: "media", formalidade: "equilibrada", emoji: "um", criatividade: "equilibrada",
    cta: "", sempre: "", nunca: "", exemplos: "", extra: "", ...p0,
  });
  const [ofertas, setOfertas] = useState(p0.ofertas_nicho?.length ? p0.ofertas_nicho : [{ nicho: "", oferta: "", link: "" }]);
  const [icp, setIcp] = useState({ bairros: "", avaliacoes_min: "", avaliacoes_max: "", nota_min: "", precos: [], excluir: "", excluir_redes: true, ...(p0.icp || {}) });
  const seti = (k) => (e) => setIcp({ ...icp, [k]: e.target.value });
  const [aba, setAba] = useState("icp");
  const [erro, setErro] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setp = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const setOf = (i, k, v) => setOfertas(ofertas.map((o, j) => (j === i ? { ...o, [k]: v } : o)));

  const salvar = async () => {
    try {
      await save("agente", {
        id: "padrao", oferta: f.oferta, tom: f.tom, assinatura: f.assinatura, portfolio_url: f.portfolio_url,
        cidade_padrao: f.cidade_padrao, followup_dias: +f.followup_dias || 3,
        nichos: String(f.nichos || "").split(",").map((s) => s.trim()).filter(Boolean),
        prefs: {
          ...p, ofertas_nicho: ofertas.filter((o) => o.nicho.trim()),
          icp: { ...icp, avaliacoes_min: +icp.avaliacoes_min || null, avaliacoes_max: +icp.avaliacoes_max || null, nota_min: +icp.nota_min || null },
        },
      });
      onClose();
    } catch (e) { setErro(e.message); }
  };

  const abas = [{ id: "icp", label: "Cliente ideal" }, { id: "ia", label: "Como a IA escreve" }, { id: "ofertas", label: "Oferta por nicho" }, { id: "precos", label: "Preços" }, { id: "marca", label: "Astrovia" }];
  const FAIXAS = [["PRICE_LEVEL_INEXPENSIVE", "Barato"], ["PRICE_LEVEL_MODERATE", "Moderado"], ["PRICE_LEVEL_EXPENSIVE", "Caro"], ["PRICE_LEVEL_VERY_EXPENSIVE", "Muito caro"]];
  return (
    <Modal open onClose={onClose} title="Configurar o agente"
      footer={<>{erro && <span className="text-sm text-[#ff9be9]">{erro}</span>}<Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="neon" onClick={salvar}>Salvar</Btn></>}>
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
        {abas.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${aba === a.id ? "bg-[#22d3ee]/15 text-[#22d3ee]" : "text-titanium hover:text-white"}`}>{a.label}</button>
        ))}
      </div>

      {aba === "icp" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <p className="text-sm text-titanium sm:col-span-2">O garimpo do Google só salva quem se encaixa aqui, e quem está no bairro e na faixa de preço certos ganha nota maior.</p>
          <Field label="Bairros-alvo" className="sm:col-span-2" hint="Separe por vírgula. Ex.: Batel, Água Verde, Bigorrilho"><Input value={icp.bairros} onChange={seti("bairros")} /></Field>
          <Field label="Mínimo de avaliações" hint="Negócio já estabelecido"><Input type="number" min="0" value={icp.avaliacoes_min || ""} onChange={seti("avaliacoes_min")} placeholder="30" /></Field>
          <Field label="Máximo de avaliações" hint="Acima disso costuma ser rede grande"><Input type="number" min="0" value={icp.avaliacoes_max || ""} onChange={seti("avaliacoes_max")} placeholder="800" /></Field>
          <Field label="Nota mínima no Google"><Input type="number" min="0" max="5" step="0.1" value={icp.nota_min || ""} onChange={seti("nota_min")} placeholder="4.2" /></Field>
          <Field label="Faixa de preço aceita" hint="Vazio = todas">
            <div className="flex flex-wrap gap-1.5">
              {FAIXAS.map(([v, l]) => {
                const on = icp.precos?.includes(v);
                return <button key={v} type="button" onClick={() => setIcp({ ...icp, precos: on ? icp.precos.filter((x) => x !== v) : [...(icp.precos || []), v] })}
                  className={`rounded-lg border px-2.5 py-1 text-xs ${on ? "border-[#22d3ee]/50 bg-[#22d3ee]/15 text-[#22d3ee]" : "border-white/10 text-titanium"}`}>{l}</button>;
              })}
            </div>
          </Field>
          <Field label="Excluir nomes que contenham" className="sm:col-span-2" hint="Ex.: franquias e concorrentes. Separe por vírgula."><Input value={icp.excluir} onChange={seti("excluir")} placeholder="Barbearia Corleone, Espaço Laser, Sobrancelhas Design" /></Field>
          <label className="flex items-center gap-2 text-sm text-titanium-bright sm:col-span-2">
            <input type="checkbox" checked={!!icp.excluir_redes} onChange={(e) => setIcp({ ...icp, excluir_redes: e.target.checked })} />
            Ignorar redes e franquias (mesmo nome em várias unidades)
          </label>
        </div>
      )}

      {aba === "precos" && (
        <Field label="Tabela de preços e condições" hint="O assistente usa só isto para montar propostas. Sem tabela, ele escreve 'a definir'.">
          <Textarea rows={9} value={p.precos || ""} onChange={setp("precos")}
            placeholder={"Sistema de agendamento: implantação R$ ___ + R$ ___/mês\nSite profissional: a partir de R$ ___\nAutomação com IA: a partir de R$ ___\nCondições: 50% na entrada, 50% na entrega; parcelamos em até ___x"} />
        </Field>
      )}

      {aba === "ia" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tamanho da mensagem"><Select value={p.tamanho} onChange={setp("tamanho")} options={OPC.tamanho} /></Field>
          <Field label="Formalidade"><Select value={p.formalidade} onChange={setp("formalidade")} options={OPC.formalidade} /></Field>
          <Field label="Emoji"><Select value={p.emoji} onChange={setp("emoji")} options={OPC.emoji} /></Field>
          <Field label="Precisão" hint="Precisa = respostas mais parecidas e fiéis às regras"><Select value={p.criatividade} onChange={setp("criatividade")} options={OPC.criatividade} /></Field>
          <Field label="Como terminar a mensagem" className="sm:col-span-2" hint='Ex.: "perguntar se pode mandar um vídeo de 1 minuto da demo"'>
            <Input value={p.cta} onChange={setp("cta")} placeholder="pergunta simples, sem compromisso" />
          </Field>
          <Field label="Sempre fazer" className="sm:col-span-2" hint="Ex.: chamar pelo nome do negócio; citar que somos de Curitiba">
            <Textarea rows={2} value={p.sempre} onChange={setp("sempre")} />
          </Field>
          <Field label="Palavras e frases proibidas" className="sm:col-span-2" hint="Separe por vírgula. Se escapar alguma, o agente reescreve sozinho.">
            <Textarea rows={2} value={p.nunca} onChange={setp("nunca")} placeholder="prezado, oportunidade imperdível, alavancar, solução completa" />
          </Field>
          <Field label="Exemplos de mensagens no seu estilo" className="sm:col-span-2"
            hint="Cole 1 a 3 mensagens que você mandaria. É o que mais deixa a IA precisa. As que tiverem resposta entram como exemplo automaticamente.">
            <Textarea rows={5} value={p.exemplos} onChange={setp("exemplos")} />
          </Field>
          <Field label="Outras instruções" className="sm:col-span-2"><Textarea rows={2} value={p.extra} onChange={setp("extra")} /></Field>
        </div>
      )}

      {aba === "ofertas" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-titanium">Para cada nicho, o que oferecer e qual link mostrar. Se o nicho do lead contiver a palavra, a IA usa esta oferta.</p>
          {ofertas.map((o, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-white/[0.06] p-3 sm:grid-cols-[1fr_2fr_1.4fr_auto]">
              <Input placeholder="nicho (ex.: barbearia)" value={o.nicho} onChange={(e) => setOf(i, "nicho", e.target.value)} />
              <Input placeholder="o que oferecer" value={o.oferta || ""} onChange={(e) => setOf(i, "oferta", e.target.value)} />
              <Input placeholder="link da demo" value={o.link || ""} onChange={(e) => setOf(i, "link", e.target.value)} />
              <Btn variant="ghost" size="sm" onClick={() => setOfertas(ofertas.filter((_, j) => j !== i))} aria-label="Remover"><Trash2 size={13} /></Btn>
            </div>
          ))}
          <Btn variant="ghost" size="sm" className="self-start" onClick={() => setOfertas([...ofertas, { nicho: "", oferta: "", link: "" }])}><Plus size={13} /> Nicho</Btn>
        </div>
      )}

      {aba === "marca" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="O que a Astrovia oferece" className="sm:col-span-2" hint="A IA usa isso como base para toda mensagem"><Textarea rows={3} value={f.oferta} onChange={set("oferta")} /></Field>
          <Field label="Tom de voz" className="sm:col-span-2"><Textarea rows={2} value={f.tom} onChange={set("tom")} /></Field>
          <Field label="Assinatura"><Input value={f.assinatura} onChange={set("assinatura")} /></Field>
          <Field label="Link do portfólio"><Input value={f.portfolio_url} onChange={set("portfolio_url")} /></Field>
          <Field label="Nichos-alvo" hint="Separados por vírgula" className="sm:col-span-2"><Input value={f.nichos} onChange={set("nichos")} /></Field>
          <Field label="Cidade padrão"><Input value={f.cidade_padrao} onChange={set("cidade_padrao")} /></Field>
          <Field label="Follow-up depois de (dias)"><Input type="number" min="1" max="30" value={f.followup_dias} onChange={set("followup_dias")} /></Field>
        </div>
      )}
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
