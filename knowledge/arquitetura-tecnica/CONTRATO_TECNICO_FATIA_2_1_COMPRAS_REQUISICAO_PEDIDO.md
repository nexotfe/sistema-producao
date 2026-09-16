# Contrato Técnico — Fatia 2.1: Relação Requisição ↔ Pedido de Compra

**Data:** 2026-09-16
**Versão:** 1.0
**Status:** Rascunho de especificação — aguardando decisões técnicas abertas (§20) antes de qualquer implementação.
**Natureza do documento:** contrato funcional/técnico de uma fatia do Incremento 9, derivado de
[`DEC-008_Fluxo_Operacional_Compras_Recebimento_Conferencia.md`](DEC-008_Fluxo_Operacional_Compras_Recebimento_Conferencia.md)
e das regras de negócio adicionais consolidadas nesta rodada. **Não é um `DEC-`** (não registra uma
decisão de negócio nova por si só — as regras aqui vêm do DEC-008 e da conversa que originou este
documento) **nem um `PAD-`** (não é um padrão de arquitetura reutilizável entre domínios — é
específico da relação Requisição↔Pedido de Compras). Não existe, hoje, uma série de nomenclatura
própria para "contrato técnico de uma fatia de incremento" em `knowledge/` — o nome deste arquivo
segue o precedente não-numerado já usado na mesma pasta por
`ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md` (documento técnico vivo, descritivo,
sem prefixo de série numerada).

**Convenção de leitura deste documento:** cada seção, e as afirmações mais sensíveis dentro dela, são
classificadas conforme uma das quatro categorias abaixo, para nunca confundir o que já foi decidido
com o que ainda está em aberto:

- **[Regra de negócio]** — já decidida (nesta rodada ou no DEC-008), não é objeto de escolha técnica.
- **[Situação atual]** — o que o repositório (migrations reais + código) mostra hoje, verificado por
  leitura direta, nunca presumido.
- **[Lacuna/Conflito]** — distância entre a regra de negócio e a situação atual.
- **[Decisão técnica aberta]** — ainda não decidido; não deve ser inferido nem implementado agora.

---

## 1. Objetivo da Fatia 2.1

Formalizar, em nível conceitual, o contrato entre Requisição de Compra e Pedido de Compra — em
particular no nível de **item**, não apenas de cabeçalho — de forma que o modelo técnico futuro
consiga representar: uma Requisição atendida por vários Pedidos; um Pedido cobrindo itens de várias
Requisições; a distinção entre cobertura comercial e atendimento físico da OF; e um cancelamento de
Pedido que nunca cancela automaticamente a Requisição.

Este documento **não escolhe** a estrutura técnica definitiva (migrations, RPCs, colunas). Ele separa
o que já é regra de negócio do que ainda é decisão técnica em aberto, para que a próxima rodada possa
decidir com todo o contexto já levantado.

## 2. Escopo

- A relação conceitual entre Item da Requisição e Item do Pedido de Compra (cobertura comercial).
- O papel do Planejamento de Compras (`planejamentos_compra`/`planejamento_compra_origens`) nesse
  fluxo — o que é provisório, o que precisa ser definitivo.
- A distinção formal entre cobertura comercial, recebimento, estoque disponível e atendimento
  operacional da OF.
- O cancelamento de Pedido e seu efeito (ou ausência de efeito) sobre a Requisição.
- A fronteira entre Compras, Recebimento, Estoque, PCP e Qualidade — sem implementar nenhum desses
  domínios.
- Compras sem OF (Requisições gerais da empresa) — só a nível conceitual de compatibilidade de
  modelo, sem desenhar o mecanismo técnico.
- Unidade técnica × apresentação comercial — só como restrição a preservar, sem desenhar conversão.

## 3. Fora de escopo

Explicitamente fora desta fatia (herdado do DEC-008 §23 + reforçado pelas regras desta rodada):

- Qualquer migration, RPC, alteração de tabela, RLS ou UI.
- Implementação de Recebimento/Conferência/Estoque como módulos funcionais.
- Módulo de Qualidade / Não Conformidade (só a fronteira conceitual é preservada, §15).
- Financeiro / Contas a Pagar.
- Conversão automática de unidades (kg↔metro, barra↔mm, chapa↔m² etc.).
- Mecanismo técnico definitivo de compras sem OF (RPC/tela/endpoint).
- Modelo de cotação, alçadas de aprovação por valor, múltiplos aprovadores, centro de custo
  definitivo, integração com e-mail — todos já listados como abertos no DEC-008 §23 e não reabertos
  aqui.
- OF pai/filha para continuidade de produção (DEC-008 §2).
- Decisão de qual das alternativas técnicas (§10) será implementada.

## 4. Glossário

| Termo | Definição neste contrato |
|---|---|
| **Necessidade da OF** | Quantidade de matéria-prima que uma Ordem de Fabricação precisa para executar uma operação, avaliada pelo PCP. É a origem operacional de uma decisão CI/CE. |
| **CI (Consumo Interno)** | Decisão do PCP de que material já existente no estoque da empresa pode ser liberado para a OF. Gera baixa imediata do estoque e apropriação de custo à OF (DEC-008 §2). |
| **CE (Compra Externa)** | Decisão do PCP de que o estoque não atende (total ou parcialmente) a necessidade, gerando uma Requisição de Compra para o saldo externo. |
| **Requisição (de Compra)** | Documento que representa uma necessidade de compra. Não representa propriedade física nem reserva automática de estoque. Pode conter vários itens de materiais/naturezas diferentes. |
| **Item da Requisição** | Uma linha da Requisição — um material/quantidade específicos. É o nível que garante a origem produtiva individual correta quando a Requisição reunir múltiplas origens, e o nível da relação de cobertura com o Pedido — sem que isso proíba o cabeçalho de também carregar campos de contexto (ex.: `projeto_id`, `of_id`) quando úteis. |
| **Origem produtiva** | O vínculo auditável e permanente entre um Item da Requisição e a OF que o originou, quando aplicável. Representa justificativa/origem da necessidade — nunca propriedade física do material. |
| **Planejamento (de Compras)** | Etapa intermediária/provisória em que Compras agrupa, analisa e decide como necessidades técnicas viram uma decisão de compra, antes de formalizar o Pedido. |
| **Pedido de Compra** | Documento formal, numerado, dirigido a um fornecedor, que nasce depois da decisão comercial de Compras (DEC-008 §6). |
| **Item do Pedido** | Uma linha do Pedido de Compra — quantidade comercial, unidade comercial, preço, destinada a um fornecedor. |
| **Cobertura comercial** | O fato (e a quantidade) de que um Item de Requisição foi coberto por um Pedido de Compra válido. Não representa propriedade física, separação física, reserva de estoque, nem atendimento da OF. |
| **Atendimento operacional** | O fato de que uma OF efetivamente recebeu material via movimentação/baixa física de estoque. Distinto e independente de cobertura comercial (uma necessidade pode estar 100% coberta comercialmente e 0% atendida fisicamente). |
| **Recebimento** | O material chegou fisicamente à empresa. Não implica, por si só, estoque disponível nem atendimento da OF (DEC-008 §13). |
| **Estoque disponível** | Quantidade que passou pela Conferência/aprovação e está disponível para uso — distinto de "material recebido" (DEC-008 §13, §16). |
| **Baixa para OF** | Movimentação de estoque que transfere fisicamente material (e, com ele, custo) para uma OF/projeto específicos. É o único evento que gera atendimento operacional e apropriação de custo (DEC-008 §17). |
| **Apropriação de custo** | O reconhecimento do custo do material como custo realizado da OF/projeto — ocorre exclusivamente na baixa física, nunca na compra, na NF ou no recebimento. |
| **Rastreabilidade física** | Cadeia NF→recebimento→lote/material→estoque→baixa→OF, no domínio de Estoque. Desejável, mas não é requisito universal bloqueante para uso do material (§16). |
| **Apresentação comercial** | A forma em que o fornecedor vende o material (ex.: "1 barra de 6.000 mm"), que pode ser diferente da unidade técnica da necessidade (ex.: "4.500 mm") e da unidade operacional do estoque. |

