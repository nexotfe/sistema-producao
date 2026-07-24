# DEC-001 — Decisão de Negócio: Desconto Comercial do Orçamento

**Data:** 2026-07-24
**Versão:** 1.0
**Status:** Vigente
**Natureza do documento:** decisão de negócio formalizada — registra a
regra de uma funcionalidade específica (o desconto comercial sobre o
Orçamento), não um padrão de arquitetura cross-cutting como os
documentos `PAD-`, nem estado de auditoria como `AUD-`, nem
implementação de referência como `IMP-`, nem um registro vivo que
cresce por investigação tabela a tabela como `REG-`. Este é o primeiro
documento da série `DEC-`: uma vez aprovado, tem a mesma força de regra
permanente que os demais documentos desta pasta — alterações futuras
exigem nova aprovação explícita, não reinterpretação silenciosa.

---

## Objetivo

Na indústria de fabricação sob encomenda, usinagem, ferramentaria e
desenvolvimento de produtos, o valor calculado pelo sistema raramente é
exatamente o valor fechado com o cliente. É comum que, após a
apresentação da proposta, ocorra uma negociação comercial, resultando
na concessão de um desconto sobre o valor total do orçamento. O
NEXOTFE deverá representar esse processo da mesma forma que ocorre na
prática.

## Princípio

O sistema deverá separar claramente dois conceitos.

**Valor Técnico do Orçamento:** é o valor calculado automaticamente
pelo ERP através da formação de preço. Esse cálculo considera
matéria-prima, processos produtivos, serviços de terceiros, custos
industriais, custos indiretos, impostos e margem de lucro definida
pelo orçamentista. Este valor representa o preço tecnicamente
calculado pelo sistema e nunca deverá ser alterado pelo desconto
comercial.

**Valor Comercial do Orçamento:** é o valor efetivamente negociado com
o cliente. Corresponde ao Valor Técnico do Orçamento menos o desconto
comercial concedido durante a negociação. Este é o valor apresentado
ao cliente e utilizado no fechamento da venda.

## Regra de Negócio

O desconto comercial deverá ser aplicado exclusivamente sobre o Valor
Técnico do Orçamento, ou seja, sobre o valor já calculado pelo ERP,
incluindo impostos.

Exemplo numérico: Valor Técnico do Orçamento R$ 100.000,00. Desconto
Comercial de 20%. Valor do desconto R$ 20.000,00. Valor Comercial
R$ 80.000,00.

O desconto é uma simples redução financeira sobre o valor total
apresentado ao cliente. Não existe recálculo de custos. Não existe
recálculo de impostos. A formação de preço permanece inalterada.

O desconto comercial é limitado ao intervalo de 0% (inclusive) a 100%
(exclusive) — um desconto de exatamente 100% não é permitido, por
representar fornecimento gratuito, o que não corresponde a uma
negociação comercial real. Este limite é uma decisão de negócio (não
uma necessidade de cálculo — a fórmula funciona corretamente mesmo em
100%) e serve como proteção contra erro de digitação.

## Responsabilidade

A definição do desconto comercial é uma decisão do orçamentista ou do
responsável pela negociação. O ERP não deverá impedir essa decisão.
Sua responsabilidade é apresentar, de forma clara e transparente, os
impactos da negociação.

## Informações apresentadas ao usuário

A tela de Orçamento deverá apresentar de forma clara:

- Valor Técnico do Orçamento;
- Percentual de Desconto;
- Valor do Desconto;
- Motivo do desconto, campo opcional, exemplo "Negociação Comercial";
- Valor Comercial do Orçamento.

Opcionalmente, poderão ser apresentados indicadores adicionais, como
Margem Técnica e Margem Efetiva, desde que utilizem a metodologia
oficial de cálculo adotada pelo NEXOTFE.

O Valor Técnico do Orçamento deverá permanecer sempre visível e nunca
será substituído pelo Valor Comercial do Orçamento.

## Escopo desta versão

Nesta versão, o desconto comercial é tratado como um único estado
vigente do orçamento. Alterações anteriores não são armazenadas. A
adoção de histórico de negociações poderá ser avaliada futuramente,
caso surjam requisitos que justifiquem sua implementação.

Como consequência, os indicadores possíveis nesta primeira versão
refletem o estado atual da carteira, por exemplo percentual médio de
desconto entre orçamentos, ou clientes e vendedores com desconto mais
alto hoje, mas não permitem reconstruir a evolução de uma negociação
ao longo do tempo, nem quantas vezes um orçamento foi renegociado.

## Objetivo da funcionalidade

O desconto comercial não altera a formação de preço. Sua finalidade é
representar fielmente o processo de negociação existente entre empresa
e cliente. Ao manter separados o Valor Técnico do Orçamento e o Valor
Comercial do Orçamento, o NEXOTFE preserva a integridade dos cálculos
técnicos, permite análises futuras sobre políticas de desconto, mantém
indicadores confiáveis de rentabilidade e garante transparência entre
o preço calculado pelo ERP e o preço efetivamente negociado.

## Regras permanentes

O desconto comercial pertence exclusivamente à camada comercial do
orçamento. Ele não poderá alterar:

- custos;
- matéria-prima;
- operações;
- recursos produtivos;
- tempos de fabricação;
- impostos;
- margem utilizada na formação de preço;
- qualquer outro cálculo técnico do orçamento.

Sua única finalidade é reduzir o valor final apresentado ao cliente.

## Consistência entre módulos

Sempre que o Valor Comercial do Orçamento for utilizado em qualquer
módulo, documento, API ou integração do sistema, esse consumidor
deverá adotar exatamente a mesma regra de cálculo do Orçamento. Não é
permitido que existam diferenças entre o valor apresentado no
Orçamento, na Proposta Comercial, em documentos emitidos ao cliente ou
em qualquer outra funcionalidade, presente ou futura, que utilize o
valor final negociado. A existência de múltiplas implementações do
mesmo cálculo deverá ser evitada.

Esta regra passa a ser a única referência oficial para cálculo do
Valor Comercial do Orçamento. Novos módulos, documentos, APIs ou
integrações que utilizem esse valor deverão obrigatoriamente reutilizar
a mesma implementação, não sendo permitidas novas implementações
independentes da regra de cálculo.

## Dívidas técnicas conhecidas

A lógica de apuração de custo por item (escolha de BOM ativo, RPC
`calcular_custo_bom`, exclusão de matéria-prima para `tipo_projeto`
industrialização) permanece duplicada entre `useOrcamento.ts` e
`useProposta.ts`. A centralização realizada nesta decisão cobre apenas
a formação de preço (`calcularResumoOrcamento`), não a apuração de
custo. Resolver essa duplicação é dívida técnica separada, fora do
escopo desta decisão.
