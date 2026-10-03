/* =========================================================
   K-TEX — camada de dados compartilhada (loja + gestão)
   Versão protótipo: salva no navegador (localStorage).
   Próxima etapa: trocar por Supabase mantendo as mesmas funções.
   ========================================================= */
(function () {
  const KEY = 'ktex_db_v1';
  const PAID = ['pago', 'separacao', 'enviado', 'entregue'];

  const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const today = () => new Date().toISOString().slice(0, 10);

  function seed() {
    return {
      config: {
        adminSenha: 'ktex2026',
        whatsapp: '5541999999999',
        instagram: 'ktex.aftercare',
        freteFixo: 19.9,
        freteGratisAcima: 199,
        mpEndpoint: '', // URL da função que cria o pagamento no Mercado Pago (etapa Supabase)
        pedidoMinimoAtacado: 300
      },
      products: [
        { id: 'p1', nome: 'Pomada Cicatrizante K-TEX', variacao: '30g', categoria: 'Pomadas', descricao: 'Pomada pós-tattoo para o dia a dia da cicatrização. [Edite a descrição conforme o rótulo]', preco: 49.9, precoAtacado: 29.9, estoque: 120, estoqueMin: 20, ativo: true, destaque: true, img: '' },
        { id: 'p2', nome: 'Pomada Cicatrizante K-TEX', variacao: '10g', categoria: 'Pomadas', descricao: 'Tamanho de bolso, ideal para kit pós-sessão do estúdio. [Edite a descrição]', preco: 24.9, precoAtacado: 13.9, estoque: 300, estoqueMin: 50, ativo: true, destaque: false, img: '' },
        { id: 'p3', nome: 'Espuma de Limpeza K-TEX', variacao: '150ml', categoria: 'Limpeza', descricao: 'Higienização suave da tattoo nos primeiros dias. [Edite a descrição]', preco: 59.9, precoAtacado: 36.9, estoque: 60, estoqueMin: 15, ativo: true, destaque: false, img: '' },
        { id: 'p4', nome: 'Kit Pós-Tattoo K-TEX', variacao: 'Pomada 30g + Espuma', categoria: 'Kits', descricao: 'O cuidado completo da primeira semana. [Edite a descrição]', preco: 99.9, precoAtacado: 62.9, estoque: 40, estoqueMin: 10, ativo: true, destaque: true, img: '' }
      ],
      lotes: [
        { id: 'l1', produtoId: 'p1', codigo: 'KT30-001', qtd: 120, fabricacao: '2026-09-01', validade: '2028-09-01', custoUnit: 14.5 },
        { id: 'l2', produtoId: 'p2', codigo: 'KT10-001', qtd: 300, fabricacao: '2026-09-01', validade: '2028-09-01', custoUnit: 6.2 }
      ],
      orders: [],
      estudios: [],
      comissionados: [
        { id: 'c1', nome: 'Christian (Site & Gestão)', papel: 'Gestão do site', percentual: 10, base: 'todas', codigo: '', ativo: true }
      ],
      pagamentosComissao: [],
      financeiro: [],
      seq: 1000
    };
  }

  function load() {
    try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.config) return d; } catch (e) {}
    const d = seed(); save(d); return d;
  }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }

  let db = load();
  const listeners = [];
  function commit() { save(db); listeners.forEach(f => f(db)); }

  const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  /* ---------- comissões ---------- */
  function orderCommissions(o) {
    if (!PAID.includes(o.status)) return [];
    return db.comissionados.filter(c => c.ativo).flatMap(c => {
      const ok = c.base === 'todas' || (c.base === 'varejo' && o.canal === 'varejo') ||
        (c.base === 'atacado' && o.canal === 'atacado') || (c.base === 'indicadas' && o.vendedorId === c.id);
      return ok ? [{ comissionadoId: c.id, valor: +(o.subtotal * c.percentual / 100).toFixed(2) }] : [];
    });
  }
  function commissionSummary() {
    return db.comissionados.map(c => {
      let gerado = 0, vendas = 0;
      db.orders.forEach(o => orderCommissions(o).forEach(x => { if (x.comissionadoId === c.id) { gerado += x.valor; vendas++; } }));
      const pago = db.pagamentosComissao.filter(p => p.comissionadoId === c.id).reduce((s, p) => s + Number(p.valor), 0);
      return { ...c, gerado: +gerado.toFixed(2), pago: +pago.toFixed(2), pendente: +(gerado - pago).toFixed(2), vendas };
    });
  }

  /* ---------- pedidos ---------- */
  function priceFor(p, canal) { return canal === 'atacado' ? p.precoAtacado : p.preco; }
  function findStudioByCode(code) {
    code = (code || '').trim().toUpperCase();
    return code ? db.estudios.find(e => e.status === 'aprovado' && (e.codigo || '').toUpperCase() === code) : null;
  }
  function findSellerByCode(code) {
    code = (code || '').trim().toUpperCase();
    return code ? db.comissionados.find(c => c.ativo && c.codigo && c.codigo.toUpperCase() === code) : null;
  }
  function quote(cart, studioCode) {
    const studio = findStudioByCode(studioCode);
    const canal = studio ? 'atacado' : 'varejo';
    const itens = cart.map(i => {
      const p = db.products.find(x => x.id === i.id);
      return p ? { produtoId: p.id, nome: p.nome + ' ' + p.variacao, qtd: i.qtd, preco: priceFor(p, canal) } : null;
    }).filter(Boolean);
    const subtotal = +itens.reduce((s, i) => s + i.qtd * i.preco, 0).toFixed(2);
    const frete = canal === 'atacado' ? 0 : (subtotal >= db.config.freteGratisAcima || subtotal === 0 ? 0 : db.config.freteFixo);
    return { canal, studio, itens, subtotal, frete, total: +(subtotal + frete).toFixed(2) };
  }
  function createOrder({ cart, cliente, studioCode, sellerCode }) {
    const q = quote(cart, studioCode);
    if (!q.itens.length) throw new Error('Carrinho vazio');
    if (q.canal === 'atacado' && q.subtotal < db.config.pedidoMinimoAtacado)
      throw new Error('Pedido mínimo de atacado: ' + money(db.config.pedidoMinimoAtacado));
    const seller = findSellerByCode(sellerCode);
    db.seq++;
    const o = {
      id: uid('o'), numero: 'KT' + db.seq, data: new Date().toISOString(), cliente,
      itens: q.itens, subtotal: q.subtotal, frete: q.frete, total: q.total, canal: q.canal,
      estudioId: q.studio ? q.studio.id : null, vendedorId: seller ? seller.id : null,
      status: 'aguardando', rastreio: '', pagamento: 'mercadopago', baixaEstoque: false
    };
    db.orders.unshift(o); commit(); return o;
  }
  function setOrderStatus(id, status) {
    const o = db.orders.find(x => x.id === id); if (!o) return;
    const wasPaid = PAID.includes(o.status), isPaid = PAID.includes(status);
    if (isPaid && !o.baixaEstoque) { o.itens.forEach(i => { const p = db.products.find(x => x.id === i.produtoId); if (p) p.estoque -= i.qtd; }); o.baixaEstoque = true; }
    if (status === 'cancelado' && o.baixaEstoque) { o.itens.forEach(i => { const p = db.products.find(x => x.id === i.produtoId); if (p) p.estoque += i.qtd; }); o.baixaEstoque = false; }
    o.status = status; commit();
  }

  /* ---------- financeiro ---------- */
  function finance(from, to) {
    const inRange = d => (!from || d >= from) && (!to || d <= to + 'T99');
    const vendas = db.orders.filter(o => PAID.includes(o.status) && inRange(o.data));
    const receita = vendas.reduce((s, o) => s + o.total, 0);
    const lanc = db.financeiro.filter(f => inRange(f.data));
    const outrasEntradas = lanc.filter(f => f.tipo === 'entrada').reduce((s, f) => s + Number(f.valor), 0);
    const saidas = lanc.filter(f => f.tipo === 'saida').reduce((s, f) => s + Number(f.valor), 0);
    let comissoes = 0; vendas.forEach(o => orderCommissions(o).forEach(x => comissoes += x.valor));
    let custo = 0; vendas.forEach(o => o.itens.forEach(i => {
      const l = db.lotes.filter(x => x.produtoId === i.produtoId); const cu = l.length ? l[l.length - 1].custoUnit : 0; custo += cu * i.qtd; }));
    return { vendas: vendas.length, receita, outrasEntradas, saidas, comissoes, custo, lucro: receita + outrasEntradas - saidas - comissoes - custo };
  }

  window.KTEX = {
    get db() { return db; }, commit, uid, today, money, PAID,
    onChange: f => listeners.push(f),
    reset() { db = seed(); commit(); },
    quote, createOrder, setOrderStatus, orderCommissions, commissionSummary, finance,
    findSellerByCode, findStudioByCode,
    STATUS: { aguardando: 'Aguardando pagamento', pago: 'Pago', separacao: 'Em separação', enviado: 'Enviado', entregue: 'Entregue', cancelado: 'Cancelado' }
  };
  window.addEventListener('storage', e => { if (e.key === KEY) { db = load(); listeners.forEach(f => f(db)); } });
})();