## 5. Regras de negócio consolidadas

Todas as regras abaixo são **[Regra de negócio]**, já decididas — nenhuma é objeto de escolha
técnica. Cada uma é numerada como na conversa que originou este documento, com nota sobre a relação
com o DEC-008.

1. **Requisição multi-item.** Uma Requisição pode conter vários itens de materiais/naturezas
   diferentes (aço, plástico, madeira, motor, parafusos etc.). *(Detalha DEC-008 §3, que já tratava
   Requisição como unidade de necessidade, mas não explicitava multiplicidade de itens.)*
2. **Origem produtiva no nível do item.** Não presumir que o cabeçalho inteiro da Requisição
   pertence a uma única OF — uma Requisição pode reunir itens de OFs distintas do mesmo
   contexto/projeto. A origem operacional (qual OF, se houver) deve ser preservada no **Item da
   Requisição**, de forma permanente e auditável. Essa ligação é origem/justificativa, nunca
   propriedade física. Isso **não** é uma proibição de o cabeçalho da Requisição também ter campos de
   contexto (ex.: `projeto_id`, `of_id`) quando forem tecnicamente úteis — a exigência é só que a
   origem individual de cada item nunca dependa exclusivamente do cabeçalho quando a Requisição reunir
   múltiplas origens. *(Refina DEC-008 §2/§5, que descreviam a origem em termos de "a OF" no
   singular — esta regra corrige essa granularidade para o nível de item.)*
3. **CI/CE por necessidade, sem histórico obrigatório complexo.** Toda necessidade de MP de uma OF
   passa pelo PCP (CI/CE). Atendimento parcial por estoque é permitido (CI parcial + CE do saldo).
   Não é necessário histórico complexo obrigatório para cada avaliação CI/CE — só o necessário para
   identificar origem, quantidade e decisão. *(Restates DEC-008 §2; a dispensa de histórico
   obrigatório complexo é nova nesta rodada.)*
4. **N:N entre Requisição e Pedido, no nível de item.** Uma Requisição pode originar vários Pedidos
   (ex.: aço/motor/madeira/parafusos para fornecedores diferentes); um Pedido pode reunir itens de
   várias Requisições (ex.: parafuso M8 de duas Requisições, mesmo fornecedor). A relação de negócio
   relevante é **Item da Requisição ↔ Item do Pedido**, não Requisição↔Pedido como um todo. *(Extensão
   explícita além do DEC-008 §4, que só cobria "1 Pedido agrupa N necessidades" — não estabelecia N:N
   nem a granularidade de item.)*
5. **Cobertura/justificativa comercial.** A relação Item↔Item deve permitir saber qual necessidade
   justificou qual compra, e qual quantidade dela foi coberta. Não representa propriedade física,
   separação física, reserva de estoque, nem material fisicamente destinado à OF.
6. **Regra central de propriedade e custo.** Requisição justifica a aquisição. Pedido formaliza a
   compra. Recebimento aprovado abastece o estoque da empresa. Só a baixa física transfere material e
   custo para a OF/projeto. Compra, NF e recebimento **não** apropriam custo automaticamente.
   *(Consolida DEC-008 §5 + §17 numa única formulação.)*
7. **Sem divisão física automática por origem.** No exemplo OF X=4.500mm/OF Y=1.200mm/compra=6.000mm,
   os 6.000mm entram integralmente no estoque da empresa — não existe divisão automática
   "4.500 pertence a X / 1.200 pertence a Y / 300 é excedente". **Não criar uma entidade "excedente
   comercial"** só para representar o saldo não solicitado. *(Mesmo exemplo numérico do DEC-008 §5;
   a proibição explícita de reificar "excedente" é nova.)*
8. **Cobertura comercial não é estoque.** Não criar uma entidade artificial de "saldo da Requisição"
   como se fosse estoque. Quando necessário, o sistema pode **calcular** (não persistir)
   `necessidade externa − quantidade coberta por Pedidos válidos` = quantidade ainda não coberta
   comercialmente — nunca estoque, recebimento, disponibilidade física ou atendimento da OF.
   Preferir cálculo derivado; não criar coluna de saldo persistido sem justificativa técnica forte.
9. **Cobertura comercial ≠ atendimento da OF.** São dois fatos distintos e independentes: quanto da
   necessidade está coberto por Pedido válido (comercial) vs. quanto efetivamente saiu do estoque
   para a OF (físico/operacional). Pedido emitido, recebimento do fornecedor e material em estoque
   **não** significam, nenhum deles, atendimento da OF. O evento que demonstra atendimento real é a
   movimentação/baixa física de estoque — não criar confirmação manual adicional quando essa
   movimentação já pode representar o fato.
