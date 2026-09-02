import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import MagneticButton from "./MagneticButton";
import {
  Truck,
  ShoppingBag,
  Gamepad,
  ArrowUpRight,
  Activity,
  Cpu,
  Sparkle,
  Layers,
} from "./icons";

gsap.registerPlugin(ScrollTrigger);

/* O lag smoothing do GSAP congela as tweens quando um frame passa de
   500ms — o que acontece em máquina fraca por causa do canvas WebGL.
   Desligar mantém as animações baseadas em tempo real. */
gsap.ticker.lagSmoothing(0);

/* ============================================================
   CASES DE SUCESSO — Bento Grid assimétrico + GSAP ScrollTrigger
   ============================================================ */

/* ------------------------------------------------------------
   Wrapper de card: vidro, borda de circuito, spotlight local
------------------------------------------------------------ */
function BentoCard({ children, className = "", index = 0, glow = "#22d3ee" }) {
  const ref = useRef(null);
  const [spot, setSpot] = useState({ x: -300, y: -300, on: false });

  const handleMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    setSpot({ x: e.clientX - r.left, y: e.clientY - r.top, on: true });
  };

  return (
    <article
      ref={ref}
      data-bento
      data-index={index}
      onMouseMove={handleMove}
      onMouseLeave={() => setSpot((s) => ({ ...s, on: false }))}
      className={`group glass relative overflow-hidden rounded-2xl ${className}`}
    >
      {/* spotlight local seguindo o cursor dentro do card */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: spot.on ? 1 : 0,
          background: `radial-gradient(340px circle at ${spot.x}px ${spot.y}px, ${glow}14, transparent 70%)`,
        }}
      />
      {/* linha de circuito no topo */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px origin-center scale-x-0 transition-transform duration-700 group-hover:scale-x-100"
        style={{
          background: `linear-gradient(90deg, transparent, ${glow}, transparent)`,
        }}
      />
      <div className="relative z-10 flex h-full flex-col">{children}</div>
    </article>
  );
}

function CardHead({ icon: Icon, kicker, title, glow }) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]"
          style={{ color: glow }}
        >
          <Icon size={16} />
        </span>
        <div>
          <p className="font-mono text-[0.58rem] uppercase tracking-[0.28em] text-titanium-dim">
            {kicker}
          </p>
          <h3 className="font-display text-lg leading-tight text-white">
            {title}
          </h3>
        </div>
      </div>
      <span className="text-titanium-dim transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white">
        <ArrowUpRight size={18} />
      </span>
    </header>
  );
}

function Tag({ children }) {
  return (
    <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-titanium">
      {children}
    </span>
  );
}

