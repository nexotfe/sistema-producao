# PAD-006 — Sistema de Temas (Claro/Escuro/Sistema)

**Data:** 2026-07-23
**Versão:** 1.0
**Status:** Vigente
**Natureza do documento:** arquitetura permanente — regras, tokens e
mecanismo técnico, sem referência a componentes ou telas específicas
(isso é papel de PAD-007 e PAD-008). Os valores hexadecimais registrados
aqui são referência de trabalho, não identidade visual travada — ver
seção 2.

---

## 1. Estado atual investigado (ponto de partida)

- Tailwind CSS `^3.4.17`. `darkMode` não está configurado em
  `tailwind.config.ts` (o padrão do Tailwind 3 quando omitido é
  `'media'`) — irrelevante na prática porque **nenhuma classe `dark:`
  existe no projeto hoje**.
- `src/app/globals.css` declara `:root { color-scheme: light; }` e
  hardcoda `body { background: #edf1f5; color: #0f172a; }` — a
  aplicação é hoje 100% clara, sem nenhuma implementação de tema
  (completa, parcial ou abandonada).
- Os únicos tokens de cor existentes hoje são dois, estendidos em
  `tailwind.config.ts`: `app-bg` (`#EDF1F5`) e `app-card` (`#FAFBFC`).
  O restante da paleta usa classes literais do Tailwind (`slate-*`,
  `blue-*`, `emerald-*`, `amber-*`, `red-*`) ou hex hardcoded inline —
  notadamente `bg-[#0B1B2B]`, o cabeçalho escuro, duplicado em **28
  arquivos** de módulos diferentes (não é uma particularidade de
  Recursos Produtivos).
- Não existe shell/nav global persistente em `layout.tsx` — cada
  módulo desenha seu próprio cabeçalho. Isso significa que **onde vive
  o controle de alternância de tema não está decidido por este
  documento** — depende de um primitivo de UI (Button/toggle) que é
  escopo de PAD-007, não deste PAD.

---

## 2. Paleta — grafite, azul, branco

Os valores abaixo são **referência de trabalho para o piloto**, não
identidade fechada. A proposta utiliza provisoriamente o `#0B1B2B`
como referência por já ser a cor institucional predominante do
projeto (usada hoje em 28 arquivos como cabeçalho escuro). A definição
final da paleta será validada visualmente durante o piloto do módulo
Recursos Produtivos — qualquer hex deste documento pode ser ajustado
nesse momento sem precisar reabrir este PAD, desde que a estrutura de
tokens (seção 3) seja preservada.

**Modo Claro**

| Token | Valor | Uso |
|---|---|---|
| `background` | `#EDF1F5` | fundo da aplicação (mantém o `app-bg` atual) |
| `surface` | `#FAFBFC` | cards (mantém o `app-card` atual) |
| `surface-elevated` | `#FFFFFF` | modais, dropdowns |
| `border` | `#E2E8F0` | borda padrão |
| `border-subtle` | `#F1F5F9` | divisórias internas |
| `text-primary` | `#0F172A` | texto principal |
| `text-secondary` | `#64748B` | texto de apoio, labels |
| `text-disabled` | `#94A3B8` | campos/itens desabilitados |
| `action-primary` | `#2563EB` | botão/ação primária |
| `action-primary-hover` | `#1D4ED8` | hover (mais escuro) |
| `focus-ring` | `#60A5FA` a 40% opacidade | anel de foco |
| `status-success` | texto `#047857` / fundo `#ECFDF5` / borda `#A7F3D0` | |
| `status-warning` | texto `#92400E` / fundo `#FFFBEB` / borda `#FDE68A` | |
| `status-danger` | texto `#DC2626` / fundo `#FEF2F2` / borda `#FECACA` | |
| `status-info` | texto `#1D4ED8` / fundo `#EFF6FF` / borda `#BFDBFE` | |

**Modo Escuro** (ancorado no `#0B1B2B` já existente como cor
institucional — não é um tom novo inventado)

