import { createClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------
   Banco da Sala de Gestão.
   A chave abaixo é a chave PÚBLICA (publishable) — ela pode ficar
   no código. Quem protege os dados são as regras (RLS) do banco:
   só e-mails liberados em "Equipe" enxergam qualquer coisa.
------------------------------------------------------------ */
export const SUPABASE_URL = "https://jfariprplbmuorzdhhav.supabase.co";
export const SUPABASE_KEY = "sb_publishable_ApxsX0JHvyhiRZTJcEXBbg_1UDZfQAD";

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "astrovia-gestao-auth" },
});

export const T = {
  equipe: "gestao_equipe",
  perfis: "gestao_perfis",
  clientes: "gestao_clientes",
  negocios: "gestao_negocios",
  projetos: "gestao_projetos",
  lancamentos: "gestao_lancamentos",
  tarefas: "gestao_tarefas",
  notas: "gestao_notas",
};
