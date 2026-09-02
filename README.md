# Astrovia Solutions

Site institucional — React + Vite, Tailwind CSS v4, Framer Motion, GSAP ScrollTrigger e three.js / React Three Fiber.

## Rodar localmente

Precisa do Node.js 20 ou superior.

```bash
npm install
npm run dev
```

## Deploy

O projeto é um Vite padrão. Na Vercel, a detecção é automática:

- Framework: **Vite**
- Build Command: `npm run build`
- Output Directory: `dist`

## Notas de arquitetura

- Tailwind é **v4**: os tokens ficam no bloco `@theme` de `src/index.css`, e a
  compilação passa pelo plugin `@tailwindcss/vite` (não pelo PostCSS).
- A cena 3D fica em `src/scene/HeroScene.jsx` e roda num canvas fixo atrás de
  todas as seções.
- `gsap.ticker.lagSmoothing(0)` em `CasesSection.jsx` é obrigatório: sem isso,
  as animações de scroll congelam quando o WebGL derruba o framerate.
- A logo é resolvida por `import.meta.glob` em `Header.jsx` — trocar o arquivo
  `src/assets/logo.png` troca a logo, sem mexer em código.
