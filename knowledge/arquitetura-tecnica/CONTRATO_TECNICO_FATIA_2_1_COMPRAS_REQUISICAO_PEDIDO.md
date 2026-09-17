# Contrato Técnico — Fatia 2.1: Relação Requisição ↔ Pedido de Compra

**Data:** 2026-09-17
**Versão:** 2.0
**Status:** Regras de negócio consolidadas — nenhuma decisão de negócio bloqueadora identificada
(§26). Restam apenas decisões técnicas de implementação (nomes de campos, mecanismo exato de lock,
formato de RPC) antes de qualquer migration.
**Natureza do documento:** contrato funcional/técnico de uma fatia do Incremento 9, derivado de
[`DEC-008_Fluxo_Operacional_Compras_Recebimento_Conferencia.md`](DEC-008_Fluxo_Operacional_Compras_Recebimento_Conferencia.md)
e de todas as decisões de negócio fechadas ao longo desta sessão sobre Requisição, Planejamento,
Pedido e cobertura comercial. **Não é um `DEC-`** (não registra uma decisão de negócio nova por si
só — consolida decisões já tomadas em conversa) **nem um `PAD-`** (não é um padrão de arquitetura
reutilizável entre domínios — é específico da relação Requisição↔Pedido de Compras). Não existe, hoje,
uma série de nomenclatura própria para "contrato técnico de uma fatia de incremento" em `knowledge/` —
o nome deste arquivo segue o precedente não-numerado já usado na mesma pasta por
`ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md`.

Esta é a **versão 2.0**, substituindo integralmente a versão 1.0 (commit `8c059d1`). Fecha como regra
de negócio vários pontos que a versão 1.0 listava como decisão técnica aberta (obrigatoriedade do
Planejamento, cardinalidade Planejamento↔Pedido, compromisso comercial, imutabilidade, reaprovação,
cancelamento pré/pós-envio, unicidade do Pedido), corrige duas afirmações que se provaram falsas na
revisão (proveniência Pedido→Planejamento "100% derivável"; imutabilidade do Pedido desde a criação),
e adiciona os domínios de Requisição produtiva/geral, Recebimento (fronteira mínima), Propriedade do
material, Atendimento da necessidade, Custo realizado e Consumo Interno (resultado de auditoria de
código real, não presumido).

**Convenção de leitura:** cada seção, e as afirmações mais sensíveis dentro dela, são classificadas
conforme uma das quatro categorias abaixo:

- **[Regra de negócio]** — já decidida, não é objeto de escolha técnica.
- **[Situação atual]** — o que o repositório (migrations reais + código) mostra hoje, verificado por
  leitura direta, nunca presumido.
- **[Lacuna/Conflito]** — distância entre a regra de negócio e a situação atual.
- **[Decisão técnica aberta]** — ainda não decidido; não deve ser inferido nem implementado agora.

---

## 1. Objetivo da Fatia 2.1

Formalizar o contrato entre Requisição de Compra e Pedido de Compra — no nível de **item**, não
apenas de cabeçalho — de forma que o modelo técnico futuro consiga representar: uma Requisição
produtiva com itens de OFs diferentes do mesmo Projeto; uma Requisição atendida por vários Pedidos;
um Pedido cobrindo itens de várias Requisições; a distinção entre cobertura comercial, compromisso
comercial e atendimento físico da necessidade; e um cancelamento de Pedido que nunca cancela
automaticamente a Requisição.

Este documento **não escolhe** a estrutura técnica definitiva (migrations, RPCs, colunas, nomes
exatos). Separa o que já é regra de negócio — a maior parte, nesta versão — do que ainda é decisão
técnica em aberto (§26).

## 2. Escopo

- A relação conceitual entre Item da Requisição e Item do Pedido de Compra (cobertura comercial).
- O papel do Planejamento de Compras — obrigatório para necessidade de Projeto, opcional para o
  resto.
- O ciclo completo do Pedido: criação, edição, aprovação, reaprovação, envio (compromisso comercial),
  cancelamento pré/pós-envio.
- A distinção formal entre cobertura comercial, compromisso comercial, recebimento, estoque
  disponível e atendimento físico da necessidade.
- A fronteira entre Compras, Recebimento, Estoque, PCP e Qualidade — sem implementar nenhum desses
  domínios.
- Requisição geral (sem Projeto/OF) — a nível conceitual de compatibilidade de modelo.
- Unidade técnica × apresentação comercial × unidade de estoque — só como restrição a preservar.
- O resultado da auditoria real de `decidir_ci_ce_de_of` (§18), para não presumir comportamento do
  domínio de Consumo Interno.

## 3. Fora de escopo

- Qualquer migration, RPC, alteração de tabela, RLS ou UI.
- Implementação de Recebimento/Conferência/Estoque como módulos funcionais (só a fronteira mínima é
  registrada, §12).
- Módulo de Qualidade / Não Conformidade.
- Financeiro / Contas a Pagar.
- Conversão automática de unidades (kg↔metro, barra↔mm, chapa↔m² etc.).
- Mecanismo técnico definitivo de Requisição geral (RPC/tela/endpoint).
- Módulo pesado de cotação — só o registro mínimo de envio de solicitação (§17).
- Devolução, cancelamento parcial ("de parcela"), fluxo de negociação excepcional de cancelamento.
- Modelo de centro de custo definitivo, múltiplas alçadas/aprovadores, integração técnica com e-mail.
- OF pai/filha para continuidade de produção (DEC-008 §2).
- Método de valorização de custo (médio, lote, específico) — pertence ao futuro domínio de
  Estoque/Custos (§15).