10. **OF/PCP continuam sendo a fonte da necessidade.** Emitir um Pedido não encerra a necessidade
    operacional da OF. Se o material não chegar, chegar parcial, atrasar ou não estar disponível
    quando necessário, a OF continua necessitando — o PCP acompanha isso operacionalmente. Não criar
    mecanismo de "reabertura" — a necessidade simplesmente nunca deixou de existir.
11. **Material parcial não bloqueia início de produção.** Não existe regra universal de "100% dos
    materiais disponíveis antes de iniciar a OF". O PCP decide operacionalmente, por etapa.
12. **Risco de atraso é avaliação momentânea do PCP.** O sistema fornece fatos (disponível/parcial/
    ausente, datas previstas, sequência, prazo do projeto); a classificação de risco
    (sem risco/atenção/risco de atraso) é do PCP e **não precisa gerar histórico obrigatório** — não
    transformar cada avaliação em evento permanente.
13. **Atraso real → fronteira com Qualidade/Não Conformidade.** Se falta/atraso de material causar
    atraso real do projeto, o motivo deve ser registrado; quando relacionado a Compras, o tratamento
    segue futuramente para Qualidade/Não Conformidade. **Não implementar esse fluxo agora** — só
    preservar a fronteira conceitual.
14. **Cancelamento de Pedido.** Terminal, motivo obrigatório, registra usuário/data-hora, preserva
    histórico, impede reativação, mantém vínculos antigos só para auditoria, e faz com que aquele
    Pedido deixe de contar como cobertura comercial ativa. **Não** cancela automaticamente a
    Requisição, outros itens dela, a necessidade da OF, nem outros Pedidos. Se o Pedido cobria só um
    item de uma Requisição multi-item, só aquela cobertura específica deixa de valer. **Não** assumir
    ainda que Pedido só pode ser cancelado "antes da consolidação" — esse limite por estágio é
    decisão técnica futura, não desta fatia. *(Reforça e detalha DEC-008 §18, já vigente — não há
    contradição, só maior precisão de granularidade por item.)*
15. **Recebimento e estoque.** Todo material recebido/conferido/aprovado pertence à empresa.
    Recebimento não significa destinação à OF que justificou a compra nem estoque disponível — só a
    conferência/aprovação libera estoque disponível; só a baixa destina à OF. *(Restates DEC-008 §13
    + §16, com a formulação explícita "recebimento ≠ estoque disponível".)*
16. **Rastreabilidade física não é requisito universal bloqueante.** O ideal é NF→recebimento→
    lote→estoque→baixa→OF, mas material legítimo pode entrar em estoque sem essa cadeia completa
    (sobra de cliente, estoque antigo, sem certificado etc.) — o sistema deve preservar a
    rastreabilidade disponível, mas não bloquear uso só pela ausência de NF/certificado/lote,
    exceto quando a própria empresa/Qualidade exigir. **Tema do domínio futuro de Estoque/Qualidade —
    não implementar agora.**
17. **Encerramento da Requisição não é automático.** Não presumir que a Requisição está encerrada só
    porque todos os itens têm Pedido, nem que o recebimento do fornecedor encerra a necessidade
    produtiva. É preciso distinguir: necessidade original, cobertura comercial, recebimento,
    disponibilidade física, baixa para OF, atendimento operacional, encerramento da Requisição. Para
    Requisições de origem produtiva, a Requisição permanece operacionalmente relevante enquanto as
    necessidades associadas não forem efetivamente atendidas (por baixa física). Se a Requisição tiver
    itens de várias OFs, o encerramento não deve ignorar parcelas ainda não atendidas. **Não
    transformar isso em status persistido nesta fatia** — primeiro documentar a semântica (feito
    aqui, §16), depois decidir tecnicamente o que é persistido vs. derivado.
18. **Compras sem OF.** A empresa pode gerar Requisições sem OF (manutenção, limpeza, escritório,
    administrativo, almoxarifado, infraestrutura, serviços, frete, software etc.), por pessoas
    autorizadas conforme permissões da empresa. **O mecanismo técnico ainda não está definido** — não
    escolher prematuramente RPC/tela/endpoint, e não reutilizar automaticamente RPC antiga sem
    auditoria. *(Detalha DEC-008 §20.)*
19. **Compras gerais nem sempre geram estoque.** Nem todo item comprado entra em estoque, tem
    movimentação física, terá baixa para OF, lote, certificado ou unidade física controlada. As
    regras de recebimento físico/estoque/baixa se aplicam só onde fizerem sentido — não forçar toda
    compra corporativa para dentro do modelo de matéria-prima.
20. **Unidade técnica ≠ apresentação comercial ≠ unidade de estoque.** A arquitetura deve preservar a
    capacidade de representar as três separadamente (ex.: necessidade técnica 4.500mm, compra
    comercial 1 barra de 6.000mm). **Não implementar conversões automáticas genéricas nesta fatia**
    (kg↔metro, barra↔mm, chapa↔m² etc.) — e, ao mesmo tempo, não impor que fornecedor, Requisição e
    estoque tenham sempre a mesma apresentação comercial. Não congelar uma arquitetura de conversão
    ainda não estudada.

## 6. Cardinalidades necessárias

Conforme regra 4 (§5), o contrato de negócio exige, no nível de **item**:

```
Item Requisição A ──┬── parte → Item Pedido 001
                     └── parte → Item Pedido 002

Item Requisição B ──┐
Item Requisição C ──┼── Item Pedido 003
Item Requisição D ──┘
```

Ou seja: **N:N entre Item da Requisição e Item do Pedido**, com uma quantidade associada a cada par
(cobertura parcial ou total). Uma Requisição pode ter itens cobertos por Pedidos diferentes; um
Pedido pode ter itens cobrindo Requisições diferentes; e um único Item de Requisição pode ser
parcialmente coberto por mais de um Pedido ao longo do tempo (inclusive depois de um Pedido anterior
ter sido cancelado).

## 7. Modelo atual encontrado no repositório

**[Situação atual]** — verificado por leitura direta de `supabase/migrations/*.sql` (nunca
`supabase/baseline/`, que é reescrita paralela nunca aplicada em produção). Resumo consolidado de
investigação read-only já realizada nesta mesma sessão (Incremento 9 — Fatia 2):

