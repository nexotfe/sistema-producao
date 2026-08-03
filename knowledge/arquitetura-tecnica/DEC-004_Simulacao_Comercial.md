# DEC-004 — Simulação Comercial

**Data original:** 2026-07-29
**Última revisão:** 2026-08-03
**Versão:** 1.2
**Status:** Vigente
**Natureza do documento:** decisão de negócio formalizada, quarta da série `DEC-` (ver `DEC-001_Desconto_Comercial_Orcamento.md` para a convenção completa). Consolida, em nível funcional e de negócio, o objetivo, os papéis e os limites da Simulação Comercial — a arquitetura técnica que sustenta este comportamento está documentada em `ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md`; sua consolidação como decisão arquitetural cabe ao PAD-008 (Motor de Capacidade). Este documento não repete esse conteúdo.

---

## Objetivo

A Simulação Comercial existe para responder, ainda durante a elaboração do orçamento: com a capacidade produtiva disponível, este projeto pode ser entregue na data desejada pelo cliente? Seu propósito é apoiar a decisão comercial antes da aprovação da proposta — fornecendo ao orçamentista informações para decidir, com base na capacidade produtiva da empresa, se o compromisso pretendido é viável.

## Princípio

A Simulação Comercial existe para apoiar decisões comerciais. Ela não substitui o julgamento do orçamentista.

**O Comercial informa premissas e decide. O Motor calcula e informa fatos.** O Motor nunca escolhe hora extra, terceirização, antecipação de material ou renegociação de prazo com o cliente — ele relata a situação (viável, com déficit, sem janela); a escolha de como reagir é sempre humana.

## Papel do orçamentista

Cabe ao orçamentista solicitar a simulação para o período em que pretende produzir o projeto, revisar o resultado apresentado e decidir se aprova aquele cenário.

Antes da simulação, o orçamentista informa a Margem de Segurança, expressa em dias produtivos, e a Data Prevista de Aprovação do Pedido, utilizada como data-base para os deslocamentos definidos pelo Calendário Operacional:

- **Margem de Segurança** — dias produtivos de folga interna entre a necessidade real do cliente e o prazo que o cálculo de viabilidade usa internamente.
- **Data Prevista de Aprovação do Pedido** — estimativa do orçamentista sobre quando o pedido do cliente será formalmente confirmado. Diferente da Situação Comercial (que registra fatos já observados na negociação — Consulta, Proposta Enviada, Negociação, Compromisso Verbal, Pedido Recebido), este campo é uma previsão editável, não um fato consumado.

As duas premissas devem ser informadas antes da simulação. Qualquer alteração posterior invalida o resultado apresentado e exige uma nova simulação antes da aprovação.

### Déficit de capacidade × ausência de janela produtiva

Estas são duas situações diferentes, com consequências diferentes na aprovação:

- **Déficit de capacidade** (existe janela, mas a capacidade disponível nela não cobre a necessidade): não bloqueia a aprovação. Exige confirmação adicional explícita do orçamentista — aprovar nessas condições significa que a empresa decidiu assumir conscientemente aquele risco, não que existe capacidade suficiente para cumprir o prazo.
- **Ausência total de janela produtiva** (não existe nenhum dia produtivo utilizável entre a disponibilidade do material e o Prazo Interno — ver seção abaixo): bloqueia a aprovação. Não existe resultado de capacidade válido para formar a base do Snapshot Comercial — não há o que o orçamentista possa revisar e aprovar, com ou sem risco assumido. A mensagem informa o fato ao orçamentista; não escolhe a solução (antecipar material, negociar novo prazo, assumir hora extra) — essa escolha é sempre dele.

A aprovação é sempre uma decisão explícita do orçamentista, nunca automática.

## Papel do Motor

A Simulação Comercial utiliza um componente de cálculo — o Motor de Capacidade — para avaliar se a capacidade produtiva disponível é suficiente para atender ao cenário comercial informado, considerando as regras de capacidade vigentes na empresa. Quando a capacidade não é suficiente, o Motor identifica os respectivos déficits para apoiar a decisão do orçamentista.

