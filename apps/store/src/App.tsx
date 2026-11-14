import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@celeris/supabase-client';

type Category = { id: string; name: string; slug: string };
type Product = {
  id: string; name: string; slug: string; description: string | null; sku: string | null;
  price: number | string; compare_at_price: number | string | null; image_url: string | null;
  stock_quantity: number; is_featured: boolean; category_id: string | null;
};
type CartLine = { product: Product; quantity: number };
const money = (v: number | string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
function stored<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartLine[]>(() => stored('celeris-store-cart', []));
  const [theme, setTheme] = useState<'light' | 'dark'>(() => stored<'light' | 'dark'>('celeris-store-theme', 'light'));
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [cartOpen, setCartOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('celeris-store-theme', JSON.stringify(theme)); }, [theme]);
  useEffect(() => { localStorage.setItem('celeris-store-cart', JSON.stringify(cart)); }, [cart]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) { setError('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis do projeto Cloudflare.'); setLoading(false); return; }
      const [p, c] = await Promise.all([
        supabase.from('store_products').select('id,name,slug,description,sku,price,compare_at_price,image_url,stock_quantity,is_featured,category_id').eq('is_active', true).order('is_featured', { ascending: false }).order('sort_order').order('created_at', { ascending: false }),
        supabase.from('store_categories').select('id,name,slug').eq('is_active', true).order('sort_order')
      ]);
      if (!active) return;
      if (p.error || c.error) setError(p.error?.message || c.error?.message || 'Falha ao carregar o catálogo.');
      else { setProducts((p.data || []) as Product[]); setCategories((c.data || []) as Category[]); }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('pt-BR');
    return products.filter(p => (category === 'all' || p.category_id === category) &&
      (!q || [p.name, p.description || '', p.sku || ''].some(v => v.toLocaleLowerCase('pt-BR').includes(q))));
  }, [products, search, category]);
  const count = cart.reduce((n, l) => n + l.quantity, 0);
  const total = cart.reduce((n, l) => n + Number(l.product.price) * l.quantity, 0);

  function add(product: Product) {
    if (product.stock_quantity < 1) return;
    setCart(current => {
      const found = current.find(l => l.product.id === product.id);
      return found
        ? current.map(l => l.product.id === product.id ? { ...l, quantity: Math.min(l.quantity + 1, product.stock_quantity) } : l)
        : [...current, { product, quantity: 1 }];
    });
    setCartOpen(true);
  }
  function quantity(id: string, delta: number) {
    setCart(current => current.map(l => l.product.id === id ? { ...l, quantity: Math.min(l.product.stock_quantity, l.quantity + delta) } : l).filter(l => l.quantity > 0));
  }

  return <div className="store-shell">
    <header className="site-header">
      <a className="brand" href="#inicio" aria-label="Celeris Store início"><img className="brand-logo" src="https://teamceleris.pages.dev/assets/solmar-celeris-site-logo.png" alt="SolMar Celeris"/><span className="brand-copy"><strong>CELERIS</strong><small>STORE</small></span></a>
      <nav className="desktop-nav"><a className="active" href="#loja">Loja</a><a href="#categorias">Categorias</a><a href="#sobre">Sobre a Celeris</a></nav>
      <div className="header-actions">
        <button className="icon-button" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} aria-label="Alternar tema">{theme === 'light' ? '☾' : '☼'}</button>
        <button className="cart-button" onClick={() => setCartOpen(true)}><span>▱</span><span className="cart-label">Carrinho</span><b>{count}</b></button>
      </div>
    </header>

    <main id="inicio">
      <section className="hero">
        <div className="hero-copy"><p className="eyebrow"><i /> A LOJA OFICIAL CELERIS</p><h1>Tecnologia, inovação<br />e <em>identidade.</em></h1><p className="hero-description">Explore os produtos e faça parte do movimento Celeris.</p><a className="primary-cta" href="#loja">Explorar produtos <span>↗</span></a><div className="hero-footnote"><span className="mini-mark">C</span> CELERIS · INOVAÇÃO EM MOVIMENTO</div></div>
        <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-emblem">C<span>.</span></div><div className="hero-tag tag-top">CELERIS / STORE</div><div className="hero-tag tag-bottom">DESDE A IDEIA ATÉ O MOVIMENTO</div><div className="hero-glow"/></div>
      </section>

      <section className="catalog-section" id="loja">
        <div className="section-heading"><div><p className="eyebrow">VITRINE CELERIS</p><h2>Encontre o que <em>move você.</em></h2></div><span className="result-count">{loading ? 'Carregando catálogo…' : `${visible.length} produtos`}</span></div>
        <div className="catalog-toolbar" id="categorias">
          <div className="category-list"><button className={category === 'all' ? 'category-chip selected' : 'category-chip'} onClick={() => setCategory('all')}>Todos</button>{categories.map(c => <button key={c.id} className={category === c.id ? 'category-chip selected' : 'category-chip'} onClick={() => setCategory(c.id)}>{c.name}</button>)}</div>
          <label className="search-box"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produtos…" aria-label="Buscar produtos"/></label>
        </div>
        {error && <div className="notice error-notice"><strong>Não foi possível abrir a vitrine.</strong><span>{error}</span></div>}
        {loading ? <div className="product-grid">{[1,2,3,4].map(i => <div className="product-skeleton" key={i}><div/><span/><span/></div>)}</div> :
          !error && visible.length === 0 ? <div className="empty-state"><span className="empty-symbol">C.</span><h3>{products.length ? 'Nenhum produto encontrado' : 'A vitrine está sendo preparada'}</h3><p>{products.length ? 'Tente outra busca ou categoria.' : 'Os produtos cadastrados no catálogo serão exibidos aqui.'}</p>{(search || category !== 'all') && <button className="text-button" onClick={() => { setSearch(''); setCategory('all'); }}>Limpar filtros</button>}</div> :
          <div className="product-grid">{visible.map(p => {
            const price = Number(p.price); const compare = Number(p.compare_at_price || 0);
            return <article className="product-card" key={p.id}>
              <div className="product-image-wrap">{p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy"/> : <div className="product-placeholder"><span>C.</span><small>CELERIS</small></div>}{p.is_featured && <span className="featured-tag">DESTAQUE</span>}{p.stock_quantity <= 0 && <span className="sold-tag">ESGOTADO</span>}</div>
              <div className="product-info"><p className="product-category">{categories.find(c => c.id === p.category_id)?.name || 'CELERIS'}</p><h3>{p.name}</h3><p className="product-description">{p.description || 'Produto oficial Celeris.'}</p><div className="product-buy-row"><div><strong>{money(price)}</strong>{compare > price && <del>{money(compare)}</del>}</div><button className="add-button" onClick={() => add(p)} disabled={p.stock_quantity <= 0} aria-label={`Adicionar ${p.name} ao carrinho`}>+</button></div></div>
            </article>;
          })}</div>}
      </section>

      <section className="brand-banner" id="sobre"><div className="banner-mark">C.</div><div><p className="eyebrow">MAIS QUE UMA MARCA</p><h2>Somos movidos por <em>inovação.</em></h2><p>Uma identidade. Uma equipe. Um movimento.</p></div><span className="banner-coordinate">CELERIS / BR</span></section>
    </main>
    <footer className="site-footer"><a className="footer-brand" href="#inicio">CELERIS <span>STORE</span></a><span>© {new Date().getFullYear()} Celeris. Todos os direitos reservados.</span><a href="#inicio">Voltar ao topo ↑</a></footer>

    {cartOpen && <div className="drawer-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setCartOpen(false); }}>
      <aside className="cart-drawer" aria-label="Carrinho de compras">
        <div className="drawer-header"><div><p className="eyebrow">SUA SELEÇÃO</p><h2>Carrinho <span>({count})</span></h2></div><button className="icon-button close-button" onClick={() => setCartOpen(false)} aria-label="Fechar carrinho">×</button></div>
        {cart.length === 0 ? <div className="cart-empty"><span>▱</span><h3>Seu carrinho está vazio</h3><p>Adicione produtos da vitrine para começar.</p><button className="primary-cta" onClick={() => setCartOpen(false)}>Explorar produtos <span>↗</span></button></div> :
          <><div className="cart-lines">{cart.map(l => <div className="cart-line" key={l.product.id}><div className="cart-thumb">{l.product.image_url ? <img src={l.product.image_url} alt=""/> : <span>C.</span>}</div><div className="cart-line-info"><strong>{l.product.name}</strong><span>{money(l.product.price)}</span><div className="quantity-control"><button onClick={() => quantity(l.product.id, -1)}>−</button><b>{l.quantity}</b><button onClick={() => quantity(l.product.id, 1)} disabled={l.quantity >= l.product.stock_quantity}>+</button></div></div><strong className="line-total">{money(Number(l.product.price) * l.quantity)}</strong></div>)}</div><div className="drawer-summary"><div><span>Subtotal</span><strong>{money(total)}</strong></div><p>Frete e pagamento serão calculados na etapa de finalização.</p><button className="checkout-button" disabled>Finalização de compra em configuração <span>→</span></button><button className="clear-cart" onClick={() => setCart([])}>Limpar carrinho</button></div></>}
      </aside>
    </div>}
  </div>;
}