| Tabela | Papel hoje | Achado central |
|---|---|---|
| `requisicoes_compra` | Cabeçalho da Requisição | `status` (`aberta/em_compra/atendida/cancelada`) existe no CHECK, mas **nenhuma RPC viva jamais o altera** além do valor inicial `aberta` — estados mortos. |
| `requisicao_compra_itens` | Item da Requisição | `quantidade_necessaria` **imutável** após criação (bloqueada por trigger). Sem nenhuma coluna de quantidade atendida/coberta/pendente. Tem `necessidade_id` (FK a `necessidades_of_material`, nullable, único parcial — no máx. 1 item por necessidade de OF) e scaffolding morto (`item_anterior_id`, `status_versao` com valores `substituida`/`congelada`/`excesso_previsto` nunca gravados por nenhuma RPC viva). |
| `planejamentos_compra` | Lote/decisão comercial provisória de Compras | Estados `em_planejamento/pronto_pedido/convertido_pedido/cancelado`; versionamento otimista; histórico próprio (`planejamentos_compra_historico`). |
| `planejamento_compra_origens` | Vínculo planejamento↔item de requisição | `origem_ativa` (bool) com índice único parcial `(empresa_id, requisicao_compra_item_id) WHERE origem_ativa=true` — **no máximo 1 origem ativa por item, globalmente**. Só desativada pelo cancelamento do planejamento pai; **nunca** pela conversão em Pedido — uma vez `convertido_pedido`, a origem fica ativa para sempre. `quantidade_necessaria` aqui é **sempre** a quantidade total do item (não existe parâmetro de quantidade parcial em nenhuma RPC). |
| `pedidos_compra` | Cabeçalho do Pedido | `planejamento_compra_id` com **UNIQUE** — 1 planejamento → no máximo 1 Pedido. |
| `pedido_compra_itens` | Item do Pedido | **Sem nenhuma FK direta** para `requisicao_compra_item_id`/`requisicao_compra_id`. O único vínculo com a Requisição é indireto, em 2 saltos: `pedido_compra_itens.planejamento_compra_id → planejamentos_compra ← planejamento_compra_origens.requisicao_compra_item_id`. Confirmado: a função `gerar_pedido_compra_rascunho` insere **1 único item agregado** por planejamento (não 1 item por origem). |

**Funções vivas relevantes**: `criar_planejamento_compra_a_partir_de_requisicoes` (agrupa N itens de
requisição num planejamento; exige mesma `materia_prima_id`/`unidade_id` entre todos os itens do
lote; sempre usa a quantidade inteira de cada item); `decidir_compra_planejamento` (decide quantidade
comercial, mas só agregada ao nível do planejamento); `gerar_pedido_compra_rascunho` (planejamento →
1 Pedido); `cancelar_planejamento_compra` (só antes de virar Pedido). **Não existe** `cancelar_pedido_compra`
em nenhuma migration.

`decidir_ci_ce_de_of` (único escritor vivo de `requisicoes_compra`/`requisicao_compra_itens`) tem
invariante que **proíbe reprocessamento** da mesma necessidade; `ajustar_of` **bloqueia** qualquer
ajuste de OF que já tenha necessidade/CI/CE materializada.

## 8. Conflitos entre modelo atual e contrato pretendido

**[Lacuna/Conflito]** — pontos em que o modelo atual, hoje, ou impede ativamente o que este
contrato exige, ou levanta uma tensão que ainda precisa ser investigada antes de ser tratada como
conflito confirmado:

1. **Ausência de mecanismo para liberar/recalcular cobertura após cancelamento de Pedido.** O sistema
   atual **não possui cancelamento de Pedido** (não existe `cancelar_pedido_compra`, §7/§9) — logo não
   há, hoje, nenhum código que "execute incorretamente" essa operação. O que existe é uma lacuna: o
   único gatilho que desativa `origem_ativa` é o cancelamento do **planejamento**, nunca a conversão em
   Pedido, e não há nenhum caminho técnico, hoje, que reative ou recalcule cobertura depois que um
   planejamento vira `convertido_pedido`. Isso significa que, quando `cancelar_pedido_compra` vier a
   ser criado (decisão técnica aberta, §20), ele precisará de um mecanismo próprio para liberar/
   recalcular a cobertura correspondente — esse mecanismo simplesmente não existe ainda, para nenhum
   cenário. Contradiz a regra 4/14 (§5): um Item de Requisição precisa poder, depois de um Pedido
   cancelado, voltar a ficar disponível para um novo Pedido — e hoje não há como isso acontecer,
   porque a capacidade de cancelar Pedido em si ainda não existe.
2. **Impossibilidade estrutural de cobertura parcial em 2 Pedidos.** `criar_planejamento_compra_a_partir_de_requisicoes`
   sempre usa a quantidade inteira do item — não há como planejar 3.000mm de um item de 4.500mm.
   Contradiz diretamente a regra 4/12 (cardinalidades, §6).
