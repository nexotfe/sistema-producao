# PAD-007 — Design System Base

**Data:** 2026-07-23
**Versão:** 1.0
**Status:** Vigente
**Natureza do documento:** arquitetura permanente — princípios,
inventário de evidência e decisão de papel de cor. Para o catálogo real
de extração componente a componente (o que sai de onde, para onde
entra), ver PAD-008 (Componentes Compartilhados) quando criado. Este
documento não especifica valores de raio/padding pixel-perfect — isso é
resolvido no mockup visual dos primitivos, etapa seguinte a este PAD.

---

## 1. Princípio

Tema (PAD-006) depende de existir um Design System; Design System não
depende de tema. O problema real identificado nesta investigação não é
"falta suporte a modo escuro" — é que **não existe um único primitivo
de UI compartilhado no NEXOTFE**. Cada tela reimplementa Card, Input,
Select do zero, e a inconsistência visual encontrada em Recursos
Produtivos é sintoma desse problema mais amplo, não uma particularidade
do módulo.

---

## 2. Investigação — quantas variações de cada primitivo existem hoje

Contagem de implementações locais e independentes (função duplicada
por arquivo, não componente compartilhado):

| Primitivo | Implementações locais encontradas | Já existe compartilhado? |
|---|---|---|
| `Card` | 16 arquivos com `function Card(` própria | Não |
| `Field` (input de texto) | 13 arquivos com `function Field(` própria | Não |
| `SelectField` | 6 arquivos | Não |
| `CurrencyField` | 2 arquivos (só Recursos Novo/Editar — nenhum outro módulo formata moeda) | Não |
| Modal (`fixed inset-0 ...`) | 13 arquivos | Não |
| Tabela (`Th` de cabeçalho) | 6 arquivos (um por módulo com lista) | Não |
| Badge de status | 1 implementação (`StatusBadge`) | Sim, mas estreito — só booleano ativo/inativo, cores fixas |
| EmptyState | 1 implementação | Sim |
| LoadingState | 1 implementação | Sim |
| Botão | nenhuma função dedicada — cada botão é um `<button>` com className solta | Não |

Total: **566 ocorrências de `rounded-*` espalhadas em 80 arquivos** —
sintoma direto de não existir um primitivo central de raio/borda.

### 2.1 O `Card` não varia aleatoriamente — divide-se em 2 famílias consistentes

Comparação das 16 implementações lado a lado:

- **Família "Detalhe/Editar"** (8 arquivos: `grupos-recursos/[id]`,
  `grupos-recursos/[id]/editar`, `fornecedores/[id]`,
  `fornecedores/[id]/editar`, `recursos/[id]`, `recursos/[id]/editar`,
  `clientes/[id]`, `clientes/[id]/editar`): `rounded-lg`, sem hover,
  cabeçalho `px-6 py-5`, título `text-base font-semibold text-slate-900`.
- **Família "Novo"** (8 arquivos: `grupos-recursos/novo`,
  `ProductForm.tsx`, `fornecedores/novo`, `recursos/novo`,
  `estoque/materias-primas/novo`, `clientes/novo` — mais 2 exceções,
  ver seção 3): `rounded-md`, `hover:border-blue-700`, cabeçalho
  `px-4 py-3`, título `text-sm font-bold text-slate-950`.

`Field` replica a mesma divisão (label `mb-2 text-sm` vs. `mb-1.5
text-xs`). Achado adicional: o `Field` de `colaboradores/[id]/page.tsx`
tem props extras (`disabled`, `type`) que nenhuma outra implementação
tem — não é só diferença visual, é diferença de capacidade, porque
cada cópia evoluiu isoladamente.

**Foco de teclado também diverge entre as duas famílias:** família
"Novo" usa `focus:border-blue-600 focus:ring-blue-100`; família
"Detalhe/Editar" usa `focus:border-slate-300 focus:ring-slate-200/70`.
O próprio estado de foco — que PAD-006 trata como não podendo depender
só de cor — já hoje usa cores diferentes dependendo de qual família a
tela copiou.

---

## 3. As 2 exceções vazadas — não são cosméticas

`colaboradores/[id]/page.tsx` e `estoque/materias-primas/[codigo]/page.tsx`
são telas de **Detalhe**, mas usam a família visual "Novo" (`rounded-md`,
`hover:border-blue-700`, título `text-sm font-bold text-slate-950`) em
vez da família "Detalhe/Editar" que as outras 4 telas de Detalhe usam.

Isso é registrado explicitamente porque **a inconsistência já vazou
para dentro do que deveria ser um padrão único, mesmo antes de
qualquer decisão de tema existir**. Não é um problema que a introdução
de tokens de cor vai resolver sozinho: mesmo sem tema, essas duas telas
já divergem do restante das telas de Detalhe do sistema. A migração
desses 2 arquivos para o primitivo `Card` único do Design System não é
um ajuste estético incidental do piloto — é a correção de uma
inconsistência estrutural real, que existe independentemente de
Claro/Escuro/Sistema. PAD-008 deve tratar esses 2 arquivos como
candidatos prioritários de correção, não como "mais dois consumidores
do primitivo novo" iguais aos demais.

---

## 4. Proposta — primitivos necessários e sua situação atual