- Decisão de qual das alternativas técnicas remanescentes (§26) será implementada.

**Fronteira entre domínios** — nenhum destes domínios deve ser implementado nesta fatia; a fronteira
conceitual entre eles é preservada apenas para que a modelagem de Requisição/Pedido não invada o
espaço deles:

| Domínio | Responsabilidade preservada |
|---|---|
| PCP | Avaliar necessidade produtiva, decidir CI/CE e acompanhar atendimento da OF. |
| Compras | Planejar, cotar, formar Pedido, submetê-lo à aprovação, enviar e acompanhar. |
| Recebimento | Registrar chegada física. |
| Conferência/Aceite | Determinar o que foi aceito e pode ingressar como estoque disponível. |
| Estoque | Controlar material físico, disponibilidade, movimentações e baixas. |
| Qualidade | Tratar requisitos específicos de rastreabilidade e ocorrências/NC quando aplicável. |
| OF/Projeto | Receber apropriação de consumo/custo quando ocorrer a baixa física correspondente. |

A existência de um Pedido **não** substitui a necessidade da OF; **não** encerra automaticamente a
Requisição produtiva; **não** elimina o acompanhamento operacional pelo PCP.

## 4. Glossário

| Termo | Definição neste contrato |
|---|---|
| **Necessidade da OF** | Quantidade de matéria-prima que uma OF precisa, avaliada pelo PCP. Origem de uma decisão CI/CE. |
| **CI (Consumo Interno)** | Decisão do PCP de reservar administrativamente material já em estoque para a OF (§18). |
| **CE (Compra Externa)** | Decisão do PCP de que o estoque não atende a necessidade, gerando item de Requisição para o saldo externo. |
| **Requisição produtiva** | Requisição que pertence a exatamente um Projeto; pode conter itens de OFs diferentes, todas do mesmo Projeto (§5.1). |
| **Requisição geral** | Requisição sem Projeto/OF, com finalidade empresarial rastreável obrigatória (§5.3). |
| **Item da Requisição** | Uma linha da Requisição — material/quantidade específicos, com origem técnica inequívoca até sua OF/Projeto quando produtiva. |
| **Planejamento (de Compras)** | Workspace de trabalho — organiza, agrupa, apoia cotação/escolha de fornecedor, registra custo previsto. Nunca é cobertura definitiva. |
| **Pedido de Compra** | Documento único, numerado, dirigido a um fornecedor. Sem revisão — qualquer alteração pós-envio gera um Pedido novo (§10.3). |
| **Item do Pedido** | Uma linha do Pedido — quantidade comercial, unidade comercial, preço; editável até o envio, imutável depois. |
| **Cobertura comercial** | Vínculo N:N entre Item da Requisição e Item do Pedido, com `quantidade_vinculada`. Nunca representa estoque, propriedade ou atendimento físico (§8). |
| **Quantidade alocada / em preparação** | Soma de cobertura vinculada a Pedidos não cancelados, enviados ou não (§9.B). |
| **Quantidade comercialmente comprometida** | Soma de cobertura vinculada a Pedidos **enviados** e não cancelados (§9.C) — só nasce no envio. |
| **Compromisso comercial efetivo** | O que existe a partir do **envio** do Pedido ao fornecedor — nunca na criação nem na aprovação isoladas (§10.1). |
| **Atendimento operacional** | O fato de que uma necessidade recebeu material via baixa física de estoque. Independente de cobertura/compromisso comercial (§14). |
| **Recebimento** | Material chegou fisicamente. Não implica, por si só, estoque disponível (§12). |
| **Estoque disponível** | Quantidade conferida e aceita — distinta de "material recebido" (§12). |
| **Baixa física** | Movimentação de estoque que transfere material (e custo) para uma necessidade/OF específica. Único evento de atendimento e apropriação de custo (§14, §15). |
| **Apresentação comercial** | Forma em que o fornecedor vende o material, podendo diferir da unidade técnica da necessidade e da unidade de estoque (§6). |

## 5. Requisição de Compra

### 5.1 Requisição produtiva

**[Regra de negócio]** Cada Requisição produtiva pertence a **exatamente um Projeto**. Um Projeto
pode possuir uma ou mais Requisições produtivas — **não** "um Projeto = uma única Requisição". Uma
Requisição produtiva pode conter vários itens, e os itens podem ter origem em OFs diferentes, desde
que todas pertençam ao mesmo Projeto da Requisição:

```
Projeto 260015
→ Requisição RC-001
   → Item A → OF 001
   → Item B → OF 002
   → Item C → OF 003
```

A OF é origem do **item**, nunca fonte autoritativa do cabeçalho. Uma nova necessidade legítima pode
gerar uma nova Requisição; uma Requisição em estado terminal (cancelada) nunca é reaberta
silenciosamente — se a necessidade voltar a existir, nasce uma Requisição nova (já estabelecido no
CONTRATO §11, mantido).

### 5.2 Origem do item produtivo

**[Regra de negócio]** Cada Item da Requisição produtiva deve possuir origem técnica inequívoca até
sua OF e Projeto. Itens do mesmo material vindos de necessidades de OFs diferentes **não** devem ser
agregados dentro da Requisição, mesmo que sejam o mesmo material:

```
Requisição do Projeto 260015
Item A → necessidade da OF 01
Item B → necessidade da OF 02
```

O agrupamento comercial — quando fizer sentido — acontece **depois**, no Planejamento (§7) ou na
cobertura Item da Requisição ↔ Item do Pedido (§8), nunca dentro do cabeçalho ou dos itens da
Requisição em si.

Este contrato **não decide antecipadamente** se a cadeia técnica exigirá duplicar `necessidade_id`,
`of_id`, `item_roteiro_id` e `projeto_id` no item, ou se bastará um único vínculo do qual os demais
são derivados — isso é desenho técnico posterior. A regra funcional fixada aqui é: **a cadeia deve
permitir rastrear inequivocamente a necessidade até sua OF e Projeto**. O desenho técnico posterior
precisa verificar: integridade da cadeia; imutabilidade; mesma empresa em toda a cadeia; a OF
pertencer de fato ao Projeto da Requisição; e o impacto de exclusões/alterações futuras na origem.

### 5.3 Requisição geral

**[Regra de negócio]** Pode existir sem Projeto/OF para finalidades empresariais legítimas —
manutenção, limpeza, escritório, administrativo, infraestrutura, estoque geral, outras finalidades
válidas. **Nunca** pode existir uma Requisição "sem origem/finalidade conhecida" — a finalidade
empresarial deve ser rastreável, mesmo sem Projeto/OF. O conjunto exato de finalidades **não é
congelado em enum fixo nesta fatia** — só a obrigatoriedade de existir alguma finalidade rastreável.

### 5.4 Numeração da Requisição

**[Regra de negócio]** Requisição possui numeração própria: automática, sequencial por empresa, única
por empresa, independente da numeração do Pedido. Número de Requisição cancelada **nunca é
reutilizado**.

## 6. Unidades

**[Regra de negócio]** A unidade pertence ao **item/material**, nunca ao cabeçalho da Requisição — a
mesma Requisição pode legitimamente conter aço em mm, chapa em peça, parafuso em unidade e óleo em
litro, sem nenhuma conversão automática genérica entre eles. Não presumir nesta fatia conversões como
kg↔metro, barra↔mm, chapa↔m² ou similares. Qualquer campo legado de rendimento, múltiplo,
arredondamento ou conversão de unidade já existente no código deve ser **auditado** antes de ser
tratado como regra de negócio vigente — não classificado automaticamente só por já existir.

## 7. Planejamento de Compras

**[Regra de negócio]** Para necessidade vinculada a Projeto, Planejamento de Compras é **obrigatório**
antes da formalização do Pedido. Para compra sem Projeto, é **opcional** — usado se Compras
considerar útil.

Papel do Planejamento: organizar necessidades; apresentar materiais semelhantes, Projeto/OF/data/
quantidade; permitir inclusão/exclusão; apoiar cotação e escolha de fornecedor; registrar custo
previsto/planejado.

O Planejamento **não é**: cobertura definitiva; estoque; reserva física; propriedade de material;
compromisso comercial; encerramento da Requisição.

**Limite da proveniência histórica (correção desta versão)**: a versão 1.0 deste documento afirmava
que a proveniência Pedido→Planejamento seria "100% derivável" navegando `pedido_compra_itens →
cobertura → requisicao_compra_itens → planejamento_compra_origens`. **Essa afirmação está corrigida
— não se sustenta.** O mesmo Item de Requisição pode ter participado de mais de um Planejamento ao
longo do trabalho (a composição do Planejamento é editável), então essa navegação pode retornar mais
de um Planejamento candidato, sem meio de saber qual efetivamente originou um Pedido específico. A
navegação dá **contexto informativo**, nunca um fato histórico garantido.

Não criar, nesta fatia: tabela dedicada Planejamento↔Pedido; FK de origem no cabeçalho do Pedido; ou
um campo de snapshot de Planejamento na relação de cobertura — nenhum desses tem necessidade
demonstrada até agora. A cobertura comercial (§8) já funciona corretamente sem depender de nenhum
deles; um mecanismo de rastreio de proveniência só se justificaria se surgir uma necessidade real de
relatório (ex.: comparar custo previsto de um Planejamento com o Pedido que efetivamente nasceu
dele) — não confirmada nesta fatia.

## 8. Cobertura Comercial (Item da Requisição ↔ Item do Pedido)

**[Regra de negócio]** Relação definitiva: **N:N** entre Item da Requisição e Item do Pedido.
Responsabilidade única: responder "qual quantidade desta necessidade está associada a este Item do
Pedido?". Campo conceitual principal: `quantidade_vinculada`.

A cobertura **não representa**: estoque; lote; NF; baixa física; reserva física; propriedade da OF;
custo realizado.

**Proteção contra duplicidade**: avaliar como regra técnica recomendada `UNIQUE
(requisicao_compra_item_id, pedido_compra_item_id)` — impede duas linhas duplicadas representando
exatamente o mesmo par; **não elimina** o N:N (um Item de Requisição continua podendo se associar a
vários Itens de Pedido, e vice-versa). Isso é apontado como recomendação técnica, não SQL definitivo.