3. **[Ponto a investigar, não conflito comprovado]** `decidir_ci_ce_de_of` e `ajustar_of` têm
   invariantes que proíbem uma segunda execução da decisão CI/CE para a mesma necessidade de OF. Não
   está comprovado que isso conflita com a regra 10 (§5, "a necessidade continua existindo até ser
   atendida") — é plausível que o PCP só precise decidir CI/CE **uma vez** por necessidade, e que
   Compras continue tratando comercialmente essa mesma necessidade (cobrindo, cancelando, recobrindo
   com novos Pedidos) **sem** exigir uma nova execução de `decidir_ci_ce_de_of`/`ajustar_of` — a
   decisão de origem (quanto é CI, quanto é CE) não precisaria mudar só porque um Pedido específico foi
   cancelado. Este ponto precisa de investigação técnica adicional (ler o corpo completo dessas duas
   funções à luz do fluxo revisado) antes de ser classificado como conflito real — só deve ser tratado
   como conflito comprovado se o código demonstrar que a continuidade do fluxo (recobrir uma
   necessidade após cancelamento de Pedido) exigiria, na prática, uma nova execução dessas funções.
4. **Vínculo indireto (2 saltos) em vez de relação definitiva própria.** A regra 4/5 (§5) exige que a
   cobertura comercial seja rastreável no nível Item↔Item; hoje ela só existe via o caminho
   `pedido_compra_itens → planejamento (agregado) → origem`, que (a) não tem, hoje, nenhuma garantia
   de que sobreviveria de forma útil a um futuro cancelamento de Pedido, já que essa capacidade ainda
   não existe (achado 1 acima), e (b) nem existe como FK direta.
5. **Ausência de `cancelar_pedido_compra`.** A regra 14 (§5, e já vigente no DEC-008 §18) exige
   cancelamento terminal e auditável de Pedido — hoje não existe nenhum caminho de API para isso.
6. **`requisicoes_compra.status` morto.** A regra 17 (§5) fala em encerramento da Requisição como
   conceito a ser modelado (derivado ou persistido, decisão futura) — hoje o `status` existente no
   banco (`aberta/em_compra/atendida/cancelada`) nunca é escrito além do valor inicial, então nenhuma
   UI futura pode confiar nele sem antes decidir a semântica (§16/§20).

## 9. Gaps entre modelo atual e regras consolidadas

**[Lacuna/Conflito]** — o que simplesmente não existe ainda (não é conflito ativo, é ausência):

- Nenhuma coluna/mecanismo representa quantidade coberta, pendente ou cancelada por item de
  Requisição (regra 8/9, §5).
- Nenhuma relação N:N Item da Requisição ↔ Item do Pedido (regra 4, §5 — só existe indiretamente via
  planejamento, com as limitações do §8).
- Nenhuma distinção técnica entre cobertura comercial e atendimento operacional (regra 9, §5) — hoje
  não existe nenhuma representação de "atendimento operacional" ligada a Pedido/Requisição (a única
  representação real de CI/CE no sistema hoje, confirmado em investigação anterior desta sessão,
  fica em `vw_of_fluxo_operacional`/`vw_of_consumo_detalhado`, e é só leitura agregada, sem ligação
  com Pedido de Compra).
- Nenhuma tabela `pedidos_compra_historico` (necessária para preservar histórico do cancelamento de
  Pedido, regra 14).
- Nenhum mecanismo técnico para compras sem OF (regra 18) — o único caminho genérico existente
  (`registrar_requisicao_compra_material`) está com `EXECUTE` revogado de todos os papéis desde o
  Incremento 6.
- Nenhuma representação de categoria de custo/compra global por empresa (DEC-008 §19) — fora do
  escopo direto desta fatia, mas relevante para "compras sem OF" precisar de uma origem/finalidade
  rastreável (DEC-008 §20).
- Nenhuma coluna/estrutura para apresentação comercial distinta de unidade técnica além do que já
  existe hoje (`unidade` no item de requisição vs. `unidade_compra_id` decidido em
  `decidir_compra_planejamento`, ambos existentes mas nunca formalizados como um contrato de 3
  camadas conforme regra 20).

## 10. Modelo conceitual futuro

**[Decisão técnica aberta — não implementar]** Avaliação conceitual da necessidade de uma relação
N:N explícita entre `requisicao_compra_item` e `pedido_compra_item`, conforme solicitado. Exemplo
puramente conceitual (nomes e campos não são definitivos, não viram migration nesta rodada):

```
pedido_compra_item_requisicoes  (nome conceitual, não definitivo)
├── empresa_id
├── pedido_compra_id
├── pedido_compra_item_id
├── requisicao_compra_id
├── requisicao_compra_item_id
├── quantidade_vinculada
├── created_at
└── created_by
```

Esta tabela **conceitual** resolveria diretamente os conflitos 1, 2 e 4 do §8: cada linha é um par
Item-Pedido↔Item-Requisição com uma quantidade própria, independente do que acontece com o
Planejamento depois — permitindo, em princípio, que o mesmo `requisicao_compra_item_id` apareça em
múltiplas linhas (mesmo Pedido cancelado ou não), e resolvendo a cardinalidade N:N exigida no §6.

Isto NÃO é uma decisão de implementar esta tabela exatamente assim. É a formalização do problema que
a próxima rodada técnica precisa resolver, com as restrições explícitas abaixo (regras de negócio,
não escolhas):

- **Não** transformar esta lista de campos automaticamente em migration.
- **Não** assumir que todos os campos listados são necessários (ex.: talvez `requisicao_compra_id`
  seja redundante se `requisicao_compra_item_id` já implica o cabeçalho).
- **Não** criar coluna de saldo persistido sem justificativa técnica forte (regra 8, §5) — "quantidade
  ainda não coberta" deve, preferencialmente, ser calculada a partir das linhas válidas desta relação,
  não armazenada.
- **Não** criar status genérico de vínculo sem semântica claramente definida (ex.: um `status` textual
  solto no vínculo, sem dizer o que cada valor significa, repete o erro já visto em
  `requisicoes_compra.status`, §8 achado 6).
- **Não** usar esta relação para representar estoque, lote, NF, baixa para OF ou propriedade física —
  ela é estritamente cobertura comercial (regra 5, §5).

### 10.1 Invariante conceitual de cobertura (hipótese, não mecanismo aprovado)

**[Decisão técnica aberta — hipótese a estudar]** A cobertura comercial atribuída a uma necessidade
não deve ultrapassar a necessidade vigente sem uma regra de negócio explícita que autorize isso —
ou seja, algo como `SOMA(quantidade_vinculada de vínculos válidos) ≤ quantidade_necessaria do item`
é uma invariante **conceitual** que qualquer mecanismo técnico futuro provavelmente precisará
respeitar. Isto **não é uma CHECK constraint, trigger ou mecanismo técnico já aprovado** — é a
formalização, em forma de fórmula, da regra de negócio 8 (§5: "não criar entidade de saldo além da
necessidade"), para orientar quem for desenhar o mecanismo técnico depois. Como essa invariante seria
garantida (trigger com lock, constraint declarativa, validação em cada RPC, ou outra forma) é decisão
técnica em aberto (§20).

### 10.2 Dois conceitos que não devem ser confundidos

A investigação prévia desta sessão encontrou, no schema real, um scaffolding morto
(`requisicao_compra_itens.item_anterior_id`/`status_versao`) que poderia sugerir "versionar" a
necessidade como solução para cobertura parcial. **São dois problemas diferentes, e não devem ser
tratados como alternativas equivalentes**:

**A) Revisão da necessidade** — a própria quantidade necessária muda (ex.: o PCP reavalia e a
necessidade técnica passa de 4.500mm para 5.200mm). Isso é uma mudança na Requisição/Item, não uma
questão de cobertura comercial. `item_anterior_id`/`status_versao` (scaffolding já existente no
banco, hoje morto) são candidatos naturais para representar esse tipo de revisão no futuro — mas isso
não foi decidido aqui, só apontado como uso plausível.

**B) Distribuição da cobertura comercial** — a necessidade permanece a mesma (ex.: 4.500mm o tempo
todo), mas é coberta por mais de um Pedido ao longo do tempo (ex.: Pedido A cobre 3.000mm, Pedido B
cobre os 1.500mm restantes). **Isto não é versionamento da necessidade** — a necessidade não muda, só
o número de Pedidos que a cobrem. É este o problema que a relação N:N deste §10 e a invariante do
§10.1 endereçam.

