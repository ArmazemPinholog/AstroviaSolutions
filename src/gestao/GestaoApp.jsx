import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, Users, SquareKanban, FolderKanban, Wallet, ListChecks, UserCog, UserRound,
  LogOut, RefreshCw, Menu, X, Lock, KeyRound, Radar, Clapperboard,
} from "lucide-react";
import { sb, T } from "./supabase";
import { Ctx, Btn, Field, Input, Card, Avatar } from "./ui";
import Painel from "./pages/Painel";
import Clientes from "./pages/Clientes";
import Funil from "./pages/Funil";
import Prospeccao from "./pages/Prospeccao";
import Conteudo from "./pages/Conteudo";
import Projetos from "./pages/Projetos";
import Financeiro from "./pages/Financeiro";
import Tarefas from "./pages/Tarefas";
import Equipe from "./pages/Equipe";
import Perfil from "./pages/Perfil";
import logo from "../assets/logo.png";

/* ============================================================
   SALA DE GESTÃO ASTROVIA  —  /gestao
   Login → verificação de acesso (gestao_equipe) → painel
   ============================================================ */

const PAGES = [
  { id: "painel", label: "Visão geral", icon: LayoutDashboard, el: Painel },
  { id: "clientes", label: "Clientes", icon: Users, el: Clientes },
  { id: "prospeccao", label: "Prospecção", icon: Radar, el: Prospeccao },
  { id: "conteudo", label: "Conteúdo", icon: Clapperboard, el: Conteudo },
  { id: "funil", label: "Funil", icon: SquareKanban, el: Funil },
  { id: "projetos", label: "Projetos", icon: FolderKanban, el: Projetos },
  { id: "financeiro", label: "Financeiro", icon: Wallet, el: Financeiro },
  { id: "tarefas", label: "Tarefas", icon: ListChecks, el: Tarefas },
  { id: "equipe", label: "Equipe", icon: UserCog, el: Equipe },
  { id: "perfil", label: "Meu perfil", icon: UserRound, el: Perfil },
];

const EMPTY = { equipe: [], perfis: [], clientes: [], negocios: [], projetos: [], lancamentos: [], tarefas: [], notas: [], prospects: [], abordagens: [], agente: [], conteudos: [] };

function Shell({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#030305] px-5 py-10 text-white">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{ background: "radial-gradient(60% 50% at 50% 0%, rgba(34,211,238,0.12), transparent 70%), radial-gradient(50% 40% at 80% 100%, rgba(255,47,208,0.08), transparent 70%)" }}
      />
      <div className="relative w-full max-w-sm">{children}</div>
    </div>
  );
}

function Brand() {
  return (
    <a href="/" className="mb-8 flex items-center justify-center gap-3">
      <img src={logo} alt="" className="h-10 w-auto" />
      <span className="font-display text-sm uppercase tracking-[0.32em] text-titanium-bright">Astrovia</span>
    </a>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const entrar = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErro("");
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) setErro(error.message.includes("Invalid") ? "E-mail ou senha incorretos." : error.message);
    setBusy(false);
  };
  return (
    <Shell>
      <Brand />
      <Card className="p-6">
        <div className="mb-5 flex items-center gap-2 text-[#22d3ee]">
          <Lock size={14} />
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.28em]">Área restrita</span>
        </div>
        <h1 className="font-display text-2xl text-white">Sala de Gestão</h1>
        <p className="mt-1 text-sm text-titanium">Clientes, funil, projetos, financeiro e tarefas da Astrovia.</p>
        <form onSubmit={entrar} className="mt-6 flex flex-col gap-4">
          <Field label="E-mail">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Senha">
            <Input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Field>
          {erro && <p className="text-sm text-[#ff9be9]">{erro}</p>}
          <Btn type="submit" variant="neon" disabled={busy} className="justify-center">
            {busy ? "Entrando…" : "Entrar"}
          </Btn>
        </form>
        <p className="mt-5 text-xs leading-relaxed text-titanium-dim">
          Não tem acesso? Peça para o administrador liberar seu e-mail e criar sua conta.
        </p>
      </Card>
    </Shell>
  );
}

