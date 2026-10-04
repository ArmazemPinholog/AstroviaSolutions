-- Astra: inteligência de atendimento e consciência da Astrovia, dentro da Sala de Gestão.
-- Tudo com prefixo astra_. Leitura/edição pela equipe (gestao_membro()); escrita automática só pela Edge Function (service role).

create table public.astra_tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  nome text not null,
  persona text not null,
  base_conhecimento text not null,
  config jsonb not null default '{}',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.astra_contatos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.astra_tenants(id) on delete cascade,
  canal text not null check (canal in ('whatsapp','instagram','web','email','interno')),
  externo_id text not null,
  nome text,
  status text not null default 'novo' check (status in ('novo','em_conversa','qualificado','reuniao','cliente','perdido')),
  segmento text, interesse text,
  prioridade text check (prioridade in ('alta','media','baixa')),
  pontuacao int check (pontuacao between 0 and 100),
  pais text, idioma text, escopo text, resumo text, origem text,
  handoff boolean not null default false, handoff_motivo text,
  cliente_id uuid references public.gestao_clientes(id) on delete set null,
  negocio_id uuid references public.gestao_negocios(id) on delete set null,
  prospect_id uuid references public.gestao_prospects(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, canal, externo_id)
);
create index astra_contatos_tenant_idx on public.astra_contatos (tenant_id, atualizado_em desc);

create table public.astra_mensagens (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.astra_tenants(id) on delete cascade,
  contato_id uuid not null references public.astra_contatos(id) on delete cascade,
  papel text not null check (papel in ('cliente','agente','equipe')),
  conteudo text not null,
  criado_em timestamptz not null default now()
);
create index astra_mensagens_contato_idx on public.astra_mensagens (contato_id, criado_em desc);

create table public.astra_reunioes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.astra_tenants(id) on delete cascade,
  contato_id uuid not null references public.astra_contatos(id) on delete cascade,
  inicio timestamptz not null, fim timestamptz not null,
  status text not null default 'marcada' check (status in ('marcada','cancelada','realizada','faltou')),
  email_cliente text, link text, google_event_id text,
  lembrete_24h_enviado boolean not null default false,
  lembrete_1h_enviado boolean not null default false,
  criado_em timestamptz not null default now(),
  check (fim > inicio)
);
create index astra_reunioes_idx on public.astra_reunioes (tenant_id, inicio);

create table public.astra_lacunas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.astra_tenants(id) on delete cascade,
  contato_id uuid references public.astra_contatos(id) on delete set null,
  pergunta text not null, resposta text,
  status text not null default 'pendente' check (status in ('pendente','respondida','descartada')),
  criado_em timestamptz not null default now()
);

create table public.astra_feedbacks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.astra_tenants(id) on delete cascade,
  contato_id uuid references public.astra_contatos(id) on delete set null,
  resposta_ia text not null,
  avaliacao text not null check (avaliacao in ('boa','ruim')),
  correcao text,
  status text not null default 'pendente' check (status in ('pendente','aplicado','descartado')),
  criado_em timestamptz not null default now()
);

create table public.astra_conhecimento (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.astra_tenants(id) on delete cascade,
  tipo text not null default 'informacao' check (tipo in ('regra','informacao','preco','resposta','tom')),
  conteudo text not null check (char_length(conteudo) between 3 and 1500),
  origem text not null default 'dono' check (origem in ('dono','lacuna','feedback','painel')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  desativado_em timestamptz
);
create index astra_conhecimento_idx on public.astra_conhecimento (tenant_id, ativo, criado_em);

create table public.astra_simulacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.astra_tenants(id) on delete cascade,
  persona text not null, transcricao jsonb not null,
  nota int check (nota between 0 and 100), avaliacao text,
  criado_em timestamptz not null default now()
);

create table public.astra_processadas (
  externo_id text primary key,
  criado_em timestamptz not null default now()
);

alter table public.astra_tenants enable row level security;
alter table public.astra_contatos enable row level security;
alter table public.astra_mensagens enable row level security;
alter table public.astra_reunioes enable row level security;
alter table public.astra_lacunas enable row level security;
alter table public.astra_feedbacks enable row level security;
alter table public.astra_conhecimento enable row level security;
alter table public.astra_simulacoes enable row level security;
alter table public.astra_processadas enable row level security; -- sem policy: só service role

-- equipe da sala: lê tudo; ajusta o que faz sentido no painel
create policy "equipe le" on public.astra_tenants for select to authenticated using (public.gestao_membro());
create policy "admin edita" on public.astra_tenants for update to authenticated using (public.gestao_admin()) with check (public.gestao_admin());
create policy "equipe le" on public.astra_contatos for select to authenticated using (public.gestao_membro());
create policy "equipe edita" on public.astra_contatos for update to authenticated using (public.gestao_membro()) with check (public.gestao_membro());
create policy "equipe le" on public.astra_mensagens for select to authenticated using (public.gestao_membro());
create policy "equipe responde" on public.astra_mensagens for insert to authenticated with check (public.gestao_membro() and papel = 'equipe');
create policy "equipe le" on public.astra_reunioes for select to authenticated using (public.gestao_membro());
create policy "equipe edita" on public.astra_reunioes for update to authenticated using (public.gestao_membro()) with check (public.gestao_membro());
create policy "equipe le" on public.astra_lacunas for select to authenticated using (public.gestao_membro());
create policy "equipe edita" on public.astra_lacunas for update to authenticated using (public.gestao_membro()) with check (public.gestao_membro());
create policy "equipe le" on public.astra_feedbacks for select to authenticated using (public.gestao_membro());
create policy "equipe edita" on public.astra_feedbacks for update to authenticated using (public.gestao_membro()) with check (public.gestao_membro());
create policy "equipe le" on public.astra_conhecimento for select to authenticated using (public.gestao_membro());
create policy "equipe ensina" on public.astra_conhecimento for insert to authenticated with check (public.gestao_membro() and origem = 'painel');
create policy "equipe edita" on public.astra_conhecimento for update to authenticated using (public.gestao_membro()) with check (public.gestao_membro());
create policy "equipe le" on public.astra_simulacoes for select to authenticated using (public.gestao_membro());

-- funções auxiliares (só a Edge Function chama)
create or replace function public.astra_segredo(nome text)
returns text language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = nome limit 1;
$$;
create or replace function public.astra_msgs_recentes(c uuid, minutos int)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.astra_mensagens
  where contato_id = c and papel = 'cliente' and criado_em > now() - make_interval(mins => minutos);
$$;
create or replace function public.astra_limpar_processadas()
returns void language sql security definer set search_path = public as $$
  delete from public.astra_processadas where criado_em < now() - interval '7 days';
$$;
revoke all on function public.astra_segredo(text) from public, anon, authenticated;
revoke all on function public.astra_msgs_recentes(uuid, int) from public, anon, authenticated;
revoke all on function public.astra_limpar_processadas() from public, anon, authenticated;
grant execute on function public.astra_segredo(text) to service_role;
grant execute on function public.astra_msgs_recentes(uuid, int) to service_role;
grant execute on function public.astra_limpar_processadas() to service_role;
