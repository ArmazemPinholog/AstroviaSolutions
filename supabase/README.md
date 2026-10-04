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

## Astra · prospecção autônoma (semana 1)

Migração `20261005_astra_rotina.sql`. Nada é enviado a lead nenhum sem aprovação: tudo vira rascunho em **Astra → Aprovar envios**.

| Peça | Como funciona |
|---|---|
| Rotina diária | `pg_cron` (job `astra-rotina-diaria`) chama `gestao-agente` com a ação `rotina` a cada 5 min das 6h às 8h55 (Brasília). Cada rodada faz um pedaço: follow-ups de quem não respondeu em 3 dias, depois leads novos (garimpa no Google Maps quando faltam, investiga e escreve) até a meta do dia (padrão 10). No fim avisa na conversa da Astra. Diário em `astra_rotinas`. |
| Ajustes da rotina | Astra → Resultados (ligar/desligar, leads por dia, nota mínima, follow-ups) ou `gestao_agente_config.prefs.rotina` (`ativa`, `meta`, `nota_min`, `followups`, `max_followups`, `garimpos_dia`, `nichos`). |
| Chaves internas | Ficam só no Vault: `astra_chave_rotina` (só a ação `rotina`) e `astra_chave_cnpj` (só `importar_cnpj`). A função compara em tempo constante e usa o service role só nessas ações. Para trocar: `update vault.secrets set secret = encode(gen_random_bytes(32),'hex') where name = '...'` (e atualize o secret do GitHub no caso da `astra_chave_cnpj`). |
| CNPJs novos | `.github/workflows/cnpj-novos.yml` (dias 5 e 20) roda `scripts/cnpj_novos.py`: baixa os dados abertos do CNPJ da Receita, filtra Curitiba + clínicas, salões, barbearias e oficinas abertos nos últimos 90 dias e manda para `importar_cnpj`. CPF de MEI é removido; só o primeiro nome vira "dono". Precisa do secret `ASTRA_CHAVE_CNPJ` no GitHub (valor: `select decrypted_secret from vault.decrypted_secrets where name = 'astra_chave_cnpj';`). O servidor da Receita **recusa conexões de fora do Brasil**, então o job precisa rodar numa máquina no Brasil: registre um runner próprio (Settings → Actions → Runners) e crie a variável `CNPJ_RUNNER` com o rótulo dele; sem ela o agendamento fica parado. Alternativa simples: rodar no seu PC (abaixo). Se a Receita mudar o endereço, use as variáveis `RECEITA_BASE` ou `RECEITA_SHARE`. |
| Motor de IA | `gestao-agente` usa o Claude quando há `ANTHROPIC_API_KEY`: Sonnet 5.5 escreve (mensagens, respostas, conteúdo) e Haiku 4.5 monta o dossiê. Gemini e Poe ficam de reserva. Opcional: `CLAUDE_MODEL`, `CLAUDE_MODEL_ANALISE`. |
| Painel | Astra → Resultados: leads (por fonte), abordados, respostas, reuniões, funil e o diário da rotina. |

### CNPJs novos rodando no seu PC (Windows)
Precisa só do Python 3. No PowerShell, uma vez:
```powershell
setx ASTRA_CHAVE_CNPJ "<valor da astra_chave_cnpj>"
schtasks /create /tn "Astra CNPJs novos" /sc monthly /d 20 /st 07:30 /tr "py C:\caminho\AstroviaSolutions\scripts\cnpj_novos.py"
```
Teste antes com `py scripts\cnpj_novos.py --teste` (só conta, não envia).

### Publicar as funções
O repositório é público, então as funções podem ser publicadas com um `index.ts` de uma linha que importa o código
deste repositório **fixado num commit** (o bundle é montado na hora do deploy; nada é buscado em tempo de execução):

```ts
import "https://raw.githubusercontent.com/ArmazemPinholog/AstroviaSolutions/<sha-do-commit>/supabase/functions/gestao-agente/index.ts";
```

Ou, com a CLI: `supabase functions deploy gestao-agente --no-verify-jwt` e `supabase functions deploy astra --no-verify-jwt`.