**Mutabilidade**: antes do envio do Pedido pai, `quantidade_vinculada` e a composição da cobertura
podem ser ajustadas por fluxo controlado; alterações relevantes depois da aprovação invalidam a
aprovação (§10.2). Depois do envio, Pedido, itens e vínculos de cobertura tornam-se **imutáveis** —
não existe edição silenciosa pós-envio, revisão do mesmo Pedido, nem reenvio de nova versão do mesmo
Pedido (§10.3). Se o Pedido for cancelado, o vínculo permanece fisicamente registrado para auditoria,
deixa de contar nos cálculos derivados aplicáveis (§9), e seu histórico nunca é apagado.

## 9. Quantidades Derivadas

**[Regra de negócio]** Nenhum saldo autoritativo deve ser persistido. Definições conceituais:

- **A. Quantidade necessária** — a quantidade necessária registrada no Item da Requisição. Revisão
  formal da necessidade fica fora desta fatia — não criar `item_anterior_id`/`status_versao` novos,
  nem inventar mecanismo substituto de versionamento nesta rodada.
- **B. Quantidade alocada/em preparação** = soma dos vínculos de cobertura de Pedidos **não
  cancelados**, enviados ou não.
- **C. Quantidade comercialmente comprometida** = soma dos vínculos de cobertura de Pedidos
  **enviados e não cancelados**.
- **D. Quantidade livre/não alocada** = A − B.
- **E. Quantidade ainda não comprometida** = A − C.

**Invariante desta fatia**: a soma das quantidades vinculadas por cobertura não pode ultrapassar a
quantidade necessária registrada no Item da Requisição (A), considerando os Pedidos que contam para
aquele cálculo (B ou C, conforme o caso). Esta fatia não decide agora quando a quantidade necessária
em si pode ser aumentada ou reduzida — isso pertence à revisão formal de necessidade, tratada
separadamente.

Por construção, C ⊆ B, logo E ≥ D sempre.

## 10. Pedido de Compra — ciclo de vida

### 10.1 Criação, edição, aprovação, envio

**[Regra de negócio]**

- **Pedido criado**: editável; **não** é compromisso comercial.
- **Pedido aprovado**: autorizado internamente; **ainda não** é compromisso comercial.
- **Pedido enviado**: **compromisso comercial efetivo**; conteúdo comercial torna-se imutável a
  partir daqui.

```
criação → edição → aprovação → envio → compromisso comercial
```

Antes do envio, o Pedido pode ser corrigido/alterado livremente, respeitando integridade e auditoria:
fornecedor, preço, quantidade, material/especificação, prazo, condição de pagamento, frete, impostos/
encargos e composição dos itens podem mudar.

**Autoaprovação**: se a configuração da empresa permitir, comprador e aprovador podem ser a mesma
pessoa — mesmo assim, o evento de aprovação continua explícito e auditável, nunca tratado como
ausência de aprovação (DEC-008 §8).

### 10.2 Alteração após aprovação (reaprovação)

**[Regra de negócio]** Qualquer alteração comercial relevante após a aprovação **invalida a aprovação
anterior**, exigindo nova aprovação antes do envio. Exemplos de alteração comercial relevante:
fornecedor, itens, material/especificação, quantidade, preço, impostos, frete, pagamento, prazo,
vínculos de cobertura, ou qualquer outra condição comercial relevante.

```
Aprovado → alteração comercial relevante → aprovação invalidada → nova aprovação → envio
```

Observações exclusivamente internas/administrativas, sem efeito comercial, podem não invalidar a
aprovação — mas em caso de dúvida sobre o impacto, tratar **conservadoramente** (exigir nova
aprovação). O critério exato de quais campos contam como "puramente formal" não é fechado nesta
fatia — é detalhe de engenharia, não bloqueia o desenho.

### 10.3 Pedido enviado — imutabilidade e unicidade

**[Regra de negócio — decisão definitiva]** Pedido de Compra é **único**. Não existe revisão do mesmo
Pedido, nem reenvio do mesmo Pedido, nem "Pedido 001 Rev.01". Depois do envio, qualquer alteração
comercial necessária exige a criação de **outro** Pedido — com número novo, nova aprovação, novo
envio, novo compromisso comercial. O Pedido original permanece **integralmente preservado**, nunca
sobrescrito (§11.3).

### 10.4 Numeração do Pedido

**[Regra de negócio]** Pedido possui numeração própria: automática, sequencial por empresa, única por
empresa, independente da numeração da Requisição. Número de Pedido cancelado **nunca é reutilizado**.

### 10.5 Fornecedor

**[Regra de negócio]** Pedido deve possuir fornecedor definitivo (`fornecedor_id`), obrigatoriamente
da mesma empresa/tenant do Pedido — proteger tecnicamente contra referência cross-tenant. O Pedido
deve preservar snapshot histórico adequado dos dados comerciais do fornecedor no momento da
formalização; alterações futuras no cadastro do fornecedor não alteram retroativamente Pedidos
antigos (DEC-008 §7).

## 11. Cancelamento

### 11.1 Antes do envio

**[Regra de negócio]** Cancelamento interno normal, permitido sem restrição adicional. Registrar:
motivo, usuário, data/hora. Estado terminal, sem reativação. Número do Pedido nunca reutilizado.

### 11.2 Depois do envio

**[Regra de negócio]** Depois do envio, o Pedido já representa compromisso comercial. O cancelamento
simples só pode ocorrer se: Compras consultar o fornecedor; o fornecedor concordar; a operação ainda
permitir cancelamento; houver motivo; e houver evidência/observação auditável da concordância. Se
existirem fatos que exijam tratamento específico — recebimento parcial/total já ocorrido, corte,
fabricação, personalização, ou outra obrigação comercial relevante já assumida — o caso sai do
cancelamento simples desta fatia; não definir agora fluxo de devolução, cancelamento parcial,
ocorrência ou negociação excepcional. **Não existe "cancelamento de parcela" nesta fatia** —
cancelamento é sempre do Pedido inteiro.

