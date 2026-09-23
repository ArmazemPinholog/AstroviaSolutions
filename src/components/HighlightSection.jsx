import React, { useRef } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import LiveFrame from "./LiveFrame";
import { SectionLabel, ExpandIcon, useModal } from "./ui";
import { PROJECTS } from "../data/projects";
import { useSectionMotion } from "../lib/reveal";

/* ============================================================
   04 · DESTAQUE — a Lobas Brechó rodando num celular.
   A pessoa pode rolar e tocar DENTRO do celular.
   ============================================================ */

const RED = "#E12424";

const FEATURES = [
  "Hero 3D com a estrela da marca",
  "Vitrine editorial de peças únicas",
  "Closet: provador virtual",
  "Compra fechada direto no WhatsApp",
];

export default function HighlightSection() {
  const root = useRef(null);
  const { openProject } = useModal();
  const project = PROJECTS.find((p) => p.id === "lobas");
  useSectionMotion(root);

  // tilt 3D suave do celular
  const rx = useSpring(useMotionValue(0), { stiffness: 140, damping: 20 });
  const ry = useSpring(useMotionValue(0), { stiffness: 140, damping: 20 });
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - (r.left + r.width / 2)) / r.width) * 10);
    rx.set(-((e.clientY - (r.top + r.height / 2)) / r.height) * 8);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
  };

  return (
    <section id="destaque" ref={root} className="section-shell relative z-40 overflow-hidden px-6 py-28 md:px-[8vw] md:py-36">
      {/* halo vermelho Lobas */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-10%] top-1/2 h-[75vh] w-[75vh] -translate-y-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(225,36,36,0.5), rgba(255,47,208,0.12), transparent)" }}
      />
      {/* marca d'água */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 bottom-6 hidden select-none font-display text-[18vw] font-semibold leading-none tracking-[-0.06em] lg:block"
        style={{ color: "transparent", WebkitTextStroke: "1px rgba(225,36,36,0.18)" }}
      >
        LOBAS
      </span>

      <div className="grid items-center gap-16 lg:grid-cols-[1fr_auto] lg:gap-24">
        <div>
          <SectionLabel n="04" color={RED}>Destaque</SectionLabel>
          <h2 data-words className="font-display font-medium leading-[0.98] tracking-[-0.045em] text-white">
            {["Duas lobas.", "Uma vitrine com alma."].map((line, li) => (
              <span key={li} className="block text-[clamp(2.1rem,5vw,4.4rem)]">
                {line.split(" ").map((w, i) => (
                  <span key={i} className="mr-[0.22em] inline-block overflow-hidden pb-[0.08em] align-bottom">
                    <span data-word className={`inline-block ${li === 1 ? "text-[#E12424]" : ""}`}>
                      {w}
                    </span>
                  </span>
                ))}
              </span>
            ))}
          </h2>

          <p data-reveal className="mt-8 max-w-lg text-[0.98rem] leading-relaxed text-titanium">
            <span className="text-white">Lobas Brechó</span>: brechó curado de peças únicas, com
            identidade forte em preto, off-white e vermelho. Branding, e-commerce e experiência 3D
            feitos sob medida — nada de template de loja.
          </p>
          <p data-reveal className="mt-4 max-w-lg text-sm leading-relaxed text-titanium">
            A loja está rodando de verdade aqui ao lado — role e toque dentro do celular.
          </p>

          <ul data-reveal className="mt-8 grid max-w-lg gap-2 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-sm text-titanium-bright">
                <span className="h-1 w-1 rotate-45 bg-[#E12424]" />
                {f}
              </li>
            ))}
          </ul>

          <div data-reveal className="mt-10 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => openProject(project)}
              className="inline-flex items-center gap-2.5 rounded-full bg-white px-6 py-3 font-display text-[0.7rem] uppercase tracking-[0.2em] text-[#030305] transition-transform hover:scale-[1.04]"
            >
              <ExpandIcon size={12} /> Abrir em tela cheia
            </button>
            <a
              href={project.url}
              target="_blank"
              rel="noreferrer"
              className="glass inline-flex items-center gap-2 rounded-full px-6 py-3 font-display text-[0.7rem] uppercase tracking-[0.2em] text-titanium-bright"
            >
              Abrir no celular ↗
            </a>
          </div>
        </div>

        {/* CELULAR */}
        <div data-reveal className="mx-auto" style={{ perspective: 1200 }} onMouseMove={onMove} onMouseLeave={onLeave}>
          <motion.div
            style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
            className="relative h-[640px] w-[312px] rounded-[48px] border border-white/15 bg-[#0b0b10] p-[10px] shadow-[0_60px_120px_-40px_rgba(0,0,0,0.9),0_0_80px_-30px_rgba(225,36,36,0.5)] max-[380px]:h-[560px] max-[380px]:w-[274px]"
          >
            <span aria-hidden className="absolute left-1/2 top-[18px] z-20 h-[22px] w-[92px] -translate-x-1/2 rounded-full bg-black" />
            <div className="relative h-full w-full overflow-hidden rounded-[38px] bg-[#0B0B0B]" data-lenis-prevent>
              <LiveFrame url={project.url} title={`${project.title} — versão celular`} virtualWidth={390} interactive />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
