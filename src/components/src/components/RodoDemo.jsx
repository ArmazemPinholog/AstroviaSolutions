import React, { useEffect, useState } from "react";
import { motion, LayoutGroup } from "framer-motion";
import { ScaledStage } from "./LiveFrame";
import { LockIcon } from "./ui";

/* ============================================================
   AGENTE RODO — DEMONSTRAÇÃO BLOQUEADA
   Réplica visual do sistema, 100% em código e com dados
   fictícios. Não tem link para o sistema real, não salva nada
   e uma película por cima bloqueia qualquer clique/digitação.
   ============================================================ */

const COLS = [
  { id: "aguardando", label: "Aguardando carga", color: "#8a8f98" },
  { id: "transito", label: "Em trânsito", color: "#22d3ee" },
  { id: "terminal", label: "No terminal", color: "#a78bfa" },
  { id: "entregue", label: "Entregue", color: "#34d399" },
];

const DRIVERS = ["Marcos", "Paulo", "Rita", "Jonas", "Célio", "Ana", "Diego", "Luís", "Vera", "Nei"];
const ROUTES = [
  "Paranaguá → Curitiba",
  "Curitiba → Joinville",
  "Paranaguá → Araucária",
  "S. J. Pinhais → Itajaí",
  "Curitiba → Ponta Grossa",
  "Paranaguá → Campo Largo",
];

let seq = 0;
function makeCard(col) {
  seq += 1;
  const n = 100000 + Math.floor(Math.random() * 899999);
  const letters = ["DEMO", "TEST", "FAKE", "XMPL"][seq % 4];
  return {
    id: `c${seq}`,
    col,
    cntr: `${letters} ${n}-${seq % 10}`,
    placa: `ABC${(seq * 7) % 10}D${(seq * 13) % 90 + 10}`,
    driver: DRIVERS[seq % DRIVERS.length],
    route: ROUTES[seq % ROUTES.length],
    eta: `${String(8 + (seq % 10)).padStart(2, "0")}:${seq % 2 ? "30" : "15"}`,
    alert: seq % 7 === 0,
  };
}

function initialCards() {
  const dist = { aguardando: 3, transito: 4, terminal: 2, entregue: 3 };
  return Object.entries(dist).flatMap(([col, qty]) =>
    Array.from({ length: qty }, () => makeCard(col))
  );
}

function Card({ c }) {
  const col = COLS.find((x) => x.id === c.col);
  return (
    <motion.div
      layout
      layoutId={c.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className="rounded-lg border border-white/[0.07] bg-[#0d0d15] p-3"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-wide text-white">{c.cntr}</span>
        {c.alert ? (
          <span className="rounded bg-[#ff2fd0]/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#ff2fd0]">
            doc pendente
          </span>
        ) : (
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: col.color }} />
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-titanium">{c.route}</p>
      <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.05] pt-2">
        <span className="flex items-center gap-1.5 text-[10px] text-titanium">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[8px] text-white">
            {c.driver[0]}
          </span>
          {c.driver} · {c.placa}
        </span>
        <span className="font-mono text-[10px] text-titanium-dim">ETA {c.eta}</span>
      </div>
    </motion.div>
  );
}

