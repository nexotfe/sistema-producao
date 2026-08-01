---
name: NEXOTFE
description: Plataforma industrial multi-tenant para gestão de projetos sob encomenda
colors:
  background: "#EDF1F5"
  surface: "#FAFBFC"
  surface-elevated: "#FFFFFF"
  border: "#E2E8F0"
  border-subtle: "#F1F5F9"
  text-primary: "#0F172A"
  text-secondary: "#64748B"
  text-disabled: "#94A3B8"
  action-primary: "#2563EB"
  action-primary-hover: "#1D4ED8"
  action-primary-text: "#FFFFFF"
  focus-ring: "rgba(96, 165, 250, 0.40)"
  success-text: "#047857"
  success-bg: "#ECFDF5"
  success-border: "#A7F3D0"
  warning-text: "#92400E"
  warning-bg: "#FFFBEB"
  warning-border: "#FDE68A"
  danger-text: "#DC2626"
  danger-bg: "#FEF2F2"
  danger-border: "#FECACA"
  info-text: "#1D4ED8"
  info-bg: "#EFF6FF"
  info-border: "#BFDBFE"
  brand-header-fixed: "#0B1B2B"
typography:
  display:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1.3
rounded:
  sm: "10px"
  md: "12px"
  lg: "16px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "13px"
  md: "18px"
  lg: "22px"
components:
  button-primary:
    backgroundColor: "{colors.action-primary}"
    textColor: "{colors.action-primary-text}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.action-primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.action-primary}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "40px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger-text}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "40px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "20px 22px"
  field-input:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "42px"
  badge-neutral:
    backgroundColor: "{colors.border-subtle}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.full}"
    padding: "4px 11px"
---

# Design System: NEXOTFE

## Overview

**Creative North Star: "O Painel de Controle"**

**Decisão visual:** o NEXOTFE tem duas naturezas visuais deliberadamente
diferentes, e essa divisão é a decisão central deste sistema — não uma
observação sobre o que já existe, mas a regra que orienta o que vem a
seguir. Pense num painel de controle industrial real: o mostrador
principal é desenhado para impressionar e orientar — marcante,
contemporâneo, confiável, a primeira leitura que estabelece confiança
no sistema inteiro. Os instrumentos individuais do mesmo painel são
calmos, precisos, de baixo ruído visual, feitos para uso repetido sem
fadiga. A **entrada institucional** do NEXOTFE (autenticação e pontos
de orientação) é o mostrador principal. O **interior operacional** —
formulários, listas, telas de detalhe/edição, PCP, dashboards — são os
instrumentos individuais: claros, calmos, eficientes, de baixa carga
cognitiva, sem decoração. A fronteira entre os dois é rígida: nenhum
tratamento de entrada vaza para dentro de uma tela operacional, e
nenhuma tela operacional pega emprestado o registro calmo para a
entrada.

**Estado atual confirmado:** só o lado "instrumento operacional" existe
como sistema de tokens real (`src/modules/shared/ui/` +
PAD-006/PAD-007) — superfícies planas, sem sombra, bordas finas,
paleta grafite/azul/branco, azul reservado para ação primária. A
sequência de entrada hoje é login (`src/app/page.tsx`) → hub central
(`src/app/central/page.tsx`); **nenhuma das duas é a implementação-alvo**.
O login usa classes ad-hoc anteriores ao sistema de tokens. O hub
central hoje é uma lista técnica de links para acesso a rotas, sem
tratamento visual — serve para desenvolvimento, não é uma tela de
produto desenhada. Ambas serão retrabalhadas.

**Evolução futura:** o "mostrador principal" (entrada institucional +
hub) ainda não foi desenhado sob o princípio acima. Esse redesenho é
trabalho futuro, com etapa própria de aprovação — este documento
registra a decisão de que ele deve existir e como deve se comportar
frente ao restante do sistema, **não como ele vai se parecer**: nenhuma
imagem, gradiente, fonte de destaque ou composição foi decidida ainda.

**Key Characteristics:**
- Dualidade deliberada: entrada expressiva (mostrador principal), operação contida (instrumentos individuais) — fronteira rígida entre as duas.
- Azul (`action-primary`) é o preenchimento exclusivo da ação primária, de links e de indicação de navegação ativa. O contorno de foco usa o token distinto `focus-ring`, por vezes acompanhado de borda `action-primary` em campos e selects.
- Grafite pode aparecer em texto/ícone/borda de controle secundário; nunca é preenchimento de ação primária.
- Superfícies planas — profundidade vem de borda e camada de tom, não de sombra.
- Todo indicador de estado (sucesso/aviso/erro/info) precisa de um significado legível independentemente de cor — texto, rótulo ou mensagem, não só a paleta.