| Primitivo | Situação | Ação do Design System |
|---|---|---|
| `Button` | Não existe | Criar do zero |
| `Card` | Não existe (16 cópias, 2 famílias + 2 exceções vazadas) | Criar do zero, absorvendo as 16 |
| `Input`/`Field` | Não existe (13 cópias) | Criar do zero |
| `Select` | Não existe (6 cópias) | Criar do zero |
| `CurrencyInput` | Não existe (2 cópias) | Criar do zero |
| `Table` (estrutura Th/Td/Row) | Não existe (6 cópias) | Criar do zero |
| `Modal` | Não existe (13 cópias, mas já há um esqueleto de referência documentado em `IMP-SoftDelete.md` seção 5) | Criar do zero, usando o esqueleto já documentado como ponto de partida |
| `Badge` | Existe (`StatusBadge`) mas só ativo/inativo | Generalizar (variant: success/neutral/warning/danger + label livre) |
| `EmptyState` | Existe | Mover para o Design System, trocar cores por tokens |
| `LoadingState` | Existe | Mover para o Design System, trocar cores por tokens |

---

## 5. Onde vivem

Proposta: **`src/modules/shared/ui/`** — novo diretório, irmão de
`shared/navigation/`, `shared/components/` e `shared/data/`, que já são
a convenção existente no projeto. `shared/components/` continua
reservado para peças com regra de negócio embutida (ex.:
`ExclusaoBloqueadaBanner`, `RowActionsMenu`); `shared/ui/` fica
reservado para primitivos puramente visuais, sem conhecimento de
domínio.

---

## 6. Como cada primitivo consome os tokens de PAD-006

Nenhum primitivo recebe cor via valor solto nem hardcoda hex ou classe
de paleta Tailwind literal. Cada primitivo usa só as classes Tailwind
mapeadas aos tokens definidos em PAD-006 (`bg-surface`,
`border-border`, `text-text-primary`, `bg-action-primary`, etc. — via
`theme.extend.colors` apontando para as CSS vars). A existência do
primitivo resolve tema automaticamente: trocar `data-theme` na tag
`<html>` já muda todo primitivo, sem cada um precisar de lógica própria
de tema.

---

## 7. Decisão: azul vs. grafite como cor de ação do `Button`

**Azul (`action-primary`) é a cor de ação em todo o Design System.
Grafite (`#0B1B2B` e a família de tokens `surface`/`text-primary`
associada) fica reservado para estrutura (superfícies escuras,
cabeçalhos) e ênfase de texto (títulos), nunca para elementos
interativos.**

Justificativa, baseada na investigação da seção 2, não em preferência:

1. **Sobreposição semântica é o problema real da família
   "Detalhe/Editar" hoje.** Ela usa `slate-950` tanto para título de
   card (`text-slate-950`) quanto para botão primário (`bg-slate-950`)
   — a mesma cor comunica "isto é um texto importante" e "isto é
   clicável", que são coisas diferentes. A família "Novo" não tem esse
   problema: `slate-950` é só texto, `blue-600` é só ação.
2. **Azul já é o fio consistente em toda a base, mesmo hoje
   fragmentada.** Aparece como cor de foco na família "Novo"
   (`focus:border-blue-600`), como accent do próprio cabeçalho escuro
   em todos os 28 arquivos (`focus:border-blue-400` no campo de
   busca), e como cor de ação em metade das telas. Grafite nunca
   aparece como cor de interação hoje — só como fundo estrutural ou
   peso de texto.
3. Isso não remove grafite da paleta — ele continua sendo a cor de
   superfície escura no modo escuro (token `surface` de PAD-006,
   literalmente `#0B1B2B`) e a cor de texto de maior ênfase no modo
   claro. "Grafite, azul e branco" continua com os três presentes; o
   que estava faltando era definir qual papel cada um cumpre, que é
   exatamente esta decisão.

**Onde vive o controle de alternância de tema (pergunta em aberto de
PAD-006 seção 5):** também não decidida neste documento. O Theme
Toggle não é uma variante do primitivo `Button` — é um componente
composto que reutiliza `Button` como base visual, conceitualmente
distinto dele (o mockup de validação usa `Button` como implementação
temporária do Theme Toggle só por não existir ainda um componente
composto próprio). Onde esse componente composto vive na aplicação
real só fica claro depois do piloto em Recursos Produtivos. Registrado
como pendência a resolver no piloto, não aqui.

---

## 8. Sequência de execução (não iniciar sem aprovação de cada etapa)

1. PAD-006 — Sistema de Temas. **Concluído.**
2. PAD-007 — Design System Base. **Concluído (este documento).**
3. Mockup visual dos primitivos — validação nesta ordem explícita,
   antes de iniciar a migração de qualquer tela real de Recursos
   Produtivos: **Button → Card → Input → Select → Table → Badge →
   Modal → EmptyState/LoadingState**. Esta sequência é parte do
   processo, não uma lista solta — cada primitivo só é considerado
   validado depois de revisão visual explícita, na ordem acima.
4. PAD-008 — Componentes Compartilhados: catálogo de extração real
   (cabeçalho duplicado 28x é o primeiro candidato óbvio; as 2 exceções
   da seção 3 são candidatas prioritárias).
5. Piloto: Recursos Produtivos (Lista, Novo, Detalhe, Editar) consome
   os primitivos + tokens de tema.
6. Migração gradual dos demais módulos — fora de qualquer escopo atual.

## 9. Escopo desta rodada

Este documento é investigação e arquitetura aprovada. Não inclui
código, componente novo, dependência nova ou alteração de tela.
