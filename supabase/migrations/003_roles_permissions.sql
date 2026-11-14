-- Celeris Platform | 003 | RBAC
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- SECURITY DEFINER permite consultar as tabelas RBAC sem recursão de RLS.
-- O super_admin é reconhecido mesmo sem linhas em role_permissions.
create or replace function public.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = (select auth.uid())
        and r.key = 'super_admin'
    )
    or exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = (select auth.uid())
        and p.key = permission_key
    );
$$;

revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

insert into public.roles (key, name) values
 ('super_admin', 'Superadministrador'),
 ('admin', 'Administrador'),
 ('manager', 'Gerente'),
 ('operator', 'Operador')
on conflict (key) do nothing;

insert into public.permissions (key, description) values
 ('dashboard.read', 'Visualizar dashboard'),
 ('users.read', 'Visualizar usuários'),
 ('users.manage', 'Gerenciar usuários'),
 ('roles.manage', 'Gerenciar cargos e permissões'),
 ('crm.read', 'Visualizar CRM'),
 ('crm.manage', 'Gerenciar CRM'),
 ('products.read', 'Visualizar produtos'),
 ('products.manage', 'Gerenciar produtos'),
 ('inventory.read', 'Visualizar estoque'),
 ('inventory.manage', 'Gerenciar estoque'),
 ('orders.read', 'Visualizar pedidos'),
 ('orders.manage', 'Gerenciar pedidos'),
 ('finance.read', 'Visualizar financeiro'),
 ('finance.manage', 'Gerenciar financeiro'),
 ('purchases.manage', 'Gerenciar compras'),
 ('reports.read', 'Visualizar relatórios'),
 ('store.manage', 'Gerenciar vitrine')
on conflict (key) do nothing;

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;

create policy "roles_read_authorized"
on public.roles for select to authenticated
using (public.has_permission('roles.manage'));

create policy "roles_manage_authorized"
on public.roles for all to authenticated
using (public.has_permission('roles.manage'))
with check (public.has_permission('roles.manage'));

create policy "permissions_read_authorized"
on public.permissions for select to authenticated
using (public.has_permission('roles.manage'));

create policy "user_roles_read_self_or_admin"
on public.user_roles for select to authenticated
using (user_id = (select auth.uid()) or public.has_permission('users.read'));

create policy "user_roles_manage_authorized"
on public.user_roles for all to authenticated
using (public.has_permission('roles.manage'))
with check (public.has_permission('roles.manage'));

create policy "role_permissions_read_authorized"
on public.role_permissions for select to authenticated
using (public.has_permission('roles.manage'));

create policy "role_permissions_manage_authorized"
on public.role_permissions for all to authenticated
using (public.has_permission('roles.manage'))
with check (public.has_permission('roles.manage'));