Ao cancelar (pré ou pós-envio): o Pedido permanece preservado; seus itens e vínculos de cobertura
permanecem para auditoria; deixam de contar como alocação/compromisso (§9); a necessidade volta a
aparecer como pendente (quantidade livre/não comprometida recalculada); um novo Pedido pode ser
criado cobrindo o saldo; o número cancelado não é reutilizado.

### 11.3 Novo Pedido após alteração

**[Regra de negócio]** Quando um Pedido enviado precisa mudar, cria-se um Pedido novo. O Pedido
original pode continuar válido ou ser cancelado (se o fornecedor aceitar, §11.2) — em nenhum dos dois
casos o Pedido novo substitui silenciosamente o anterior; não existe sobrescrita histórica.

## 12. Recebimento

**[Regra de negócio]** Distinção mínima preservada (DEC-008 §13/§16), sem redesenhar o domínio nesta
fatia:

```
chegada física → conferência → aceite → entrada no estoque disponível da empresa
```

Chegada física **≠** material disponível — só o que foi conferido e aceito entra no estoque
disponível. Recebimento parcial: representado como status textual explícito + alerta visual no
Dashboard; **não** é coluna própria; **não** é automaticamente divergência (DEC-008 §14/§15).

**[Regra de negócio]** Rastreabilidade física completa **não** é requisito universal para todo
material. Podem existir materiais legítimos como estoque antigo, sobra legítima incorporada à
empresa, material sem lote, material sem certificado, entre outros contextos válidos. Quando
existirem lote, certificado, NF, origem ou outro dado de rastreabilidade, eles devem ser preservados.
A obrigatoriedade de rastreabilidade completa pode decorrer de regra da empresa, Qualidade, requisito
do cliente, tipo de material, processo ou norma aplicável — quando obrigatória, deve ser respeitada;
quando não obrigatória, a ausência desses dados não pode bloquear universalmente a utilização do
material. Não inventar regras adicionais de Qualidade nesta fatia.

## 13. Propriedade do Material

**[Regra de negócio]** Material comprado pertence à **empresa**, nunca à OF que justificou a compra.
Exemplo:

```
OF X justificou a compra.
Material entrou no estoque.
Estoque entregou esse material para OF Y.

Resultado:
- custo realizado vai para OF Y;
- necessidade da OF X continua pendente;
- a compra histórica não cria propriedade física para OF X.
```

Quatro conceitos permanecem separados, nunca confundidos entre si: origem da necessidade ≠ origem da
compra ≠ destino físico do material ≠ apropriação real do custo.

## 14. Atendimento da Necessidade Produtiva

**[Regra de negócio]** Cobertura comercial e atendimento físico são fatos diferentes:

- Pedido criado **≠** necessidade atendida.
- Pedido enviado **≠** necessidade atendida.
- Material recebido no estoque da empresa **≠** necessidade da OF atendida.

A necessidade produtiva é atendida quantitativamente pela **baixa física** vinculada à
necessidade/OF correspondente:

```
necessidade: 4.500 mm
baixa para a OF/necessidade: 3.000 mm → atendimento parcial = 3.000 mm; restante = 1.500 mm
nova baixa: 1.500 mm → necessidade integralmente atendida
```

A Requisição produtiva estará integralmente atendida quando **todas** as quantidades de **todos** os
seus itens estiverem integralmente atendidas. Não exigir 100% de material disponível para iniciar
produção — atendimento parcial continua válido (DEC-008 §2, CONTRATO regra 11).

**[Regra de negócio]** O PCP pode avaliar operacionalmente o risco da necessidade/material — por
exemplo: sem risco; atenção; risco de atraso. Essa avaliação é **momentânea**: pode mudar com prazo,
prioridade, estoque ou chegada de material. Não exige histórico obrigatório próprio a cada
recalculada, e não deve virar máquina de estados ou evento permanente sem necessidade real — registrar
fatos operacionais permanentes somente quando de fato necessário.

**[Regra de negócio]** Se atraso/falta de material efetivamente causar impacto no Projeto, o PCP
registra a causa pertinente; quando houver ocorrência relacionada a Compras/fornecedor, eventual
tratamento de Não Conformidade pertence ao domínio de Qualidade. Esta fatia **não** implementa
Qualidade nem cria fluxo de Não Conformidade — só preserva a fronteira entre os domínios.

## 15. Custo Realizado

**[Regra de negócio]** O custo realizado da OF/projeto nasce **exclusivamente** na baixa física do
estoque para a OF. Não usar, como custo realizado: o custo previsto do Planejamento; o preço
estimado; ou o preço isolado do Pedido. O valor efetivamente realizado será definido pelo futuro
domínio de Estoque/Custos, conforme o método de valorização da empresa — custo médio, lote, custo
específico ou outro método **não é decidido nesta fatia**.

## 16. Requisição Geral — Encerramento

**[Regra de negócio, mínima]** Requisição geral não depende de baixa para OF para se considerar
atendida — depende do recebimento/conferência/aceite do que lhe corresponde. O critério técnico exato
de encerramento deve preservar a distinção entre atendimento parcial e integral por item. Nenhum
enum/status definitivo é imposto nesta fatia.

