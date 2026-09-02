import React, { useEffect } from "react";
import HeroScene from "./scene/HeroScene";
import Spotlight from "./components/Spotlight";
import Header from "./components/Header";
import Hero from "./components/Hero";
import CasesSection from "./components/CasesSection";
import { bindPointer } from "./lib/pointer";

/* ============================================================
   ASTROVIA SOLUTIONS — Shell
   O <Canvas> vive em position:fixed e serve de atmosfera para
   todas as seções; cada seção controla o próprio contraste.
   ============================================================ */

export default function App() {
  useEffect(() => bindPointer(), []);

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-void text-white">
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
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10 hidden md:block"
      >
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

      {/* ---------- CASES ---------- */}
      <CasesSection />
    </main>
  );
}