## Colors

Paleta grafite/azul/branco (decisão PAD-007 §7): grafite é estrutura e
texto de controle secundário, azul é a cor de preenchimento exclusiva
de ação primária, branco/cinza-claro compõem a superfície neutra.

O frontmatter deste arquivo guarda **só o modo claro** — esse é o valor
canônico por convenção do formato DESIGN.md; o schema não modela um
segundo conjunto "dark" dentro do YAML. Os pares escuros abaixo são
reais (extraídos de `src/app/globals.css` e da tabela do PAD-006 §2),
mas vivem fora do frontmatter, na prosa e no sidecar, não dentro do
YAML.

### Primary
- **Azul de Comando** (`#2563EB`; escuro: `#3B82F6`): preenchimento exclusivo da ação primária; também cobre links e navegação ativa. **Não é o token de foco** — ver "A Regra da Cor de Ação".

### Neutral
- **Névoa Operacional** (`#EDF1F5`; escuro: `#0A1420`): fundo da aplicação.
- **Branco Papel** (`#FAFBFC`; escuro: `#0B1B2B`): superfície de card, base da UI.
- **Branco Puro** (`#FFFFFF`; escuro: `#16273D`): superfície elevada — modal, dropdown.
- **Cinza Estrutural** (`#E2E8F0`; escuro: `#28405C`): borda padrão.
- **Névoa Sutil** (`#F1F5F9`; escuro: `#1B2C40`): divisória interna, fundo de linha hover/skeleton.
- **Tinta Grafite** (`text-primary`, `#0F172A`; escuro: `#F1F5F9`): texto principal — pode aparecer em texto/ícone/borda de controle secundário (ver Named Rules); nunca é preenchimento de ação.
- **Cinza Secundário** (`#64748B`; escuro: `#A9B8CC`): texto de apoio, labels.
- **Cinza Desabilitado** (`#94A3B8`; escuro: `#5B7086`): campos/itens desabilitados.
- **Grafite Institucional** (`brand-header-fixed`, `#0B1B2B`, token fixo — não participa da troca claro/escuro): superfície estrutural — cabeçalho de marca. Nunca texto, nunca preenchimento de ação.
- **Anel de Foco** (`focus-ring`, `rgba(96,165,250,.40)`; escuro: `rgba(96,165,250,.55)`): token dedicado ao contorno de foco em todo componente interativo. Distinto de `action-primary` — ver "Fronteira foco × ação" abaixo.

### Estado — Status/Badges vs. Validação de campo
Sucesso/aviso/erro/info comunicam só estado — nunca são identidade
visual do produto nem substituem a cor de ação primária. Duas
composições diferentes, não uma regra única:

- **Status/Badges:** trio texto+fundo+borda da mesma família (consistência visual).
- **Validação de campo:** mensagem de erro explícita (texto) + borda/anel de erro — **sem exigir preenchimento de fundo colorido**. Ver Components > Inputs/Fields.

Valores claro/escuro de cada família:
- **Sucesso** — texto `success-text` `#047857`/escuro `#34D399`; fundo `success-bg` `#ECFDF5`/escuro `rgba(16,185,129,.12)`; borda `success-border` `#A7F3D0`/escuro `rgba(16,185,129,.4)`.
- **Aviso** — texto `warning-text` `#92400E`/escuro `#FBBF24`; fundo `warning-bg` `#FFFBEB`/escuro `rgba(245,158,11,.12)`; borda `warning-border` `#FDE68A`/escuro `rgba(245,158,11,.4)`.
- **Perigo** — texto `danger-text` `#DC2626`/escuro `#F87171`; fundo `danger-bg` `#FEF2F2`/escuro `rgba(239,68,68,.12)`; borda `danger-border` `#FECACA`/escuro `rgba(239,68,68,.4)`.
- **Info** — texto `info-text` `#1D4ED8`/escuro `#60A5FA`; fundo `info-bg` `#EFF6FF`/escuro `rgba(59,130,246,.12)`; borda `info-border` `#BFDBFE`/escuro `rgba(59,130,246,.4)`.

**Indicador semântico independente de cor (requisito de acessibilidade,
não decoração):** o trio texto+fundo+borda dos Badges padroniza a
*apresentação visual*, mas texto+fundo+borda continuam sendo três
manifestações de cor — o trio sozinho **não** garante que o significado
seja compreensível sem enxergar cor. O que garante isso é o *conteúdo*:
a palavra dentro do Badge ("Ativo", "Inativo"), a mensagem de erro por
extenso ao lado do campo. Um indicador que dependesse só da combinação
de cores (por exemplo, um ponto colorido sem texto) não seria
suficiente, mesmo respeitando o trio.

