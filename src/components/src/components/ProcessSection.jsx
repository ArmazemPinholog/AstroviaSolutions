import React, { useRef } from "react";
import gsap from "gsap";
import { SectionLabel } from "./ui";
import { useSectionMotion } from "../lib/reveal";

/* ============================================================
   03 · PROCESSO — frase que "acende" com o scroll + 4 etapas
   ============================================================ */

const STATEMENT =
  "Todo projeto segue a mesma órbita: quatro etapas claras, do primeiro briefing ao sistema rodando no ar — sem tela em branco no meio do caminho.";

const STEPS = [
  {
    n: "01",
    title: "Descoberta",
    text: "Entendemos o negócio, a operação e o público antes de desenhar qualquer tela ou automação.",
  },
  {
    n: "02",
    title: "Direção de arte",
    text: "Identidade visual própria para cada projeto. Nada de template genérico repintado.",
  },
  {
    n: "03",
    title: "Engenharia",
    text: "React, animação sob medida, IA e integrações (Supabase, WhatsApp, Gemini) com foco em performance real.",
  },
  {
    n: "04",
    title: "Deploy & suporte",
    text: "Publicação, domínio, ajustes finos e acompanhamento depois que o projeto vai ao ar.",
  },
];

export default function ProcessSection() {
  const root = useRef(null);

  useSectionMotion(root, (mm) => {
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(
        "[data-lit]",
        { opacity: 0.14 },
        {
          opacity: 1,
          ease: "none",
          stagger: 0.1,
          scrollTrigger: { trigger: "[data-statement]", start: "top 80%", end: "bottom 45%", scrub: true },
        }
      );
      gsap.from("[data-step]", {
        y: 60,
        opacity: 0,
        duration: 1,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: { trigger: "[data-steps]", start: "top 80%" },
      });
      gsap.fromTo(
        "[data-orbit]",
        { scaleX: 0 },
        {
          scaleX: 1,
          ease: "none",
          scrollTrigger: { trigger: "[data-steps]", start: "top 75%", end: "bottom 60%", scrub: true },
        }
      );
    });
  });

  return (
    <section id="processo" ref={root} className="section-shell relative z-40 px-6 py-28 md:px-[8vw] md:py-36">
      <SectionLabel n="03" color="#a78bfa">Processo</SectionLabel>

      <p
        data-statement
        className="max-w-5xl font-display text-[clamp(1.6rem,3.6vw,3.1rem)] font-medium leading-[1.12] tracking-[-0.03em] text-white"
      >
        {STATEMENT.split(" ").map((w, i) => (
          <span key={i} data-lit className="inline-block pr-[0.26em]">
            {w}
          </span>
        ))}
      </p>

      <div data-steps className="relative mt-20">
        {/* órbita que liga as etapas */}
        <span
          data-orbit
          aria-hidden
          className="absolute left-0 right-0 top-[1.15rem] hidden h-px origin-left bg-gradient-to-r from-[#22d3ee] via-[#ff2fd0] to-[#a78bfa] md:block"
        />
        <ol className="grid gap-4 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.n} data-step className="relative">
              <span
                className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-[#030305] font-mono text-[0.62rem] text-white"
                style={{ boxShadow: `0 0 18px -6px ${["#22d3ee", "#ff2fd0", "#ff2fd0", "#a78bfa"][i]}` }}
              >
                {s.n}
              </span>
              <div className="glass mt-5 rounded-2xl p-5">
                <h3 className="font-display text-lg text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-titanium">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