**"Linhagem versionada" (reaproveitar `item_anterior_id`/`status_versao`) não é uma alternativa
equivalente à relação/alocação de cobertura parcial (conceito B)** — ela pertence ao conceito A. A
relação N:N (`pedido_compra_item_requisicoes`, ou equivalente) é o mecanismo que resolve o conceito B;
qual mecanismo resolveria o conceito A (se e quando for necessário) é uma questão técnica separada,
fora do escopo direto desta fatia.

## 11. Papel do Planejamento de Compras

**[Decisão técnica aberta — investigação conceitual, não decisão]** Conforme solicitado, a
investigação abaixo separa o que é provisório, definitivo, histórico e derivável em
`planejamentos_compra`/`planejamento_compra_origens`:

- **O que é provisório hoje**: `planejamento_compra_origens`, no modelo atual, já funciona como uma
  alocação/intenção temporária de Compras — existe antes de qualquer Pedido, pode (em tese) ser
  descartada via cancelamento do planejamento. Essa função provisória **pode continuar existindo** —
  nada nas regras de negócio desta rodada exige eliminar o Planejamento como etapa de trabalho de
  Compras (análise, agrupamento, cotação, conforme DEC-008 §6). Isso **não decide** que o Planejamento
  será uma etapa técnica obrigatória para todo Pedido — são dois eixos diferentes: existir como
  conceito/etapa de trabalho de Compras (isso nada exige eliminar) versus ser tecnicamente obrigatório
  no fluxo/schema (isso continua decisão aberta, ver item (a) abaixo).
- **O que precisa ser definitivo**: a relação Item da Requisição ↔ Item do Pedido, uma vez o Pedido
  formalizado, **não deve depender exclusivamente do Planejamento** — porque (achado 1, §8) não existe,
  hoje, nenhum mecanismo que reverta ou recalcule a origem do planejamento quando um Pedido vier a ser
  cancelado (o próprio cancelamento de Pedido ainda não existe como capacidade técnica), e porque o
  Planejamento é, por natureza, um objeto provisório/descartável, enquanto a cobertura comercial
  precisa sobreviver ao cancelamento e à reformulação de Pedidos. Isso aponta para a necessidade de
  uma relação própria, materializada no momento da formalização do Pedido (o modelo conceitual do
  §10), e não apenas herdada via o caminho indireto `pedido_compra_itens → planejamento → origem`.
- **O que é histórico**: o cancelamento de um Pedido deve preservar o vínculo antigo para auditoria
  (regra 14, §5) — isso é uma exigência de negócio, mas **a forma técnica** (a linha do vínculo fica
  marcada como inativa/cancelada mas presente, ou é movida para uma tabela de histórico separada,
  mesmo padrão já usado em `planejamentos_compra_historico`/`ordens_fabricacao_historico_estados`)
  é decisão técnica aberta.
- **O que pode ser derivado**: "quantidade ainda não coberta comercialmente" (regra 8, §5) deve,
  preferencialmente, ser calculada a partir das linhas de cobertura válidas (não canceladas), nunca
  persistida como coluna de saldo — isso vale tanto para a Requisição quanto para eventual
  "quantidade comercial pendente" de um Planejamento.
- **O que ainda depende de decisão**: (a) se o Planejamento continua obrigatório como etapa
  intermediária de todo Pedido, ou se passa a ser opcional; (b) o desenho exato da relação definitiva
  do §10; (c) se a materialização da cobertura acontece no momento de `gerar_pedido_compra_rascunho`
  (hoje) ou em um novo ponto do fluxo; (d) **não criar automaticamente uma relação N:N entre
  cabeçalho de Pedido e Planejamento sem demonstrar necessidade real** — a UNIQUE atual
  (`pedidos_compra_planejamento_compra_id_uniq`) impõe hoje no máximo um Pedido por Planejamento, mas
  ainda não foi decidido se essa cardinalidade é compatível com o modelo futuro; **esta fatia não
  decide manter nem remover essa constraint**. O que este contrato exige relaxar, com certeza, é a
  relação Item↔Item (§10) — não necessariamente o cabeçalho Planejamento↔Pedido.

## 12. Cobertura parcial e múltiplos Pedidos

Consolidação normativa (repete, para referência rápida, o que já está detalhado nos §§5,6,8,10):

- Um Item de Requisição pode ser coberto por mais de um Pedido ao longo do tempo (regra 4, cenário
  "parte → Pedido 001 / parte → Pedido 002"). **[Situação atual: impossível hoje — §8 achado 2.]**
- Um Pedido pode cobrir itens de várias Requisições (regra 4, cenário "A+B+C → Pedido 003").
  **[Situação atual: suportado a nível de Planejamento, com a restrição de que todos os itens
  agrupados precisam ter a mesma `materia_prima_id`/`unidade_id` — §7.]**
- A quantidade coberta por cada combinação Item-Requisição × Item-Pedido deve ser registrável
  (regra 5) — hoje não existe (§9).
- O cálculo de "quanto ainda falta cobrir comercialmente" deve ser derivado, não persistido (regra 8).

## 13. Relação Item da Requisição ↔ Item do Pedido

Ver modelo conceitual completo no §10. Resumo normativo:

- É o nível correto da relação de negócio — não Requisição↔Pedido como cabeçalhos (regra 4).
- Representa exclusivamente cobertura/justificativa comercial (regra 5) — nunca propriedade física,
  separação física, reserva de estoque, lote pertencente à OF, ou destinação física definitiva.
- Hoje é **indireta** (2 saltos via Planejamento) e, como o cancelamento de Pedido ainda não existe
  como capacidade técnica (§8 achados 1 e 4), não há nenhum caminho comprovado para que essa relação
  sobreviva de forma útil a um futuro cancelamento — é o gap técnico central que esta fatia formaliza,
  sem resolver.

## 14. Cancelamento

Consolidação normativa (regra 14, §5 — já reforça e detalha o DEC-008 §18, vigente, não alterado por
este documento):

- Pedido cancelado: terminal, motivo obrigatório, usuário, data/hora, histórico preservado, nunca
  reativado.
- Cancelar Pedido **não** cancela: a Requisição, outros itens dela, a necessidade da OF, outros
  Pedidos.
- Se o Pedido cobria só parte de uma Requisição multi-item, só aquela cobertura específica deixa de
  valer — o resto da Requisição continua com sua cobertura própria intacta.
