# Consolidação Vigente — NEXOTFE

**Data:** 2026-07-14
**Status:** Vigente
**Natureza do documento:** adição sobre a base documental existente

---

## Nota de precedência

Este documento **não substitui** a base documental do projeto (os 132
arquivos mapeados em `knowledge/` e `docs/`, incluindo o "Livro Mestre",
os handbooks de onboarding, as notas de `discussoes/` e os registros de
auditoria). Nenhum desses arquivos foi apagado, movido ou reescrito por
causa deste documento.

Este documento tem precedência **apenas** sobre os 5 pontos específicos
listados abaixo, exatamente onde um documento anterior afirmar o
contrário. Para qualquer outro assunto não coberto aqui, a base
documental existente continua valendo normalmente, na ordem de
prevalência já estabelecida em `knowledge/BASELINE_NEXOTFE_1_0.md`.

Cada ponto abaixo cita explicitamente quais documentos antigos ficam
superados nesse ponto específico — e apenas nesse ponto. Um documento
citado como "superado" no item 1 pode continuar sendo a fonte válida
para qualquer outro assunto que ele trate.

Origem: consolidação de decisões implementadas em código e testadas
(direto em produção, com dados reais) numa sessão de trabalho de
2026-07-13/14. Ver `git log` no repositório para o histórico exato de
commits e migrations referenciados abaixo.

---

## 1. Operação vincula Recurso Produtivo, não Tecnologia

**Decisão vigente:** a Operação (`bom_operacoes`) vincula diretamente a
um Recurso Produtivo específico (`recurso_produtivo_id`, FK para
`recursos_produtivos`), não a uma Tecnologia. A classificação
Engenharia/Produção passou a ser um campo próprio da Operação (`tipo`),
escolhido pelo usuário ao criar a OP, independente do recurso vinculado.
`tecnologias_aplicadas`/`tecnologia_aplicada_id` estão **descontinuadas
como vínculo de Operação** — a coluna `tecnologia_aplicada_id` continua
existindo em `bom_operacoes` (não foi apagada), mas sem uso pelo código
atual.

**Motivo da mudança:** é o Recurso Produtivo específico (a máquina/posto
de trabalho real) que a Simulação de Capacidade precisa para calcular
carga — não a categoria abstrata de Tecnologia. Além disso, a maioria
dos recursos cadastrados hoje (31 de 31 ativos de uma das empresas
piloto) não tem nenhuma Tecnologia vinculada, o que deixava o cadastro
de Operação praticamente inutilizável em produção.

**Implementado em:** migrations `202607130003_bom_operacoes_recurso_produtivo.sql`
e `202607130004_calcular_custo_bom_via_recurso_produtivo.sql`; commits
`0ae3e6d` e `35c0e67`.

**Superam, especificamente neste ponto:**

- `knowledge/livro-arquitetura-funcional/Capítulo 02 Cadastro de Tecnologias`
  — que estabelece como regra obrigatória: *"Toda Operação (OP) deverá
  possuir, obrigatoriamente: uma Tecnologia definida; um Tempo
  planejado. [...] Operações sem Tecnologia [...] não deverão ser
  liberadas para execução."*
- `knowledge/livro-arquitetura-funcional/Capítulo 03 Grupos de Tecnologias`
  — que desenha a cadeia oficial como *"Grupo de Tecnologia →
  Tecnologias → Operações → Ordens de Fabricação → Projetos"*, sem
  Recurso Produtivo nela.
- `knowledge/discussoes/2026-07-06-auditoria e modificacao.md` — que
  ainda descreve `tecnologias_aplicadas` como *"a"* tabela de vínculo de
  custo-hora da Operação, neste ponto específico (o restante desse
  documento permanece válido — ver item 2 abaixo, onde ele é a fonte
  que **confirma**, não supera).

---

## 2. Roteiro pertence ao Produto, não ao Item de Projeto

**Decisão vigente:** o Roteiro (`boms`/`bom_itens`/`bom_operacoes`)
pertence ao **Produto** (`boms.produto_id`), não a um Item de Projeto
específico. Um Produto pode ter seu Roteiro reaproveitado entre
múltiplos projetos — não é recriado a cada novo projeto. O Roteiro não
tem conceito de Quantidade; Quantidade é atributo da fase de produção
(Ordem de Fabricação), fase ainda não implementada no sistema.