function SemAcesso({ email, status, onDone }) {
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const ativar = async (e) => {
    e.preventDefault();
    setErro("");
    const { error } = await sb.rpc("gestao_ativar", { codigo: codigo.trim() });
    if (error) setErro(error.message);
    else onDone();
  };
  return (
    <Shell>
      <Brand />
      <Card className="p-6">
        {!status.ativada ? (
          <>
            <div className="mb-4 flex items-center gap-2 text-[#22d3ee]">
              <KeyRound size={14} />
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.28em]">Primeiro acesso</span>
            </div>
            <h1 className="font-display text-xl text-white">Ativar a Sala de Gestão</h1>
            <p className="mt-2 text-sm text-titanium">
              Digite o código de ativação para tornar <span className="text-white">{email}</span> o administrador. O código só funciona uma vez.
            </p>
            <form onSubmit={ativar} className="mt-5 flex flex-col gap-4">
              <Input placeholder="ASTRO-XXXXXXXX-XXXXXXXX" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
              {erro && <p className="text-sm text-[#ff9be9]">{erro}</p>}
              <Btn type="submit" variant="neon" className="justify-center">Ativar</Btn>
            </form>
          </>
        ) : (
          <>
            <h1 className="font-display text-xl text-white">Acesso pendente</h1>
            <p className="mt-2 text-sm text-titanium">
              O e-mail <span className="text-white">{email}</span> ainda não foi liberado. Peça ao administrador para
              adicioná-lo em <b className="text-titanium-bright">Equipe</b>.
            </p>
          </>
        )}
        <Btn variant="ghost" className="mt-5 w-full justify-center" onClick={() => sb.auth.signOut()}>
          <LogOut size={14} /> Sair
        </Btn>
      </Card>
    </Shell>
  );
}