**Nota de acessibilidade — contraste:** os valores claro/escuro acima
são estimativa de boa-fé (PAD-006 §2), ainda **não validados** com
ferramenta de contraste dedicada. Não tratar como conformidade WCAG
confirmada até essa validação acontecer.

**Nota de nomenclatura (para quem for gerar código a partir daqui):**
os nomes de token deste documento (`danger-text`, `success-bg`, etc.)
seguem a variável CSS real (`--color-danger-text` em `globals.css`).
Na classe Tailwind do projeto, especificamente as quatro famílias de
estado (success/warning/danger/info) levam o prefixo `status-`
(`text-status-danger-text`, `bg-status-success-bg` — ver
`tailwind.config.ts` linhas 32–43); os demais tokens (`background`,
`surface`, `border`, `action-primary`, `focus-ring` etc.) não têm esse
prefixo e mapeiam 1:1 para a classe Tailwind de mesmo nome.

### Named Rules
**A Regra do Grafite em Controles.** A família grafite cobre dois
tokens distintos. `text-primary` (Tinta Grafite, reativo ao tema) pode
aparecer em texto, ícone e borda de controles secundários — é o caso
do texto do botão secundário e do rótulo de campos/selects.
`brand-header-fixed` (Grafite Institucional, token fixo) é só
superfície estrutural — cabeçalho de marca, nunca texto. **Nenhum dos
dois é usado como preenchimento de uma ação, em nenhuma variante**: uma
ação primária usa exclusivamente `action-primary`.

**A Regra da Cor de Ação.** `action-primary` (azul) é o preenchimento
exclusivo da ação primária, links e indicação de navegação ativa.
Controles secundários usam fundo neutro (`surface`) + borda neutra
(`border`) + texto grafite (`text-primary`) — nunca fundo azul nem
fundo grafite. Ação destrutiva usa a família `danger`. Sucesso/aviso/
erro são só semânticos — nunca identidade visual nem ação primária.
**Fronteira foco × ação:** o contorno de foco usa sempre `focus-ring`,
nunca `action-primary` isoladamente. Em campos e selects, a borda
*também* muda para `action-primary` junto com o anel `focus-ring`; em
botões e no toggle de tema, só o anel (`focus-ring`) muda — não há
troca de borda.

## Typography

**Estado atual confirmado:** pilha de sistema (Arial, Helvetica,
sans-serif) em toda a aplicação, sem fonte customizada carregada via
`next/font` ou `@font-face`. Hierarquia atual é só por tamanho/peso
dentro dessa pilha (ver Hierarchy abaixo). Nenhuma fonte de destaque
existe hoje — não presumir Cormorant Garamond, Inter, ou qualquer outra
família como se já estivesse decidida.

**Evolução futura (não decidida):** a entrada institucional marcante
provavelmente vai pedir uma identidade tipográfica própria (uma fonte
de destaque para o "mostrador principal"), mas nenhuma fonte foi
escolhida. Essa escolha é uma decisão futura, com etapa própria.

### Hierarchy
- **Display** (600, 30px, 1.2): título de página (`<h1>` do ModuleHeader plano).
- **Title** (600, 15px, 1.4): cabeçalho de card/modal.
- **Body** (400, 13–13.5px, 1.5): texto de formulário, botão, célula de tabela.
- **Label** (600, 11–12.5px, 1.3): rótulo de campo, badge; cabeçalho de tabela usa a mesma faixa em versal com `tracking-[0.05em]`.

## Layout

