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

## Problemas ainda não observados

Nenhum outro incidente real de ambiente Windows (PowerShell bloqueando
execução de scripts, antivírus interferindo em `npm install`/`git`,
etc.) ocorreu até a data deste documento (2026-07-29). Se isso
acontecer no futuro, documentar aqui com o mesmo formato acima — não
adicionar esses cenários como hipotéticos antes de acontecerem de
verdade.
