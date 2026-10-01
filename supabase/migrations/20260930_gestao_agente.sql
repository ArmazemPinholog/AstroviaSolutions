-- ============================================================
-- Agente de prospecção da Sala de Gestão Astrovia
-- Tudo prefixado com gestao_ e protegido por gestao_membro(),
-- para poder ser movido junto com o resto da sala para um
-- projeto Supabase próprio da Astrovia no futuro.
-- ============================================================

-- Leads garimpados (Google Maps, Instagram ou manual)
create table if not exists public.gestao_prospects (
  id uuid primary key default gen_random_uuid(),
  fonte text not null default 'manual' check (fonte in ('google', 'instagram', 'manual')),
  externo_id text,                 -- place_id do Google ou username do Instagram
  nome text not null,
  nicho text,
  cidade text,
  endereco text,
  telefone text,
  site text,
  instagram text,
  maps_url text,
  nota_google numeric,
  avaliacoes integer,
  seguidores integer,
  publicacoes integer,
  bio text,
  score integer not null default 0,
  motivos text[] not null default '{}',
  status text not null default 'novo' check (status in ('novo', 'abordado', 'respondeu', 'no_funil', 'descartado')),
  cliente_id uuid references public.gestao_clientes(id) on delete set null,
  negocio_id uuid references public.gestao_negocios(id) on delete set null,
  responsavel uuid,
  abordado_em timestamptz,
  raw jsonb,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  unique (fonte, externo_id)
);
create index if not exists gestao_prospects_status_idx on public.gestao_prospects (status, score desc);

-- Mensagens de abordagem geradas pela IA (histórico por lead)
create table if not exists public.gestao_abordagens (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.gestao_prospects(id) on delete cascade,
  cliente_id uuid references public.gestao_clientes(id) on delete cascade,
  canal text not null default 'instagram' check (canal in ('instagram', 'whatsapp', 'email')),
  tipo text not null default 'primeiro_contato' check (tipo in ('primeiro_contato', 'followup')),
  texto text not null,
  status text not null default 'rascunho' check (status in ('rascunho', 'enviada', 'descartada')),
  enviada_em timestamptz,
  modelo text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists gestao_abordagens_prospect_idx on public.gestao_abordagens (prospect_id, criado_em desc);

-- Configuração do agente (sem segredos: chaves ficam nos Secrets das Edge Functions)
create table if not exists public.gestao_agente_config (
  id text primary key default 'padrao' check (id = 'padrao'),
  oferta text,
  tom text,
  assinatura text,
  portfolio_url text,
  nichos text[] not null default '{}',
  cidade_padrao text,
  followup_dias integer not null default 3,
  atualizado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
insert into public.gestao_agente_config (id, oferta, tom, assinatura, portfolio_url, nichos, cidade_padrao)
values (
  'padrao',
  'Sistemas de agendamento e gestão, sites e automações com IA para pequenos negócios. Temos demos prontas para barbearias (Barber Berserker) e clínicas de estética (LUXE).',
  'Próximo, direto e respeitoso. Nada de texto de vendedor. Mensagem curta, de dono pra dono.',
  'Christian · Astrovia Solutions',
  'https://astrovia-solutions.vercel.app',
  array['barbearia', 'clínica de estética', 'salão de beleza', 'brechó'],
  'Curitiba, PR'
)
on conflict (id) do nothing;

alter table public.gestao_prospects enable row level security;
alter table public.gestao_abordagens enable row level security;
alter table public.gestao_agente_config enable row level security;

drop policy if exists "equipe total" on public.gestao_prospects;
create policy "equipe total" on public.gestao_prospects for all to authenticated
  using (public.gestao_membro()) with check (public.gestao_membro());
drop policy if exists "equipe total" on public.gestao_abordagens;
create policy "equipe total" on public.gestao_abordagens for all to authenticated
  using (public.gestao_membro()) with check (public.gestao_membro());
drop policy if exists "equipe total" on public.gestao_agente_config;
create policy "equipe total" on public.gestao_agente_config for all to authenticated
  using (public.gestao_membro()) with check (public.gestao_membro());
