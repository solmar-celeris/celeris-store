-- Celeris catalog: product model variations and product image storage.
create table if not exists public.store_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.store_products(id) on delete cascade,
  name text not null,
  sku text,
  price numeric(12,2) not null check (price >= 0),
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists store_product_variants_product_idx
  on public.store_product_variants(product_id, is_active, sort_order);
create unique index if not exists store_product_variants_sku_unique
  on public.store_product_variants(sku) where sku is not null and sku <> '';
alter table public.store_product_variants enable row level security;
drop policy if exists store_product_variants_public_read on public.store_product_variants;
create policy store_product_variants_public_read on public.store_product_variants
 for select to anon using (is_active and exists(select 1 from public.store_products p where p.id=product_id and p.is_active));
drop policy if exists store_product_variants_authenticated_read on public.store_product_variants;
create policy store_product_variants_authenticated_read on public.store_product_variants
 for select to authenticated using (is_active or public.has_permission('store.manage'));
drop policy if exists store_product_variants_admin_manage on public.store_product_variants;
create policy store_product_variants_admin_manage on public.store_product_variants
 for all to authenticated using (public.has_permission('store.manage'))
 with check (public.has_permission('store.manage'));
grant select on public.store_product_variants to anon, authenticated;
grant insert, update, delete on public.store_product_variants to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('product-images','product-images',true,10485760,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=true,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read on storage.objects for select to anon,authenticated using(bucket_id='product-images');
drop policy if exists product_images_admin_insert on storage.objects;
create policy product_images_admin_insert on storage.objects for insert to authenticated
 with check(bucket_id='product-images' and public.has_permission('store.manage'));
drop policy if exists product_images_admin_update on storage.objects;
create policy product_images_admin_update on storage.objects for update to authenticated
 using(bucket_id='product-images' and public.has_permission('store.manage'))
 with check(bucket_id='product-images' and public.has_permission('store.manage'));
drop policy if exists product_images_admin_delete on storage.objects;
create policy product_images_admin_delete on storage.objects for delete to authenticated
 using(bucket_id='product-images' and public.has_permission('store.manage'));
