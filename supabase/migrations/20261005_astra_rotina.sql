-- ============================================================
-- Astra · semana 1: rotina diária autônoma, follow-ups, CNPJs novos e painel
--
-- • pg_cron + pg_net disparam a função gestao-agente toda manhã com uma chave interna.
-- • As chaves internas ficam só no Vault (nunca no código): a função lê pelo
--   astra_segredo() com o service role e compara em tempo constante.
--   - astra_chave_rotina → só a ação "rotina" (cron do banco)
--   - astra_chave_cnpj   → só a ação "importar_cnpj" (GitHub Actions, dados abertos da Receita)
-- • Nada é enviado a lead nenhum: a rotina só deixa rascunhos em "Aprovar envios".
-- Não toca em nenhuma tabela da Lobas.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- chaves internas (geradas aqui, guardadas criptografadas no Vault)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'astra_chave_rotina') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'astra_chave_rotina', 'Chave interna da rotina diária da Astra (pg_cron → gestao-agente)');
  end if;
  if not exists (select 1 from vault.secrets where name = 'astra_chave_cnpj') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'astra_chave_cnpj', 'Chave do importador de CNPJs novos (GitHub Actions → gestao-agente)');
  end if;
  if not exists (select 1 from vault.secrets where name = 'astra_url_funcoes') then
    perform vault.create_secret('https://jfariprplbmuorzdhhav.supabase.co/functions/v1', 'astra_url_funcoes', 'Endereço das Edge Functions');
  end if;
end $$;

-- nova fonte de leads: CNPJs recém-abertos (dados abertos da Receita Federal)
alter table public.gestao_prospects drop constraint if exists gestao_prospects_fonte_check;
alter table public.gestao_prospects add constraint gestao_prospects_fonte_check
  check (fonte in ('google', 'instagram', 'manual', 'receita'));
alter table public.gestao_prospects
  add column if not exists cnpj text,
  add column if not exists aberto_em date,
  add column if not exists email text;
create index if not exists gestao_prospects_telefone_idx on public.gestao_prospects (telefone) where telefone is not null;

-- de onde veio cada mensagem (rotina automática ou pedido manual) → painel de resultados
alter table public.gestao_abordagens add column if not exists origem text;
create index if not exists gestao_abordagens_status_idx on public.gestao_abordagens (status, tipo, criado_em desc);

-- diário da rotina (um registro por dia)
create table if not exists public.astra_rotinas (
  dia date primary key,
  status text not null default 'rodando' check (status in ('rodando', 'concluida', 'parcial', 'erro')),
  leads_preparados int not null default 0,
  followups int not null default 0,
  garimpos int not null default 0,
  rodadas int not null default 0,
  ocupada_ate timestamptz,
  avisado boolean not null default false,
  detalhes jsonb not null default '{}',
  erro text,
  iniciado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.astra_rotinas enable row level security;
drop policy if exists "equipe le" on public.astra_rotinas;
create policy "equipe le" on public.astra_rotinas for select to authenticated using (public.gestao_membro());

-- dispara a rotina (só o cron e o service role chamam)
create or replace function public.astra_disparar_rotina()
returns bigint language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  url text := (select decrypted_secret from vault.decrypted_secrets where name = 'astra_url_funcoes' limit 1);
  chave text := (select decrypted_secret from vault.decrypted_secrets where name = 'astra_chave_rotina' limit 1);
begin
  if url is null or chave is null then
    raise exception 'astra: chave ou url ausente no Vault';
  end if;
  return net.http_post(
    url := url || '/gestao-agente',
    body := jsonb_build_object('acao', 'rotina'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-astra-chave', chave),
    timeout_milliseconds := 10000
  );
end $$;
revoke all on function public.astra_disparar_rotina() from public, anon, authenticated;
grant execute on function public.astra_disparar_rotina() to service_role;

-- toda manhã, das 6h às 8h55 (Brasília, UTC-3), a cada 5 minutos: cada rodada faz um pedaço
-- (garimpar, investigar, escrever) até chegar na meta do dia; depois as rodadas só conferem e saem.
select cron.unschedule(jobid) from cron.job where jobname in ('astra-rotina-diaria', 'astra-limpeza');
select cron.schedule('astra-rotina-diaria', '*/5 9-11 * * *', $$select public.astra_disparar_rotina()$$);
select cron.schedule('astra-limpeza', '17 6 * * *', $$select public.astra_limpar_processadas(); delete from net._http_response where created < now() - interval '3 days'$$);
