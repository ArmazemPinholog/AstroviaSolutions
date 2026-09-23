/* ============================================================
   PORTFÓLIO — edite aqui para adicionar/trocar projetos.
   live: true  → o site real aparece dentro de uma janela (iframe)
   live: false → mostra a demonstração bloqueada (sem link real)
   ============================================================ */

export const WHATSAPP_URL =
  "https://wa.me/5541988373685?text=Ol%C3%A1%2C%20Astrovia!%20Quero%20conversar%20sobre%20um%20projeto.";

export const PROJECTS = [
  {
    id: "lobas",
    n: "01",
    title: "Lobas Brechó",
    kicker: "E-commerce · Moda circular",
    url: "https://lobas-brecho.vercel.app/",
    domain: "lobas-brecho.vercel.app",
    live: true,
    accent: "#ff2fd0",
    desc: "Brechó curado de peças únicas com identidade forte: hero 3D com a estrela da marca, vitrine editorial em bento grid, cursor próprio e venda direta pelo WhatsApp.",
    tags: ["React", "Three.js", "GSAP", "Branding"],
  },
  {
    id: "alerson",
    n: "02",
    title: "Dr. Alerson Ribeiro",
    kicker: "Advocacia · Cartão digital",
    url: "https://dr-alerson-ribeiro.vercel.app/",
    domain: "dr-alerson-ribeiro.vercel.app",
    live: true,
    accent: "#c8bba3",
    desc: "Cartão de visitas digital para advogado: grafite e champanhe, WhatsApp em um toque, salvar contato, QR code e prévia elegante ao compartilhar.",
    tags: ["HTML", "CSS", "JS", "Mobile-first"],
  },
  {
    id: "rodo",
    n: "03",
    title: "Agente Rodo",
    kicker: "Logística · Sistema de operações",
    url: null,
    domain: "agente-rodo · demonstração",
    live: false,
    locked: true,
    accent: "#22d3ee",
    desc: "Sistema de operações para transporte rodoviário: quadro Kanban em tempo real, gestão de conjuntos da frota, check-in de documentos e relatórios. Aqui você vê uma demonstração bloqueada, com dados fictícios.",
    tags: ["Automação", "Supabase", "Real-time", "Kanban"],
  },
];
