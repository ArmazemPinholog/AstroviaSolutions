import React, { useRef } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import LiveFrame from "./LiveFrame";
import { SectionLabel, ExpandIcon, useModal } from "./ui";
import { PROJECTS } from "../data/projects";
import { useSectionMotion } from "../lib/reveal";

/* ============================================================
   04 · DESTAQUE — o cartão do Dr. Alerson rodando num celular.
   A pessoa pode rolar e tocar DENTRO do celular.
   ============================================================ */

const FEATURES = [
  "WhatsApp em um toque",
  "Salvar contato direto na agenda",
  "QR code para mostrar na hora",
  "Prévia elegante ao compartilhar",
];

export default function HighlightSection() {
  const root = useRef(null);
  const { openProject } = useModal();
  const project = PROJECTS.find((p) => p.id === "alerson");
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
      {/* halo champanhe */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-10%] top-1/2 h-[70vh] w-[70vh] -translate-y-1/2 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(200,187,163,0.45), rgba(34,211,238,0.12), transparent)" }}
      />

      <div className="grid items-center gap-16 lg:grid-cols-[1fr_auto] lg:gap-24">
        <div>
          <SectionLabel n="04" color="#c8bba3">Destaque</SectionLabel>
          <h2 data-words className="font-display font-medium leading-[0.98] tracking-[-0.045em] text-white">
            {["Um escritório inteiro", "no bolso do cliente."].map((line, li) => (
              <span key={li} className="block text-[clamp(2.1rem,5vw,4.4rem)]">
                {line.split(" ").map((w, i) => (
                  <span key={i} className="mr-[0.22em] inline-block overflow-hidden pb-[0.08em] align-bottom">
                    <span data-word className={`inline-block ${li === 1 ? "text-[#c8bba3]" : ""}`}>
                      {w}
                    </span>
                  </span>
                ))}
              </span>
            ))}
          </h2>

          <p data-reveal className="mt-8 max-w-lg text-[0.98rem] leading-relaxed text-titanium">
            Cartão de visitas digital do <span className="text-white">Dr. Alerson Ribeiro</span>,
            advogado: grafite, champanhe e tipografia serena, pensado para abrir no celular e
            transmitir confiança em segundos.
          </p>
          <p data-reveal className="mt-4 max-w-lg text-sm leading-relaxed text-titanium">
            Ele está rodando de verdade aqui ao lado — role e toque dentro do celular.
          </p>

          <ul data-reveal className="mt-8 grid max-w-lg gap-2 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-sm text-titanium-bright">
                <span className="h-1 w-1 rotate-45 bg-[#c8bba3]" />
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
            className="relative h-[640px] w-[312px] rounded-[48px] border border-white/15 bg-[#0b0b10] p-[10px] shadow-[0_60px_120px_-40px_rgba(0,0,0,0.9),0_0_80px_-30px_rgba(200,187,163,0.45)] max-[380px]:h-[560px] max-[380px]:w-[274px]"
          >
            <span aria-hidden className="absolute left-1/2 top-[18px] z-20 h-[22px] w-[92px] -translate-x-1/2 rounded-full bg-black" />
            <div className="relative h-full w-full overflow-hidden rounded-[38px] bg-[#16171a]" data-lenis-prevent>
              <LiveFrame url={project.url} title={`${project.title} — cartão digital`} virtualWidth={390} interactive />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
