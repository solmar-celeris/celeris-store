# Celeris Platform

Projeto independente da Team Celeris, com dois aplicativos:
- `apps/store`: loja pública
- `apps/business`: painel administrativo

## Stack
- React + TypeScript + Vite
- pnpm workspaces
- Supabase (PostgreSQL, Auth, Edge Functions)
- Tailwind CSS e shadcn/ui podem ser adicionados na próxima etapa

## Requisitos
- Node.js 20+
- pnpm 9+
- Projeto Supabase próprio

## Instalação
```bash
pnpm install
cp apps/store/.env.example apps/store/.env
cp apps/business/.env.example apps/business/.env
pnpm dev:store
pnpm dev:business
```

Store: http://localhost:5173  
Business: http://localhost:5174

Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nos dois arquivos `.env`.

## Supabase
As migrations estão em `supabase/migrations/`. Aplique-as em ordem com:
```bash
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```
Ou execute os arquivos em ordem pelo SQL Editor do Supabase.

## Criar o primeiro superadministrador
1. Cadastre uma conta pela autenticação do Supabase.
2. Localize o UUID em Authentication > Users.
3. Execute no SQL Editor, substituindo o UUID:

```sql
insert into public.user_roles (user_id, role_id)
select 'UUID-DO-USUARIO'::uuid, id
from public.roles
where key = 'super_admin'
on conflict do nothing;
```

Não habilite cadastro público de administradores. A atribuição de cargos deve ser feita por um operador confiável no banco ou por uma Edge Function protegida.

## Segurança e limitações desta fundação
- Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- `anon` key é própria para frontend; RLS é obrigatória.
- O checkout e o webhook ainda não estão implementados nesta entrega.
- Não armazene dados de cartão. Use checkout/tokenização do provedor.
- Antes de produção, configure SMTP, URLs de redirect, domínio, políticas de backup e testes de segurança.

## Estrutura
```text
apps/
  store/
  business/
packages/
  supabase-client/
supabase/
  migrations/
  functions/
```
