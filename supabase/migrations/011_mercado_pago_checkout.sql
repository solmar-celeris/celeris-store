-- Celeris Store | 011 | Mercado Pago checkout
alter table public.store_orders add column if not exists shipping_address jsonb, add column if not exists payment_provider text, add column if not exists provider_order_id text, add column if not exists provider_reference text;
alter table public.store_order_items add column if not exists variant_id uuid references public.store_product_variants(id) on delete set null;
create unique index if not exists store_orders_provider_order_id_unique on public.store_orders(provider_order_id) where provider_order_id is not null;
create index if not exists store_orders_customer_created_idx on public.store_orders(customer_id, created_at desc);
