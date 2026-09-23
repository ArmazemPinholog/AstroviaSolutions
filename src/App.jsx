import React, { useCallback, useEffect, useMemo, useState } from "react";
import HeroScene from "./scene/HeroScene";
import Spotlight from "./components/Spotlight";
import Header from "./components/Header";
import Hero from "./components/Hero";
import AboutSection from "./components/AboutSection";
import PortfolioSection from "./components/PortfolioSection";
import ProcessSection from "./components/ProcessSection";
import HighlightSection from "./components/HighlightSection";
import ContactSection from "./components/ContactSection";
import LiveModal from "./components/LiveModal";
import { ModalContext } from "./components/ui";
import { bindPointer } from "./lib/pointer";
import { initSmooth } from "./lib/smooth";

/* ============================================================
   ASTROVIA SOLUTIONS — Shell
   O <Canvas> vive em position:fixed e serve de atmosfera para
   todas as seções; cada seção controla o próprio contraste.
   Estrutura (inspirada em "portfólio vivo"):
   Hero → 01 Sobre → 02 Portfólio → 03 Processo → 04 Destaque → 05 Contato
   ============================================================ */

export default function App() {
  const [active, setActive] = useState(null);

  useEffect(() => bindPointer(), []);
  useEffect(() => initSmooth(), []);

  const openProject = useCallback((p) => setActive(p), []);
  const close = useCallback(() => setActive(null), []);
  const ctx = useMemo(() => ({ openProject }), [openProject]);

  return (
    <ModalContext.Provider value={ctx}>
      <main className="relative min-h-screen w-full overflow-x-clip bg-void text-white">
        {/* ---------- CAMADA 3D ---------- */}
        <div className="pointer-events-none fixed inset-0 z-0">
          <HeroScene />
        </div>

        {/* ---------- VIGNETTE + ARQUITETURA ---------- */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-10"
          style={{
            background:
              "radial-gradient(115% 85% at 50% 45%, rgba(3,3,5,0.35) 0%, rgba(3,3,5,0.72) 55%, rgba(3,3,5,0.93) 82%, #030305 100%)",
          }}
        />
        <div aria-hidden className="pointer-events-none fixed inset-0 z-10 hidden md:block">
          <div className="hairline absolute left-[8vw] top-0 h-full w-px" />
          <div className="hairline absolute right-[8vw] top-0 h-full w-px" />
        </div>

        {/* ---------- SPOTLIGHT + GRAIN ---------- */}
        <Spotlight />
        <div className="bg-grain" aria-hidden />

        {/* ---------- HERO ---------- */}
        <div className="relative z-40 flex min-h-screen flex-col px-6 md:px-[8vw]">
          <Header />
          <Hero />
        </div>

        {/* ---------- SEÇÕES ---------- */}
        <AboutSection />
        <PortfolioSection />
        <ProcessSection />
        <HighlightSection />
        <ContactSection />
      </main>

      <LiveModal project={active} onClose={close} />
    </ModalContext.Provider>
  );
}
