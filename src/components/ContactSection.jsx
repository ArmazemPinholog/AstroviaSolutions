import React, { useRef } from "react";
import MagneticButton from "./MagneticButton";
import { SectionLabel } from "./ui";
import { WHATSAPP_URL } from "../data/projects";
import { useSectionMotion } from "../lib/reveal";

/* ============================================================
   05 · CONTATO + RODAPÉ
   ============================================================ */

const logoModules = import.meta.glob("../assets/logo.{png,svg,webp,jpg,jpeg}", { eager: true, import: "default" });
const logoUrl = Object.values(logoModules)[0] ?? null;

const NAV = [
  { label: "Sobre", href: "#sobre" },
  { label: "Portfólio", href: "#portfolio" },
  { label: "Processo", href: "#processo" },
  { label: "Destaque", href: "#destaque" },
];

export default function ContactSection() {
  const root = useRef(null);
  useSectionMotion(root);

  return (
    <>
      <section id="contato" ref={root} className="section-shell relative z-40 overflow-hidden px-6 pb-24 pt-28 md:px-[8vw] md:pt-40">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[55%] h-[60vh] w-[90vw] -translate-x-1/2 -translate-y-1/2 opacity-40 blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgba(34,211,238,0.28), rgba(255,47,208,0.18), transparent)" }}
        />
        <SectionLabel n="05">Contato</SectionLabel>

        <h2 data-words className="relative font-display font-medium leading-[0.86] tracking-[-0.055em]">
          {[
            ["VAMOS", "CONSTRUIR"],
            ["O", "PRÓXIMO."],
          ].map((line, li) => (
            <span key={li} className="block text-[clamp(3rem,11vw,10rem)]">
              {line.map((w) => (
                <span key={w} className="mr-[0.2em] inline-block overflow-hidden pb-[0.06em] align-bottom">
                  <span
                    data-word
                    className={`inline-block ${li === 1 ? "text-outline-neon" : "text-white"}`}
                  >
                    {w}
                  </span>
                </span>
              ))}
            </span>
          ))}
        </h2>

        <div className="relative mt-12 grid gap-10 md:grid-cols-[1fr_auto] md:items-end">
          <p data-reveal className="max-w-md text-[0.98rem] leading-relaxed text-titanium">
            Conte sua ideia em uma mensagem — site, sistema ou automação. A gente responde com o
            próximo passo.
          </p>
          <div data-reveal className="flex flex-wrap items-center gap-4">
            <MagneticButton href={WHATSAPP_URL} target="_blank" rel="noreferrer">
              Chamar no WhatsApp
            </MagneticButton>
            <MagneticButton href="#portfolio" variant="ghost">
              Rever portfólio
            </MagneticButton>
          </div>
        </div>
      </section>

      <footer className="relative z-40 border-t border-white/[0.06] bg-[#030305] px-6 py-10 md:px-[8vw]">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <a href="#" className="flex items-center gap-3" aria-label="Astrovia Solutions — voltar ao topo">
            {logoUrl && <img src={logoUrl} alt="" className="h-9 w-auto" />}
            <span className="font-display text-sm uppercase tracking-[0.32em] text-titanium-bright">Astrovia</span>
          </a>
          <nav className="flex flex-wrap gap-6">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="font-display text-[0.66rem] uppercase tracking-[0.2em] text-titanium">
                {n.label}
              </a>
            ))}
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="font-display text-[0.66rem] uppercase tracking-[0.2em] text-titanium">
              WhatsApp ↗
            </a>
          </nav>
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-white/[0.05] pt-6 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-titanium-dim sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} Astrovia Solutions · Curitiba / BR</span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22d3ee]" /> disponível para novos projetos
          </span>
        </div>
      </footer>
    </>
  );
}
