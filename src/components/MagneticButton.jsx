import React, { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

/* ------------------------------------------------------------
   BOTÃO MAGNÉTICO
   O container persegue o cursor; o conteúdo interno se move a
   38% desse deslocamento → sensação de peso/inércia.
------------------------------------------------------------ */
export default function MagneticButton({
  children,
  href = "#contato",
  variant = "primary",
  className = "",
}) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const config = { stiffness: 240, damping: 18, mass: 0.55 };
  const sx = useSpring(x, config);
  const sy = useSpring(y, config);

  const innerX = useTransform(sx, (v) => v * 0.38);
  const innerY = useTransform(sy, (v) => v * 0.38);

  const handleMove = (e) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((e.clientX - (rect.left + rect.width / 2)) * 0.42);
    y.set((e.clientY - (rect.top + rect.height / 2)) * 0.55);
  };

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  const isPrimary = variant === "primary";

  return (
    <motion.a
      ref={ref}
      href={href}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      style={{ x: sx, y: sy }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={[
        "group relative inline-flex items-center gap-3 overflow-hidden rounded-full px-8 py-4",
        "font-display text-[0.78rem] uppercase tracking-[0.22em] no-underline",
        isPrimary
          ? "bg-white text-[#030305]"
          : "glass text-titanium-bright hover:text-white",
        className,
      ].join(" ")}
    >
      {/* halo neon */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-8 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(closest-side, rgba(34,211,238,0.55), rgba(255,47,208,0.35), transparent)",
        }}
      />
      {/* sweep de luz */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/45 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
      />

      <motion.span
        style={{ x: innerX, y: innerY }}
        className="relative z-10 flex items-center gap-3"
      >
        {children}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="transition-transform duration-300 group-hover:translate-x-1"
          aria-hidden
        >
          <path
            d="M1 7h11M8 3l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="square"
          />
        </svg>
      </motion.span>
    </motion.a>
  );
}