**[Regra de negócio]** Nem toda compra geral está fisicamente controlada em estoque — a fatia
distingue três naturezas, sem congelar aqui um catálogo definitivo de tipos de compra:

- **A. Material físico controlado em estoque** — após recebimento, conferência e aceite, entra no
  estoque da empresa, seguindo as mesmas regras já registradas (§12).
- **B. Item de consumo imediato não controlado em estoque** — não deve gerar saldo físico artificial;
  segue o fluxo correspondente à sua natureza, fora do modelo de matéria-prima.
- **C. Serviço ou despesa sem material físico** — não cria saldo de estoque, não cria lote artificial,
  não cria movimentação de matéria-prima artificial.

Esta fatia não força todo tipo de compra geral para dentro do domínio físico de Estoque. Ao mesmo
tempo, quando houver material físico controlado (categoria A), recebimento/conferência/aceite
continuam obrigatórios conforme as regras já existentes (§12).

## 17. Cotação

**[Regra de negócio]** O NEXOTFE deve permitir, futuramente, enviar solicitação de cotação por
e-mail, registrando como evidência mínima: fornecedor destinatário; data/hora; usuário que enviou;
itens/quantidades solicitados; contexto de Compras; versão/documento enviado. A negociação em si pode
continuar por e-mail, telefone, conversa ou outros meios, sem rastreamento estruturado nesta fatia.
Não criar nesta fatia: módulo completo de propostas; ranking automático de fornecedores; workflow de
aprovação da cotação; captura automática de resposta por e-mail; comparação estruturada obrigatória
de propostas.

## 18. CI — Consumo Interno (resultado da auditoria de código real)

**[Regra de negócio]** CI pode ser parcial — não é uma decisão binária de 100% CI ou 100% CE. Exemplo
conceitual:

```
Necessidade da OF: 4.500 mm
Estoque interno utilizável: 3.000 mm

CI: 3.000 mm
CE/Requisição: 1.500 mm
```

A decisão de CI parcial representa reserva/separação administrativa — **nunca** baixa física, **nunca**
custo realizado. A baixa física só ocorre quando o material for efetivamente entregue/baixado para a
OF (§14, §15).

**[Situação atual — investigado por leitura direta de `20260901222711_of_decisao_ci_ce_necessidades.sql`
e das definições de `estoque_saldos`, `estoque_movimentacoes`, `consumos_internos`]**

**Fatos auditados** (nunca inferidos): `decidir_ci_ce_de_of` trava a linha de saldo com `FOR UPDATE`;
incrementa `saldo_reservado`; **nunca** toca `saldo_disponivel`; grava `estoque_movimentacoes` com
`tipo_movimento='reserva'`; grava `consumos_internos` com `custo_unitario_material=0`; **nunca** grava
`tipo_movimento='saida'`. Busca exaustiva confirmou que nenhuma outra função, em nenhuma migration,
faz `UPDATE` de `consumos_internos` ou de `estoque_saldos.saldo_disponivel`.

**Interpretação prudente**: esses fatos são coerentes com a regra de negócio de que custo realizado
só nasce na baixa física (§15) — a função implementa a camada administrativa de reserva (CI), não
contradiz a regra. **Esta auditoria não abrangeu toda a aplicação** — foi feita sobre as migrations
(schema e funções SQL), não sobre a totalidade do código; não se afirma que nenhuma lógica adicional
exista em outro lugar não coberto por esta busca.

**Lacuna identificada, fora do escopo desta fatia**: o mecanismo de baixa física real (que reduziria
`saldo_disponivel`, criaria movimentação `'saida'` e preencheria custo real) não foi encontrado em
nenhuma migration auditada. Isso pertence ao domínio de Estoque, já fora de escopo (§3) — não deve ser
implementado nesta fatia.

## 19. Segurança Multiempresa

**[Regra de negócio + requisito técnico]** Para qualquer estrutura nova/adaptada desta fatia:
`empresa_id` explícito; pais e filhos sempre da mesma empresa; fornecedor da mesma empresa do Pedido;
Requisição/Item/Pedido/Item/Cobertura sem cruzamento entre tenants; RLS; prevenção de IDOR; escrita
controlada (nunca tabela de edição livre pelo frontend); grants mínimos; `SECURITY DEFINER` com
`search_path` seguro quando usado; FK composta ou validação explícita equivalente quando FK composta
não for prática — mesmo padrão já auditado e aprovado nesta sessão para as funções existentes. Testes
mínimos exigidos antes de qualquer escrita em produção: duas empresas distintas tentando referenciar
objetos uma da outra (deve falhar sempre).

## 20. Concorrência

**[Requisito técnico]** Locks determinísticos, em ordem consistente; revalidação da invariante de
soma (§9) dentro da mesma transação, nunca confiando em leitura anterior; prevenção de overcoverage e
de vínculo duplicado; atomicidade de Pedido + itens + cobertura (tudo ou nada); tratamento seguro de
cancelamento concorrente com criação/edição de cobertura para a mesma necessidade. Testes mínimos:
duas sessões tentando cobrir a mesma necessidade simultaneamente; cancelamento concorrente com
criação de novo vínculo.

## 21. Fluxo Conceitual Final

