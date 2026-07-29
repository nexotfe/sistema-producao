# Setup do Ambiente — Windows

Guia para preparar um computador Windows do zero para desenvolver no
NEXOTFE. Segue a ordem em que cada etapa depende da anterior.

As versões usadas como referência estão em
[VERSOES_OFICIAIS.md](VERSOES_OFICIAIS.md) — confirme com os comandos
`--version` de cada ferramenta em vez de presumir que o número ali
ainda bate, principalmente para pacotes do `package.json` fixados como
`"latest"`.

## 1. Requisitos

- Windows 10/11.
- Acesso de instalação de programas na máquina (não precisa ser
  administrador para Git/Node/VS Code, mas facilita).
- Conta com acesso ao repositório GitHub `nexotfe/sistema-producao`.
- Conta com acesso ao projeto Supabase vinculado (project ref
  `xttyiffmtsmraqroalrb`).
- Assinatura Claude.ai ativa, se for usar Claude Code neste ambiente.

## 2. Instalar Git

Baixar e instalar em <https://git-scm.com/download/win>. Aceitar os
padrões do instalador é suficiente para este projeto.

Confirmar após instalar:

```powershell
git --version
```

## 3. Instalar Node.js e npm

Baixar o instalador LTS ou a versão atual em
<https://nodejs.org/>. O npm já vem junto com o Node — não precisa
instalar separado.

Confirmar após instalar:

```powershell
node --version
npm --version
```

## 4. Instalar VS Code

Baixar em <https://code.visualstudio.com/>. Durante a instalação,
marcar a opção "Add to PATH" para poder abrir o editor com `code .` do
terminal.

Confirmar:

```powershell
code --version
```

### Extensões

O repositório não tem um `.vscode/extensions.json` com recomendações
oficiais — a lista abaixo é uma sugestão baseada na stack real do
projeto (Next.js + TypeScript + Tailwind + ESLint), não uma exigência
documentada. As extensões abaixo aumentam a produtividade, mas não são
obrigatórias para executar o projeto.

- ESLint (`dbaeumer.vscode-eslint`) — o projeto usa
  `eslint-config-next` via `eslint.config.mjs`.
- Tailwind CSS IntelliSense (`bradlc.vscode-tailwindcss`) — o projeto
  usa Tailwind (`tailwind.config.ts`).
- TypeScript já vem embutido no VS Code, não precisa de extensão
  adicional para o básico.

## 5. Clonar o repositório

```powershell
git clone https://github.com/nexotfe/sistema-producao.git
cd sistema-producao
```

## 6. Instalar as dependências do projeto

```powershell
npm install
```

## 7. Configurar `.env.local`

O arquivo `.env.local` **não** vem no Git (está no `.gitignore`) —
precisa ser criado manualmente na raiz do projeto, com estas três
variáveis:

| Variável | Onde obter |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → projeto → Project Settings → API → "Project URL" |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → projeto → Project Settings → API → "anon public" key |
| `DATABASE_URL` | Supabase Dashboard → projeto → Project Settings → Database → Connection string → aba **Session pooler** (não a de conexão direta — ver motivo em [TROUBLESHOOTING.md](TROUBLESHOOTING.md#2-conexão-direta-ao-postgres-do-supabase-falha-dbrefsupabaseco5432)) |

Nenhum valor real deve ser colado em documentação ou commitado — só
neste arquivo local.

## 8. Login no Supabase CLI

```powershell
npx supabase login
npx supabase link --project-ref xttyiffmtsmraqroalrb
```

(Esses dois comandos também existem como atalhos no `package.json`:
`npm run supabase:login` e `npm run supabase:link`.)

A sessão do CLI é por máquina — não vem junto quando você clona o
repositório ou dá `git pull` num computador novo. Precisa refazer esse
login sempre que trocar de máquina.

## 9. Iniciar o projeto

```powershell
npm run dev
```

Abre em `http://localhost:3000` por padrão.

## 10. Problemas conhecidos neste ambiente Windows

Só dois problemas reais já ocorreram e estão documentados com
sintoma/causa/solução completos em
[TROUBLESHOOTING.md](TROUBLESHOOTING.md):

1. Tela de reautenticação do Claude Code aparecendo no meio da sessão.
2. Conexão direta ao Postgres do Supabase falhando por causa de IPv6
   (resolvido usando o Session Pooler no `.env.local` e
   `supabase db query --linked` para queries via CLI).

Nenhum outro problema específico de Windows (bloqueio de scripts pelo
PowerShell, antivírus interferindo em `npm install`/`git`, etc.) foi
enfrentado de fato até agora. Não presuma que vai acontecer — se
acontecer, documente em TROUBLESHOOTING.md com o mesmo formato.
