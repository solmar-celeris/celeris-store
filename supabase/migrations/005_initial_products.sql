-- Celeris Store | 005 | Produtos iniciais
-- Produtos oficiais solicitados para a vitrine.
-- O estoque começa em zero para não permitir vendas sem quantidade confirmada.

insert into public.store_products
  (name, slug, description, sku, price, stock_quantity, is_active, is_featured, sort_order)
values
  ('Chaveiro', 'chaveiro', 'Chaveiro oficial Celeris.', 'CEL-CHAVEIRO', 3.00, 0, true, false, 10),
  ('Caneca', 'caneca', 'Caneca oficial Celeris.', 'CEL-CANECA', 25.00, 0, true, false, 20)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  sku = excluded.sku,
  price = excluded.price,
  is_active = true,
  updated_at = now();
