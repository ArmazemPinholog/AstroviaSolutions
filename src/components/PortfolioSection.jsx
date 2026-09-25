import React, { useRef } from "react";
import gsap from "gsap";
import { SectionLabel, Tag, BrowserWindow, ExpandIcon, LockIcon, useModal } from "./ui";
import LiveFrame from "./LiveFrame";
import RodoDemo from "./RodoDemo";
import { PROJECTS } from "../data/projects";
import { useSectionMotion } from "../lib/reveal";

/* ============================================================
   02 · PORTFÓLIO VIVO
   Cada projeto é uma "janela" que abre conforme a rolagem:
   entra pequena e escura, cresce até ocupar a tela e fica
   presa (sticky) um tempo para a pessoa olhar o site rodando.
   ============================================================ */

function ProjectPanel({ p, total }) {
  const { openProject } = useModal();

  return (
    <div id={`case-${p.id}`} data-project className="relative md:h-[210vh]">
      <div className="flex flex-col gap-5 py-10 md:sticky md:top-0 md:h-screen md:py-8">
        {/* INFO */}
        <div data-info className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-5">
            <span className="font-display text-[clamp(2.4rem,5vw,4.2rem)] leading-none tracking-[-0.05em] text-outline">
              {p.n}
            </span>
            <div>
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.26em] text-titanium">
                {p.kicker}
                <span className="text-titanium-dim"> · {p.n}/{String(total).padStart(2, "0")}</span>
              </p>
              <h3 className="mt-1 font-display text-[clamp(1.6rem,3vw,2.4rem)] leading-tight tracking-[-0.03em] text-white">
                {p.title}
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-titanium">{p.desc}</p>
              {p.hint && (
                <p className="mt-2 max-w-xl font-mono text-[0.62rem] uppercase leading-relaxed tracking-[0.12em]" style={{ color: p.accent }}>
                  ▸ {p.hint}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {p.tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
            <button
              type="button"
              onClick={() => openProject(p)}
              className="ml-1 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-display text-[0.62rem] uppercase tracking-[0.2em] text-[#030305] transition-transform hover:scale-[1.04]"
            >
              {p.locked ? <LockIcon size={12} /> : <ExpandIcon size={12} />}
              {p.locked ? "Ver demonstração" : p.demo ? "Testar a demo" : "Ver em tela cheia"}
            </button>
          </div>
        </div>

        {/* JANELA */}
        <div className="relative h-[62vh] min-h-[340px] md:h-auto md:min-h-0 md:flex-1">
          <div data-window className="absolute inset-0 will-change-transform">
            {/* brilho da cor do projeto atrás da janela */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-10 -z-10 opacity-40 blur-3xl"
              style={{ background: `radial-gradient(60% 55% at 50% 60%, ${p.accent}33, transparent 70%)` }}
            />
            <BrowserWindow project={p} className="h-full">
              {p.live ? <LiveFrame url={p.url} title={p.title} /> : <RodoDemo />}
              {/* clique na janela também abre a tela cheia */}
              {p.live && (
                <button
                  type="button"
                  onClick={() => openProject(p)}
                  aria-label={`Abrir ${p.title} em tela cheia`}
                  className="group absolute inset-0 z-10 flex items-end justify-end p-4"
                >
                  <span className="flex translate-y-2 items-center gap-2 rounded-full bg-[#030305]/85 px-3.5 py-2 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-white opacity-0 backdrop-blur transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                    <ExpandIcon size={11} /> {p.demo ? "testar a demo" : "interagir"}
                  </span>
                </button>
              )}
              {/* véu escuro controlado pelo scroll */}
              <div data-veil aria-hidden className="pointer-events-none absolute inset-0 z-20 bg-[#030305]" style={{ opacity: 0 }} />
            </BrowserWindow>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PortfolioSection() {
  const root = useRef(null);

  useSectionMotion(root, (mm) => {
    mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
      gsap.utils.toArray("[data-project]").forEach((panel) => {
        const win = panel.querySelector("[data-window]");
        const veil = panel.querySelector("[data-veil]");
        const info = panel.querySelector("[data-info]");

        // abrir a janela enquanto o painel sobe até o topo
        const tl = gsap.timeline({
          scrollTrigger: { trigger: panel, start: "top 85%", end: "top top", scrub: 0.8 },
        });
        tl.fromTo(
          win,
          { scale: 0.62, y: 60, rotateX: 14, clipPath: "inset(0% 0% 0% 0% round 36px)" },
          { scale: 1, y: 0, rotateX: 0, clipPath: "inset(0% 0% 0% 0% round 14px)", ease: "none" },
          0
        )
          .fromTo(veil, { opacity: 0.85 }, { opacity: 0, ease: "none" }, 0)
          .fromTo(info, { opacity: 0, y: 30 }, { opacity: 1, y: 0, ease: "none" }, 0.35);

        // na saída, a janela recua e escurece antes da próxima
        gsap.fromTo(
          win,
          { scale: 1 },
          {
            scale: 0.9,
            ease: "none",
            immediateRender: false,
            scrollTrigger: { trigger: panel, start: "bottom 95%", end: "bottom top", scrub: 0.8 },
          }
        );
        gsap.fromTo(
          veil,
          { opacity: 0 },
          {
            opacity: 0.7,
            ease: "none",
            immediateRender: false,
            scrollTrigger: { trigger: panel, start: "bottom 95%", end: "bottom top", scrub: 0.8 },
          }
        );
      });

      // barra de progresso do portfólio
      gsap.fromTo(
        "[data-progress]",
        { scaleX: 0 },
        {
          scaleX: 1,
          ease: "none",
          scrollTrigger: { trigger: "[data-projects]", start: "top center", end: "bottom bottom", scrub: true },
        }
      );
    });
  });

  return (
    <section id="portfolio" ref={root} className="section-shell relative z-40 px-6 pb-10 pt-24 md:px-[8vw]">
      <SectionLabel n="02" color="#ff2fd0">Portfólio</SectionLabel>

      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <h2 data-words className="font-display font-medium leading-[0.9] tracking-[-0.05em]">
          {["PORTFÓLIO", "VIVO"].map((w, i) => (
            <span key={w} className="mr-5 inline-block overflow-hidden pb-2 align-bottom">
              <span
                data-word
                className={`inline-block text-[clamp(2.6rem,8vw,6.5rem)] ${i === 1 ? "text-outline-neon" : "text-white"}`}
              >
                {w}
              </span>
            </span>
          ))}
        </h2>
        <p data-reveal className="max-w-sm text-sm leading-relaxed text-titanium">
          Nada de print estático: os sites abaixo estão rodando de verdade. Role para abrir cada
          janela ou clique para interagir em tela cheia.
        </p>
      </div>

      {/* progresso */}
      <div className="sticky top-0 z-30 -mx-6 mt-10 hidden h-px bg-white/[0.06] md:mx-0 md:block">
        <span data-progress className="block h-px origin-left bg-gradient-to-r from-[#22d3ee] via-[#ff2fd0] to-[#a78bfa]" />
      </div>

      <div data-projects style={{ perspective: 1400 }}>
        {PROJECTS.map((p) => (
          <ProjectPanel key={p.id} p={p} total={PROJECTS.length} />
        ))}
      </div>
    </section>
  );
}