```
Necessidade da OF
  → Requisição produtiva do Projeto
    → Planejamento de Compras (obrigatório para Projeto)
      → Pedido em preparação (editável)
        → Aprovação
          → [alteração comercial relevante → nova aprovação]
        → Envio ao fornecedor / compromisso comercial efetivo
          → Recebimento físico
            → Conferência e aceite
              → Estoque da empresa
                → Baixa física vinculada à necessidade/OF
                  → Atendimento parcial ou integral da necessidade
                    → Custo realizado apropriado à OF/projeto
```

Se a baixa ocorrer para uma necessidade/OF diferente da que originalmente justificou a compra: só a
necessidade efetivamente vinculada àquela movimentação é atendida; a necessidade que originalmente
justificou a compra continua pendente (§13, §14).

Para compra sem Projeto: `Requisição geral → análise do comprador → Planejamento (opcional) → Pedido
de Compra → restante do fluxo idêntico`.

## 22. Modelo atual encontrado no repositório

**[Situação atual]** — verificado por leitura direta de `supabase/migrations/*.sql` (nunca
`supabase/baseline/`, reescrita paralela nunca aplicada em produção):

| Tabela | Papel hoje | Achado central |
|---|---|---|
| `requisicoes_compra` | Cabeçalho da Requisição | `status` (`aberta/em_compra/atendida/cancelada`) existe no CHECK, mas nenhuma RPC viva jamais o altera além do valor inicial `aberta` — estados mortos. |
| `requisicao_compra_itens` | Item da Requisição | `quantidade_necessaria` imutável após criação (trigger). Tem `necessidade_id` (FK a `necessidades_of_material`, nullable, único parcial) e scaffolding morto (`item_anterior_id`, `status_versao`) nunca gravado por nenhuma RPC viva. |
| `planejamentos_compra` | Lote/decisão comercial provisória | Estados `em_planejamento/pronto_pedido/convertido_pedido/cancelado`; versionamento otimista; histórico próprio. |
| `planejamento_compra_origens` | Vínculo planejamento↔item de requisição | `origem_ativa` com índice único parcial — no máx. 1 origem ativa por item, globalmente. Só desativada pelo cancelamento do planejamento pai; nunca pela conversão em Pedido. `quantidade_necessaria` sempre a quantidade total do item. |
| `pedidos_compra` | Cabeçalho do Pedido | `planejamento_compra_id` com UNIQUE — 1 planejamento → no máximo 1 Pedido. |
| `pedido_compra_itens` | Item do Pedido | Sem FK direta para `requisicao_compra_item_id`/`requisicao_compra_id`. Vínculo indireto em 2 saltos via planejamento. `gerar_pedido_compra_rascunho` insere 1 único item agregado por planejamento. |

**Funções vivas relevantes**: `criar_planejamento_compra_a_partir_de_requisicoes`,
`decidir_compra_planejamento`, `gerar_pedido_compra_rascunho`, `cancelar_planejamento_compra`. **Não
existe** `cancelar_pedido_compra` em nenhuma migration. `decidir_ci_ce_de_of` (auditada em detalhe no
§18) e `ajustar_of` têm invariante de não-reprocessamento (§23, achado 3).

## 23. Conflitos entre modelo atual e contrato pretendido

**[Lacuna/Conflito]**

1. **Ausência de mecanismo para liberar/recalcular cobertura após cancelamento de Pedido.** Não existe
   `cancelar_pedido_compra`; o único gatilho que desativa `origem_ativa` é o cancelamento do
   planejamento, nunca a conversão em Pedido.
2. **Impossibilidade estrutural de cobertura parcial em 2 Pedidos.**
   `criar_planejamento_compra_a_partir_de_requisicoes` sempre usa a quantidade inteira do item.
3. **[Ponto a investigar, não conflito comprovado]** `decidir_ci_ce_de_of` e `ajustar_of` proíbem
   reprocessamento da mesma necessidade — plausivelmente compatível com o modelo revisado, já que o
   PCP só precisa decidir CI/CE uma vez, e Compras trata a cobertura comercial (cobrir, cancelar,
   recobrir) de forma totalmente separada e posterior, sem exigir nova execução dessas funções.
4. **Vínculo indireto (2 saltos) em vez de relação definitiva própria** — resolvido conceitualmente
   pela cobertura comercial do §8.
5. **Ausência de `cancelar_pedido_compra`.**
6. **`requisicoes_compra.status` morto** — nunca escrito além do valor inicial.

## 24. Gaps entre modelo atual e regras consolidadas

**[Lacuna/Conflito]** — ausências, não conflitos ativos:

- Nenhuma coluna/mecanismo representa quantidade coberta, alocada, comprometida ou pendente por item
  de Requisição.
- Nenhuma relação N:N Item da Requisição ↔ Item do Pedido.
- Nenhuma distinção técnica entre cobertura comercial, compromisso comercial e atendimento
  operacional.
- Nenhuma tabela `pedidos_compra_historico`.
- Nenhum mecanismo técnico para Requisição geral — `registrar_requisicao_compra_material` está com
  `EXECUTE` revogado de todos os papéis desde o Incremento 6.
- Nenhuma representação de finalidade/categoria de Requisição geral.
- Nenhuma coluna/estrutura para as 3 camadas de unidade (técnica/comercial/estoque).
- Nenhum mecanismo de baixa física real para matéria-prima (§18).

## 25. Compatibilidade/Migração de Dados Existentes

**[Lacuna identificada, não resolvida — nenhuma migration desenhada]**

