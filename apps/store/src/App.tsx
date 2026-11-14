export default function App() {
  return <main className="page">
    <header className="topbar"><strong>CELERIS <span>STORE</span></strong><nav><a href="#loja">Loja</a><a href="#categorias">Categorias</a><a href="#conta">Minha conta</a></nav><button className="cart">Carrinho</button></header>
    <section className="hero"><p className="eyebrow">BEM-VINDO À CELERIS STORE</p><h1>Uma experiência de compra<br/>simples e inteligente.</h1><p>A vitrine oficial da Celeris.</p><a className="cta" href="#loja">Explorar produtos</a></section>
    <section id="loja" className="content"><h2>Produtos em destaque</h2><p className="muted">Seu catálogo será exibido aqui quando o módulo de produtos estiver conectado.</p><div className="empty">A loja está sendo preparada. Em breve, novidades por aqui.</div></section>
    <footer>© {new Date().getFullYear()} Celeris Store</footer>
  </main>;
}
