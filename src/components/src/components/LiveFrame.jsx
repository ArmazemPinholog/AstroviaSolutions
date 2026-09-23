import React, { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------
   PALCO ESCALADO
   Renderiza o conteúdo numa largura "virtual" (ex.: 1440px, como
   num desktop) e reduz com transform: scale para caber na janela.
   Assim o site aparece com o layout de desktop mesmo num card.
------------------------------------------------------------ */
export function useBoxSize(ref) {
  const [dim, setDim] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) =>
      setDim({ w: e.contentRect.width, h: e.contentRect.height })
    );
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return dim;
}

export function ScaledStage({ virtualWidth, children, className = "" }) {
  const box = useRef(null);
  const { w, h } = useBoxSize(box);
  const vw = typeof virtualWidth === "function" ? virtualWidth(w) : virtualWidth;
  const scale = w ? w / vw : 1;
  return (
    <div ref={box} className={`absolute inset-0 overflow-hidden ${className}`}>
      {w > 0 && (
        <div
          style={{
            width: vw,
            height: h / scale,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
          }}
          className="absolute left-0 top-0"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/* Largura virtual automática: celular abaixo de 640px, desktop acima */
const autoWidth = (w) => (w < 640 ? 390 : 1440);

/* ------------------------------------------------------------
   IFRAME AO VIVO
   - Só carrega quando chega perto da tela (economia de rede)
   - interactive=false → é "vitrine": não recebe clique nem scroll
------------------------------------------------------------ */
export default function LiveFrame({
  url,
  title,
  virtualWidth = autoWidth,
  interactive = false,
  eager = false,
}) {
  const sentinel = useRef(null);
  const [load, setLoad] = useState(eager);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (load || !sentinel.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setLoad(true);
          io.disconnect();
        }
      },
      { rootMargin: "800px 0px" }
    );
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [load]);

  return (
    <div ref={sentinel} className="absolute inset-0 bg-[#050508]">
      <ScaledStage virtualWidth={virtualWidth}>
        {load && (
          <iframe
            src={url}
            title={title}
            loading="lazy"
            tabIndex={interactive ? 0 : -1}
            onLoad={() => setReady(true)}
            className="h-full w-full border-0 transition-opacity duration-700"
            style={{
              pointerEvents: interactive ? "auto" : "none",
              opacity: ready ? 1 : 0,
            }}
          />
        )}
      </ScaledStage>

      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <span className="relative h-px w-40 overflow-hidden bg-white/10">
            <span className="animate-load absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-[#22d3ee] to-transparent" />
          </span>
          <span className="font-mono text-[0.58rem] uppercase tracking-[0.24em] text-titanium-dim">
            abrindo site ao vivo…
          </span>
        </div>
      )}
    </div>
  );
}
