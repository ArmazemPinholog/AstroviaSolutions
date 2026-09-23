/* ------------------------------------------------------------
   Ponteiro global normalizado (-1 → 1).
   O <Canvas> é pointer-events:none, então o mouse é lido na
   window e compartilhado com a cena 3D por este objeto mutável
   (sem re-render do React a cada movimento).
------------------------------------------------------------ */
export const pointer = { x: 0, y: 0 };

export function bindPointer() {
  const onMove = (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
  };
  window.addEventListener("pointermove", onMove, { passive: true });
  return () => window.removeEventListener("pointermove", onMove);
}
