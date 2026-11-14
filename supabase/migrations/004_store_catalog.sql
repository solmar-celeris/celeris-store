-- Celeris Store | 004 | Catalog and public storefront
create table if not exists public.store_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.store_categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  sku text unique,
  price numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= price),
  image_url text,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_active boolean not null default false,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_products_public_listing_idx
  on public.store_products (is_active, is_featured desc, sort_order, created_at desc);
create index if not exists store_products_category_idx
  on public.store_products (category_id);

drop trigger if exists store_categories_set_updated_at on public.store_categories;
create trigger store_categories_set_updated_at
before update on public.store_categories
for each row execute function public.set_updated_at();

drop trigger if exists store_products_set_updated_at on public.store_products;
create trigger store_products_set_updated_at
before update on public.store_products
for each row execute function public.set_updated_at();

alter table public.store_categories enable row level security;
alter table public.store_products enable row level security;

drop policy if exists "store_categories_public_read" on public.store_categories;
drop policy if exists "store_categories_authenticated_read" on public.store_categories;
create policy "store_categories_public_read"
on public.store_categories for select to anon
using (is_active);
create policy "store_categories_authenticated_read"
on public.store_categories for select to authenticated
using (is_active or public.has_permission('store.manage'));

drop policy if exists "store_categories_admin_manage" on public.store_categories;
create policy "store_categories_admin_manage"
on public.store_categories for all to authenticated
using (public.has_permission('store.manage'))
with check (public.has_permission('store.manage'));

drop policy if exists "store_products_public_read" on public.store_products;
drop policy if exists "store_products_authenticated_read" on public.store_products;
create policy "store_products_public_read"
on public.store_products for select to anon
using (is_active);
create policy "store_products_authenticated_read"
on public.store_products for select to authenticated
using (is_active or public.has_permission('store.manage'));

drop policy if exists "store_products_admin_manage" on public.store_products;
create policy "store_products_admin_manage"
on public.store_products for all to authenticated
using (public.has_permission('store.manage'))
with check (public.has_permission('store.manage'));

grant select on public.store_categories, public.store_products to anon, authenticated;
grant insert, update, delete on public.store_categories, public.store_products to authenticated;

insert into public.permissions (key, description)
values ('store.manage', 'Gerenciar catálogo e categorias da loja')
on conflict (key) do nothing;
