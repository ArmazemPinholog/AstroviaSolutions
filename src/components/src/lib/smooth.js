/* ------------------------------------------------------------
   Scroll suave (Lenis) sincronizado com o GSAP ScrollTrigger.
   - Links "#ancora" passam a rolar suave pelo Lenis.
   - stopScroll/startScroll travam a página (usado pelo modal).
   - Com prefers-reduced-motion, o Lenis nem é ligado.
------------------------------------------------------------ */
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

let lenis = null;

export function initSmooth() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reduce) {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
  }
  const raf = (time) => lenis?.raf(time * 1000);
  gsap.ticker.add(raf);

  const onClick = (e) => {
    const a = e.target.closest?.('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href");
    e.preventDefault();
    if (id === "#" || id.length < 2) {
      lenis ? lenis.scrollTo(0, { force: true }) : window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const el = document.querySelector(id);
    if (!el) return;
    lenis
      ? lenis.scrollTo(el, { offset: 0, duration: 1.4, force: true })
      : el.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  };
  document.addEventListener("click", onClick);

  return () => {
    gsap.ticker.remove(raf);
    document.removeEventListener("click", onClick);
    lenis?.destroy();
    lenis = null;
  };
}

export function stopScroll() {
  lenis?.stop();
  document.documentElement.style.overflow = "hidden";
}

export function startScroll() {
  lenis?.start();
  document.documentElement.style.overflow = "";
}
