-- ============================================================
-- Módulo de conteúdo (feed, story, reels) da Sala de Gestão
-- Texto: Gemini grátis (Poe só como reserva)
-- Imagem e vídeo: bots de mídia da Poe
-- ============================================================

create table if not exists public.gestao_conteudos (
  id uuid primary key default gen_random_uuid(),
  formato text not null default 'feed' check (formato in ('feed', 'story', 'reels')),
  tema text not null,
  briefing text,
  legenda text,
  hashtags text[] not null default '{}',
  roteiro text,
  texto_arte text,
  prompt_midia text,
  midia_path text,
  midia_tipo text check (midia_tipo in ('imagem', 'video')),
  modelo_texto text,
  modelo_midia text,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'gerando', 'pronto', 'aprovado', 'publicando', 'publicado', 'erro')),
  erro text,
  agendado_para timestamptz,
  publicado_em timestamptz,
  ig_media_id text,
  responsavel uuid,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists gestao_conteudos_status_idx on public.gestao_conteudos (status, criado_em desc);

alter table public.gestao_conteudos enable row level security;
drop policy if exists "equipe total" on public.gestao_conteudos;
create policy "equipe total" on public.gestao_conteudos for all to authenticated
  using (public.gestao_membro()) with check (public.gestao_membro());

-- Bots da Poe e identidade visual usados pelo agente
alter table public.gestao_agente_config
  add column if not exists bot_imagem text not null default 'Imagen-4',
  add column if not exists bot_video text not null default 'Veo-3.1',
  add column if not exists identidade_visual text;
update public.gestao_agente_config
  set identidade_visual = coalesce(identidade_visual,
    'Estética "Dark Sci-Fi Corporativo": fundo quase preto (#030305), luzes neon ciano e magenta, brilho direcional, visual tecnológico premium, tipografia geométrica. Sem textos longos na imagem.')
  where id = 'padrao';

-- Arquivos gerados (privado: só a equipe vê)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gestao-conteudo', 'gestao-conteudo', false, 52428800,
        array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

drop policy if exists "gestao conteudo equipe" on storage.objects;
create policy "gestao conteudo equipe" on storage.objects for all to authenticated
  using (bucket_id = 'gestao-conteudo' and public.gestao_membro())
  with check (bucket_id = 'gestao-conteudo' and public.gestao_membro());
