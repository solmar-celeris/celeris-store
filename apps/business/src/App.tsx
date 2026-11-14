const modules = [
  ['⌂','Visão geral','Indicadores e atividades'],
  ['◎','CRM','Leads, clientes e negociações'],
  ['▣','Vendas','Pedidos e orçamentos'],
  ['□','Produtos e estoque','Catálogo e movimentações'],
  ['＄','Financeiro','Contas e fluxo de caixa'],
  ['⇄','Compras','Fornecedores e aquisições'],
  ['⚙','Configurações','Usuários e permissões']
];
export default function App() {
  return <div className="shell"><aside className="sidebar"><div className="brand">CELERIS <span>BUSINESS</span></div><small>GESTÃO EMPRESARIAL</small>{modules.map(([icon,name,desc])=><a className="navitem" href="#" key={name}><b>{icon}</b><span>{name}<small>{desc}</small></span></a>)}</aside><main className="main"><header><span>Painel administrativo</span><span className="user">Ambiente de configuração</span></header><section className="welcome"><p>CELERIS BUSINESS</p><h1>Gestão da sua operação, em um só lugar.</h1><span>A fundação do ambiente administrativo está pronta para receber os módulos.</span></section><section className="cards">{modules.slice(1).map(([icon,name,desc])=><article key={name}><b>{icon}</b><h3>{name}</h3><p>{desc}</p><small>Preparado para implementação</small></article>)}</section><footer>Fundação técnica · versão 0.1.0</footer></main></div>;
}