O Motor apenas avalia viabilidade de capacidade — ele não sequencia operações, não distribui produção entre recursos de forma definitiva nem decide como a fabricação será executada. A arquitetura interna do Motor, seus consumidores e sua evolução pertencem ao escopo do PAD-008, não deste documento.

## Prazo interno e disponibilidade de material

As datas e os deslocamentos são calculados em dias produtivos. A capacidade é expressa em horas e apurada apenas sobre os dias produtivos da janela. Isso vale para: margem de segurança; prazo para requisição e compra de material; chegada e liberação do material; cálculo reverso da data necessária de início; e capacidade disponível de cada recurso — todos conforme o Calendário Operacional vigente da empresa (Arquitetura Vigente §7). A data-base de qualquer contagem nunca é contada como um dos dias; a contagem começa no primeiro dia produtivo seguinte (deslocamento à frente) ou anterior (deslocamento para trás).

**Prazo interno**: a Margem de Segurança reduz a Data de Necessidade informada pelo cliente, gerando um Prazo Interno mais apertado, usado só internamente na avaliação de viabilidade — nunca altera a data real prometida ao cliente.

```text
Prazo Interno = Data de Necessidade − Margem de Segurança (dias produtivos)
```

Exemplo: Data de Necessidade 30/11/2026, Margem de 3 dias produtivos → Prazo Interno 25/11/2026.

### Disponibilidade provisória de material

**Implementado (Entrega 1).** Enquanto o módulo de Compras não estiver operacional, a Simulação Comercial considera uma antecedência provisória de material, decomposta explicitamente:

```text
1 dia produtivo  — criar a requisição
1 dia produtivo  — realizar a compra
7 dias produtivos — chegada prevista do material
——————————————————
9 dias produtivos — total até a chegada prevista
```

```text
Data de Chegada Prevista = Data Prevista de Aprovação do Pedido + 9 dias produtivos
Data de Disponibilidade para Produção = primeiro dia produtivo posterior à Data de Chegada Prevista
```

Hipótese conservadora: o material pode chegar no fim do dia, então o próprio dia da chegada não tem capacidade produtiva utilizável. Na prática, a disponibilidade para produção ocorre depois de **10 dias produtivos**, não 9 — a chegada e a disponibilidade para produção são dois fatos distintos, registrados separadamente, não escondidos um dentro do outro.

Esta é uma regra provisória, criada para permitir o uso do Motor antes de existir o módulo de Compras. Quando Compras estiver operacional, os 9 dias fixos serão substituídos pelo dado real do fluxo de requisição, cotação, pedido e previsão de entrega. Sem data ou roadmap fechado para essa substituição.

## Engenharia reversa comercial

**Decisão de negócio aprovada, pendente de implementação.** A Simulação Comercial parte do Prazo Interno e, consumindo a capacidade disponível de trás para frente, estima analiticamente a Data de Início Necessária para atendimento do Prazo Interno — a data mais tardia em que a produção precisaria começar para ainda cumprir esse prazo. Essa data é uma estimativa comercial de capacidade, não uma programação de produção nem um sequenciamento de PCP.

A Simulação então compara a Data de Disponibilidade para Produção com a Data de Início Necessária:

- Se a produção pode começar a tempo, o material não bloqueia o prazo.
- Se não, existe **conflito de material dentro de uma janela que existe** — a Simulação informa os fatos (horas necessárias, horas disponíveis, déficit, a diferença de dias entre o início necessário e a disponibilidade do material, os recursos envolvidos, e a quantidade de horas adicionais que resolveria o conflito). Isso não bloqueia a aprovação por si só — é tratado como déficit, sujeito à mesma regra de confirmação explícita descrita acima.

Isso é diferente de **ausência total de janela produtiva** (quando a Data de Disponibilidade para Produção é posterior ao Prazo Interno, ou não existe nenhum dia produtivo utilizável entre os dois) — nesse caso, não existe resultado de capacidade válido, e a aprovação é bloqueada (ver "Déficit de capacidade × ausência de janela produtiva", acima).

