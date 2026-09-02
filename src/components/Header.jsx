import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { reveal } from "../lib/motion";
/* A logo é resolvida por glob: se `src/assets/logo.(png|svg|webp|jpg)`
   ainda não existir, o build NÃO quebra — o componente cai na marca
   geométrica. Assim que você soltar o arquivo na pasta, ele aparece. */
const logoModules = import.meta.glob("../assets/logo.{png,svg,webp,jpg,jpeg}", {
  eager: true,
  import: "default",
});
const logoUrl = Object.values(logoModules)[0] ?? null;

const NAV = [
  { label: "Serviços", href: "#servicos" },
  { label: "Cases", href: "#cases" },
  { label: "Laboratório", href: "#laboratorio" },
  { label: "Contato", href: "#contato" },
];

export default function Header() {
  const [clock, setClock] = useState("--:--:--");
  const [logoFailed, setLogoFailed] = useState(!logoUrl);

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          hour12: false,
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.header
      initial="hidden"
      animate="show"
      variants={reveal}
      className="flex items-center justify-between py-6"
    >
      {/* ---------- LOGO OFICIAL ---------- */}
      <motion.a
        href="#"
        whileHover={{ scale: 1.03 }}
        transition={{ type: "spring", stiffness: 320, damping: 20 }}
        className="group flex items-center gap-3.5 no-underline"
        aria-label="Astrovia Solutions — início"
      >
        <span className="relative flex items-center">
          {/* halo neon atrás da logo */}
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-3 rounded-full opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100"
            style={{
              background:
                "radial-gradient(closest-side, rgba(34,211,238,0.55), rgba(255,47,208,0.28), transparent)",
            }}
          />
          {logoFailed ? (
            // fallback: marca geométrica, caso o arquivo não exista ainda
            <span className="relative flex h-8 w-8 items-center justify-center">
              <span className="absolute inset-0 rotate-45 border border-white/25 transition-transform duration-700 group-hover:rotate-[135deg]" />
              <span className="h-1.5 w-1.5 bg-[#22d3ee] shadow-[0_0_12px_#22d3ee]" />
            </span>
          ) : (
            <img
              src={logoUrl}
              alt="Astrovia Solutions"
              onError={() => setLogoFailed(true)}
              className="relative h-11 w-auto select-none object-contain
                         drop-shadow-[0_0_10px_rgba(34,211,238,0.25)]
                         transition-all duration-500
                         group-hover:scale-105
                         group-hover:drop-shadow-[0_0_20px_rgba(34,211,238,0.55)]"
              draggable={false}
            />
          )}
        </span>

        {/* Wordmark — remova este bloco se a sua logo.png já tiver o nome */}
        <span className="hidden font-display text-sm uppercase tracking-[0.32em] text-titanium-bright transition-colors duration-300 group-hover:text-white sm:inline">
          Astrovia
        </span>
      </motion.a>

      {/* ---------- NAVEGAÇÃO ---------- */}
      <nav className="hidden items-center gap-9 md:flex">
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="group relative font-display text-[0.7rem] uppercase tracking-[0.2em]
                       text-titanium no-underline transition-colors duration-300 hover:text-white"
          >
            {item.label}
            <span
              aria-hidden
              className="absolute -bottom-1 left-0 h-px w-0 bg-[#22d3ee] transition-all duration-300 group-hover:w-full"
            />
          </a>
        ))}
      </nav>

      {/* ---------- STATUS HUD ---------- */}
      <div className="hidden items-center gap-3 lg:flex">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22d3ee] shadow-[0_0_10px_#22d3ee]" />
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-titanium">
          SYS · ONLINE · {clock}
        </span>
      </div>
    </motion.header>
  );
}