export function RodoApp() {
  const [cards, setCards] = useState(initialCards);
  const [spark, setSpark] = useState(() =>
    Array.from({ length: 30 }, (_, i) => 26 + Math.sin(i / 2.3) * 12)
  );
  const [clock, setClock] = useState("");

  // a cada ~2,4s um cartão avança de coluna (a operação "andando")
  useEffect(() => {
    const id = setInterval(() => {
      setCards((prev) => {
        // move o primeiro cartão da coluna mais cheia (mantém o quadro equilibrado)
        const flow = ["aguardando", "transito", "terminal"];
        const from = flow.reduce((a, b) =>
          prev.filter((c) => c.col === b).length > prev.filter((c) => c.col === a).length ? b : a
        );
        const pick = prev.find((c) => c.col === from);
        let next = prev.map((c) => {
          if (c.id !== pick.id) return c;
          const i = COLS.findIndex((x) => x.id === c.col);
          return { ...c, col: COLS[i + 1].id, alert: false };
        });
        // coluna "entregue" não cresce para sempre: recicla o mais antigo
        const done = next.filter((c) => c.col === "entregue");
        if (done.length > 3) {
          next = next.filter((c) => c.id !== done[0].id);
          next = [...next, makeCard("aguardando")];
        }
        return next;
      });
      setSpark((s) => [...s.slice(1), Math.max(6, Math.min(50, s[s.length - 1] + (Math.random() * 18 - 9)))]);
    }, 2400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const count = (col) => cards.filter((c) => c.col === col).length;
  const path = spark.map((v, i) => `${i ? "L" : "M"} ${(i / 29) * 300} ${56 - v}`).join(" ");

  return (
    <div className="flex h-full w-full bg-[#05050a] font-sans text-white">
      {/* SIDEBAR */}
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-white/[0.06] bg-[#07070d] p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#22d3ee] to-[#0e7490] font-display text-sm font-semibold text-[#030305]">
            AR
          </span>
          <div>
            <p className="font-display text-sm tracking-wide">Agente Rodo</p>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-titanium-dim">Operações</p>
          </div>
        </div>
        <nav className="mt-8 flex flex-col gap-1 text-[12px]">
          {["Quadro de operações", "Conjuntos da frota", "Check-in de documentos", "Motoristas", "Relatórios"].map(
            (item, i) => (
              <span
                key={item}
                className={`rounded-md px-3 py-2 ${i === 0 ? "bg-[#22d3ee]/10 text-[#22d3ee]" : "text-titanium"}`}
              >
                {item}
              </span>
            )
          )}
        </nav>
        <div className="mt-auto rounded-lg border border-white/[0.06] p-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-titanium-dim">Sincronização</p>
          <p className="mt-1 flex items-center gap-2 text-[11px] text-titanium">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#34d399]" /> tempo real
          </p>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex min-w-0 flex-1 flex-col p-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-titanium-dim">Quadro de operações</p>
            <h3 className="mt-1 font-display text-2xl">Operação de hoje</h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-md border border-white/[0.07] px-3 py-1.5 font-mono text-[11px] text-titanium">{clock}</span>
            <span className="flex items-center gap-2 rounded-md bg-[#22d3ee]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#22d3ee]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22d3ee]" /> ao vivo
            </span>
          </div>
        </header>

        {/* KPIs */}
        <div className="mt-5 grid grid-cols-5 gap-3">
          {[
            { k: "Conjuntos ativos", v: 18 },
            { k: "Em trânsito", v: count("transito") },
            { k: "No terminal", v: count("terminal") },
            { k: "Entregues hoje", v: 23 + count("entregue") },
          ].map((m) => (
            <div key={m.k} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-titanium-dim">{m.k}</p>
              <p className="mt-1 font-display text-2xl tabular-nums">{m.v}</p>
            </div>
          ))}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-titanium-dim">Fluxo / hora</p>
            <svg viewBox="0 0 300 56" preserveAspectRatio="none" className="mt-1 h-8 w-full" aria-hidden>
              <path d={path} fill="none" stroke="#22d3ee" strokeWidth="2" style={{ transition: "d 600ms ease" }} />
            </svg>
          </div>
        </div>

        {/* KANBAN */}
        <LayoutGroup>
          <div className="mt-5 grid min-h-0 flex-1 grid-cols-4 gap-3">
            {COLS.map((col) => (
              <section key={col.id} className="flex min-h-0 flex-col rounded-xl border border-white/[0.05] bg-white/[0.015] p-3">
                <header className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[12px] text-titanium-bright">
                    <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />
                    {col.label}
                  </span>
                  <span className="font-mono text-[10px] text-titanium-dim">{count(col.id)}</span>
                </header>
                <div className="flex flex-col gap-2 overflow-hidden">
                  {cards
                    .filter((c) => c.col === col.id)
                    .map((c) => (
                      <Card key={c.id} c={c} />
                    ))}
                </div>
              </section>
            ))}
          </div>
        </LayoutGroup>
      </main>
    </div>
  );
}

/* Versão para janela: escala o app + película de bloqueio */
export default function RodoDemo({ compact = false }) {
  return (
    <div className="absolute inset-0">
      <ScaledStage virtualWidth={(w) => (w < 640 ? 1000 : 1280)}>
        <RodoApp />
      </ScaledStage>

      {/* PELÍCULA DE BLOQUEIO — captura todo clique, toque e foco */}
      <div
        aria-label="Demonstração somente leitura"
        className="absolute inset-0 z-10 cursor-not-allowed"
        onClickCapture={(e) => e.preventDefault()}
      />

      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2">
        <span className="flex items-center gap-2 whitespace-nowrap rounded-full border border-[#ff2fd0]/40 bg-[#0a0a12]/90 px-3.5 py-1.5 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-[#ff9be9] backdrop-blur-md">
          <LockIcon size={11} />
          {compact ? "somente leitura" : "Demonstração bloqueada · dados fictícios"}
        </span>
      </div>
    </div>
  );
}
