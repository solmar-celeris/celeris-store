-- Celeris Store catalog categories requested by the business team.
insert into public.store_categories (name, slug, is_active, sort_order)
values
 ('Lembranças','lembrancas',true,1),
 ('Camisas','camisas',true,2),
 ('Informática','informatica',true,3),
 ('Brinquedos','brinquedos',true,4)
on conflict (slug) do update
set name=excluded.name,is_active=true,sort_order=excluded.sort_order;