O Motor não decide hora extra, terceirização, antecipação de material ou renegociação de prazo — essas decisões continuam sendo do orçamentista.

## Distribuição analítica entre recursos compatíveis

**Implementado (Entrega 2).** Regra de negócio confirmada e validada por teste ponta a ponta real (projeto de teste `260009`: necessidade de 120 horas-padrão, distribuídas em 52,36h/52,36h/15,28h entre três recursos, produtividade 85%, déficit zero):

- O Motor distribui as horas primeiro no recurso original.
- O saldo segue pelos recursos compatíveis, respeitando a prioridade cadastrada.
- Cada recurso consome apenas sua capacidade disponível — nunca mais do que isso.
- O déficit é somente o saldo que permanecer após esgotar todos os recursos elegíveis (original + compatíveis).
- A distribuição é analítica para a Simulação Comercial; não é sequenciamento definitivo do PCP — não altera o roteiro de fabricação, não determina como a produção real será executada, e não obriga o PCP a distribuir a operação da mesma forma quando a produção efetivamente acontecer.

## Resultado esperado

Ao final da simulação, o orçamentista recebe informações suficientes para avaliar a viabilidade do cenário comercial proposto.

O resultado identifica a capacidade disponível, eventuais restrições, déficits e demais informações necessárias para fundamentar a decisão comercial, preservando a rastreabilidade das análises realizadas.

A forma de apresentação dessas informações poderá evoluir ao longo do desenvolvimento do sistema, desde que continue fornecendo elementos suficientes para justificar a decisão tomada.

## Aprovação (Snapshot)

Ao aprovar uma simulação, o sistema registra um Snapshot Comercial. O snapshot preserva os parâmetros e o resultado registrados como base oficial da decisão comercial — os parâmetros comerciais informados pelo orçamentista (Cenário de Demanda, Modo de Produção, Data de Necessidade, Data Prevista de Aprovação do Pedido e Margem de Segurança), o período avaliado, e o resultado que fundamentou a decisão.

Esse Snapshot passa a representar a referência oficial da decisão comercial até que uma nova aprovação o substitua.

Antes de confirmar a aprovação, o sistema revalida o cenário: se algo relevante mudou desde a simulação que o orçamentista revisou, a aprovação é bloqueada até que uma nova simulação seja executada e revisada — a aprovação nunca representa um cenário diferente do que foi efetivamente analisado.

Existe sempre, no máximo, um Snapshot Comercial vigente por projeto. Ao aprovar uma nova simulação para um projeto que já possui uma aprovação vigente, o snapshot anterior deixa de ser o vigente, mas seu histórico é preservado — nenhuma aprovação anterior é apagada.

## Limites do módulo

A Simulação Comercial verifica **se é possível produzir**; não decide **como produzir**. Ela calcula capacidade, identifica gargalos, estima analiticamente a Data de Início Necessária para atendimento do Prazo Interno, e informa riscos ao orçamentista.

Ela não programa Ordens de Fabricação, não distribui operadores, não escolhe máquinas, não sequencia operações, não balanceia recursos e não cria programação diária de produção — essas responsabilidades pertencem ao módulo de PCP, mencionado aqui apenas para delimitar essa fronteira, não para descrever seu funcionamento. Isso vale mesmo para a distribuição analítica entre recursos compatíveis (seção acima): é uma estimativa de viabilidade, não uma alocação real de produção. **O PCP é um módulo futuro, fora do escopo atual deste documento e do Motor — nenhuma regra aqui descrita antecipa ou compromete seu desenho.**

A partir da aprovação do cenário comercial, as decisões operacionais passam a ser responsabilidade dos módulos específicos do ERP.

---

**Evolução Futura:** As funcionalidades avançadas da Simulação Comercial encontram-se documentadas na Seção 17 – Evolução Futura (fora do escopo da versão 1.0) da Arquitetura Vigente.