function App({ session, status }) {
  const [db, setDb] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [page, setPage] = useState(() => {
    try { return localStorage.getItem("gestao:aba") || "painel"; } catch { return "painel"; }
  });
  const [menu, setMenu] = useState(false);
  const uid = session.user.id;
  const email = session.user.email.toLowerCase();

  const load = useCallback(async () => {
    const entries = await Promise.all(
      Object.entries(T).map(async ([k, table]) => {
        const { data, error } = await sb.from(table).select("*").order("criado_em", { ascending: false, nullsFirst: false });
        if (error && table !== T.perfis) throw error;
        if (error) {
          const r = await sb.from(table).select("*");
          return [k, r.data || []];
        }
        return [k, data || []];
      })
    );
    setDb(Object.fromEntries(entries));
  }, []);

  // garante que o perfil existe e carrega tudo
  useEffect(() => {
    (async () => {
      try {
        const { data: meu } = await sb.from(T.perfis).select("id").eq("id", uid).maybeSingle();
        if (!meu) {
          const { data: eq } = await sb.from(T.equipe).select("nome").eq("email", email).maybeSingle();
          await sb.from(T.perfis).insert({ id: uid, email, nome: eq?.nome || email.split("@")[0] });
        }
        await load();
      } catch (e) {
        setErro(e.message || String(e));
      }
      setLoading(false);
    })();
    // ao voltar para a aba, atualiza os dados em silêncio (no máximo 1x por minuto),
    // sem desmontar a tela: o que estava aberto continua aberto
    let ultimo = Date.now();
    const onVoltar = () => {
      if (document.visibilityState === "hidden" || Date.now() - ultimo < 60000) return;
      ultimo = Date.now();
      load().catch(() => {});
    };
    window.addEventListener("focus", onVoltar);
    document.addEventListener("visibilitychange", onVoltar);
    return () => {
      window.removeEventListener("focus", onVoltar);
      document.removeEventListener("visibilitychange", onVoltar);
    };
  }, [uid, email, load]);

  const go = (id) => {
    setPage(id);
    setMenu(false);
    try { localStorage.setItem("gestao:aba", id); } catch { /* sem storage */ }
    window.scrollTo(0, 0);
  };

  /* ações genéricas */
  const save = useCallback(
    async (k, row) => {
      const table = T[k];
      const clean = Object.fromEntries(Object.entries(row).map(([a, b]) => [a, b === "" ? null : b]));
      const q = clean.id && k !== "perfis"
        ? sb.from(table).update(clean).eq("id", clean.id)
        : k === "perfis"
          ? sb.from(table).upsert(clean)
          : sb.from(table).insert(clean);
      const { data, error } = await q.select();
      if (error) throw error;
      await load();
      return data?.[0];
    },
    [load]
  );
  const insertMany = useCallback(async (k, rows) => {
    const { error } = await sb.from(T[k]).insert(rows);
    if (error) throw error;
    await load();
  }, [load]);
  const remove = useCallback(async (k, id, col = "id") => {
    const { error } = await sb.from(T[k]).delete().eq(col, id);
    if (error) throw error;
    await load();
  }, [load]);

  const me = db.perfis.find((p) => p.id === uid);
  const ctx = useMemo(
    () => ({ db, load, save, insertMany, remove, uid, email, me, admin: status.admin, go }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, load, save, insertMany, remove, uid, email, me, status.admin]
  );

  const Page = (PAGES.find((p) => p.id === page) || PAGES[0]).el;

  return (
    <Ctx.Provider value={ctx}>
      <div className="min-h-screen bg-[#030305] font-sans text-white">
        {/* SIDEBAR */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/[0.06] bg-[#06060b] p-4 transition-transform lg:translate-x-0 ${menu ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex items-center justify-between px-2 pb-6 pt-2">
            <a href="/" className="flex items-center gap-2.5" title="Voltar ao site">
              <img src={logo} alt="" className="h-8 w-auto" />
              <span>
                <span className="block font-display text-xs uppercase tracking-[0.3em] text-titanium-bright">Astrovia</span>
                <span className="block font-mono text-[0.55rem] uppercase tracking-[0.24em] text-[#22d3ee]">Sala de gestão</span>
              </span>
            </a>
            <button className="text-titanium lg:hidden" onClick={() => setMenu(false)} aria-label="Fechar menu"><X size={18} /></button>
          </div>
          <nav className="flex flex-1 flex-col gap-1">
            {PAGES.map((p) => {
              const on = p.id === page;
              return (
                <button
                  key={p.id}
                  onClick={() => go(p.id)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${on ? "bg-[#22d3ee]/10 text-[#22d3ee]" : "text-titanium hover:bg-white/[0.03] hover:text-white"}`}
                >
                  <p.icon size={17} />
                  {p.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/[0.06] p-3">
            <Avatar perfil={me || { email }} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{me?.nome || email}</p>
              <p className="truncate font-mono text-[0.55rem] uppercase tracking-[0.16em] text-titanium">{status.admin ? "Administrador" : "Sócia(o)"}</p>
            </div>
            <button onClick={() => sb.auth.signOut()} className="text-titanium hover:text-[#ff9be9]" title="Sair" aria-label="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </aside>
        {menu && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMenu(false)} />}

        {/* CONTEÚDO */}
        <div className="min-w-0 overflow-x-hidden lg:pl-64">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/[0.05] bg-[#030305]/85 px-4 py-3 backdrop-blur lg:px-8">
            <button className="text-titanium-bright lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menu"><Menu size={20} /></button>
            <p className="hidden font-mono text-[0.6rem] uppercase tracking-[0.24em] text-titanium lg:block">
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
            </p>
            <Btn variant="ghost" size="sm" onClick={() => load()}><RefreshCw size={13} /> Atualizar</Btn>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
            {erro && <Card className="mb-4 border-[#ff2fd0]/30 p-4 text-sm text-[#ff9be9]">Erro ao carregar: {erro}</Card>}
            {loading ? <p className="py-20 text-center text-sm text-titanium">Carregando…</p> : <Page />}
          </main>
        </div>
      </div>
    </Ctx.Provider>
  );
}

export default function GestaoApp() {
  const [session, setSession] = useState(undefined);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    document.title = "Sala de Gestão · Astrovia";
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    // o Supabase renova o login sozinho quando a aba volta a ficar visível;
    // só troca a sessão se for outra pessoa (ou saída), senão a sala inteira recarregava
    const { data } = sb.auth.onAuthStateChange((_e, s) =>
      setSession((prev) => (prev && s && prev.user.id === s.user.id ? prev : s))
    );
    return () => data.subscription.unsubscribe();
  }, []);

  const checar = useCallback(async () => {
    const { data } = await sb.rpc("gestao_status");
    setStatus(data || { membro: false, admin: false, ativada: true });
  }, []);

  const sessaoId = session?.user?.id;
  useEffect(() => {
    setStatus(null);
    if (sessaoId) checar();
  }, [sessaoId, checar]);

  if (session === undefined || (session && !status)) return <Shell><p className="text-center text-sm text-titanium">Carregando…</p></Shell>;
  if (!session) return <Login />;
  if (!status.membro) return <SemAcesso email={session.user.email} status={status} onDone={checar} />;
  return <App session={session} status={status} />;
}
