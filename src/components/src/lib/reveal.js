import { useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);
/* Evita tweens congelados em máquina fraca (canvas WebGL pesado) */
gsap.ticker.lagSmoothing(0);

/* ------------------------------------------------------------
   Reveal padrão das seções:
   [data-reveal]  → sobe + desfoca → nítido, ao entrar na tela
   [data-word]    → palavras sobem de dentro de uma máscara
   [data-count]   → contador numérico
   `extra(ctx)` permite animações específicas da seção.
------------------------------------------------------------ */
export function useSectionMotion(rootRef, extra) {
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.utils.toArray("[data-reveal]").forEach((el) => {
          gsap.from(el, {
            y: 40,
            opacity: 0,
            filter: "blur(8px)",
            duration: 1,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 88%" },
          });
        });
        gsap.utils.toArray("[data-words]").forEach((group) => {
          gsap.from(group.querySelectorAll("[data-word]"), {
            yPercent: 115,
            opacity: 0,
            duration: 1,
            ease: "power4.out",
            stagger: 0.07,
            scrollTrigger: { trigger: group, start: "top 85%" },
          });
        });
      });

      gsap.utils.toArray("[data-count]").forEach((el) => {
        const target = parseFloat(el.dataset.count);
        const obj = { v: 0 };
        gsap.to(obj, {
          v: target,
          duration: 1.6,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top bottom-=40", once: true },
          onUpdate: () => (el.textContent = Math.round(obj.v)),
        });
      });

      extra?.(mm);
    }, rootRef);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/* Título com máscara por palavra */
export function splitWords(text) {
  return text.split(" ");
}
