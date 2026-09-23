import React, { useRef } from "react";
import { SectionLabel } from "./ui";
import { useSectionMotion } from "../lib/reveal";

/* ============================================================
   01 · SOBRE — quem é a Astrovia + frentes de trabalho
   ============================================================ */

const STACK = ["React", "Vite", "Tailwind", "GSAP", "Three.js", "Supabase", "Gemini · IA", "Vercel"];

const PILLARS = [
  {
    n: "A",
    title: "Sites & e-commerce",
    text: "Sites com direção de arte própria, rápidos e pensados para vender — do cartão digital à loja completa.",
    color: "#ff2fd0",
  },
  {
    n: "B",
    title: "Sistemas & dashboards",
    text: "Painéis e sistemas sob medida que organizam a operação: quadros em tempo real, relatórios e controle de acesso.",
    color: "#22d3ee",
  },
  {
    n: "C",
    title: "Automação & IA",
    text: "Agentes e automações que leem documentos, cruzam dados e disparam ações — menos trabalho repetitivo para sua equipe.",
    color: "#a78bfa",
  },
];

function Heading({ lines }) {
  return (
    <h2 data-words className="font-display font-medium leading-[0.95] tracking-[-0.045em] text-white">
      {lines.map((line, li) => (
        <span key={li} className="block text-[clamp(2.1rem,4.6vw,4.4rem)]">
          {line.split(" ").map((w, i) => (
            <span key={i} className="mr-[0.22em] inline-block overflow-hidden pb-[0.08em] align-bottom">
              <span
                data-word
                className={`inline-block ${li === lines.length - 1 ? "text-outline-neon" : ""}`}
              >
                {w}
              </span>
            </span>
          ))}
        </span>
      ))}
    </h2>
  );
}

export default function AboutSection() {
  const root = useRef(null);
  useSectionMotion(root);

  return (
    <section id="sobre" ref={root} className="section-shell relative z-40 px-6 pb-24 pt-28 md:px-[8vw] md:pt-36">
      <SectionLabel n="01">Sobre</SectionLabel>

      <div className="grid gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
        <Heading lines={["Produtos digitais", "com gesto próprio."]} />

        <div className="flex flex-col gap-6 text-[0.98rem] leading-relaxed text-titanium lg:pt-3">
          <p data-reveal>
            A Astrovia é uma agência de tecnologia criativa de Curitiba. Unimos{" "}
            <span className="text-white">engenharia de software</span> e{" "}
            <span className="text-white">direção de arte</span> para pequenas e médias empresas:
            sites que vendem, sistemas que organizam a operação e automações com IA que tiram o
            trabalho repetitivo das pessoas.
          </p>
          <p data-reveal>
            Tudo o que você vê nesta página está no ar, funcionando. Role para abrir cada projeto —
            sem sair daqui.
          </p>
          <div data-reveal className="flex flex-wrap gap-2 pt-2">
            {STACK.map((s) => (
              <span
                key={s}
                className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-titanium-bright"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* FRENTES DE TRABALHO */}
      <div id="servicos" className="mt-20 grid gap-4 md:grid-cols-3">
        {PILLARS.map((p) => (
          <article
            key={p.n}
            data-reveal
            className="glass group relative overflow-hidden rounded-2xl p-6 transition-colors hover:border-white/15"
          >
            <span
              aria-hidden
              className="absolute inset-x-8 top-0 h-px origin-center scale-x-0 transition-transform duration-700 group-hover:scale-x-100"
              style={{ background: `linear-gradient(90deg, transparent, ${p.color}, transparent)` }}
            />
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.28em]" style={{ color: p.color }}>
              Frente {p.n}
            </span>
            <h3 className="mt-3 font-display text-xl text-white">{p.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-titanium">{p.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
