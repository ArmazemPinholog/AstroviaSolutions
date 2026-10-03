import React from "react";
import { motion } from "framer-motion";
import MagneticButton from "./MagneticButton";
import { PROJECTS } from "../data/projects";
import { reveal, springSoft } from "../lib/motion";

function Corner({ className }) {
  return (
    <span
      aria-hidden
      className={`absolute h-3 w-3 border-white/25 ${className}`}
    />
  );
}

function CaseChip({ index, label, meta, href }) {
  return (
    <motion.a
      href={href}
      custom={index}
      variants={reveal}
      whileHover={{ y: -4 }}
      transition={springSoft}
      className="glass group relative flex min-w-[160px] flex-1 flex-col rounded-xl px-4 py-3 no-underline"
    >
      <span
        aria-hidden
        className="absolute inset-x-4 top-0 h-px scale-x-0 bg-gradient-to-r from-transparent via-[#22d3ee] to-transparent transition-transform duration-500 group-hover:scale-x-100"
      />
      <span className="truncate font-mono text-[0.56rem] uppercase tracking-[0.2em] text-titanium-dim">
        Case 0{index + 1} · <span className="text-titanium">{meta}</span>
      </span>
      <span className="mt-1 truncate font-display text-sm text-titanium-bright transition-colors group-hover:text-white">
        {label}
      </span>
    </motion.a>
  );
}

const MARQUEE = [
  "Inteligência Artificial",
  "Gamificação",
  "WebGL / Three.js",
  "Apps & Jogos",
  "Design de Vanguarda",
  "Automação",
];

export default function Hero() {
  return (
    <>
      <section className="flex flex-1 flex-col justify-center py-16">
        <motion.div initial="hidden" animate="show">
          <motion.div
            custom={0}
            variants={reveal}
            className="mb-8 flex items-center gap-4"
          >
            <span className="h-px w-10 bg-gradient-to-r from-[#22d3ee] to-transparent" />
            <span className="font-display text-[0.65rem] uppercase tracking-[0.42em] text-titanium">
              Creative Tech Agency · Curitiba / BR
            </span>
            {/* legenda técnica do núcleo 3D (só desktop, onde ele fica à direita) */}
            <span
              aria-hidden
              className="ml-auto hidden items-center gap-3 font-mono text-[0.58rem] uppercase tracking-[0.22em] text-titanium-dim lg:flex"
            >
              <span className="text-[#ff2fd0]">Fig. 01</span>
              <span className="h-px w-6 bg-white/20" />
              Núcleo Astrovia · 25.4284° S · 49.2733° W
            </span>
          </motion.div>

          {/* TÍTULO BRUTALISTA */}
          <h1 className="font-display font-medium leading-[0.82] tracking-[-0.055em]">
            <motion.span
              custom={1}
              variants={reveal}
              className="glow-neon block text-[clamp(3.4rem,13.5vw,13rem)] text-white"
            >
              ASTROVIA
            </motion.span>{" "}
            <motion.span
              custom={2}
              variants={reveal}
              className="text-outline block text-[clamp(3.4rem,13.5vw,13rem)]"
            >
              SOLUTIONS
            </motion.span>
          </h1>

          <div className="mt-10 grid gap-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <motion.p
              custom={3}
              variants={reveal}
              className="max-w-xl text-[0.95rem] leading-relaxed text-titanium"
            >
              Engenharia de software e direção de arte para produtos que não
              podem parecer com nenhum outro. Construímos{" "}
              <span className="text-white">agentes de IA</span>,{" "}
              <span className="text-white">experiências gamificadas</span> e{" "}
              <span className="text-white">interfaces WebGL</span> — do conceito
              ao deploy.{" "}
              <span className="text-titanium-bright">
                Um portfólio vivo: cada projeto abaixo está no ar.
              </span>
            </motion.p>

            <motion.div
              custom={4}
              variants={reveal}
              className="glass relative hidden min-w-[210px] rounded-lg p-4 md:block"
            >
              <Corner className="-left-px -top-px border-l border-t" />
              <Corner className="-right-px -top-px border-r border-t" />
              <Corner className="-bottom-px -left-px border-b border-l" />
              <Corner className="-bottom-px -right-px border-b border-r" />
              <span
                aria-hidden
                className="animate-scan absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#22d3ee]/10 to-transparent"
              />
              <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-titanium-dim">
                Projetos no ar
              </p>
              <p className="mt-2 font-display text-3xl text-white">
                {String(PROJECTS.length).padStart(2, "0").slice(0, -1)}
                <span className="text-[#22d3ee]">{String(PROJECTS.length).slice(-1)}</span>
                <span className="ml-2 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-titanium">
                  / online agora
                </span>
              </p>
              {/* um segmento por projeto real do portfólio abaixo */}
              <div className="mt-3 flex gap-1">
                {PROJECTS.map((_, i) => (
                  <motion.span
                    key={i}
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 1 + i * 0.14, ease: "easeOut" }}
                    className="h-[3px] flex-1 origin-left rounded-full bg-gradient-to-r from-[#22d3ee] to-[#ff2fd0]"
                    style={{ filter: `hue-rotate(${i * 12}deg)` }}
                  />
                ))}
              </div>
            </motion.div>
          </div>

          <motion.div
            custom={5}
            variants={reveal}
            className="mt-12 flex flex-wrap items-center gap-4"
          >
            <MagneticButton href="#contato">Iniciar Projeto</MagneticButton>
            <MagneticButton href="#portfolio" variant="ghost">
              Ver portfólio vivo
            </MagneticButton>
          </motion.div>
        </motion.div>
      </section>

      <motion.div initial="hidden" animate="show" className="pb-8 pt-4">
        <div className="flex flex-wrap gap-3">
          {PROJECTS.map((p, i) => (
            <CaseChip key={p.id} index={i} href={`#case-${p.id}`} label={p.title} meta={p.chip} />
          ))}
        </div>

        <motion.div
          custom={4}
          variants={reveal}
          className="mask-x-fade mt-6 overflow-hidden border-t border-white/[0.06] pt-4"
        >
          <div className="animate-marquee flex w-max gap-10 whitespace-nowrap">
            {[...MARQUEE, ...MARQUEE].map((item, i) => (
              <span
                key={i}
                className="flex items-center gap-10 font-display text-[0.68rem] uppercase tracking-[0.3em] text-titanium-dim"
              >
                {item}
                <span className="h-1 w-1 rotate-45 bg-[#ff2fd0]" />
              </span>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
