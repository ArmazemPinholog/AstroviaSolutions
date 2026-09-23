import React, { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import LiveFrame from "./LiveFrame";
import RodoDemo from "./RodoDemo";
import { BrowserWindow, LockIcon } from "./ui";
import { startScroll, stopScroll } from "../lib/smooth";

/* ------------------------------------------------------------
   TELA CHEIA — abre o site real (interativo) dentro da página.
   Projetos bloqueados abrem a demonstração, que continua travada.
------------------------------------------------------------ */
export default function LiveModal({ project, onClose }) {
  useEffect(() => {
    if (!project) return;
    stopScroll();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      startScroll();
      window.removeEventListener("keydown", onKey);
    };
  }, [project, onClose]);

  return (
    <AnimatePresence>
      {project && (
        <motion.div
          key="modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${project.title} em tela cheia`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[80] flex flex-col bg-[#030305]/92 p-3 backdrop-blur-xl md:p-6"
          data-lenis-prevent
        >
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.24em] text-titanium">
                {project.n} · {project.kicker}
              </p>
              <p className="truncate font-display text-lg text-white">{project.title}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {project.live ? (
                <a
                  href={project.url}
                  target="_blank"
                  rel="noreferrer"
                  className="glass hidden rounded-full px-4 py-2 font-display text-[0.62rem] uppercase tracking-[0.2em] text-titanium-bright sm:inline-flex"
                >
                  Abrir em nova aba ↗
                </a>
              ) : (
                <span className="hidden items-center gap-2 rounded-full border border-[#ff2fd0]/30 px-4 py-2 font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[#ff9be9] sm:inline-flex">
                  <LockIcon size={11} /> Sistema privado
                </span>
              )}
              <button
                type="button"
                onClick={onClose}
                autoFocus
                aria-label="Fechar"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#030305] transition-transform hover:scale-105"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </button>
            </div>
          </div>

          <motion.div
            initial={{ y: 40, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 28 }}
            className="min-h-0 flex-1"
          >
            <BrowserWindow project={project} className="h-full">
              {project.live ? (
                <LiveFrame url={project.url} title={project.title} interactive eager virtualWidth={(w) => (w < 640 ? w : Math.max(w, 1280))} />
              ) : (
                <RodoDemo />
              )}
            </BrowserWindow>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
