import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
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

function StoreBagLogo({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  return <svg className={className} viewBox="0 0 320 340" role="img" aria-label="Celeris Store" xmlns="http://www.w3.org/2000/svg">
    <path className="bag-handle" d="M92 118V76C92 29 116 9 160 9s68 20 68 67v42" fill="none" strokeWidth="17" strokeLinecap="round"/>
    <path className="bag-body" d="M67 105h186c17 0 29 12 31 29l19 168c2 17-10 29-27 29H44c-17 0-29-12-27-29l19-168c2-17 14-29 31-29Z"/>
    <circle className="bag-handle" cx="92" cy="118" r="13" strokeWidth="10"/>
    <circle className="bag-handle" cx="228" cy="118" r="13" strokeWidth="10"/>
    <image className="bag-logo-image" href="/celeris-store-logo.svg" x="65" y="140" width="190" height="174" preserveAspectRatio="xMidYMid meet"/>
  </svg>;
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
  const [customerSession, setCustomerSession] = useState<any>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountMode, setAccountMode] = useState<'login' | 'signup'>('login');
  const [accountName, setAccountName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountMessage, setAccountMessage] = useState('');
  const [accountError, setAccountError] = useState('');

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('celeris-store-theme', JSON.stringify(theme)); }, [theme]);
  useEffect(() => { localStorage.setItem('celeris-store-cart', JSON.stringify(cart)); }, [cart]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setCustomerSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setCustomerSession(session));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) { setError('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY nas variáveis do projeto Cloudflare.'); setLoading(false); return; }
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

  // The Business panel and Store use the same store_products table. Polling keeps
  // storefront availability synchronized even if Supabase Realtime is not enabled.
  useEffect(() => {
    if (!supabase) return;
    const refresh = async () => {
      const { data, error } = await supabase.from('store_products')
        .select('id,name,slug,description,sku,price,compare_at_price,image_url,stock_quantity,is_featured,category_id')
        .eq('is_active', true).order('is_featured', { ascending: false }).order('sort_order').order('created_at', { ascending: false });
      if (error || !data) return;
      const latest = data as Product[];
      setProducts(latest);
      setCart(current => current.map(line => {
        const updated = latest.find(p => p.id === line.product.id);
        return updated ? { product: updated, quantity: Math.min(line.quantity, updated.stock_quantity) } : line;
      }).filter(line => line.quantity > 0));
    };
    const timer = window.setInterval(refresh, 15000);
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
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
  async function submitCustomerAuth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase) return;
    setAccountError(''); setAccountMessage('');
    const result = accountMode === 'signup'
      ? await supabase.auth.signUp({ email: accountEmail, password: accountPassword, options: { data: { full_name: accountName } } })
      : await supabase.auth.signInWithPassword({ email: accountEmail, password: accountPassword });
    if (result.error) setAccountError(result.error.message);
    else if (accountMode === 'signup' && !result.data.session) setAccountMessage('Cadastro realizado. Verifique seu e-mail para confirmar a conta.');
    else { setAccountMessage('Login realizado com sucesso.'); setAccountOpen(false); setAccountPassword(''); }
  }

  function quantity(id: string, delta: number) {
    setCart(current => current.map(l => l.product.id === id ? { ...l, quantity: Math.min(l.product.stock_quantity, l.quantity + delta) } : l).filter(l => l.quantity > 0));
  }

  return <div className="store-shell">
    <header className="site-header">
      <a className="brand" href="#inicio" aria-label="Celeris Store início"><StoreBagLogo className="brand-mark" compact/><span className="brand-copy"><strong>CELERIS</strong><small>STORE</small></span></a>
      <nav className="desktop-nav"><a className="active" href="#loja">Loja</a><a href="#categorias">Categorias</a><a href="#sobre">Sobre a Celeris</a><a className="restricted-link" href="https://celeris-business.pages.dev/" target="_blank" rel="noreferrer">Área restrita ↗</a></nav>
      <div className="header-actions">
        <a className="restricted-mobile-link" href="https://celeris-business.pages.dev/" target="_blank" rel="noreferrer">Área restrita</a>
        <button className="customer-login-button" onClick={() => { setAccountMode('login'); setAccountMessage(''); setAccountError(''); setAccountOpen(true); }}>{customerSession ? 'Minha conta' : 'Entrar'}</button>
        <button className="icon-button" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} aria-label="Alternar tema">{theme === 'light' ? '☾' : '☼'}</button>
        <button className="cart-button" onClick={() => setCartOpen(true)} aria-label={`Abrir carrinho com ${count} itens`}><svg className="cart-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 4h2l2.2 11.1a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 1.9-1.4L22 8H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><circle cx="10" cy="20" r="1.3" fill="currentColor"/><circle cx="18" cy="20" r="1.3" fill="currentColor"/></svg><span className="cart-label">Carrinho</span><b>{count}</b></button>
      </div>
    </header>

    <main id="inicio">
      <section className="hero">
        <div className="hero-copy"><p className="eyebrow"><i /> A LOJA OFICIAL CELERIS</p><h1>Tecnologia, inovação<br />e <em>identidade.</em></h1><p className="hero-description">Explore os produtos e faça parte do movimento Celeris.</p><a className="primary-cta" href="#loja">Explorar produtos <span>↗</span></a><div className="hero-footnote">CELERIS · INOVAÇÃO EM MOVIMENTO</div></div>
        <div className="hero-art" aria-label="Sacola Celeris Store"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><StoreBagLogo className="hero-bag-logo"/><div className="hero-tag tag-top">CELERIS / STORE</div><div className="hero-glow"/></div>
      </section>

      <section className="catalog-section" id="loja">
        <div className="section-heading"><div><p className="eyebrow">VITRINE CELERIS</p><h2>Encontre o que <em>move você.</em></h2></div><span className="result-count">{loading ? 'Carregando catálogo…' : `${visible.length} produtos`}</span></div>
        <div className="catalog-toolbar" id="categorias">
          <div className="category-list"><button className={category === 'all' ? 'category-chip selected' : 'category-chip'} onClick={() => setCategory('all')}>Todos</button>{categories.map(c => <button key={c.id} className={category === c.id ? 'category-chip selected' : 'category-chip'} onClick={() => setCategory(c.id)}>{c.name}</button>)}</div>
          <label className="search-box"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produtos…" aria-label="Buscar produtos"/></label>
        </div>
        {error && <div className="notice error-notice"><strong>Não foi possível abrir a vitrine.</strong><span>{error}</span></div>}
        {loading ? <div className="product-grid">{[1,2,3,4].map(i => <div className="product-skeleton" key={i}><div/><span/><span/></div>)}</div> :
          !error && visible.length === 0 ? <div className="empty-state"><span className="empty-symbol" aria-hidden="true">◇</span><h3>{products.length ? 'Nenhum produto encontrado' : 'A vitrine está sendo preparada'}</h3><p>{products.length ? 'Tente outra busca ou categoria.' : 'Os produtos cadastrados no catálogo serão exibidos aqui.'}</p>{(search || category !== 'all') && <button className="text-button" onClick={() => { setSearch(''); setCategory('all'); }}>Limpar filtros</button>}</div> :
          <div className="product-grid">{visible.map(p => {
            const price = Number(p.price); const compare = Number(p.compare_at_price || 0);
            return <article className="product-card" key={p.id}>
              <div className="product-image-wrap">{p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy"/> : <div className="product-placeholder"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 16 24 7l17 9v20l-17 9L7 36V16Z" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="m7 16 17 10 17-10M24 26v19M16 11l17 10" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg><small>CELERIS STORE</small></div>}{p.is_featured && <span className="featured-tag">DESTAQUE</span>}{p.stock_quantity <= 0 && <span className="sold-tag">ESGOTADO</span>}</div>
              <div className="product-info"><p className="product-category">{categories.find(c => c.id === p.category_id)?.name || 'CELERIS'}</p><h3>{p.name}</h3><p className="product-description">{p.description || 'Produto oficial Celeris.'}</p><div className="product-buy-row"><div><strong>{money(price)}</strong>{compare > price && <del>{money(compare)}</del>}</div><button className="add-button" onClick={() => add(p)} disabled={p.stock_quantity <= 0} aria-label={`Adicionar ${p.name} ao carrinho`}>+</button></div></div>
            </article>;
          })}</div>}
      </section>


    </main>
    <footer className="site-footer"><a className="footer-brand" href="#inicio">CELERIS <span>STORE</span></a><span>© {new Date().getFullYear()} Celeris. Todos os direitos reservados.</span><a href="#inicio">Voltar ao topo ↑</a></footer>

    {accountOpen && <div className="drawer-backdrop account-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setAccountOpen(false); }}><section className="account-modal" role="dialog" aria-modal="true" aria-label="Conta do cliente"><button className="account-close" onClick={() => setAccountOpen(false)} aria-label="Fechar">×</button><p className="eyebrow">ÁREA DO CLIENTE</p><h2>{accountMode === 'login' ? 'Acesse sua conta' : 'Crie sua conta'}</h2><p className="account-intro">Entre para sua experiência na Celeris Store.</p><form onSubmit={submitCustomerAuth}>{accountMode === 'signup' && <label>Nome completo<input value={accountName} onChange={e => setAccountName(e.target.value)} required autoComplete="name"/></label>}<label>E-mail<input type="email" value={accountEmail} onChange={e => setAccountEmail(e.target.value)} required autoComplete="email"/></label><label>Senha<input type="password" value={accountPassword} onChange={e => setAccountPassword(e.target.value)} required minLength={6} autoComplete={accountMode === 'login' ? 'current-password' : 'new-password'}/></label>{accountError && <div className="account-feedback error">{accountError}</div>}{accountMessage && <div className="account-feedback">{accountMessage}</div>}<button className="checkout-button" type="submit">{accountMode === 'login' ? 'Entrar' : 'Criar conta'} <span>→</span></button></form><button className="account-switch" onClick={() => { setAccountMode(accountMode === 'login' ? 'signup' : 'login'); setAccountError(''); setAccountMessage(''); }}>{accountMode === 'login' ? 'Ainda não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}</button>{customerSession && <button className="account-signout" onClick={async () => { await supabase?.auth.signOut(); setAccountOpen(false); }}>Sair da conta</button>}</section></div>}

    {cartOpen && <div className="drawer-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setCartOpen(false); }}>
      <aside className="cart-drawer" aria-label="Carrinho de compras">
        <div className="drawer-header"><div><p className="eyebrow">SUA SELEÇÃO</p><h2>Carrinho <span>({count})</span></h2></div><button className="icon-button close-button" onClick={() => setCartOpen(false)} aria-label="Fechar carrinho">×</button></div>
        {cart.length === 0 ? <div className="cart-empty"><svg className="empty-cart-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M5 8h4l4.5 23h23l5-17H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="18" cy="39" r="2.5" fill="currentColor"/><circle cx="34" cy="39" r="2.5" fill="currentColor"/></svg><h3>Seu carrinho está vazio</h3><p>Adicione produtos da vitrine para começar.</p><button className="primary-cta" onClick={() => setCartOpen(false)}>Explorar produtos <span>↗</span></button></div> :
          <><div className="cart-lines">{cart.map(l => <div className="cart-line" key={l.product.id}><div className="cart-thumb">{l.product.image_url ? <img src={l.product.image_url} alt=""/> : <svg viewBox="0 0 40 40" aria-hidden="true"><path d="m5 13 15-8 15 8v18l-15 8-15-8V13Z" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="m5 13 15 9 15-9M20 22v17" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>}</div><div className="cart-line-info"><strong>{l.product.name}</strong><span>{money(l.product.price)}</span><div className="quantity-control"><button onClick={() => quantity(l.product.id, -1)}>−</button><b>{l.quantity}</b><button onClick={() => quantity(l.product.id, 1)} disabled={l.quantity >= l.product.stock_quantity}>+</button></div></div><strong className="line-total">{money(Number(l.product.price) * l.quantity)}</strong></div>)}</div><div className="drawer-summary"><div><span>Subtotal</span><strong>{money(total)}</strong></div><p>Frete e pagamento serão calculados na etapa de finalização.</p><button className="checkout-button" disabled>Finalização de compra em configuração <span>→</span></button><button className="clear-cart" onClick={() => setCart([])}>Limpar carrinho</button></div></>}
      </aside>
    </div>}
  </div>;
}