- A necessidade "simplesmente continua existindo" — nenhum mecanismo de "reabertura" é necessário
  nem deve ser criado.
- **[Decisão técnica aberta]**: em qual(is) estágio(s) do fluxo de estados do Pedido o cancelamento é
  permitido — esta fatia **não** assume que só é permitido "antes da consolidação"; isso é decisão
  técnica de uma rodada futura, sobre o contrato de estados do Pedido (DEC-008 §23 já lista "nomenclatura
  completa de todos os estados técnicos internos" como aberto).
- **[Situação atual]**: não existe `cancelar_pedido_compra`, nem `pedidos_compra_historico` (§8/§9).

## 15. Separação obrigatória entre Compras, Recebimento, Estoque, PCP e Qualidade

**[Regra de negócio]** Nenhum destes domínios deve ser implementado nesta fatia; a fronteira
conceitual entre eles é preservada apenas para que a modelagem de Requisição/Pedido não invada o
espaço deles:

| Domínio | Responsabilidade que este contrato preserva, mas não implementa |
|---|---|
| **Compras** | Decide fornecedor, agrupamento, quantidade comercial, formaliza o Pedido (DEC-008 §4/§6). Único domínio efetivamente tocado por esta fatia. |
| **Recebimento** | Material chega fisicamente; distinto de Conferência (DEC-008 §13). Não implementado. |
| **Estoque** | Entrada disponível só após conferência/aprovação; baixa para OF; rastreabilidade física (§16, regra 16). Não implementado — é o domínio futuro citado explicitamente como "não implementar agora" na regra 16. |
| **PCP** | Decide CI/CE, avalia risco de atraso momentaneamente (regra 12), acompanha a necessidade até o atendimento real (regra 10). Não implementado nesta fatia — só a interface conceitual de que a necessidade da OF é a fonte, e que o PCP não é substituído pela existência de um Pedido. |
| **Qualidade** | Trata atraso real de projeto e Não Conformidade quando a causa vier de Compras (regra 13). Só a fronteira é preservada — nenhum módulo criado. |

## 16. Separação entre cobertura comercial, atendimento físico e encerramento operacional

**[Regra de negócio]** Três fatos distintos e independentes (regras 8, 9, 17, §5):

1. **Cobertura comercial** — quanto da necessidade está coberto por Pedido de Compra válido. Fato
   comercial, calculável a partir da relação Item↔Item (§10), nunca físico.
2. **Atendimento físico/operacional** — quanto efetivamente saiu do estoque para a OF, via baixa
   física. É o único evento que conta como "a OF recebeu o material" e que apropria custo.
3. **Encerramento da Requisição** — não é automático nem pela cobertura 100% comercial, nem pelo
   recebimento do fornecedor. Para Requisições de origem produtiva, permanece relevante enquanto
   houver parcela não atendida fisicamente. **A forma técnica exata (persistido vs. derivado) é
   decisão futura** (§20) — esta fatia só formaliza que os três conceitos nunca podem ser confundidos
   entre si num único status.

## 17. Unidade técnica × apresentação comercial

**[Regra de negócio, regra 20 §5]** A arquitetura deve preservar a capacidade de representar
separadamente: necessidade técnica (ex.: 4.500mm), quantidade comercial efetivamente comprada
(ex.: 1 barra de 6.000mm) e quantidade efetivamente incorporada ao estoque.

**[Situação atual]**: já existem, hoje, duas colunas distintas — `unidade` em
`requisicao_compra_itens` e `unidade_compra_id` decidido em `decidir_compra_planejamento` — que tocam
esse tema de formas diferentes. Isso é só uma descrição do estado atual do código, **não** uma
conclusão de que o contrato de 3 camadas (técnica/comercial/estoque) já esteja resolvido: essas duas
colunas nunca foram desenhadas com esse contrato em mente, não cobrem a terceira camada (estoque), e
sua existência não implica nenhuma decisão sobre como as três camadas devem se relacionar.

**[Decisão técnica aberta]**: como a terceira camada (unidade de estoque) se relaciona com as duas já
existentes — não desenhado nesta fatia, por decisão explícita da regra 20.

## 18. Concorrência e integridade a considerar posteriormente (sem implementar)

**[Decisão técnica aberta]** — pontos identificados na investigação prévia desta sessão que
qualquer implementação futura do modelo do §10 precisará resolver, mas que não são decididos aqui:

- Se a invariante conceitual de cobertura do §10.1 (`SOMA(quantidade_vinculada) ≤
  quantidade_necessaria do item`) vier a ser adotada como mecanismo técnico (trigger, constraint ou
  validação em RPC), ela precisará de lock explícito (`FOR UPDATE`) no item de Requisição durante
  qualquer criação/cancelamento de vínculo — mesmo padrão já usado hoje em
  `criar_planejamento_compra_a_partir_de_requisicoes`.
- Duas sessões tentando cobrir o mesmo saldo de um item simultaneamente — hoje resolvido de forma
  "acidental" pela trava total (nenhum reaproveitamento é possível); qualquer solução que permita
  cobertura parcial precisa de uma trava equivalente, deliberada.
- Cancelamento concorrente de Pedido com criação de um novo Pedido para o mesmo saldo — precisa do
  mesmo padrão de `FOR UPDATE` + checagem defensiva pós-UPDATE já usado em `gerar_pedido_compra_rascunho`/
  `cancelar_planejamento_compra`.
- `definir_planejamento_compra_origem` hoje não tem `FOR UPDATE` nem versão otimista — risco de
  last-write-wins já identificado, relevante se essa função continuar existindo no fluxo revisado.
- Constraint que impeça cobertura acima da quantidade requisitada (regra correlata à invariante de
  cobertura do §10.1) — não existe hoje porque não existe o próprio conceito de cobertura parcial.

## 19. Compatibilidade/migração de dados existentes (identificação do problema, sem desenhar migration)

**[Lacuna identificada, não resolvida]**

- Toda origem hoje em `planejamento_compra_origens` com `origem_ativa=true` e planejamento
  `convertido_pedido` representa, de fato, uma cobertura comercial 100% (a quantidade inteira do item
  foi usada) — se uma futura relação Item↔Item definitiva (§10) for criada, os dados existentes
  precisarão ser retroalimentados (backfill) a partir dessas origens já existentes, para não perder a
  cobertura histórica já formalizada.
- `requisicoes_compra.status` nunca foi escrito além de `'aberta'` — qualquer semântica nova de
  status (persistido ou derivado, §16) vai encontrar 100% das Requisições existentes formalmente
  "abertas", independentemente do estado real de cobertura/atendimento — isso pode divergir
  significativamente da realidade operacional e precisa ser considerado antes de expor esse campo em
  qualquer UI futura.
- O scaffolding morto (`item_anterior_id`/`status_versao`) já existe fisicamente no banco, com
  `default 'ativa'` em todas as linhas existentes — qualquer decisão de reaproveitá-lo para revisão de
  necessidade (conceito A, §10.2) precisa confirmar que nenhuma linha real já usa os valores mortos de
  forma inesperada antes de ativar a lógica.

Nenhuma migration foi desenhada para tratar esses pontos — são apenas identificados aqui.

## 20. Decisões técnicas ainda abertas

1. Qual mecanismo técnico garante a invariante de cobertura do §10.1 (trigger com lock, constraint
   declarativa, validação em cada RPC, ou outra forma) — não confundir com revisão de necessidade
   (conceito A, §10.2), que é um problema técnico separado.
2. Desenho exato (campos, nome, constraints) da relação Item↔Item definitiva — a tabela conceitual do
   §10 é um ponto de partida, não uma proposta final.
3. Se o Planejamento continua obrigatório como etapa intermediária de todo Pedido, ou se passa a ser
   opcional (§11).
4. Onde e como a materialização da cobertura acontece no fluxo (dentro de `gerar_pedido_compra_rascunho`
   revisada, ou em um novo ponto) (§11).
5. Forma técnica do histórico de cancelamento — linha marcada inativa in-place vs. tabela de
   histórico separada (§11, §14).
6. Em quais estágios do fluxo de estados do Pedido o cancelamento é permitido (§14) — depende do
   contrato de estados do Pedido, ainda não fechado (DEC-008 §23).
7. Se `requisicoes_compra.status` será reaproveitado, redesenhado ou obsoletado em favor de um status
   totalmente derivado (§16, §19).
8. Mecanismo técnico de compras sem OF — RPC nova, adaptação de `registrar_requisicao_compra_material`
   (hoje inalcançável), ou outro caminho (regra 18, §5).
9. Investigar se as invariantes de não-reprocessamento (`decidir_ci_ce_de_of`, `ajustar_of`)
   realmente impedem, na prática, honrar a regra de saldo pendente reutilizável (§8 achado 3 — hoje
   classificado como ponto a investigar, não conflito comprovado) — e, só se a investigação confirmar
   um impedimento real, decidir como resolvê-lo. Sem essa investigação, não se sabe se o mecanismo do
   §10 é alcançável sem alteração dessas duas funções para necessidades de origem produtiva.
10. Terceira camada de unidade (estoque) e sua relação com unidade técnica/comercial (§17).
11. Concorrência e locking definitivos para qualquer novo mecanismo de cobertura (§18).
12. Estratégia de backfill para dados já existentes (§19).

## 21. Itens explicitamente adiados

Herdados do DEC-008 §23 (não reabertos aqui) + reforçados nesta fatia:

- OF pai/filha para continuidade de produção.
- Modelo definitivo de cotações.
- Múltiplas alçadas de aprovação por valor, múltiplos aprovadores.
- Integração técnica com e-mail.
- Modelo definitivo de centro de custo.
- Integração com Contas a Pagar.
- Implementação do estoque (movimentação, lote, rastreabilidade física completa).
- Desenho definitivo da UI.
- Módulo de Qualidade / Não Conformidade.
- Conversões automáticas de unidade.
- Nomenclatura completa de todos os estados técnicos internos do Pedido.
- "Consolidação do Pedido" como conceito técnico definitivo — mencionada nas regras de negócio, mas
  sem definição técnica nesta fatia.

## 22. Critérios que uma futura implementação deverá satisfazer

Qualquer implementação técnica derivada deste contrato deve, no mínimo:

1. Representar a relação Item da Requisição ↔ Item do Pedido em nível N:N, com quantidade por par
   (§6, §10).
2. Nunca deixar um Item de Requisição permanentemente inelegível para nova cobertura após o
   cancelamento do Pedido que o cobria (resolve o conflito 1 do §8).
3. Permitir que uma necessidade (Item de Requisição) seja coberta parcialmente por múltiplos
   Pedidos, inclusive ao longo do tempo — não só numa única operação simultânea (resolve o conflito 2
   do §8). Quando um desses Pedidos for cancelado, sua parcela deixa de contar como cobertura
   comercial ativa, mas **a necessidade original não desaparece por causa do cancelamento** — ela
   continua existindo e pode voltar a ser coberta por um novo Pedido (regra 10, §5).
4. Nunca persistir uma coluna de saldo sem justificativa técnica forte — preferir cálculo derivado
   (regra 8, §5).
5. Nunca confundir cobertura comercial com atendimento físico ou com propriedade/reserva de estoque
   (regras 5, 8, 9, §5).
6. Preservar rastreabilidade da origem produtiva no nível do item, mesmo após cancelamento (regras 2,
   14, §5).
7. Nunca cancelar automaticamente a Requisição, outros itens dela, ou a necessidade da OF, ao
   cancelar um Pedido (regra 14, §5).
8. Preservar histórico de cancelamento sem permitir reativação (regra 14, §5).
9. Ser compatível com Requisições sem OF, sem forçar todo item comprado para dentro do modelo de
   matéria-prima/estoque (regras 18, 19, §5).
10. Preservar a possibilidade de 3 camadas de unidade (técnica/comercial/estoque) sem implementar
    conversão automática (regra 20, §5).
11. Investigar explicitamente (não presumir) se as invariantes de não-reprocessamento de
    `decidir_ci_ce_de_of`/`ajustar_of` realmente impedem o fluxo revisado de honrar saldo pendente
    reutilizável — e, se a investigação confirmar um impedimento real, resolvê-lo — antes de declarar
    a Fatia 2.1 "implementável" (§8 achado 3, §20 item 9).
12. Ser auditada quanto a concorrência (locks, versão otimista) antes de qualquer escrita em
    produção — nenhum mecanismo novo deve repetir o padrão last-write-wins hoje presente em
    `definir_planejamento_compra_origem` (§18).

---

Este documento não altera o DEC-008 (que permanece vigente e inalterado) nem implementa nenhum
código, migration ou RPC. É um contrato de especificação — a próxima rodada deve decidir os pontos do
§20 antes de qualquer escrita técnica.
