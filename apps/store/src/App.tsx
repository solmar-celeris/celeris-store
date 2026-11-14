import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '@celeris/supabase-client';

type Category = { id: string; name: string; slug: string };
type Variant = { id:string; name:string; sku:string|null; price:number|string; image_url:string|null };
type Product = {
  id: string; name: string; slug: string; description: string | null; sku: string | null;
  price: number | string; compare_at_price: number | string | null; image_url: string | null;
  stock_quantity: number; is_featured: boolean; category_id: string | null; store_product_variants?: Variant[];
};
type CartLine = { product: Product; variant?: Variant; quantity: number };
const money = (v: number | string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
function stored<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

function StoreBagLogo({ className = '', variant = 'white' }: { className?: string; variant?: 'black' | 'white' }) {
  return <img className={className} src={variant === 'black' ? '/celeris-store-logo-black.svg' : '/celeris-store-logo.svg'} alt="SolMar Celeris" />;
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedVariants,setSelectedVariants]=useState<Record<string,string>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartLine[]>(() => stored('celeris-store-cart', []));
  const [theme, setTheme] = useState<'light' | 'dark'>(() => stored<'light' | 'dark'>('celeris-store-theme', 'light'));
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'mercado_pago' | 'pix'>('mercado_pago');
  const [pixPayment, setPixPayment] = useState<{ qr_code: string; qr_code_base64: string; ticket_url: string | null; order_number: string | number } | null>(null);
  const [orderToVerify, setOrderToVerify] = useState<string | null>(() => new URLSearchParams(window.location.search).get('order') || localStorage.getItem('celeris-store-pending-order'));
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [shipping, setShipping] = useState({phone:'',cep:'',street:'',number:'',complement:'',neighborhood:'',city:'',state:''});
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const customerName = customerSession?.user?.user_metadata?.full_name || customerSession?.user?.email?.split('@')[0] || 'Cliente';
  const customerAvatar = customerSession?.user?.user_metadata?.avatar_url as string | undefined;
  const customerInitial = String(customerName).trim().charAt(0).toLocaleUpperCase('pt-BR') || 'C';

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('celeris-store-theme', JSON.stringify(theme)); }, [theme]);
  useEffect(() => { localStorage.setItem('celeris-store-cart', JSON.stringify(cart)); }, [cart]);

  // Only empty the cart after the database confirms that the provider webhook marked the order as paid.
  useEffect(() => {
    const client = supabase;
    if (!client || !orderToVerify) return;
    let active = true;
    const verify = async () => {
      const { data, error } = await client.from('store_orders').select('payment_status').eq('id', orderToVerify).maybeSingle();
      if (!active || error || !data) return;
      if (data.payment_status === 'paid') {
        setCart([]);
        setPaymentConfirmed(true);
        setCheckoutOpen(true);
        setCheckoutBusy(false);
        localStorage.removeItem('celeris-store-pending-order');
        setOrderToVerify(null);
      }
    };
    void verify();
    const timer = window.setInterval(verify, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [orderToVerify]);


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
        supabase.from('store_products').select('id,name,slug,description,sku,price,compare_at_price,image_url,stock_quantity,is_featured,category_id,store_product_variants(id,name,sku,price,image_url)').eq('is_active', true).order('is_featured', { ascending: false }).order('sort_order').order('created_at', { ascending: false }),
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
    const client = supabase;
    if (!client) return;
    const refresh = async () => {
      const { data, error } = await client.from('store_products')
        .select('id,name,slug,description,sku,price,compare_at_price,image_url,stock_quantity,is_featured,category_id,store_product_variants(id,name,sku,price,image_url)')
        .eq('is_active', true).order('is_featured', { ascending: false }).order('sort_order').order('created_at', { ascending: false });
      if (error || !data) return;
      const latest = data as Product[];
      setProducts(latest);
      setCart(current => current.map(line => {
        const updated = latest.find(p => p.id === line.product.id);
        return updated ? { ...line, product: updated } : line;
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
  const featuredProducts = products.filter(p=>p.is_featured).slice(0,4);
  const count = cart.reduce((n, l) => n + l.quantity, 0);
  const total = cart.reduce((n, l) => n + Number(l.variant?.price ?? l.product.price) * l.quantity, 0);

  function add(product: Product, variant?: Variant) {
    const key=product.id+':'+(variant?.id||'default');
    setCart(current=>{const found=current.find(l=>l.product.id+':'+(l.variant?.id||'default')===key);return found?current.map(l=>l.product.id+':'+(l.variant?.id||'default')===key?{...l,quantity:l.quantity+1}:l):[...current,{product,variant,quantity:1}];});
    setCartOpen(true);
  }
  async function submitCustomerAuth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase) return;
    setAccountError(''); setAccountMessage('');
    const result = accountMode === 'signup'
      ? await supabase.auth.signUp({ email: accountEmail, password: accountPassword, options: { data: { full_name: accountName } } })
      : await supabase.auth.signInWithPassword({ email: accountEmail, password: accountPassword });
    if (result.error) setAccountError(result.error.message);
    else if (accountMode === 'signup' && !result.data.session) setAccountMessage('Cadastro criado. Para entrar imediatamente, desative a confirmação de e-mail em Supabase → Authentication → Providers → Email → Confirm email.');
    else { setAccountMessage('Login realizado com sucesso.'); setAccountOpen(false); setAccountPassword(''); }
  }

  async function uploadCustomerAvatar(file?: File) {
    if (!file || !supabase || !customerSession?.user) return;
    if (!file.type.startsWith('image/')) { setAccountError('Selecione um arquivo de imagem.'); return; }
    if (file.size > 5 * 1024 * 1024) { setAccountError('A imagem deve ter no máximo 5 MB.'); return; }
    setAvatarUploading(true); setAccountError('');
    const userId = customerSession.user.id;
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) { setAccountError(uploadError.message); setAvatarUploading(false); return; }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    const { error: updateError } = await supabase.auth.updateUser({ data: { avatar_url: data.publicUrl } });
    if (updateError) setAccountError(updateError.message);
    else { const { data: sessionData } = await supabase.auth.getSession(); setCustomerSession(sessionData.session); setProfileOpen(false); }
    setAvatarUploading(false);
  }

  function quantity(key:string,delta:number){setCart(current=>current.map(l=>l.product.id+':'+(l.variant?.id||'default')===key?{...l,quantity:l.quantity+delta}:l).filter(l=>l.quantity>0));}
  async function startCheckout(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase || !customerSession || !cart.length) return;
    setCheckoutBusy(true); setCheckoutError('');
    try {
      const result = await supabase.functions.invoke('create-checkout', { body: { items: cart.map(line => ({ product_id: line.product.id, variant_id: line.variant?.id || null, quantity: line.quantity })), shipping_address: shipping, payment_method: paymentMethod } });
      if (result.error) throw result.error;
      if (paymentMethod === 'pix') {
        if (!result.data?.pix?.qr_code || !result.data?.pix?.qr_code_base64) throw new Error(result.data?.error || 'Não foi possível gerar o PIX.');
        setPixPayment({ ...result.data.pix, order_number: result.data.order_number });
        setPaymentConfirmed(false);
        setOrderToVerify(result.data.order_id);
        localStorage.setItem('celeris-store-pending-order', result.data.order_id);
        setCheckoutBusy(false);
        return;
      }
      if (!result.data?.checkout_url) throw new Error(result.data?.error || 'Não foi possível iniciar o pagamento.');
      localStorage.setItem('celeris-store-pending-order', result.data.order_id);
      window.location.assign(result.data.checkout_url);
    } catch (err) { setCheckoutError(err instanceof Error ? err.message : 'Falha ao iniciar o checkout.'); setCheckoutBusy(false); }
  }

  async function copyPixCode() {
    if (!pixPayment?.qr_code) return;
    try { await navigator.clipboard.writeText(pixPayment.qr_code); setCheckoutError('Código PIX copiado!'); }
    catch { setCheckoutError('Não foi possível copiar automaticamente. Selecione e copie o código PIX.'); }
  }

  return <div className="store-shell">
    <div className="store-topline"><span>Bem-vindo à loja oficial SolMar Celeris</span><div><button onClick={()=>setAccountOpen(true)}>Minha conta</button><span className="topline-separator">|</span><a href="https://celeris-business.pages.dev/" target="_blank" rel="noreferrer">Área restrita</a></div></div>
    <header className="site-header">
      <a className="brand" href="#inicio" aria-label="Celeris Store início"><StoreBagLogo className="brand-mark" variant={theme === "dark" ? "white" : "black"}/></a>
      <label className="header-search"><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')document.getElementById('loja')?.scrollIntoView({behavior:'smooth'});}} placeholder="Buscar produtos..." aria-label="Buscar produtos"/><button type="button" aria-label="Buscar" onClick={()=>document.getElementById('loja')?.scrollIntoView({behavior:'smooth'})}>⌕</button></label>
      <div className="header-actions">
        {customerSession ? <div className="customer-profile-wrap"><button className="customer-profile-button" onClick={() => setProfileOpen(v => !v)} aria-expanded={profileOpen}>{customerAvatar ? <img src={customerAvatar} alt="" /> : <span className="customer-avatar-initial">{customerInitial}</span>}<span className="customer-profile-name">{customerName}</span><span className="profile-chevron">⌄</span></button>{profileOpen && <div className="customer-profile-menu"><strong>{customerName}</strong><small>{customerSession.user.email}</small><button onClick={() => avatarInput.current?.click()} disabled={avatarUploading}>{avatarUploading ? 'Enviando foto…' : 'Trocar foto'}</button><button className="profile-logout" onClick={async () => { await supabase?.auth.signOut(); setProfileOpen(false); }}>Sair da conta</button></div>}<input ref={avatarInput} className="avatar-file-input" type="file" accept="image/*" onChange={e => { void uploadCustomerAvatar(e.target.files?.[0]); e.currentTarget.value = ''; }}/></div> : <><button className="customer-login-button" onClick={() => { setAccountMode('login'); setAccountMessage(''); setAccountError(''); setAccountOpen(true); }}>Entrar</button><button className="customer-signup-button" onClick={() => { setAccountMode('signup'); setAccountMessage(''); setAccountError(''); setAccountOpen(true); }}>Criar conta</button></>}
        <button className="icon-button" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} aria-label="Alternar tema">{theme === 'light' ? '☾' : '☼'}</button>
        <button className="cart-button" onClick={() => setCartOpen(true)} aria-label={`Abrir carrinho com ${count} itens`}><svg className="cart-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 4h2l2.2 11.1a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 1.9-1.4L22 8H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><circle cx="10" cy="20" r="1.3" fill="currentColor"/><circle cx="18" cy="20" r="1.3" fill="currentColor"/></svg><span className="cart-label">Carrinho</span><b>{count}</b></button>
      </div>
    </header>
    <nav className="store-category-nav" aria-label="Navegação por categorias"><a className="store-nav-home" href="#inicio">INÍCIO</a><a href="#loja" onClick={()=>setCategory('all')}>TODOS OS PRODUTOS</a>{categories.map(c=><button key={c.id} onClick={()=>{setCategory(c.id);document.getElementById('loja')?.scrollIntoView({behavior:'smooth'});}}>{c.name.toLocaleUpperCase('pt-BR')}</button>)}<a className="store-nav-promo" href="#destaques">DESTAQUES</a></nav>

    <main id="inicio">
      <section className="hero campaign-hero">
        <div className="hero-copy"><p className="eyebrow"><i /> SOLMAR CELERIS · LOJA OFICIAL</p><h1>Navegue nos melhores<br/><em>produtos e preços.</em></h1><p className="hero-description">Produtos, lembranças e tecnologia com a identidade SolMar Celeris.</p><a className="primary-cta" href="#loja">COMPRE AGORA <span>↗</span></a><div className="hero-footnote">SOLMAR CELERIS · INOVAÇÃO EM MOVIMENTO</div></div>
        <div className="hero-art" aria-label="Logo SolMar Celeris"><StoreBagLogo className="hero-bag-logo"/></div>
      </section>

      <section className="home-search" aria-label="Buscar no catálogo">
        <label className="home-search-box"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="O que você está procurando?" aria-label="Buscar produtos"/><button type="button" onClick={()=>document.getElementById('loja')?.scrollIntoView({behavior:'smooth'})}>Buscar</button></label>
      </section>

      {featuredProducts.length>0&&<section className="featured-section" id="destaques" aria-label="Produtos em destaque">
        <div className="featured-heading"><div><p className="eyebrow">SELEÇÃO CELERIS</p><h2>Produtos em <em>destaque.</em></h2></div><a href="#loja">Ver catálogo completo →</a></div>
        <div className="featured-grid">{featuredProducts.map(p=>{const vs=p.store_product_variants||[];const v=vs.find(x=>x.id===selectedVariants[p.id])||vs[0];return <article className="featured-card" key={p.id}><div className="featured-image">{(v?.image_url||p.image_url)?<img src={v?.image_url||p.image_url||''} alt={p.name}/>:<div className="product-placeholder"><small>CELERIS</small></div>}</div><div className="featured-card-info"><span>DESTAQUE</span><h3>{p.name}</h3><strong>{money(Number(v?.price??p.price))}</strong><button onClick={()=>add(p,v)}>Adicionar ao carrinho</button></div></article>})}</div>
      </section>}

      

      <section className="catalog-section" id="loja">
        <div className="section-heading"><div><p className="eyebrow">NOSSA VITRINE</p><h2>Produtos <em>para você.</em></h2></div><span className="result-count">{loading ? 'Carregando catálogo…' : `${visible.length} produtos`}</span></div>
        <div className="catalog-toolbar" id="categorias">
          <div className="category-list"><button className={category === 'all' ? 'category-chip selected' : 'category-chip'} onClick={() => setCategory('all')}>Todos</button>{categories.map(c => <button key={c.id} className={category === c.id ? 'category-chip selected' : 'category-chip'} onClick={() => setCategory(c.id)}>{c.name}</button>)}</div>
          <label className="search-box"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produtos…" aria-label="Buscar produtos"/></label>
        </div>
        {error && <div className="notice error-notice"><strong>Não foi possível abrir a vitrine.</strong><span>{error}</span></div>}
        {loading ? <div className="product-grid">{[1,2,3,4].map(i => <div className="product-skeleton" key={i}><div/><span/><span/></div>)}</div> :
          !error && visible.length === 0 ? <div className="empty-state"><span className="empty-symbol" aria-hidden="true">◇</span><h3>{products.length ? 'Nenhum produto encontrado' : 'A vitrine está sendo preparada'}</h3><p>{products.length ? 'Tente outra busca ou categoria.' : 'Os produtos cadastrados no catálogo serão exibidos aqui.'}</p>{(search || category !== 'all') && <button className="text-button" onClick={() => { setSearch(''); setCategory('all'); }}>Limpar filtros</button>}</div> :
          <div className="product-grid">{visible.map(p => {
            const variants=p.store_product_variants||[]; const selected=variants.find(v=>v.id===selectedVariants[p.id])||variants[0]; const price=Number(selected?.price??p.price);
            return <article className="product-card" key={p.id}>
              <div className="product-image-wrap">{(selected?.image_url||p.image_url)?<img src={selected?.image_url||p.image_url||''} alt={p.name} loading="lazy"/>:<div className="product-placeholder"><small>CELERIS STORE</small></div>}{p.is_featured&&<span className="featured-tag">DESTAQUE</span>}</div>
              <div className="product-info"><p className="product-category">{categories.find(c=>c.id===p.category_id)?.name||'CELERIS'}</p><h3>{p.name}</h3><p className="product-description">{p.description||'Produto oficial Celeris.'}</p>
              {variants.length>0&&<label className="variant-store-select">Modelo<select value={selected?.id||''} onChange={e=>setSelectedVariants(current=>({...current,[p.id]:e.target.value}))}>{variants.map(v=><option key={v.id} value={v.id}>{v.name} — {money(Number(v.price))}</option>)}</select></label>}
              <div className="product-buy-row"><div><strong className="variant-price">{money(price)}</strong></div><button className="add-button" onClick={()=>add(p,selected)} aria-label={'Adicionar '+p.name+' ao carrinho'}>+</button></div></div>
            </article>;
          })}</div>}
      </section>


    </main>
    <footer className="site-footer"><a className="footer-brand" href="#inicio">SOLMAR CELERIS <span>STORE</span></a><span>© {new Date().getFullYear()} Celeris. Todos os direitos reservados.</span><a href="#inicio">Voltar ao topo ↑</a></footer>

    {accountOpen && <div className="drawer-backdrop account-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setAccountOpen(false); }}><section className="account-modal" role="dialog" aria-modal="true" aria-label="Conta do cliente"><button className="account-close" onClick={() => setAccountOpen(false)} aria-label="Fechar">×</button><p className="eyebrow">ÁREA DO CLIENTE</p><h2>{accountMode === 'login' ? 'Acesse sua conta' : 'Crie sua conta'}</h2><p className="account-intro">Entre para sua experiência na Celeris Store.</p><form onSubmit={submitCustomerAuth}>{accountMode === 'signup' && <label>Nome completo<input value={accountName} onChange={e => setAccountName(e.target.value)} required autoComplete="name"/></label>}<label>E-mail<input type="email" value={accountEmail} onChange={e => setAccountEmail(e.target.value)} required autoComplete="email"/></label><label>Senha<input type="password" value={accountPassword} onChange={e => setAccountPassword(e.target.value)} required minLength={6} autoComplete={accountMode === 'login' ? 'current-password' : 'new-password'}/></label>{accountError && <div className="account-feedback error">{accountError}</div>}{accountMessage && <div className="account-feedback">{accountMessage}</div>}<button className="checkout-button" type="submit">{accountMode === 'login' ? 'Entrar' : 'Criar conta'} <span>→</span></button></form><button className="account-switch" onClick={() => { setAccountMode(accountMode === 'login' ? 'signup' : 'login'); setAccountError(''); setAccountMessage(''); }}>{accountMode === 'login' ? 'Ainda não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}</button>{customerSession && <button className="account-signout" onClick={async () => { await supabase?.auth.signOut(); setAccountOpen(false); }}>Sair da conta</button>}</section></div>}


    {checkoutOpen && <div className="drawer-backdrop account-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!checkoutBusy)setCheckoutOpen(false);}}><section className="checkout-modal" role="dialog" aria-modal="true" aria-label="Finalizar compra"><button className="account-close" onClick={()=>{setCheckoutOpen(false);setPixPayment(null);setCheckoutError('');}} aria-label="Fechar" disabled={checkoutBusy}>×</button><p className="eyebrow">ÚLTIMA ETAPA</p>{paymentConfirmed ? <><h2>Pagamento confirmado!</h2><p className="account-intro">Recebemos a confirmação do seu pagamento. Seu pedido já foi atualizado e seu carrinho foi esvaziado.</p><button type="button" className="checkout-button" onClick={()=>{setCheckoutOpen(false);setPixPayment(null);setPaymentConfirmed(false);setCheckoutError('');}}>Continuar comprando <span>→</span></button></> : pixPayment ? <><h2>PIX do pedido #{pixPayment.order_number}</h2><p className="account-intro">Escaneie o QR Code no aplicativo do seu banco ou copie o código PIX abaixo. A confirmação será recebida automaticamente.</p><div className="pix-payment-panel"><img className="pix-qr-code" src={`data:image/png;base64,${pixPayment.qr_code_base64}`} alt="QR Code PIX para pagamento"/><label className="pix-copy-label">PIX Copia e Cola<textarea readOnly value={pixPayment.qr_code} rows={4}/></label><button type="button" className="checkout-button pix-copy-button" onClick={copyPixCode}>Copiar código PIX <span>▣</span></button>{pixPayment.ticket_url && <a className="pix-ticket-link" href={pixPayment.ticket_url} target="_blank" rel="noreferrer">Abrir pagamento no Mercado Pago ↗</a>}<p className="pix-waiting-note">Aguardando confirmação do pagamento. Você pode fechar esta janela; seu pedido continuará registrado.</p></div>{checkoutError&&<div className="account-feedback">{checkoutError}</div>}</> : <><h2>Dados para entrega</h2><p className="account-intro">Informe onde deseja receber seu pedido.</p><form onSubmit={startCheckout} className="checkout-form"><label>Telefone / WhatsApp<input required value={shipping.phone} onChange={e=>setShipping(s=>({...s,phone:e.target.value}))} autoComplete="tel"/></label><div className="checkout-form-grid"><label>CEP<input required value={shipping.cep} onChange={e=>setShipping(s=>({...s,cep:e.target.value}))} autoComplete="postal-code"/></label><label>Estado<input required maxLength={2} value={shipping.state} onChange={e=>setShipping(s=>({...s,state:e.target.value.toUpperCase()}))} placeholder="UF"/></label></div><label>Rua / Avenida<input required value={shipping.street} onChange={e=>setShipping(s=>({...s,street:e.target.value}))} autoComplete="street-address"/></label><div className="checkout-form-grid"><label>Número<input required value={shipping.number} onChange={e=>setShipping(s=>({...s,number:e.target.value}))}/></label><label>Complemento<input value={shipping.complement} onChange={e=>setShipping(s=>({...s,complement:e.target.value}))}/></label></div><div className="checkout-form-grid"><label>Bairro<input required value={shipping.neighborhood} onChange={e=>setShipping(s=>({...s,neighborhood:e.target.value}))}/></label><label>Cidade<input required value={shipping.city} onChange={e=>setShipping(s=>({...s,city:e.target.value}))}/></label></div><div className="checkout-shipping-note">O frete ainda será combinado e informado separadamente. O valor cobrado agora corresponde aos produtos.</div><div className="checkout-total"><span>Total dos produtos</span><strong>{money(total)}</strong></div><div className="payment-method-options"><span className="payment-method-title">Forma de pagamento</span><label className={paymentMethod==='mercado_pago'?'payment-method-option selected':'payment-method-option'}><input type="radio" name="payment-method" value="mercado_pago" checked={paymentMethod==='mercado_pago'} onChange={()=>setPaymentMethod('mercado_pago')}/><span><strong>Mercado Pago</strong><small>Cartão e outras opções disponíveis</small></span></label><label className={paymentMethod==='pix'?'payment-method-option selected':'payment-method-option'}><input type="radio" name="payment-method" value="pix" checked={paymentMethod==='pix'} onChange={()=>setPaymentMethod('pix')}/><span><strong>PIX</strong><small>QR Code ou Copia e Cola</small></span></label></div>{checkoutError&&<div className="account-feedback error">{checkoutError}</div>}<button className="checkout-button" type="submit" disabled={checkoutBusy}>{checkoutBusy?'Preparando pagamento…':paymentMethod==='pix'?'Gerar PIX':'Pagar com Mercado Pago'} <span>→</span></button></form></>}</section></div>}{cartOpen && <div className="drawer-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setCartOpen(false); }}>
      <aside className="cart-drawer" aria-label="Carrinho de compras">
        <div className="drawer-header"><div><p className="eyebrow">SUA SELEÇÃO</p><h2>Carrinho <span>({count})</span></h2></div><button className="icon-button close-button" onClick={() => setCartOpen(false)} aria-label="Fechar carrinho">×</button></div>
        {cart.length === 0 ? <div className="cart-empty"><svg className="empty-cart-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M5 8h4l4.5 23h23l5-17H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="18" cy="39" r="2.5" fill="currentColor"/><circle cx="34" cy="39" r="2.5" fill="currentColor"/></svg><h3>Seu carrinho está vazio</h3><p>Adicione produtos da vitrine para começar.</p><button className="primary-cta" onClick={() => setCartOpen(false)}>Explorar produtos <span>↗</span></button></div> :
          <><div className="cart-lines">{cart.map(l => <div className="cart-line" key={l.product.id+":"+(l.variant?.id||"default")}><div className="cart-thumb">{l.product.image_url ? <img src={l.product.image_url} alt=""/> : <svg viewBox="0 0 40 40" aria-hidden="true"><path d="m5 13 15-8 15 8v18l-15 8-15-8V13Z" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="m5 13 15 9 15-9M20 22v17" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>}</div><div className="cart-line-info"><strong>{l.product.name}</strong>{l.variant&&<small>{l.variant.name}</small>}<span>{money(Number(l.variant?.price??l.product.price))}</span><div className="quantity-control"><button onClick={() => quantity(l.product.id+":"+(l.variant?.id||"default"), -1)}>−</button><b>{l.quantity}</b><button onClick={() => quantity(l.product.id+":"+(l.variant?.id||"default"), 1)}>+</button></div></div><strong className="line-total">{money(Number(l.variant?.price??l.product.price) * l.quantity)}</strong></div>)}</div><div className="drawer-summary"><div><span>Subtotal</span><strong>{money(total)}</strong></div><p>Frete e pagamento serão calculados na etapa de finalização.</p><button className="checkout-button" onClick={() => { if (!customerSession) { setAccountMode('login'); setAccountOpen(true); } else { setCheckoutOpen(true); } }}>Continuar para pagamento <span>→</span></button><button className="clear-cart" onClick={() => setCart([])}>Limpar carrinho</button></div></>}
      </aside>
    </div>}
  </div>;
}