**Confirma:** `knowledge/discussoes/2026-07-06-auditoria e modificacao.md`
— *"Roteiro pertence ao Produto (não ao item de projeto)... Um produto
pode ter vários Roteiros/versões... Reaproveitável entre projetos — não
precisa remontar a árvore a cada projeto."*

**Supera, especificamente neste ponto:**

- `knowledge/omboard/2026-05-07-HANDBOOK-CLAUDE-011` (Decision 2 —
  "Routing Ownership"), que afirma o oposto: *"The routing is linked to
  the specific project item, not to a generic reusable product catalog
  entry. Each project item has its own routing."* Esse handbook se
  autodeclara "decisão final, não pode ser redesenhada sem autorização
  explícita" — esta consolidação registra formalmente essa autorização,
  neste ponto específico. As demais decisões do HANDBOOK-011 (Decision
  1, 3, 4, 5 — definição gradual de produto, custo do orçamento sempre
  vindo do roteiro, estrutura multinível, agregação recursiva
  bottom-up) **não são afetadas** e continuam vigentes.

---

## 3. `numero_projeto` é único por empresa, não globalmente

**Decisão vigente:** a constraint de unicidade de `projetos.numero_projeto`
é `UNIQUE (empresa_id, numero_projeto)`. Duas empresas diferentes podem
ter projetos com o mesmo número — a numeração é um identificador dentro
do escopo de cada empresa, não um identificador global do sistema.

**Motivo da mudança:** a constraint global causava colisão real —
confirmado ao vivo em produção: a segunda empresa a salvar seu N-ésimo
projeto recebia `23505 unique_violation`/HTTP 409, pois a numeração
(gerada de forma independente por empresa, via
`numeracao_configuracoes`) produzia os mesmos números em empresas
diferentes.

**Implementado em:** migration
`202607130002_fix_projetos_numero_projeto_unique_por_empresa.sql`;
commit `7b7f05b`.

**Confirma:** `knowledge/COMPARACAO_BANCO_RESTAURADO_ARQUITETURA_NEXOTFE_1_0.md`,
seção 4.1, que já apontava isso como desvio a corrigir: *"projetos.numero_projeto
é globalmente único, enquanto a numeração é configurada por empresa."*

**Supera, especificamente neste ponto:**

- `knowledge/discussoes/2026-06-28-orcamento.md` — que especifica o
  número do projeto como *"Obrigatório. Único no sistema. Não deve ser
  duplicado."* — essa era exatamente a premissa que causava a colisão
  entre empresas. O restante desse documento (regras da tela de
  Orçamento, natureza, custo) não é afetado.

---

## 4. RLS de `clientes`/`clientes_ativos` — correção registrada retroativamente

**Decisão vigente:** as policies de RLS de `clientes` filtram
corretamente por `empresa_id = empresa_atual_id()` em SELECT, INSERT,
UPDATE e DELETE. A view `clientes_ativos` também está corretamente
escopada por empresa, e recebeu `security_invoker = true` como reforço
preventivo adicional (não é a causa da correção — a RLS da tabela base
já era suficiente).

**Contexto da lacuna:** `knowledge/AUDITORIA_COMPLETA_POLICIES_RLS.md`
(21/06/2026) registrou um vazamento total nessa tabela: *"clientes —
quatro de quatro críticas. SELECT [...] utiliza USING (true).
Consequência: qualquer usuário autenticado [...] pode visualizar
clientes de todas as empresas."* Ao testar isso nesta sessão (via
simulação de sessão RLS real, com dois usuários de empresas diferentes,
em transação com rollback), **não foi encontrado nenhum vazamento** — a
policy já filtrava corretamente. Ou seja, a correção aconteceu em algum
momento entre 21/06 e 13/07/2026, mas **nenhum documento da base registra
quando ou como** — esta seção existe para fechar essa lacuna
retroativamente, já que o Manifesto (`knowledge/01-MANIFESTO-NEXOTFE.md`)
exige que toda regra de negócio nasça documentada.