- Toda origem hoje em `planejamento_compra_origens` com `origem_ativa=true` e planejamento
  `convertido_pedido` representa cobertura comercial 100% — se a relação de cobertura definitiva
  (§8) for criada, dados existentes precisariam de backfill a partir dessas origens.
- `requisicoes_compra.status` nunca foi escrito além de `'aberta'` — qualquer semântica nova
  encontrará 100% das Requisições formalmente "abertas".
- O scaffolding morto (`item_anterior_id`/`status_versao`) já existe fisicamente, com `default
  'ativa'` em todas as linhas.

**Regra de segurança para a futura migration**: antes de qualquer alteração estrutural
destrutiva/substitutiva, confirmar automaticamente que `requisicoes_compra`, `requisicao_compra_itens`,
`planejamentos_compra`, `planejamento_compra_origens`, `pedidos_compra` e `pedido_compra_itens`
continuam sem dados operacionais reais. Se qualquer dado aparecer, a execução deve **parar** e exigir
nova avaliação de migração/backfill — nunca "se virar" com backfill automático improvisado.

## 26. Decisões técnicas ainda abertas

**Nenhuma decisão de negócio bloqueadora identificada.** O que resta é desenho técnico:

1. Desenho exato (campos, nomes, constraints) da relação de cobertura comercial (§8) — a lista de
   campos deste contrato é ponto de partida, não proposta final.
2. Mecanismo técnico que garante a invariante `SOMA(quantidade_vinculada) ≤ quantidade_necessaria` —
   trigger com lock, constraint declarativa, ou validação em cada função de escrita.
3. Se a cadeia de origem do item produtivo (§5.2) precisa duplicar `necessidade_id`/`of_id`/
   `item_roteiro_id`/`projeto_id`, ou se basta um único vínculo do qual os demais são derivados.
4. Forma técnica do histórico de cancelamento — linha marcada inativa in-place vs. tabela de
   histórico separada.
5. Mecanismo técnico de Requisição geral — RPC nova, adaptação de
   `registrar_requisicao_compra_material` (hoje inalcançável), ou outro caminho.
6. Terceira camada de unidade (estoque) e sua relação com unidade técnica/comercial.
7. Estratégia de backfill para dados já existentes (§25) — condicionada à confirmação de que as
   tabelas continuam vazias no momento da migration.
8. Como a implementação detectará e classificará com segurança, no momento da edição, se uma
   alteração é comercialmente relevante ou puramente formal/interna — a lista de alterações que
   invalidam aprovação já é regra de negócio fechada (§10.2); a engenharia decide apenas o mecanismo
   de detecção, nunca quais alterações contam como relevantes.

## 27. Itens explicitamente adiados

Herdados do DEC-008 §23 + reforçados nesta fatia:

- Modelo definitivo de cotações (além do registro mínimo de envio, §17).
- Múltiplas alçadas de aprovação por valor, múltiplos aprovadores.
- Integração técnica com e-mail.
- Modelo definitivo de centro de custo.
- Integração com Contas a Pagar.
- Implementação do estoque (movimentação, lote, rastreabilidade física completa, baixa física real).
- Desenho definitivo da UI.
- Módulo de Qualidade / Não Conformidade.
- Conversões automáticas de unidade.
- Devolução, cancelamento parcial, fluxo de negociação excepcional de cancelamento.
- OF pai/filha para continuidade de produção.
- Método de valorização de custo (médio, lote, específico).

## 28. Critérios que uma futura implementação deverá satisfazer

1. Representar a cobertura comercial em nível N:N, com quantidade por par (§8).
2. Nunca deixar um Item de Requisição permanentemente inelegível para nova cobertura após
   cancelamento do Pedido que o cobria (§11).
3. Permitir cobertura parcial de uma necessidade por múltiplos Pedidos, inclusive ao longo do tempo;
   ao cancelar um deles, sua parcela deixa de contar, mas a necessidade original não desaparece (§9,
   §11).
4. Nunca persistir coluna de saldo sem justificativa técnica forte — preferir cálculo derivado (§9).
5. Nunca confundir cobertura comercial, compromisso comercial e atendimento físico entre si (§8, §14).
6. Preservar rastreabilidade da origem produtiva no nível do item, mesmo após cancelamento (§5.2,
   §11).
7. Nunca cancelar automaticamente a Requisição, outros itens dela, ou a necessidade da OF, ao
   cancelar um Pedido (§11).
8. Preservar histórico de cancelamento sem permitir reativação; número nunca reutilizado (§11).
9. Nunca permitir revisão/reenvio do mesmo Pedido — qualquer mudança pós-envio exige Pedido novo
   (§10.3).
10. Invalidar e exigir nova aprovação sempre que houver alteração comercial relevante após aprovação
    (§10.2).
11. Ser compatível com Requisição geral, sem forçar todo item comprado para dentro do modelo de
    matéria-prima/estoque (§5.3, §16).
12. Preservar a possibilidade de 3 camadas de unidade (técnica/comercial/estoque) sem implementar
    conversão automática (§6).
13. Ser auditada quanto a concorrência (locks, versão otimista) antes de qualquer escrita em produção
    (§20).
14. Confirmar automaticamente ausência de dados operacionais reais antes de qualquer migration
    destrutiva/substitutiva (§25).

---

Este documento não altera o DEC-008 (que permanece vigente e inalterado) nem implementa nenhum
código, migration ou RPC. É um contrato de especificação — a próxima rodada deve decidir os pontos do
§26 antes de qualquer escrita técnica.
