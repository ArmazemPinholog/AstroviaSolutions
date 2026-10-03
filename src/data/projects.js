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
    id: "ktex",
    chip: "E-commerce · Gestão",
    n: "03",
    title: "K-TEX",
    kicker: "Tattoo aftercare · Loja & gestão",
    // loja + painel rodando dentro do site da Astrovia (public/demos/ktex)
    url: "/demos/ktex/index.html",
    domain: "k-tex · loja + gestão",
    live: true,
    demo: true,
    badge: "demo interativa",
    hint: "Role a página para girar a caveira. No rodapé, “Área da empresa” abre o painel de gestão (senha ktex2026).",
    accent: "#9DFF00",
    desc: "Marca de pós-tattoo com identidade underground: abertura cinematográfica com a caveira 3D girando conforme a rolagem, vitrine horizontal, carrinho e atacado para estúdios. Por trás, um painel com pedidos, estoque por lote, comissões configuráveis por vendedor e financeiro.",
    tags: ["HTML", "JS", "Scroll 3D", "Gestão"],
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
  {
    id: "tecnomotos",
    chip: "Demo interativa",
    n: "05",
    title: "TECNOMOTOS",
    kicker: "Oficina de motos · Gestão & ordens de serviço",
    // demo estática (dados fictícios) dentro do site: public/demos/tecnomotos
    url: "/demos/tecnomotos/index.html",
    domain: "tecnomotos · demo interativa",
    live: true,
    demo: true,
    badge: "demo interativa",
    hint: "Abra uma ordem de serviço, lance itens e dê um desconto em R$ ou %. O Painel usa o PIN 1234.",
    accent: "#F5B301",
    desc: "Sistema para oficina de motos com loja de peças: entrada do veículo com leitura da placa por foto (IA), ordens de serviço com aprovação do cliente pelo WhatsApp e PDF, estoque com importação de NF-e e painel financeiro. Feito para o celular, no pátio.",
    tags: ["Next.js", "Supabase", "IA (Gemini)", "Mobile-first"],
  },
];

/* numeração automática (01, 02, …) na ordem da lista acima */
export const PROJECTS = LIST.map((p, i) => ({ ...p, n: String(i + 1).padStart(2, "0") }));