**Implementado/reforçado em:** migration
`202607130001_clientes_ativos_security_invoker.sql`; commit `2ee5b8b`.
A correção da RLS da tabela `clientes` em si não tem migration
correspondente nesta sessão (já estava correta antes dela) — fica
como pendência de investigação histórica, não como ação a refazer.

**Não supera nenhum documento** — apenas registra, pela primeira vez, a
correção de um achado crítico da auditoria de 21/06 que não estava
documentado em lugar nenhum.

---

## 5. Padrão de valor de "unidade" é `peca` (sem acento), em todo o sistema

**Decisão vigente:** o valor armazenado para a unidade "peça" é sempre
`peca` (sem cedilha/acento) — em Roteiro (`bom_itens.unidade`,
`bom_operacoes` não tem esse campo), Produto e Matéria-Prima. O acento
só aparece no **label** exibido ao usuário ("Peça"), nunca no valor
persistido.

**Motivo da mudança:** a constraint `bom_itens_unidade_chk` já aceitava
apenas `peca` (sem acento), mas o formulário de Matéria-Prima usava um
array bruto com `peça` (acentuado) como valor do `<select>` — divergente
do padrão já correto em `unidadesBomItem` (Roteiro) e `unidadesProduto`
(Produto). Isso quebrava o INSERT em `bom_itens` ao tentar adicionar
como material num Roteiro qualquer matéria-prima cadastrada com essa
unidade.

**Implementado em:** commit `c4ef663` (padronização dos formulários de
Matéria-Prima + backfill das 3 linhas existentes com `unidade = 'peça'`
para `'peca'`, direto em produção).

**Não supera nenhum documento** — nenhum documento existente na base
especifica valores literais de string para campos de unidade; este é um
padrão novo, sem precedente documental anterior a registrar como
superado.

---

## Notas para revisão futura (não são decisões fechadas)

Os pontos abaixo foram identificados durante o levantamento de
documentação desta sessão como contradições ou inconsistências
**dentro da própria base**, sem relação com o código implementado nesta
sessão. Ficam sinalizados aqui como pendência de revisão — **não são
decisões vigentes**, apenas notas para quem for arbitrar isso no
futuro.

- **"PN" vs. "Código".** Documentos de ~19/06/2026 (`ESTUDO_TECNICO_001.md`,
  `docs/FUNDACAO_INDUSTRIAL_NEXOTFE.md`, os planos Diretor/Executivo)
  usam "PN" livremente como termo técnico. Documentos de 27/06/2026
  (`knowledge/BASELINE_OPERACIONAL_NEXOTFE_1_0.md`,
  `knowledge/PADROES_DESENVOLVIMENTO_NEXOTFE_1_0.md`) instruem
  explicitamente evitar "PN" na interface em favor de "Código". Os mais
  antigos nunca foram atualizados.
- **Estados oficiais de Projeto.** Pelo menos três conjuntos de valores
  diferentes coexistem na base para o mesmo campo: os de
  `docs/FUNDACAO_INDUSTRIAL_NEXOTFE.md`, os da migration real (citados em
  `knowledge/AUDITORIA_COMPLETA_MIGRATIONS_NEXOTFE.md`) e os "Estados
  Oficiais" normativos do Livro Mestre. O próprio documento de auditoria
  já reconhece isso: *"Nem o banco nem a migration representam a norma
  congelada."*
- **Duplicação Família A vs. Família C no Livro Mestre.** Os documentos
  numerados `01`–`05` de `knowledge/livro-arquitetura-funcional/` têm
  espelhos não indexados ("... DO NEXOTFE") cobrindo os mesmos temas com
  redação divergente em pontos concretos (ex.: número de etapas do
  Recebimento, terminologia "Conferência Documental" vs. "Conferência
  Fiscal"). Nenhum dos dois se declara como versão substituta da outra.

Mapeamento completo dessas e de outras observações: ver o levantamento
de documentação produzido em 2026-07-14 (artifact desta sessão, fora do
controle de versão do repositório).