Não existe shell/navegação global persistente — cada módulo desenha o próprio cabeçalho via `ModuleHeader` (variante `plain` para a maioria das telas, `brand` para a faixa escura de marca). Contêiner de página típico: `max-w-7xl` centralizado, padding horizontal responsivo (20px → 32px → 40px conforme breakpoint). Tabelas e cards com overflow horizontal usam `overflow-x-auto` em vez de quebrar layout. Cabeçalhos de módulo empilham verticalmente em telas estreitas e viram linha única a partir de `sm`/`lg`. Os breakpoints usados são os padrões do Tailwind — `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px — não customizados em `tailwind.config.ts` (o arquivo só estende `theme.colors`, não `theme.screens`).

## Elevation & Depth

Sistema de primitivos (`shared/ui`) é **plano por decisão**: nenhum componente usa `box-shadow`; profundidade vem só de borda + troca de camada de superfície (`surface` → `surface-elevated`). Isso ainda não é universal: telas ainda não migradas para o sistema de tokens (menus/dropdown de busca, o modal antigo, a tela de login) usam `shadow-xl`/`shadow-2xl` ad-hoc, sem token — débito de migração registrado em PAD-007, não uma segunda linguagem de profundidade intencional.

### Named Rules
**A Regra Plano-por-Padrão.** Superfícies dos primitivos compartilhados ficam sem sombra em repouso. Se uma tela nova "precisa" de sombra para se destacar, o problema é hierarquia, não elevação.

## Shapes

Escala de raio com 4 degraus, sem meio-termo: **10px** (botão, campo, select, toggle de tema) para elementos de interação direta; **12px** (card, tabela) para contêineres de conteúdo; **16px** (modal) para o nível mais alto de superfície; **full** (badge) para pílulas de status. Bordas são sempre finas (1px) e usam o token `border`/`border-subtle`, nunca uma cor de paleta literal.

## Components

**Nota de escopo (frontmatter):** o bloco YAML `components:` no topo
deste arquivo é uma **projeção parcial**. O schema do formato
DESIGN.md limita cada item a 8 propriedades (`backgroundColor`,
`textColor`, `typography`, `rounded`, `padding`, `size`, `height`,
`width`) — borda e estado de foco **não fazem parte desse conjunto**,
por desenho do próprio formato. As propriedades reais de borda e foco
de cada componente estão só aqui embaixo (prosa) e no CSS de
`.impeccable/design.json`. **Não gerar interface a partir do
frontmatter isoladamente** — sempre cruzar com esta seção e com Do's
and Don'ts.

Todos os primitivos usam elementos nativos (`<button>`, `<input>`,
`<select>`) — navegáveis por teclado por padrão, sem `tabindex`
customizado. Isso é estado atual confirmado, não aspiração.

### Buttons
- **Shape:** cantos de 10px, altura fixa 40px.
- **Primary:** fundo `action-primary`, texto `action-primary-text`, padding 0 18px.
- **Secondary:** fundo neutro (`surface`), borda neutra (`border`), texto grafite (`text-primary`) — nunca fundo azul nem fundo grafite.
- **Ghost:** transparente, texto `action-primary` (mesmo tratamento de link), padding reduzido (0 8px) — uso compacto/inline.
- **Danger:** transparente, borda `danger-border` e texto `danger-text`; fundo `danger-bg` aparece só no hover.
- **Hover/Focus:** hover escurece o fundo (primary) ou aplica `border-subtle`; foco é só o anel de 3px (`focus-ring`) — botões não trocam cor de borda no foco (diferente de campos/selects, ver abaixo).

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** `surface`, borda `border`, sem sombra.
- **Header opcional:** divisória inferior (`border-subtle`), título 15px/600.
- **Internal Padding:** 22px horizontal, 18–20px vertical.
- **Nota:** Card não tem estado de hover — não é elemento interativo, e não carrega nenhuma cor de ação.

### Inputs / Fields (Field, Select)
- **Style:** altura 42px, cantos 10px, borda `border`, fundo `surface-elevated`.
- **Focus:** borda muda para `action-primary` **e** anel de 3px `focus-ring` — os dois juntos, único caso onde borda e anel mudam ao mesmo tempo.
- **Error (validação de campo, não Badge):** borda muda para `danger-border`; o anel usa `danger-bg` como cor do contorno — **não como preenchimento de fundo do campo** (o campo com erro não ganha um fundo colorido). O indicador semântico real é a mensagem de erro explícita em texto 11.5px (`danger-text`) abaixo do campo; borda e anel sozinhos, sem essa mensagem, não seriam suficientes.
- **Disabled:** fundo e borda `border-subtle`, texto `text-disabled`, cursor bloqueado.

### Badges
- **Style:** pílula (`rounded-full`), borda + fundo + texto da mesma família de status (trio completo — diferente da validação de campo, ver acima).
- **Variantes:** success, warning, danger, neutral (fundo `border-subtle`/texto `text-secondary`).
- **Indicador real:** a palavra dentro do badge ("Ativo", "Pendente" etc.) — a cor sozinha não é o que comunica o estado.

### Modal
- **Corner Style:** 16px, sem sombra própria — separação do fundo vem do overlay escuro fixo (`rgba(2,6,15,0.5)`), não de um token de tema (gap conhecido, registrado no próprio componente: PAD-006 não define token de overlay).
- **Estrutura:** cabeçalho com divisória, corpo com texto secundário, rodapé opcional com ações alinhadas à direita.
- **Estado atual confirmado:** `role="dialog"`, `aria-modal="true"`, `aria-label` com o título, e fechamento por tecla `Escape` já estão implementados em `Modal.tsx`.
- **Contrato obrigatório ainda não implementado (requisito, não estado atual):**
  1. Foco deve mover para dentro do modal na abertura (primeiro elemento focável ou o próprio container).
  2. Foco deve ficar retido dentro do modal enquanto aberto — `Tab` não pode escapar para o conteúdo por trás.
  3. Foco deve retornar ao elemento que abriu o modal quando ele fecha.
  Fechar com `Escape` sozinho **não** constitui navegação por teclado adequada sem esses três comportamentos.

### Table
- **Container:** cantos 12px, borda única envolvendo toda a tabela.
- **Header row:** fundo `border-subtle`, texto 10.5px em versal, peso 700, `tracking-[0.05em]`.
- **Row:** hover aplica `border-subtle`; divisórias entre linhas usam `border-subtle`, nunca a borda cheia.

## Do's and Don'ts

### Do:
- **Do** reservar impacto visual para pontos de entrada e orientação; manter as telas operacionais claras, calmas e eficientes. **A Regra da Porta de Entrada.**
- **Do** manter toda tela operacional (formulário, lista, detalhe/edição, PCP, dashboard) no registro plano e contido já estabelecido em `shared/ui`.
- **Do** usar `action-primary` como preenchimento exclusivo da ação primária, para links e para navegação ativa; usar `focus-ring` para o contorno de foco (acompanhado de borda `action-primary` só em campos/selects).
- **Do** compor indicadores de status (Badges) como trio texto+fundo+borda; compor validação de campo como mensagem+borda/anel, sem exigir fundo colorido. Em ambos os casos, garantir um indicador semântico legível (texto/rótulo/mensagem) independente de cor — o trio ou o par borda/anel padronizam a apresentação visual, não substituem esse indicador.
- **Do** manter foco visível por anel (`focus-ring`) em qualquer componente novo — já é o padrão em Button/Field/Select/ThemeToggle/Secondary/Danger.
- **Do** respeitar `prefers-reduced-motion: reduce` em qualquer movimento novo que a entrada marcante introduzir. Hoje isso **não está implementado** — o único uso de animação existente é `animate-pulse` no `LoadingState`, sem esse guard. Tratar como requisito da evolução futura, não como já resolvido.
- **Do** consumir componentes de `src/modules/shared/ui/` via token semântico (`bg-surface`, `text-text-primary`) — nunca classe de paleta Tailwind literal (`slate-900`) ou hex solto.

### Don't:
- **Don't** adicionar `box-shadow` a um primitivo de `shared/ui` — profundidade é borda + camada de superfície, não sombra (débito de migração existente em telas ainda não migradas não é referência a seguir).
- **Don't** criar uma nova cópia local de Card/Field/Modal/Table dentro de uma página ou módulo — PAD-007 já contou 16/13/13/6 cópias divergentes; o objetivo do sistema é zerar esse número, não somar mais uma.
- **Don't** usar grafite (`text-primary` ou `brand-header-fixed`) como preenchimento (fundo) de nenhuma ação — principal, secundária ou destrutiva. Grafite em controle secundário é só texto/ícone/borda, nunca fundo.
- **Don't** usar `action-primary` como token de foco — o contorno de foco é sempre `focus-ring`, mesmo quando a borda de um campo também muda para `action-primary`.
- **Don't** deixar o tratamento visual de entrada (imagem, tipografia de impacto, grafite em superfície sólida) vazar para dentro de uma tela operacional — a fronteira é rígida: formulário, lista e detalhe nunca herdam o registro da entrada.
- **Don't** confundir "marcante" com gradiente genérico, animação em excesso, cantos arredondados aplicados indiscriminadamente, ou aparência de template genérico de IA (hero fofo, ícones em círculos coloridos, glassmorphism default). A distinção da entrada vem de tipografia, grafite institucional e composição — não de efeito decorativo importado de template.
- **Don't** declarar um modal "acessível por teclado" só porque fecha com `Escape` — sem foco inicial, retenção de foco e retorno de foco, o contrato não está completo (ver Components > Modal).
- **Don't** tratar a tela de login (`src/app/page.tsx`) ou o hub central (`src/app/central/page.tsx`) como referência da identidade "marcante" pretendida — ambas são telas ainda não migradas/desenhadas: o login usa classes ad-hoc anteriores ao sistema de tokens, e o central é hoje uma lista técnica de rotas sem tratamento visual. Essa classificação é técnica, não é autorização para redesenho automático: qualquer migração ou redesenho dessas telas é tarefa própria, a ser aprovada separadamente.
