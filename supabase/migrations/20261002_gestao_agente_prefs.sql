-- Preferências de geração da IA (tamanho, tom, CTA, palavras proibidas, exemplos, ofertas por nicho...)
alter table public.gestao_agente_config add column if not exists prefs jsonb not null default '{}'::jsonb;
comment on column public.gestao_agente_config.prefs is 'Preferências de geração da IA: tamanho, formalidade, emoji, cta, sempre, nunca, exemplos, criatividade, ofertas_nicho[], extra';
