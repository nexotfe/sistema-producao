# DEC-004 — Simulação Comercial

**Data:** 2026-07-29
**Versão:** 1.0
**Status:** Vigente
**Natureza do documento:** decisão de negócio formalizada, quarta da
série `DEC-` (ver `DEC-001_Desconto_Comercial_Orcamento.md` para a
convenção completa). Consolida, em nível funcional e de negócio, o
objetivo, os papéis e os limites da Simulação Comercial — a arquitetura
técnica que sustenta este comportamento está documentada em
`ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md` e no PAD-008
(Motor de Capacidade); este documento não repete esse conteúdo.

---

## Objetivo

A Simulação Comercial existe para responder, ainda durante a
elaboração do orçamento: com a capacidade produtiva disponível, este
projeto pode ser entregue na data desejada pelo cliente? Seu propósito
é apoiar a decisão comercial antes da aprovação da proposta —
fornecendo ao orçamentista informações para decidir, com base na
capacidade produtiva da empresa, se o compromisso pretendido é viável.

## Princípio

A Simulação Comercial existe para apoiar decisões comerciais. Ela não
substitui o julgamento do orçamentista.

O sistema calcula. O profissional decide.

## Papel do orçamentista

Cabe ao orçamentista solicitar a simulação para o período em que
pretende produzir o projeto, revisar o resultado apresentado e decidir
se aprova aquele cenário.

A aprovação é sempre uma decisão explícita do orçamentista, nunca
automática. Quando a simulação aponta déficit de capacidade, a
aprovação não é bloqueada, mas exige confirmação adicional explícita:
aprovar nessas condições significa que a empresa decidiu assumir
conscientemente aquele risco, não que existe capacidade suficiente
para cumprir o prazo.

## Papel do Motor

A Simulação Comercial utiliza um componente de cálculo — o Motor de
Capacidade — para avaliar se a capacidade produtiva disponível é
suficiente para atender ao cenário comercial informado, considerando
as regras de capacidade vigentes na empresa. Quando a capacidade não é
suficiente, o Motor identifica os respectivos déficits para apoiar a
decisão do orçamentista.

O Motor apenas avalia viabilidade de capacidade — ele não sequencia
operações, não distribui produção entre recursos nem decide como a
fabricação será executada. A arquitetura interna do Motor, seus
consumidores e sua evolução são tratados no PAD-008, não neste
documento.

## Resultado esperado

Ao final da simulação, o orçamentista recebe informações suficientes
para avaliar a viabilidade do cenário comercial proposto.

O resultado identifica a capacidade disponível, eventuais restrições,
déficits e demais informações necessárias para fundamentar a decisão
comercial, preservando a rastreabilidade das análises realizadas.

A forma de apresentação dessas informações poderá evoluir ao longo do
desenvolvimento do sistema, desde que continue fornecendo elementos
suficientes para justificar a decisão tomada.

## Aprovação (Snapshot)

Ao aprovar uma simulação, o sistema registra um Snapshot Comercial
contendo as informações necessárias para reproduzir o cenário
utilizado na negociação: os parâmetros comerciais informados pelo
orçamentista (Cenário de Demanda, Modo de Produção, Data de
Necessidade e Margem de Segurança), o período avaliado, e o resultado
que fundamentou a decisão.

Esse Snapshot passa a representar a referência oficial da decisão
comercial até que uma nova aprovação o substitua.

Antes de confirmar a aprovação, o sistema revalida o cenário: se algo
relevante mudou desde a simulação que o orçamentista revisou, a
aprovação é bloqueada até que uma nova simulação seja executada e
revisada — a aprovação nunca representa um cenário diferente do que
foi efetivamente analisado.

Existe sempre, no máximo, um Snapshot Comercial vigente por projeto. Ao
aprovar uma nova simulação para um projeto que já possui uma aprovação
vigente, o snapshot anterior deixa de ser o vigente, mas seu histórico
é preservado — nenhuma aprovação anterior é apagada.

O Snapshot Comercial representa a base utilizada para assumir o
compromisso comercial com o cliente e preserva integralmente a
rastreabilidade dessa decisão.

## Limites do módulo

A Simulação Comercial verifica **se é possível produzir**; não decide
**como produzir**. Ela calcula capacidade, identifica gargalos, estima
a primeira data possível de entrega e informa riscos ao orçamentista.

Ela não programa Ordens de Fabricação, não distribui operadores, não
escolhe máquinas, não sequencia operações, não balanceia recursos e não
cria programação diária de produção — essas responsabilidades
pertencem ao módulo de PCP, mencionado aqui apenas para delimitar essa
fronteira, não para descrever seu funcionamento.

A partir da aprovação do cenário comercial, as decisões operacionais
passam a ser responsabilidade dos módulos específicos do ERP.

---

**Evolução Futura:** As funcionalidades avançadas da Simulação
Comercial encontram-se documentadas na Seção 17 – Evolução Futura
(fora do escopo da versão 1.0) da Arquitetura Vigente.
