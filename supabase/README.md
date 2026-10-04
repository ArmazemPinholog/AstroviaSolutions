# Sala de Gestão — banco e agente de prospecção

Tudo da sala usa tabelas `gestao_*`, as funções `gestao_membro()`, `gestao_admin()`,
`gestao_status()` e `gestao_ativar()`, e a Edge Function `gestao-agente`.
Hoje esses recursos ficam no projeto Supabase **Lobas-brecho**.

## Chaves do agente (Secrets)

Supabase → projeto → **Edge Functions → Secrets → Add new secret**.

| Secret | Para quê | Onde conseguir |
|---|---|---|
| `GEMINI_API_KEY` | Escrever as mensagens (grátis) | aistudio.google.com → Get API key |
| `GOOGLE_PLACES_KEY` | Garimpar no Google Maps | console.cloud.google.com → ativar **Places API (New)** → Credenciais → Chave de API (restrinja à Places API) |
| `IG_ACCESS_TOKEN` | Garimpar no Instagram | Token de longa duração do app Meta (Facebook Login) |
| `IG_USER_ID` | Garimpar no Instagram | ID da conta Instagram Business da Astrovia |
| `POE_API_KEY` | Imagens e vídeos (feed, story, reels) e reserva de texto. Gasta pontos da assinatura | poe.com/api/keys |
| `POE_MODEL` | Opcional: bot de texto usado só quando o Gemini falha | Padrão `Claude-Sonnet-4.6` |
| `GEMINI_MODEL` | Opcional | Padrão `gemini-2.5-flash` |
| `IG_GRAPH_VERSION` | Opcional | Padrão `v25.0` |

### Quem faz o quê
- **Texto** (abordagens, legendas, hashtags, roteiros): sempre o **Gemini grátis**. A Poe só
  escreve quando o Gemini bate o limite ou dá erro.
- **Imagem e vídeo** (aba Conteúdo): bots de mídia da **Poe**. Os bots são escolhidos em
  **Conteúdo → Estúdio** (padrão `Imagen-4` para imagem e `Veo-3.1` para vídeo), com a identidade visual da Astrovia.
- Cada mensagem e cada mídia mostra qual IA gerou, pra você acompanhar o gasto de pontos.

A mídia é gerada em segundo plano. No plano gratuito do Supabase, uma função roda no máximo
~150 segundos: imagens cabem com folga, mas um vídeo longo pode estourar esse tempo. Se o
card ficar em "Erro" por tempo, use um bot de vídeo mais rápido ou um vídeo mais curto.

Depois de salvar, as bolinhas **Gemini / Poe / Google / Instagram** na aba Prospecção ficam verdes.

### Instagram (Graph API)
1. A conta @ da Astrovia precisa ser **Comercial** e estar ligada a uma **Página do Facebook**.
2. developers.facebook.com → criar app (tipo Business) → adicionar **Instagram Graph API** com **Facebook Login**.
3. Permissões: `instagram_basic`, `pages_show_list`, `pages_read_engagement`, `instagram_manage_comments`
   (a Meta pede as duas últimas para busca por hashtag) e `instagram_content_publish` (para publicar
   feed, story e reels direto da aba Conteúdo).
4. Gere o token no Graph API Explorer, troque por um **token de longa duração** (60 dias) e pegue o
   `instagram_business_account.id` da sua Página → esse é o `IG_USER_ID`.
5. O token vence em 60 dias: renove e atualize o secret.

Limites: 30 hashtags diferentes por semana e cerca de 200 chamadas por hora.
A busca por hashtag não mostra quem postou, então o agente aproveita os @ citados nas legendas.
Perfis pessoais não aparecem no Business Discovery.

## Mudar a sala para um projeto próprio da Astrovia

1. Crie o projeto novo no Supabase.
2. No SQL Editor do projeto **antigo**, exporte os dados das tabelas `gestao_*` (ou use `pg_dump -t 'public.gestao_*'`).
3. No projeto **novo**, recrie a estrutura base da sala (tabelas `gestao_*` + funções `gestao_*`)
   e rode `migrations/20260930_gestao_agente.sql` e `migrations/20260930_gestao_conteudo.sql`
   (este cria também o bucket privado `gestao-conteudo`; copie os arquivos dele junto).
4. Importe os dados, na ordem: equipe → perfis → clientes → negócios → projetos → lançamentos →
   tarefas → notas → prospects → abordagens → agente_config → conteudos.
5. Crie os usuários de novo em **Authentication** (os IDs mudam; atualize `gestao_perfis.id` e os campos `responsavel`).
6. Publique a função: `supabase functions deploy gestao-agente --no-verify-jwt`
   (a própria função confere login e se a pessoa é da equipe) e recadastre os Secrets.
7. Na Vercel, em **Settings → Environment Variables**, crie:
   - `VITE_GESTAO_SUPABASE_URL` = URL do projeto novo
   - `VITE_GESTAO_SUPABASE_KEY` = chave publishable do projeto novo
   e faça um novo deploy. O código não precisa mudar.
8. Depois de conferir tudo, apague as tabelas `gestao_*` e a função do projeto da Lobas.

## Astra — a inteligência da Astrovia

Tabelas `astra_*` (migração `20261004_astra.sql`) e a Edge Function `astra` (`verify_jwt: false`, com autenticação própria).
A aba **Astra** da sala conversa com ela no modo dono (login da sala), testa o atendimento e guarda os ajustes.

| Entrada | Quem pode |
|---|---|
| Sala de Gestão (login) | Membros da equipe: modo dono, testes, feedback |
| WhatsApp oficial (webhook assinado pela Meta) | Clientes → atendimento; número salvo no perfil de alguém da equipe → modo dono |
| `x-demo-key` | Chat público de demonstração (opcional) |

| Secret | Para quê |
|---|---|
| `GEMINI_API_KEY` | Já existe; a Astra usa a mesma |
| `WA_TOKEN`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN` | Ligar o WhatsApp oficial (Meta) |
| `DEMO_KEY` | Opcional: chat público no site |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Opcional: agenda no Google Agenda |
| `ORIGENS_PERMITIDAS` | Opcional: domínios que podem chamar a função pelo navegador |
