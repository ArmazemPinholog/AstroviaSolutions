import React, { createContext, useContext } from "react";

/* ------------------------------------------------------------
   Peças pequenas compartilhadas entre as seções
------------------------------------------------------------ */

/* Contexto do modal "tela cheia" — qualquer seção chama openProject(p) */
export const ModalContext = createContext({ openProject: () => {} });
export const useModal = () => useContext(ModalContext);

/* Rótulo de seção: "02 · Portfólio" com traço neon */
export function SectionLabel({ n, children, color = "#22d3ee" }) {
  return (
    <div data-reveal className="mb-6 flex items-center gap-4">
      <span
        className="h-px w-10"
        style={{ background: `linear-gradient(90deg, ${color}, transparent)` }}
      />
      <span className="font-display text-[0.65rem] uppercase tracking-[0.42em] text-titanium">
        {n} · {children}
      </span>
    </div>
  );
}

export function Tag({ children }) {
  return (
    <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.16em] text-titanium">
      {children}
    </span>
  );
}

export function LockIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function ExpandIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

/* Botão secundário em pílula (não magnético) */
export function PillButton({ children, onClick, href, className = "", ...rest }) {
  const cls =
    "glass group inline-flex items-center gap-2.5 rounded-full px-5 py-2.5 font-display text-[0.68rem] uppercase tracking-[0.2em] text-titanium-bright transition-colors hover:border-white/25 hover:text-white " +
    className;
  if (href)
    return (
      <a href={href} className={cls} {...rest}>
        {children}
      </a>
    );
  return (
    <button type="button" onClick={onClick} className={cls} {...rest}>
      {children}
    </button>
  );
}

/* Moldura de navegador: bolinhas, barra de endereço, selo "ao vivo" */
export function BrowserWindow({ project, children, className = "", style }) {
  const locked = project.locked;
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-[14px] border border-white/10 bg-[#07070c] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] ${className}`}
      style={style}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] bg-[#0b0b12] px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </div>
        <div className="mx-auto flex min-w-0 max-w-md flex-1 items-center justify-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-1 font-mono text-[0.62rem] text-titanium">
          <span className={locked ? "text-[#ff2fd0]" : "text-titanium-dim"}>
            <LockIcon size={10} />
          </span>
          <span className="truncate">{project.domain}</span>
        </div>
        <span className="hidden items-center gap-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-titanium sm:flex">
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full"
            style={{
              background: locked ? "#ff2fd0" : "#22d3ee",
              boxShadow: `0 0 8px ${locked ? "#ff2fd0" : "#22d3ee"}`,
            }}
          />
          {locked ? "somente leitura" : project.badge || "site ao vivo"}
        </span>
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}
