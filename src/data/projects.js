/* ============================================================
   PORTFÓLIO — edite aqui para adicionar/trocar projetos.
   live: true  → o site real aparece dentro de uma janela (iframe)
   live: false → mostra a demonstração bloqueada (sem link real)
   ============================================================ */

export const WHATSAPP_URL =
  "https://wa.me/5541988373685?text=Ol%C3%A1%2C%20Astrovia!%20Quero%20conversar%20sobre%20um%20projeto.";

const LIST = [
  {
    id: "lobas",
    chip: "E-commerce",
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
    id: "luxe",
    n: "02",
    title: "LUXE Estética Avançada",
    kicker: "Clínicas de estética · Agendamento & gestão",
    chip: "Demo interativa",
    // demo 100% fictícia rodando dentro do site da Astrovia (public/demos/luxe)
    url: "/demos/luxe/index.html",
    domain: "luxe-estetica · demo interativa",
    live: true,
    demo: true,
    badge: "demo interativa",
    hint: "Agende como cliente ou entre em “Área da equipe” com o PIN 1234 (proprietária) ou 1111 (profissional).",
    accent: "#B08A4A",
    desc: "Sistema premium para clínicas de estética: agendamento 24/7, ficha de anamnese com alertas, antes e depois, Cartão Fidelidade (Pérola → Diamante), Clube LUXE, caixa com comissões e relatórios. Tudo fictício — teste à vontade.",
    tags: ["React", "Supabase", "White-label", "Estética"],
  },
  {
    id: "alerson",
    chip: "Cartão digital",
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
    chip: "Sistema · Logística",
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
  {
    id: "barber",
    chip: "Demo interativa",
    n: "04",
    title: "Barber Berserker",
    kicker: "Barbearias · Agendamento & gestão",
    // demo roda dentro do próprio site da Astrovia (public/demos/…):
    // os dados são fictícios e ficam só no navegador de quem testa
    url: "/demos/barber-berserker/index.html",
    domain: "barber-berserker · demo interativa",
    live: true,
    demo: true,
    badge: "demo interativa",
    hint: "Agende como cliente ou entre em “Área da equipe” com o PIN 1234 (dono) ou 1111 (barbeiro).",
    accent: "#C8161D",
    desc: "Sistema white-label para barbearias: agendamento 24/7 em 3 cliques, caixa com comissão automática, fidelidade Runas, clube de assinatura, modo TV da recepção e relatórios. Teste à vontade — cada visitante tem a própria demo.",
    tags: ["React", "Supabase", "White-label", "Agendamento"],
  },
];

/* numeração automática (01, 02, …) na ordem da lista acima */
export const PROJECTS = LIST.map((p, i) => ({ ...p, n: String(i + 1).padStart(2, "0") }));