| Token | Valor | Uso |
|---|---|---|
| `background` | `#0A1420` | fundo da aplicação |
| `surface` | `#0B1B2B` | cards — o próprio tom já usado hoje no cabeçalho |
| `surface-elevated` | `#16273D` | modais, dropdowns |
| `border` | `#28405C` | precisa contraste claro contra a surface |
| `border-subtle` | `#1B2C40` | |
| `text-primary` | `#F1F5F9` | quase-branco, não branco puro |
| `text-secondary` | `#A9B8CC` | mais claro que o `slate-400` padrão — texto secundário é o ponto onde a maioria das implementações de dark mode fica fraca demais |
| `text-disabled` | `#5B7086` | |
| `action-primary` | `#3B82F6` | mais claro que o modo claro — azul saturado escurece mal sobre fundo escuro |
| `action-primary-hover` | `#60A5FA` | hover mais claro (invertido em relação ao modo claro) |
| `focus-ring` | `#60A5FA` a 55% opacidade | mais opaco que no claro |
| `status-success` | texto `#34D399` / fundo `rgba(16,185,129,.12)` / borda `rgba(16,185,129,.4)` | |
| `status-warning` | texto `#FBBF24` / fundo `rgba(245,158,11,.12)` / borda `rgba(245,158,11,.4)` | |
| `status-danger` | texto `#F87171` / fundo `rgba(239,68,68,.12)` / borda `rgba(239,68,68,.4)` | |
| `status-info` | texto `#60A5FA` / fundo `rgba(59,130,246,.12)` / borda `rgba(59,130,246,.4)` | |

**Acessibilidade — decisões deliberadas:**
- Estados de erro/sucesso/aviso usam texto + fundo + borda da mesma
  família (nunca só a cor do texto), replicado no escuro com fundos
  translúcidos em vez de sólidos pálidos.
- Foco por teclado usa anel (`focus-visible:ring`), não só mudança de
  cor.
- Desabilitado usa fundo + cursor + opacidade combinados, não só texto
  acinzentado.
- **Ressalva registrada:** os valores acima são estimativa de boa-fé,
  não foram validados com uma ferramenta de contraste dedicada.
  Recomenda-se validar `text-secondary` sobre `surface` em ambos os
  modos antes de considerar a paleta definitiva — essa validação faz
  parte do piloto (seção 5).

---

## 3. Tokens

Nomes semânticos, nunca ligados diretamente à cor: `background`,
`surface`, `surface-elevated`, `border`, `border-subtle`,
`text-primary`, `text-secondary`, `text-disabled`, `action-primary`,
`action-primary-hover`, `focus-ring`, `status-success/warning/danger/info`
(cada um com variante `-text`/`-bg`/`-border`). Componentes consomem o
nome semântico do token, nunca um valor de paleta Tailwind literal
(`slate-900`) nem um hex direto.

---

## 4. Mecanismo técnico

CSS custom properties em cascata de 3 camadas:

```
:root                                    { /* tokens modo claro (padrão) */ }
@media (prefers-color-scheme: dark)      { :root { /* tokens modo escuro */ } }
:root[data-theme="dark"]                 { /* força escuro, vence a media query */ }
:root[data-theme="light"]                { /* força claro, vence a media query */ }
```

- Sem atributo `data-theme` → segue o sistema operacional
  automaticamente via CSS puro (cobre o modo "Sistema" sem JS).
- Atributo presente → escolha explícita do usuário, sempre vence.

**Tailwind:** os tokens são expostos via `theme.extend.colors` em
`tailwind.config.ts`, cada um apontando para `var(--color-*)` (ex.:
`background: 'var(--color-background)'`). Componentes continuam
escrevendo classes utilitárias normalmente (`bg-surface`,
`text-text-primary`), sem precisar da variante `dark:` do Tailwind
espalhada pelo JSX — a indireção via CSS var já resolve a cor
automaticamente por tema. Propõe-se `darkMode: ['class', '[data-theme="dark"]']`
só para manter compatibilidade caso algum `dark:` pontual seja
necessário no futuro; não é o mecanismo principal.

**Flash do tema incorreto (FOUC):** resolvido por um **script de
inicialização executado antes da renderização visual** (ver seção 4.1
para a comparação completa que levou a essa decisão). O script vive no
`<head>` do `layout.tsx` (o `layout.tsx` continua sem
`cookies()`/`headers()` — nenhuma chamada dinâmica de servidor), lê a
preferência salva em cookie via `document.cookie` no próprio
navegador, e aplica `data-theme` na tag `<html>` via DOM. Não é um
script bloqueante de parser no sentido clássico: inspecionando o HTML
bruto recebido do servidor, confirmou-se que o Next.js 16 (App Router,
streaming de Server Components) entrega esse trecho embutido no
payload de streaming (`self.__next_f.push(...)`), não como uma tag
`<script>` estática literal no HTML inicial — quem garante a aplicação
cedo é o processamento desse trecho pelo React antes da composição
visual, não o parser do navegador bloqueando em uma tag literal.