/* ------------------------------------------------------------
   CASE 01 — AGENTE RODO
   Dashboard flutuante com dados em tempo real + tilt 3D
------------------------------------------------------------ */
function AgenteRodoCard() {
  const [feed, setFeed] = useState({
    cargas: 1284,
    latencia: 240,
    precisao: 99.2,
    spark: Array.from({ length: 26 }, (_, i) => 30 + Math.sin(i / 2) * 14),
  });

  useEffect(() => {
    const id = setInterval(() => {
      setFeed((f) => {
        const next = Math.max(
          8,
          Math.min(58, f.spark[f.spark.length - 1] + (Math.random() * 22 - 11))
        );
        return {
          cargas: f.cargas + Math.floor(Math.random() * 4),
          latencia: Math.round(180 + Math.random() * 120),
          precisao: +(98.6 + Math.random() * 1.2).toFixed(1),
          spark: [...f.spark.slice(1), next],
        };
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // tilt 3D magnético
  const rx = useSpring(useMotionValue(0), { stiffness: 200, damping: 20 });
  const ry = useSpring(useMotionValue(0), { stiffness: 200, damping: 20 });
  const shellRef = useRef(null);

  const onMove = (e) => {
    const r = shellRef.current.getBoundingClientRect();
    ry.set(((e.clientX - (r.left + r.width / 2)) / r.width) * 12);
    rx.set(-((e.clientY - (r.top + r.height / 2)) / r.height) * 12);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
  };

  const path = feed.spark
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i / 25) * 240} ${60 - v}`)
    .join(" ");

  return (
    <BentoCard className="p-6 md:col-span-7 md:min-h-[520px]" index={0}>
      <CardHead
        icon={Truck}
        kicker="Case 01 · Logística"
        title="Agente Rodo"
        glow="#22d3ee"
      />

      <p className="mt-4 max-w-md text-sm leading-relaxed text-titanium">
        Inteligência artificial e automação rodoviária: um agente que monitora
        cargas, antecipa desvios de rota e dispara ações operacionais sem
        intervenção humana.
      </p>

      {/* DASHBOARD FLUTUANTE */}
      <div
        ref={shellRef}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className="mt-auto pt-6"
        style={{ perspective: 900 }}
        data-parallax
        data-speed="0.6"
      >
        <motion.div
          style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          className="relative rounded-xl border border-white/10 bg-[#06060b]/85 p-4 shadow-[0_30px_60px_-30px_rgba(34,211,238,0.35)] backdrop-blur-md"
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <span className="flex items-center gap-2 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-titanium">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22d3ee] shadow-[0_0_8px_#22d3ee]" />
              Live feed · rodovia BR-116
            </span>
            <span className="font-mono text-[0.58rem] text-titanium-dim">
              {feed.latencia}ms
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 py-4">
            {[
              { k: "Cargas ativas", v: feed.cargas.toLocaleString("pt-BR") },
              { k: "Precisão ETA", v: `${feed.precisao}%` },
              { k: "Ações/dia", v: "3.4k" },
            ].map((m) => (
              <div key={m.k}>
                <p className="font-mono text-[0.52rem] uppercase tracking-[0.16em] text-titanium-dim">
                  {m.k}
                </p>
                <p className="mt-1 font-display text-xl text-white tabular-nums">
                  {m.v}
                </p>
              </div>
            ))}
          </div>

          <svg
            viewBox="0 0 240 60"
            preserveAspectRatio="none"
            className="h-16 w-full"
            aria-hidden
          >
            <defs>
              <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.2" />
                <stop offset="70%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#ff2fd0" />
              </linearGradient>
            </defs>
            <path
              d={path}
              fill="none"
              stroke="url(#sparkGrad)"
              strokeWidth="1.5"
              strokeLinecap="round"
              style={{ transition: "d 600ms ease" }}
            />
          </svg>

          <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
            {["Rota otimizada", "Alerta de atraso", "NF conciliada"].map(
              (chip, i) => (
                <span
                  key={chip}
                  className="flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 font-mono text-[0.52rem] uppercase tracking-[0.14em] text-titanium"
                >
                  <span
                    className="h-1 w-1 rounded-full"
                    style={{ background: i === 1 ? "#ff2fd0" : "#22d3ee" }}
                  />
                  {chip}
                </span>
              )
            )}
          </div>
        </motion.div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Tag>Inteligência Artificial</Tag>
        <Tag>Automação</Tag>
        <Tag>Real-time</Tag>
      </div>
    </BentoCard>
  );
}

/* ------------------------------------------------------------
   CASE 02 — BRECHÓ DAS LOBAS
   E-commerce premium: camadas em paralaxe + editorial
------------------------------------------------------------ */
function LobasCard() {
  return (
    <BentoCard
      className="p-6 md:col-span-5 md:row-span-2"
      index={1}
      glow="#ff2fd0"
    >
      <CardHead
        icon={ShoppingBag}
        kicker="Case 02 · Retail"
        title="Brechó das Lobas"
        glow="#ff2fd0"
      />

      <p className="mt-4 text-sm leading-relaxed text-titanium">
        E-commerce e branding de alto padrão. Curadoria de peças únicas em uma
        vitrine editorial, com paralaxe de camadas e checkout sem fricção.
      </p>

      {/* PALCO EM PARALAXE */}
      <div className="relative mt-6 flex-1 overflow-hidden rounded-xl border border-white/10">
        {/* fundo duotone */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 30% 10%, rgba(255,47,208,0.28), transparent 55%), radial-gradient(90% 80% at 80% 90%, rgba(34,211,238,0.20), transparent 60%), #07070c",
          }}
        />
        <div className="bg-grain-static absolute inset-0" aria-hidden />

        {/* camada lenta */}
        <div
          data-parallax
          data-speed="0.35"
          className="absolute inset-x-8 top-10 flex justify-center"
        >
          <span className="font-display text-[4.2rem] leading-none tracking-[-0.06em] text-white/[0.06]">
            LOBAS
          </span>
        </div>

        {/* camada média — moldura do produto */}
        <div
          data-parallax
          data-speed="0.8"
          className="absolute inset-x-10 top-16 aspect-[3/4] rounded-lg border border-white/15 bg-gradient-to-b from-white/[0.09] to-transparent backdrop-blur-[2px]"
        >
          <div className="flex h-full flex-col justify-between p-4">
            <span className="self-start rounded-full border border-white/20 px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.18em] text-white/70">
              Peça única
            </span>
            <div>
              <p className="font-display text-sm text-white">
                Alfaiataria Vintage
              </p>
              <p className="font-mono text-[0.6rem] text-titanium">
                R$ 289,00 · 1 disponível
              </p>
            </div>
          </div>
        </div>

        {/* camada rápida — selo flutuante */}
        <motion.div
          data-parallax
          data-speed="1.4"
          animate={{ y: [0, -10, 0], rotate: [-6, -2, -6] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-10 right-6 flex h-16 w-16 items-center justify-center rounded-full border border-[#ff2fd0]/50 bg-[#0a0a12]/80 backdrop-blur-md"
        >
          <span className="text-center font-mono text-[0.5rem] uppercase leading-tight tracking-[0.12em] text-[#ff2fd0]">
            Slow
            <br />
            Fashion
          </span>
        </motion.div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-4">
        {[
          { k: "Conversão", v: "4.8", suf: "x" },
          { k: "Ticket médio", v: "62", suf: "%" },
          { k: "LCP", v: "1.1", suf: "s" },
        ].map((m) => (
          <div key={m.k}>
            <p className="font-mono text-[0.52rem] uppercase tracking-[0.14em] text-titanium-dim">
              {m.k}
            </p>
            <p className="mt-1 font-display text-lg text-white">
              <span data-count={m.v}>0</span>
              <span className="text-[#ff2fd0]">{m.suf}</span>
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Tag>E-commerce</Tag>
        <Tag>Branding</Tag>
        <Tag>Parallax</Tag>
      </div>
    </BentoCard>
  );
}

/* ------------------------------------------------------------
   CASE 03 — PLATAFORMA DE INGLÊS GAMIFICADA
   Micro-animações de recompensa
------------------------------------------------------------ */
function GamificacaoCard() {
  const [hovering, setHovering] = useState(false);
  const xp = useMotionValue(0);
  const xpSpring = useSpring(xp, { stiffness: 90, damping: 18 });
  const width = useTransform(xpSpring, (v) => `${v}%`);

  useEffect(() => {
    xp.set(hovering ? 92 : 64);
  }, [hovering, xp]);

  return (
    <BentoCard
      className="p-6 md:col-span-7 md:min-h-[380px]"
      index={2}
      glow="#22d3ee"
    >
      <div
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className="flex h-full flex-col"
      >
        <CardHead
          icon={Gamepad}
          kicker="Case 03 · EdTech"
          title="Plataforma de Inglês Gamificada"
          glow="#22d3ee"
        />

        <p className="mt-4 max-w-lg text-sm leading-relaxed text-titanium">
          Web app interativo com mecânicas de jogo: trilhas de XP, streaks
          diários, ligas entre alunos e feedback instantâneo de pronúncia.
        </p>

        {/* TRILHA DE LIÇÕES */}
        <div className="relative mt-7 flex items-center justify-between">
          <span
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0 6px, transparent 6px 12px)",
            }}
          />
          {["A1", "A2", "B1", "B2", "C1", "C2"].map((lvl, i) => {
            const done = i < 3;
            const active = i === 3;
            return (
              <motion.span
                key={lvl}
                animate={
                  hovering && active ? { scale: 1.18 } : { scale: 1 }
                }
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
                className={`relative flex h-9 w-9 items-center justify-center rounded-full border font-mono text-[0.55rem] tracking-[0.08em] ${
                  done
                    ? "border-[#22d3ee]/60 bg-[#22d3ee]/10 text-[#22d3ee]"
                    : active
                    ? "border-[#ff2fd0]/70 bg-[#0a0a12] text-white shadow-[0_0_18px_-4px_#ff2fd0]"
                    : "border-white/10 bg-[#07070c] text-titanium-dim"
                }`}
              >
                {lvl}
                {active && (
                  <motion.span
                    aria-hidden
                    animate={{ opacity: [0.15, 0.5, 0.15], scale: [1, 1.35, 1] }}
                    transition={{ duration: 2.4, repeat: Infinity }}
                    className="absolute inset-0 rounded-full border border-[#ff2fd0]/50"
                  />
                )}
              </motion.span>
            );
          })}
        </div>

        <div className="mt-auto grid gap-4 pt-6 sm:grid-cols-[1fr_auto] sm:items-end">
          {/* BARRA DE XP */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-titanium-dim">
                Nível 12 · Intermediate
              </span>
              <motion.span
                animate={
                  hovering ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }
                }
                transition={{ duration: 0.3 }}
                className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-[#22d3ee]"
              >
                + 280 XP
              </motion.span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                style={{ width }}
                className="relative h-full rounded-full bg-gradient-to-r from-[#22d3ee] to-[#ff2fd0]"
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 right-0 w-6 bg-white/40 blur-[6px]"
                />
              </motion.div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { icon: Sparkle, label: "Streak 47 dias" },
                { icon: Layers, label: "8 trilhas" },
                { icon: Activity, label: "Liga Ouro" },
              ].map(({ icon: Icon, label }, i) => (
                <motion.span
                  key={label}
                  animate={hovering ? { y: -3 } : { y: 0 }}
                  transition={{ delay: i * 0.06, ...{ type: "spring", stiffness: 320, damping: 18 } }}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-titanium"
                >
                  <span className="text-[#22d3ee]">
                    <Icon size={13} />
                  </span>
                  {label}
                </motion.span>
              ))}
            </div>
          </div>

          {/* MEDALHA DE RECOMPENSA */}
          <motion.div
            animate={
              hovering
                ? { scale: 1.06, rotate: 0, opacity: 1 }
                : { scale: 1, rotate: -8, opacity: 0.75 }
            }
            transition={{ type: "spring", stiffness: 260, damping: 16 }}
            className="relative hidden h-24 w-24 items-center justify-center rounded-2xl border border-white/12 bg-[#07070c]/80 sm:flex"
          >
            <span
              aria-hidden
              className="absolute inset-0 rounded-2xl opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(34,211,238,0.5), transparent)",
              }}
            />
            <span className="relative text-center font-display text-2xl text-white">
              A+
              <span className="mt-1 block font-mono text-[0.5rem] uppercase tracking-[0.16em] text-titanium">
                Fluency
              </span>
            </span>
          </motion.div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Tag>Gamificação</Tag>
          <Tag>Web App</Tag>
          <Tag>EdTech</Tag>
        </div>
      </div>
    </BentoCard>
  );
}

/* ------------------------------------------------------------
   CARD DE MÉTRICAS + CTA
------------------------------------------------------------ */
function MetricsCard() {
  return (
    <BentoCard className="p-6 md:col-span-12" index={3}>
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="grid flex-1 grid-cols-3 gap-6">
          {[
            { k: "Projetos entregues", v: "37", suf: "+" },
            { k: "Uptime médio", v: "99", suf: ".9%" },
            { k: "Stacks dominadas", v: "14", suf: "" },
          ].map((m) => (
            <div key={m.k}>
              <p className="font-display text-3xl text-white md:text-4xl">
                <span data-count={m.v}>0</span>
                <span className="text-[#22d3ee]">{m.suf}</span>
              </p>
              <p className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-titanium-dim">
                {m.k}
              </p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden text-titanium-dim lg:block">
            <Cpu size={20} />
          </span>
          <MagneticButton href="#contato">Ver todos os cases</MagneticButton>
        </div>
      </div>
    </BentoCard>
  );
}

/* ------------------------------------------------------------
   SEÇÃO
------------------------------------------------------------ */
export default function CasesSection() {
  const root = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // 1. Título — reveal por palavra
        gsap.from("[data-word]", {
          yPercent: 118,
          opacity: 0,
          duration: 1,
          ease: "power4.out",
          stagger: 0.08,
          scrollTrigger: { trigger: "[data-head]", start: "top 82%" },
        });

        // 2. Régua horizontal desenhada pelo scroll
        gsap.fromTo(
          "[data-rule]",
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: "none",
            scrollTrigger: {
              trigger: "[data-head]",
              start: "top 85%",
              end: "bottom 40%",
              scrub: true,
            },
          }
        );

        // 3. Cards do bento — entrada escalonada
        gsap.from("[data-bento]", {
          y: 90,
          opacity: 0,
          scale: 0.965,
          filter: "blur(10px)",
          duration: 1.1,
          ease: "power3.out",
          stagger: 0.12,
          scrollTrigger: { trigger: "[data-grid]", start: "top 78%" },
        });

        // 4. Camadas em paralaxe dentro dos cards
        gsap.utils.toArray("[data-parallax]").forEach((el) => {
          const speed = parseFloat(el.dataset.speed || "1");
          gsap.to(el, {
            yPercent: -12 * speed,
            ease: "none",
            scrollTrigger: {
              trigger: el.closest("[data-bento]") || el,
              start: "top bottom",
              end: "bottom top",
              scrub: 1,
            },
          });
        });

        // 5. Trilho vertical de progresso da seção
        gsap.fromTo(
          "[data-rail]",
          { scaleY: 0 },
          {
            scaleY: 1,
            ease: "none",
            scrollTrigger: {
              trigger: root.current,
              start: "top 70%",
              end: "bottom bottom",
              scrub: true,
            },
          }
        );
      });

      // 6. Contadores numéricos (rodam também com reduced-motion,
      //    mas sem movimento — só o valor)
      gsap.utils.toArray("[data-count]").forEach((el) => {
        const target = parseFloat(el.dataset.count);
        const decimals = (el.dataset.count.split(".")[1] || "").length;
        const obj = { v: 0 };
        gsap.to(obj, {
          v: target,
          duration: 1.6,
          ease: "power2.out",
          // "bottom-=40" e não "88%": num card no rodapé da página o
          // topo pode nunca cruzar 88% da viewport e o contador trava em 0.
          scrollTrigger: { trigger: el, start: "top bottom-=40", once: true },
          onUpdate: () => {
            el.textContent = obj.v.toFixed(decimals);
          },
        });
      });
    }, root);

    return () => ctx.revert(); // limpa ScrollTriggers e estilos inline
  }, []);

  return (
    <section
      id="cases"
      ref={root}
      className="relative z-40 px-6 pb-28 pt-24 md:px-[8vw]"
    >
      {/* fundo: dissolve o canvas 3D e assenta no Deep Void */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(to bottom, rgba(3,3,5,0) 0%, rgba(3,3,5,0.86) 14%, #030305 34%, #030305 100%)",
        }}
      />

      {/* trilho vertical */}
      <span
        data-rail
        aria-hidden
        className="absolute left-6 top-24 hidden h-[calc(100%-8rem)] w-px origin-top bg-gradient-to-b from-[#22d3ee] via-[#ff2fd0]/40 to-transparent md:left-[calc(8vw-24px)] md:block"
      />

      {/* CABEÇALHO */}
      <div data-head className="mb-14">
        <div className="mb-6 flex items-center gap-4">
          <span className="h-px w-10 bg-gradient-to-r from-[#ff2fd0] to-transparent" />
          <span className="font-display text-[0.65rem] uppercase tracking-[0.42em] text-titanium">
            Portfólio · Selected Work
          </span>
        </div>

        <h2 className="font-display font-medium leading-[0.86] tracking-[-0.05em]">
          {["CASOS", "DE", "SUCESSO"].map((word, i) => (
            <span key={word} className="mr-5 inline-block overflow-hidden pb-3 pt-1 align-bottom">
              <span
                data-word
                className={`inline-block leading-[0.95] text-[clamp(2.4rem,7.5vw,6rem)] ${
                  i === 2 ? "text-outline-neon" : "text-white"
                }`}
              >
                {word}
              </span>
            </span>
          ))}
        </h2>

        <div className="mt-6 flex items-end justify-between gap-8">
          <p className="max-w-lg text-sm leading-relaxed text-titanium">
            Três produtos em produção, três problemas distintos: automação de
            operação pesada, varejo de alto padrão e educação com mecânicas de
            jogo.
          </p>
          <span
            data-rule
            aria-hidden
            className="hidden h-px flex-1 origin-left bg-gradient-to-r from-white/25 to-transparent md:block"
          />
        </div>
      </div>

      {/* BENTO GRID */}
      <div
        data-grid
        className="grid grid-cols-1 gap-4 md:grid-cols-12"
      >
        <AgenteRodoCard />
        <LobasCard />
        <GamificacaoCard />
        <MetricsCard />
      </div>
    </section>
  );
}
