-- Inteligência de prospecção: dossiê do lead (avaliações, site, dono, momento quente) e assistente de resposta
alter table public.gestao_prospects
  add column if not exists dono text,
  add column if not exists quente boolean not null default false,
  add column if not exists quente_motivo text,
  add column if not exists dossie jsonb,
  add column if not exists proposta jsonb,
  add column if not exists investigado_em timestamptz;

-- mensagens recebidas do lead e respostas sugeridas entram no histórico de abordagens
alter table public.gestao_abordagens drop constraint if exists gestao_abordagens_tipo_check;
alter table public.gestao_abordagens add constraint gestao_abordagens_tipo_check
  check (tipo in ('primeiro_contato', 'followup', 'recebida', 'resposta'));