Nos testes realizados (Chromium, ambiente local, build de produção), o
atributo `data-theme` foi aplicado antes do `first-paint`, não tendo
sido observado flash de tema. Esse resultado é uma evidência
experimental para o ambiente testado, não uma garantia formal do
comportamento interno do React/Next.js em todas as condições de
execução.

Quando não há cookie (usuário nunca escolheu, está em "Sistema"), o
script não faz nada, e a camada de `@media (prefers-color-scheme:
dark)` cobre o primeiro paint corretamente via CSS puro.

**Compatibilidade com Next.js App Router/SSR:** todo o mecanismo é
compatível com Server Components — `layout.tsx` permanece um Server
Component síncrono, sem API dinâmica nenhuma, preservando a
pré-renderização estática de todas as rotas que já eram estáticas. Só
o controle de alternância em si (o toggle clicável, futuro) precisa
ser Client Component.

---

## 4.1 Comparação de estratégias de leitura do tema (decisão registrada)

Três estratégias foram investigadas e comparadas com evidência real
(build medido, não só argumento teórico) antes da decisão:

| Estratégia | Status | Motivo |
|---|---|---|
| SSR por `cookies()` no RootLayout | Rejeitada nesta fase | Elimina completamente as rotas estáticas (28 → 0, medido). Pode ser reavaliada futuramente. |
| Provider client-side | Rejeitada como arquitetura principal | Introduz troca de tema após hidratação, flash real na rota de login. Decisão de arquitetura não deve depender de detalhe de implementação atual (`AuthGate` client-side) que pode mudar. |
| Script de inicialização antes da renderização visual | **Aprovada** | Preserva rotas estáticas, evita flash perceptível, baixo acoplamento com o App Router. |

**Opção A** (SSR por `cookies()`) foi avaliada, implementada
experimentalmente, medida e descartada para esta fase. Permanece
registrada como alternativa arquitetural para eventual reavaliação
futura — por exemplo, se a aplicação um dia depender de cache de
CDN/edge de um jeito que hoje não depende, ou se o `AuthGate`
client-side for substituído por autenticação verificada no servidor,
o cálculo de custo/benefício desta comparação deveria ser refeito.

**Opção C** (provider client-side, sem tocar o RootLayout) foi
descartada como arquitetura principal porque introduz flash estrutural
— existe uma janela entre o primeiro paint e o `useEffect` aplicar o
tema. Na prática, esse flash ficaria mascarado atrás da tela
"Verificando acesso..." do `AuthGate` para toda rota autenticada, mas
seria visível na rota pública de login. A decisão não se apoiou nessa
mitigação, porque `AuthGate` é um detalhe de implementação atual, não
uma garantia arquitetural — se ele mudar (por exemplo, para
autenticação verificada no servidor), o argumento de mascaramento some
junto.

**Risco futuro registrado (não resolver agora):** caso uma Content
Security Policy venha a ser adotada futuramente, o mecanismo de
inicialização do tema deverá ser revisado (nonce/hash ou alternativa
equivalente) — hoje não há CSP configurada, confirmado em
`next.config.ts`.

---

## 5. Alternância e persistência

- **Persistência:** cookie como fonte da verdade, escrito por uma
  server action (`setThemeCookie`) quando o usuário escolhe Claro ou
  Escuro explicitamente. A leitura para o primeiro paint é feita pelo
  script de inicialização (seção 4/4.1), não por SSR — `localStorage`
  não é usado, para não criar uma segunda fonte de verdade além do
  cookie.
- **Antes da autenticação:** sem cookie definido → cai no
  comportamento "Sistema" via CSS, sem depender de nenhum dado.
- **Depois da autenticação:** mesmo cookie, sem relação com sessão de
  usuário — é preferência de navegador, não de conta.
- **Sincronização entre dispositivos:** explicitamente fora desta fase
  (não persiste no banco). Evolução futura possível: preferência por
  usuário/empresa no banco, cookie como cache local — não decidido
  aqui, exigiria um PAD próprio quando for necessário.
- **Onde vive o controle de alternância:** não decidido neste
  documento — depende do primitivo `Button`/toggle de PAD-007. Ver
  PAD-007 seção 4.

---

## 6. Escopo desta rodada

Este documento é investigação e arquitetura aprovada. Não inclui
código, migration, componente ou alteração de tela — isso é piloto
futuro (Recursos Produtivos: Lista, Novo, Detalhe, Editar), condicionado
à existência dos primitivos de PAD-007 e à validação visual por mockup
antes de qualquer implementação.
