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

function StoreBagLogo({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  return <svg className={className} viewBox="0 0 320 340" role="img" aria-label="Celeris Store" xmlns="http://www.w3.org/2000/svg">
    <path className="bag-handle" d="M92 118V76C92 29 116 9 160 9s68 20 68 67v42" fill="none" strokeWidth="17" strokeLinecap="round"/>
    <path className="bag-body" d="M67 105h186c17 0 29 12 31 29l19 168c2 17-10 29-27 29H44c-17 0-29-12-27-29l19-168c2-17 14-29 31-29Z"/>
    <circle className="bag-handle" cx="92" cy="118" r="13" strokeWidth="10"/>
    <circle className="bag-handle" cx="228" cy="118" r="13" strokeWidth="10"/>
    <svg x="65" y="140" width="190" height="174" viewBox="249 383 776 711" aria-hidden="true"><path className="bag-logo" fill="var(--logo-fill)" fill-rule="evenodd" d="M845,1032 L845,1090 L907,1090 L906,1078 L864,1077 L865,1067 L900,1066 L900,1055 L865,1055 L864,1045 L906,1044 L906,1031Z M726,1031 L726,1090 L744,1090 L744,1071 L757,1070 L775,1090 L798,1091 L779,1070 L790,1064 L795,1056 L795,1044 L789,1035 L780,1031Z M744,1045 L771,1044 L777,1052 L772,1058 L745,1058Z M486,1031 L486,1044 L510,1045 L511,1090 L528,1090 L528,1046 L553,1044 L553,1032Z M598,1046 L594,1056 L596,1074 L607,1086 L620,1091 L643,1092 L656,1089 L668,1082 L677,1068 L675,1047 L656,1032 L626,1030 L609,1036Z M615,1052 L628,1043 L645,1043 L657,1052 L659,1065 L648,1077 L628,1079 L619,1075 L613,1067Z M379,1038 L377,1054 L382,1061 L395,1066 L422,1069 L427,1073 L427,1077 L419,1082 L399,1081 L393,1073 L375,1073 L382,1088 L395,1093 L425,1093 L443,1085 L446,1068 L441,1061 L428,1056 L400,1053 L395,1048 L402,1041 L420,1041 L427,1048 L445,1048 L438,1034 L422,1029 L389,1031Z M410,911 L409,1003 L512,1003 L512,983 L441,982 L442,966 L508,965 L507,945 L442,945 L441,929 L509,927 L509,908 L413,908Z M882,907 L881,1002 L911,1003 L911,907Z M757,907 L757,1003 L786,1003 L787,971 L799,971 L828,1003 L866,1003 L834,970 L849,963 L860,949 L861,932 L852,916 L828,907Z M786,929 L821,927 L830,933 L831,942 L821,951 L788,952Z M646,908 L645,1003 L737,1003 L737,983 L675,982 L676,965 L730,964 L730,945 L676,945 L675,928 L735,927 L735,907Z M536,907 L536,1003 L626,1003 L626,982 L566,981 L566,908Z M939,914 L931,923 L928,934 L934,953 L949,962 L987,969 L994,974 L994,980 L986,986 L970,987 L962,985 L954,975 L928,975 L932,991 L945,1001 L961,1005 L994,1004 L1016,994 L1024,979 L1020,960 L1005,950 L964,942 L957,932 L964,925 L982,924 L988,926 L994,934 L1022,934 L1018,920 L1004,909 L986,905 L959,906Z M251,942 L249,963 L256,982 L270,995 L294,1004 L331,1005 L359,998 L375,989 L390,969 L354,967 L343,978 L318,985 L299,982 L284,970 L281,961 L282,947 L290,935 L302,928 L336,928 L353,942 L389,940 L382,927 L373,919 L346,907 L309,905 L286,910 L264,923Z M295,875 L367,855 L451,842 L540,835 L626,834 L705,838 L783,847 L861,861 L940,881 L883,857 L790,831 L706,816 L617,809 L526,812 L419,828 L342,850Z M928,754 L856,742 L789,739 L715,743 L593,758 L487,776 L409,795 L343,819 L296,847 L349,828 L421,810 L490,798 L579,790 L651,791 L723,799 L792,813 L842,829Z M757,721 L685,672 L605,715 L509,757 L648,733Z M662,653 L622,627 L393,769 L488,738 L552,713 L612,684Z M531,590 L520,630 L522,667 L627,603 L759,693 L767,677 L773,653 L774,626 L763,583 L752,564 L734,544 L713,529 L693,520 L666,514 L637,514 L599,524 L563,547 L547,564Z M798,383 L780,391 L767,405 L761,423 L762,440 L769,455 L781,467 L798,474 L816,474 L833,467 L844,457 L853,438 L853,419 L844,400 L833,390 L816,383Z M801,403 L813,403 L822,407 L833,423 L829,443 L813,454 L796,452 L788,446 L782,435 L781,426 L785,415Z M433,383 L414,391 L400,407 L395,424 L396,439 L404,456 L419,469 L433,474 L450,474 L469,466 L480,455 L487,439 L488,423 L482,405 L469,391 L450,383Z M435,403 L455,406 L467,422 L464,442 L447,454 L427,450 L416,434 L419,415Z"/></svg>
  </svg>;
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

  return <div className="store-shell">
    <div className="store-topline"><span>Bem-vindo à loja oficial SolMar Celeris</span><div><button onClick={()=>setAccountOpen(true)}>Minha conta</button><span className="topline-separator">|</span><a href="https://celeris-business.pages.dev/" target="_blank" rel="noreferrer">Área restrita</a></div></div>
    <header className="site-header">
      <a className="brand" href="#inicio" aria-label="Celeris Store início"><StoreBagLogo className="brand-mark" compact/><span className="brand-copy"><strong>CELERIS</strong><small>STORE</small></span></a>
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
        <div className="hero-copy"><p className="eyebrow"><i /> SOLMAR CELERIS · LOJA OFICIAL</p><h1>Vista suas ideias.<br/><em>Leve a Celeris com você.</em></h1><p className="hero-description">Produtos, lembranças e tecnologia com a identidade SolMar Celeris.</p><a className="primary-cta" href="#loja">COMPRE AGORA <span>↗</span></a><div className="hero-footnote">SOLMAR CELERIS · INOVAÇÃO EM MOVIMENTO</div></div>
        <div className="hero-art" aria-label="Sacola Celeris Store"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><StoreBagLogo className="hero-bag-logo"/><div className="hero-tag tag-top">CELERIS / STORE</div><div className="hero-glow"/></div>
      </section>

      <section className="home-search" aria-label="Buscar no catálogo">
        <label className="home-search-box"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="O que você está procurando?" aria-label="Buscar produtos"/><button type="button" onClick={()=>document.getElementById('loja')?.scrollIntoView({behavior:'smooth'})}>Buscar</button></label>
      </section>

      {featuredProducts.length>0&&<section className="featured-section" id="destaques" aria-label="Produtos em destaque">
        <div className="featured-heading"><div><p className="eyebrow">SELEÇÃO CELERIS</p><h2>Produtos em <em>destaque.</em></h2></div><a href="#loja">Ver catálogo completo →</a></div>
        <div className="featured-grid">{featuredProducts.map(p=>{const vs=p.store_product_variants||[];const v=vs.find(x=>x.id===selectedVariants[p.id])||vs[0];return <article className="featured-card" key={p.id}><div className="featured-image">{(v?.image_url||p.image_url)?<img src={v?.image_url||p.image_url||''} alt={p.name}/>:<div className="product-placeholder"><small>CELERIS</small></div>}</div><div className="featured-card-info"><span>DESTAQUE</span><h3>{p.name}</h3><strong>{money(Number(v?.price??p.price))}</strong><button onClick={()=>add(p,v)}>Adicionar ao carrinho</button></div></article>})}</div>
      </section>}

      <section className="category-showcase"><div className="showcase-heading"><div><p className="eyebrow">EXPLORE A CELERIS</p><h2>Compre por <em>categoria</em></h2></div><a href="#loja">Ver todas →</a></div><div className="showcase-categories">{categories.map((c,i)=><button key={c.id} className="showcase-category" onClick={()=>{setCategory(c.id);document.getElementById("loja")?.scrollIntoView({behavior:"smooth"});}}><span className={"category-art category-art-"+(i%4)}>{["✦","◈","⌘","▣"][i%4]}</span><strong>{c.name}</strong><small>Explorar produtos →</small></button>)}</div></section>\n\n      <section className="catalog-section" id="loja">
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

    {cartOpen && <div className="drawer-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setCartOpen(false); }}>
      <aside className="cart-drawer" aria-label="Carrinho de compras">
        <div className="drawer-header"><div><p className="eyebrow">SUA SELEÇÃO</p><h2>Carrinho <span>({count})</span></h2></div><button className="icon-button close-button" onClick={() => setCartOpen(false)} aria-label="Fechar carrinho">×</button></div>
        {cart.length === 0 ? <div className="cart-empty"><svg className="empty-cart-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M5 8h4l4.5 23h23l5-17H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="18" cy="39" r="2.5" fill="currentColor"/><circle cx="34" cy="39" r="2.5" fill="currentColor"/></svg><h3>Seu carrinho está vazio</h3><p>Adicione produtos da vitrine para começar.</p><button className="primary-cta" onClick={() => setCartOpen(false)}>Explorar produtos <span>↗</span></button></div> :
          <><div className="cart-lines">{cart.map(l => <div className="cart-line" key={l.product.id+":"+(l.variant?.id||"default")}><div className="cart-thumb">{l.product.image_url ? <img src={l.product.image_url} alt=""/> : <svg viewBox="0 0 40 40" aria-hidden="true"><path d="m5 13 15-8 15 8v18l-15 8-15-8V13Z" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="m5 13 15 9 15-9M20 22v17" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>}</div><div className="cart-line-info"><strong>{l.product.name}</strong>{l.variant&&<small>{l.variant.name}</small>}<span>{money(Number(l.variant?.price??l.product.price))}</span><div className="quantity-control"><button onClick={() => quantity(l.product.id+":"+(l.variant?.id||"default"), -1)}>−</button><b>{l.quantity}</b><button onClick={() => quantity(l.product.id+":"+(l.variant?.id||"default"), 1)}>+</button></div></div><strong className="line-total">{money(Number(l.variant?.price??l.product.price) * l.quantity)}</strong></div>)}</div><div className="drawer-summary"><div><span>Subtotal</span><strong>{money(total)}</strong></div><p>Frete e pagamento serão calculados na etapa de finalização.</p><button className="checkout-button" disabled>Finalização de compra em configuração <span>→</span></button><button className="clear-cart" onClick={() => setCart([])}>Limpar carrinho</button></div></>}
      </aside>
    </div>}
  </div>;
}
