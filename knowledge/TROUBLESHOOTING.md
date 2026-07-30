# Troubleshooting — NEXOTFE

Problemas reais já enfrentados no ambiente de desenvolvimento deste
projeto, com a solução real que funcionou — não uma lista genérica de
"possíveis problemas". Formato: Problema → Sintoma → Causa → Solução.

Ao encontrar um problema novo e real, adicione uma seção nova aqui
nesse mesmo formato, em vez de guardar a solução só na conversa.

---

## 1. Tela de reautenticação do Claude Code aparecendo no meio do trabalho

**Sintoma:** durante a sessão, a interface do Claude Code passa a
exibir uma tela pedindo login/autenticação em vez de continuar
respondendo normalmente.

**Causa:** expiração da sessão de autenticação da assinatura
Claude.ai vinculada ao Claude Code — não é um erro de configuração do
projeto nem do ambiente Windows.

**Solução real usada:** clicar em "Claude.ai Subscription" na tela
exibida e reautenticar pelo navegador. Nenhum comando de terminal foi
necessário — é só o fluxo de login padrão.

---

## 2. Conexão direta ao Postgres do Supabase falha (`db.<ref>.supabase.co:5432`)

**Sintoma:** conexão direta ao banco usando o host padrão
`db.xttyiffmtsmraqroalrb.supabase.co` na porta `5432` falha a partir
desta máquina Windows.

**Causa:** esse host de conexão direta do Supabase resolve apenas em
IPv6, e a rede desta máquina/rede local não tem saída IPv6 funcional
para ele — não é um problema de credencial nem de projeto Supabase mal
configurado.

**Solução real usada:** duas partes.

1. Para a `DATABASE_URL` usada pela aplicação/ferramentas locais: trocar
   o host de conexão direta pelo **Session Pooler** do Supabase, que
   responde em IPv4 (Dashboard → Project Settings → Database →
   Connection string → aba "Session pooler"). É essa string, não a de
   conexão direta, que deve ir no `.env.local`.
2. Para queries administrativas/verificação via CLI, sem depender da
   `DATABASE_URL` do app: usar `supabase db query --linked`, que passa
   pela infraestrutura de conexão do próprio CLI (já autenticado via
   `supabase login` e `supabase link`) em vez de abrir uma conexão TCP
   direta ao host IPv6. Essa é a via mencionada na Regra 9 do
   `CLAUDE.md` para escrita/leitura de verificação em produção.

**Nota:** por causa disso, sempre que este projeto for aberto num
computador novo, a etapa de configurar `DATABASE_URL` precisa
explicitamente pegar a connection string do **Session Pooler**, não a
de conexão direta que o Dashboard mostra por padrão. Ver
[SETUP_WINDOWS.md](SETUP_WINDOWS.md).

---

## 3. Tabela de controle de migrations do Supabase dessincronizada do schema real

**Sintoma:** `supabase migration list --linked` mostra 74 migrations
como "pendentes" (coluna `Remote` vazia) — de `202606140001` até a
mais recente da época (`202607300001`) — como se nada desse período
tivesse sido aplicado ao banco remoto.

**Causa real, confirmada por leitura direta (não presumida):** os
objetos dessas migrations **existem de verdade** no banco remoto —
confirmado consultando `information_schema.tables`/`.columns` para
tabelas de várias migrations diferentes ao longo do período (ex:
`simulacoes_comerciais`, `ordens_fabricacao`, `usuarios`,
`projetos.desconto_percentual`, todas presentes). O problema é só a
tabela de controle `supabase_migrations.schema_migrations`, que parou
de registrar entradas novas depois de `202606050037` — 73 migrations
reais foram aplicadas em algum momento sem deixar registro nela. A
causa raiz de *por que* isso parou de registrar não foi investigada —
decisão explícita, tratada como projeto separado (ver regra
permanente abaixo).

Das 74 migrations que apareciam como "pendentes", 73 já existiam de
verdade no banco (esse é o problema descrito acima). A 74ª,
`202607300001`, era diferente: essa sim era genuinamente nova, nunca
aplicada antes — por isso não entrou no `migration repair` em massa,
e seguiu o fluxo descrito em "Solução real usada" abaixo (aplicação
manual + verificação + `repair` só dela).

**Risco real que isso cria:** rodar `supabase db push --linked` tenta
reexecutar as 73 migrations "pendentes" antes de aplicar qualquer
migration nova — a maioria não tem proteção `IF NOT EXISTS`
(`create policy`, `alter table add column`, `create unique index`),
então falharia por objeto duplicado. Na melhor hipótese isso só
interrompe o push cedo; não é um caminho seguro para aplicar uma
migration nova enquanto essa dívida não for resolvida.

**Solução real usada, para a migration `202607300001` (RPC v2 de
aprovação):**

1. SQL aplicado manualmente pelo usuário, direto no SQL Editor do
   Supabase Dashboard — nunca via `db push`.
2. Verificação por leitura (`supabase db query --linked`, só
   `SELECT`) confirmando que colunas, índice, function e grants
   ficaram exatamente como esperado.
3. Só depois da verificação: `supabase migration repair 202607300001
   --status applied --linked` — registra só essa versão específica na
   tabela de controle, sem tocar nas outras 73.

**Regra permanente, para não ser esquecida:** `supabase db push`
fica **proibido** para qualquer migration nova neste projeto até a
dívida das 73 migrations antigas dessincronizadas ser investigada e
resolvida como projeto próprio, separado desta entrega. Enquanto essa
decisão não for tomada, toda migration nova segue o mesmo padrão
manual usado na `202607300001`: aplicar via SQL Editor, verificar por
leitura, reparar só a versão específica com `migration repair`.

---

## Problemas ainda não observados

Nenhum outro incidente real de ambiente Windows (PowerShell bloqueando
execução de scripts, antivírus interferindo em `npm install`/`git`,
etc.) ocorreu até a data deste documento (2026-07-29). Se isso
acontecer no futuro, documentar aqui com o mesmo formato acima — não
adicionar esses cenários como hipotéticos antes de acontecerem de
verdade.
