import React, { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

/* Glow direcional que acompanha o mouse (mix-blend-screen). */
export default function Spotlight() {
  const x = useMotionValue(-1000);
  const y = useMotionValue(-1000);
  const sx = useSpring(x, { stiffness: 120, damping: 24, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 120, damping: 24, mass: 0.6 });

  useEffect(() => {
    const onMove = (e) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [x, y]);

  const background = useTransform(
    [sx, sy],
    ([cx, cy]) =>
      `radial-gradient(520px circle at ${cx}px ${cy}px, rgba(34,211,238,0.10), rgba(255,47,208,0.06) 38%, transparent 68%)`
  );

  return (
    <motion.div
      aria-hidden
      style={{ background }}
      className="pointer-events-none fixed inset-0 z-30 mix-blend-screen"
    />
  );
}
