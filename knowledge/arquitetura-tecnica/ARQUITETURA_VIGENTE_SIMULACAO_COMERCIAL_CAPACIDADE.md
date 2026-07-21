# Arquitetura Vigente — Simulação Comercial de Capacidade

**Data:** 2026-07-15
**Versão:** 1.0
**Status:** Vigente — referência oficial única
**Natureza do documento:** consolidação que substitui os 4 documentos de origem

---

## Nota de precedência

Este documento é a **referência arquitetural única e vigente** da
Simulação Comercial de Capacidade da NEXOTFE. Ele substitui, como
referência de uso corrente, os 4 documentos abaixo — que **não foram
apagados** e permanecem no repositório apenas como histórico do processo
de decisão:

- `knowledge/arquitetura-tecnica/2026-07-15-01-motor de simulacao.md`
  ("Arquitetura do Motor de Simulação Comercial de Capacidade", v1.0)
- `knowledge/arquitetura-tecnica/2026-07-15-arquitetura do calendario operacional.md`
  ("Arquitetura do Calendário Operacional para a Simulação Comercial", v1.0)
- `knowledge/arquitetura-tecnica/2026-07-15-Resumo das decisoes.md`
  ("Decisão final sobre a arquitetura do Calendário Operacional")
- `knowledge/arquitetura-tecnica/2026-07-15-arquitetura-roteiro-desenvolvimento-v2.md`
  ("Arquitetura do Roteiro em Projetos de Desenvolvimento", v2.0) —
  supera a descrição conceitual anterior deste tema ("v1.0"), discutida
  em conversa mas nunca persistida como arquivo separado no
  repositório.

Onde os 4 documentos acima divergem entre si, ou de decisões já
registradas em `knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md`, prevalece o
texto deste documento. Em particular, o modelo de calendário "seed +
cópia" descrito no Documento 1 (seção 4) e sugerido no Documento 2 foi
**abandonado** e está integralmente substituído pela arquitetura de
Calendário Oficial / Calendário Operacional da Empresa / Calendário de
Eventos da Empresa descrita na seção 7 abaixo.

Este documento passa a ser a referência oficial para: auditoria do
banco, desenho do schema, implementação de Front-End, implementação de
Back-End e futuras evoluções da Simulação Comercial.

Este documento é específico ao subsistema de Simulação Comercial de
Capacidade — não substitui a base documental geral do projeto nem os 5
pontos tratados em `knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md`, que
continua valendo normalmente para os temas que trata.

---

## 1. Objetivo

O Motor de Simulação Comercial de Capacidade existe para responder,
durante a elaboração do orçamento: **"Com a capacidade produtiva
disponível, este projeto pode ser entregue na data desejada pelo
cliente?"**

Seu objetivo é apoiar a tomada de decisão comercial antes da aprovação
da proposta.

---

## 2. Princípio Fundamental

A Simulação Comercial verifica **se é possível produzir**. O PCP
continuará responsável por definir **como produzir**.

A Simulação Comercial:
- calcula capacidade;
- identifica gargalos;
- estima a primeira data possível;
- informa riscos.

Ela **não**:
- programa Ordens de Fabricação;
- distribui operadores;
- escolhe máquinas;
- sequencia operações;
- balanceia recursos;
- cria programação diária.

Essas responsabilidades pertencem exclusivamente ao futuro módulo de
PCP.

---

## 3. Princípio da Responsabilidade Única

Cada informação deve possuir um único módulo responsável. Nenhuma
informação poderá ser duplicada apenas para atender à Simulação
Comercial. A Simulação interpreta informações existentes — ela não cria
novos cadastros.

| Informação | Dono |
| --- | --- |
| Calendário Oficial | SISARE |
| Eventos internos | Empresa |
| Capacidade | Recursos |
| Produtividade Padrão | Grupo de Recursos (sobrescrita no Recurso) |
| Quantidade | Orçamento |
| Tempos | Roteiro |
| Situação Comercial | Projeto (fato registrado pelo vendedor) |
| Cenário de Demanda | Configuração da Empresa (decide quais fases contam) |

---

## 4. A Simulação nunca altera dados permanentes

Durante uma simulação poderão existir: horas extras; sábados
trabalhados; diferentes demandas. Nenhuma dessas informações altera
permanentemente: recursos; calendário; roteiros; capacidade. Toda
alteração é temporária e existe apenas durante a análise.

---

## 5. Uma Exceção Sempre Prevalece Sobre uma Regra Permanente

Princípio válido em toda a Simulação Comercial: quando uma regra
permanente (como o Calendário Operacional da Empresa, seção 7.2) e uma
exceção pontual registrada individualmente (como um evento do
Calendário de Eventos da Empresa, seção 7.3) entram em conflito sobre o
mesmo dia, **a exceção sempre prevalece**. A regra permanente descreve
o padrão; a exceção descreve um fato real que, para aquele caso
específico, substitui o padrão. Aplicação concreta na ordem de
precedência do Calendário Operacional (seção 7.4).

---

## 6. Arquitetura Geral

A simulação é composta por componentes independentes, calculados nesta
ordem:

```
Calendário Operacional
    ↓
Dias Produtivos
    ↓
Capacidade dos Recursos
    ↓
Modo de Produção
    ↓
Capacidade Disponível
    ↓
Demanda Selecionada
    ↓
Carga Necessária
    ↓
Resultado
```

Primeiro a NEXOTFE calcula quanto a fábrica consegue produzir. Somente
depois compara essa capacidade com a demanda selecionada.

---

## 7. Calendário Operacional

O Calendário Operacional existe para determinar quais dias são
produtivos durante a janela de produção utilizada pela Simulação
Comercial. Ele **não define a capacidade dos recursos** — a capacidade
pertence exclusivamente ao cadastro dos Recursos Produtivos (seção 8).

O calendário responde apenas: *"Este dia é produtivo para esta
empresa?"* Ele nunca define horas de produção.

Três estruturas compõem o Calendário Operacional, cada uma com seu
domínio exclusivo — nenhuma delas duplica dado que já exista nas
outras.

### 7.1 Calendário Oficial

- **Global, sem `empresa_id`** — dado de referência mantido
  centralmente pela **SISARE** (fornecedora do sistema), funcionando
  como um "banco de CEP" ou tabela NCM/IBGE.
- **Somente leitura** pelo ERP — nenhuma empresa altera este
  calendário; distribuído via migration/seed, não por tela.
- **Compartilhado** por todas as empresas clientes.
- Colunas: `id`, `data`, `abrangencia` (`nacional` / `estadual` /
  `municipal`), `pais_codigo` (ISO), `uf_codigo` (IBGE),
  `municipio_codigo` (IBGE), `descricao`.
- A simulação consulta este calendário **em tempo real**, filtrando
  por `uf_codigo`/`municipio_codigo` da empresa (seção 7.5) — **nunca
  copia** os dados para dentro da empresa.

### 7.2 Calendário Operacional da Empresa

- **Regra permanente**, uma linha por empresa (`empresa_id` único).
- Colunas: `empresa_id`, e um booleano para cada dia da semana —
  `segunda`, `terca`, `quarta`, `quinta`, `sexta`, `sabado`, `domingo`.
- Representa o **padrão semanal normal de trabalho** da empresa (ex.:
  segunda a sexta produtivos, sábado e domingo não produtivos).

### 7.3 Calendário de Eventos da Empresa

- **Exceções pontuais**, `empresa_id`.
- Colunas: `id`, `empresa_id`, `data`, `tipo` (`recesso_coletivo` /
  `inventario` / `paralisacao` / `dia_trabalhado_excepcional` /
  `feriado_local_temporario`), `descricao`, `ativo`,
  `reconciliado_em`, e auditoria completa (`created_at`, `created_by`,
  `deleted_at`, `deleted_by` — soft delete, sem `DELETE` real).
- O campo **produtivo é derivado do `tipo`**, não armazenado:
  `dia_trabalhado_excepcional` torna o dia produtivo; os demais tipos
  (`recesso_coletivo`, `inventario`, `paralisacao`,
  `feriado_local_temporario`) tornam o dia não produtivo.
- `feriado_local_temporario` é o mecanismo que permite a uma empresa
  continuar operando corretamente mesmo quando exista um feriado
  municipal ainda não presente no Calendário Oficial — uso excepcional
  e provisório. `reconciliado_em` marca quando a exceção foi
  reconciliada com o Calendário Oficial depois que a SISARE o
  atualizar; **a estratégia técnica de reconciliação ainda não está
  definida nesta versão.**

### 7.4 Ordem de Precedência

A produtividade de um dia é resolvida nesta ordem:

```
Calendário Operacional da Empresa (base)
    ↓
Calendário Oficial (subtrai)
    ↓
Calendário de Eventos da Empresa (prevalece sobre os dois anteriores)
```

1. **Base** — o Calendário Operacional da Empresa (seção 7.2) define o
   padrão semanal.
2. **Calendário Oficial subtrai** — um feriado nacional/estadual/
   municipal na data torna o dia não produtivo, mesmo que a Empresa o
   considere um dia normal de trabalho na base.
3. **Calendário de Eventos da Empresa prevalece sobre os dois
   anteriores** (seção 5) — pode tanto subtrair um dia que seria
   produtivo quanto devolver como produtivo um dia que não seria:
   - **Sábado trabalhado virando recesso:** o Calendário Operacional
     da Empresa marca sábado como produtivo, mas a empresa registra um
     `recesso_coletivo` nesse sábado específico — o dia vira não
     produtivo.
   - **Domingo não-útil virando dia trabalhado excepcional:** o
     Calendário Operacional da Empresa marca domingo como não
     produtivo, mas a empresa registra `dia_trabalhado_excepcional`
     nesse domingo — o dia vira produtivo.
   - **Feriado transferido onde a empresa decide trabalhar:** o
     Calendário Oficial marca o dia como feriado (não produtivo), mas
     a empresa registra `dia_trabalhado_excepcional` nesse mesmo dia —
     o dia vira produtivo, mesmo sendo feriado oficial.

### 7.5 Localização da Empresa

País, Estado e Município são informações **obrigatórias** do cadastro
da empresa — mas ainda não existem na tabela `empresas` hoje. Plano:
adicionar `pais_codigo`, `uf_codigo`, `municipio_codigo` (os mesmos
códigos usados no Calendário Oficial, seção 7.1) como colunas
**nullable inicialmente**, com backfill das duas empresas reais
existentes (ENIFER, NEXOTFE Demo) antes de eventualmente evoluir para
`not null`.

Esses dados **não existem por causa da Simulação Comercial** — são
informações cadastrais básicas, reutilizadas por diversos módulos:
Calendário Operacional, Fiscal, Endereços, Relatórios.

### Motivação da arquitetura de calendário

Pensando em um ERP vendido para centenas de empresas, duplicar feriados
oficiais por empresa geraria inconsistência e retrabalho de manutenção
(ex.: "500 natais" em vez de um único Natal). Centralizar o dado oficial
na SISARE e deixar a empresa responsável apenas pelo seu padrão semanal
e suas exceções internas é a arquitetura mais limpa e escalável.

---

## 8. Recursos Produtivos e Capacidade Disponível

Cada recurso possui sua capacidade diária padrão, pertencente
exclusivamente ao cadastro do recurso — nunca alterada pelo calendário
nem pela simulação.

Exemplos: Torno CNC 01 → 9 horas/dia | Centro de Usinagem 5 Eixos → 18
horas/dia | Serra Vertical → 16 horas/dia.

O cálculo da capacidade disponível é composto por três elementos
independentes:

1. Calendário Operacional (dias produtivos da janela);
2. Capacidade diária do recurso;
3. Premissas do Modo de Produção (seção 10).

**Cálculo da Capacidade Bruta:** capacidade diária do recurso × dias
produtivos da janela.

Exemplo: 10 dias produtivos, Torno CNC 9 horas/dia → 90 horas
disponíveis.

---

## 9. Produtividade do Recurso

A **Produtividade Padrão** é configurável por Grupo de Recursos —
decisão livre de cada empresa, que nomeia e organiza seus próprios
Grupos (ex.: a ENIFER tem 13 grupos hoje, como "Tornos CN" e
"Caldeiraria/Soldagem"); cada Grupo recebe sua própria Produtividade
Padrão, usada para reduzir a Capacidade Bruta (seção 8) ao valor
efetivamente esperado.

O Recurso individual herda a Produtividade Padrão do seu Grupo, podendo
sobrescrever quando necessário (ex.: Torno CNC 02 configurado a 80%
mesmo que o Grupo "Tornos CN" tenha Produtividade Padrão de 85%). É um
novo campo no cadastro do Grupo de Recursos, e um novo campo — opcional,
para o caso de sobrescrita — no cadastro do Recurso Produtivo, análogo
à Capacidade e ao Valor/Hora.

Não há categorias fixas definidas pelo sistema. Percentuais como 75% ou
85%, eventualmente citados como referência, são apenas valores de
exemplo/sugestão — nunca uma classificação obrigatória.

A Produtividade nunca altera o conteúdo técnico do Roteiro nem o custo
das Operações. Ela influencia exclusivamente o cálculo da Capacidade
Disponível do recurso, afetando o prazo necessário para absorver a
carga de trabalho — nunca o volume de horas ou o custo do trabalho em
si.

A Produtividade do Recurso não é exclusiva da Simulação Comercial — o
futuro módulo de PCP também vai utilizá-la para controle de produção.
Mesmo princípio da Responsabilidade Única (seção 3): a Produtividade
pertence ao Recurso; Simulação e PCP apenas consultam, nenhum dos dois
duplica ou mantém sua própria cópia.

---

## 10. Modo de Produção

O Modo de Produção (também chamado de Cenário de Produção) representa
hipóteses temporárias utilizadas durante a simulação. Não altera
permanentemente o cadastro do recurso nem o calendário operacional.

Exemplos: Produção Normal; Hora Extra; Hora Extra + Trabalho aos
Sábados; Personalizado.

Horas extras por recurso podem ser diferentes dentro do mesmo cenário
(simula-se apenas os recursos que representam gargalo).

Exemplo: Torno CNC, capacidade padrão 9h/dia. Cenário "Hora Extra":
+2h/dia durante 5 dias, +5h no sábado → 45h normais + 10h extra + 5h
sábado = 60 horas utilizadas apenas nesta simulação.

Na Simulação Comercial, as horas adicionais previstas no Modo de
Produção são consideradas integralmente. O fator de produtividade
aplica-se apenas à capacidade padrão do recurso. Eventuais perdas
específicas de jornadas extraordinárias pertencem ao controle
operacional da Produção e não fazem parte deste cálculo.

---

## 11. Situação Comercial e Cenário de Demanda

Substitui integralmente o modelo anterior de "Demanda: Confirmada /
Provável / Potencial", com definições fixas do sistema.

### 11.1 Situação Comercial

Novo campo em `projetos` — `situacao_comercial`. Representa fatos
observáveis da negociação com o cliente, evoluindo em fases: **Consulta
→ Proposta Enviada → Negociação → Compromisso Verbal → Pedido
Recebido**.

É um eixo **independente** do `status` (o workflow interno do projeto:
Rascunho / Em Análise / Aprovado / Reprovado). Situação Comercial
descreve onde a negociação está com o cliente; `status` descreve onde o
projeto está no fluxo interno da empresa. Os dois evoluem de forma
desacoplada.

### 11.2 Relação com o Status do Projeto

Existe uma relação de **limite lógico**, não automática, entre os dois
eixos: ao registrar um Pedido de Compra do cliente (número + data) na
Situação Comercial, o sistema **sugere** a aprovação do `status` — nunca
força automaticamente. A decisão de aprovar continua sendo do usuário.

### 11.3 Histórico da Situação Comercial

Toda mudança de Situação Comercial é registrada na nova tabela
`historico_situacao_comercial` — uma linha por mudança, com:
`projeto_id`, situação anterior, situação nova, `usuario_id`,
data/hora, e origem (Manual / Automática / Importação / Integração).

Esse histórico é **obrigatório desde a primeira versão**, não uma
evolução futura — diferente de outros dados da Simulação, que têm ao
menos um valor de referência atual e podem ser reconstruídos, mudanças
de negociação comercial não podem ser reconstruídas retroativamente se
não forem capturadas no momento em que acontecem.

### 11.4 Cenário de Demanda

"Cenário de Demanda" substitui os nomes fixos "Confirmada / Provável /
Potencial". A Simulação não pergunta mais *"qual é a demanda
provável?"* — pergunta *"quais Situações Comerciais devem ser
consideradas neste cenário?"*.

Cada empresa configura livremente, nas Configurações da Empresa, quais
fases da Situação Comercial entram em cada Cenário de Demanda (ex.:
"Somente Pedidos Recebidos"; "Pedidos + Compromissos Verbais"). Não há
mais uma lista fixa de visões definida pelo sistema — é uma
configuração por empresa, decidida por ela, sobre o mesmo fato objetivo
(Situação Comercial) já registrado no Projeto.

O Cenário de Demanda continua **independente** do Modo de Produção —
são dois eixos ortogonais da simulação (ex.: é possível rodar um
Cenário de Demanda "Pedidos + Compromissos Verbais" + "Produção Hora
Extra" ao mesmo tempo).

### 11.5 Princípio: Preferir Gatilhos por Dado Objetivo

Onde for possível, a arquitetura prefere gatilhos baseados em dado
objetivo observável, não em escolha manual de uma lista. Precedentes já
aplicados nesta base:

- **Custo congelado** — disparado pela mudança real de `status` do
  projeto, não por um botão separado de "congelar".
- **Produtividade por Grupo** (seção 9) — herdada do dado já cadastrado
  no Grupo, não escolhida numa lista de categorias fixas do sistema.
- **Sugestão de aprovação de status** (seção 11.2) — disparada pelo
  registro do Número do Pedido de Compra, um fato objetivo, não pela
  simples seleção de "Pedido Recebido" numa lista.

---

## 12. Cenários

Os cenários existem **apenas durante a análise**, para apoiar a decisão
do Orçamentista. Diversos cenários podem ser comparados ao mesmo tempo
(ex.: Produção Normal; Hora Extra; Hora Extra + Sábado).

Ao concluir a análise:
- **apenas o cenário aprovado é registrado** no orçamento;
- os demais cenários **não são persistidos**.

O orçamento passa a armazenar somente: Cenário de Demanda utilizado; modo
de produção escolhido; premissas utilizadas; resultado da simulação.
Isso preserva a decisão tomada sem gerar crescimento desnecessário da
base de dados.

---

## 13. Margem de Segurança

Campo configurável diretamente na tela de Simulação, ajustável pelo
orçamentista a cada rodada de simulação — em **dias produtivos** (pode
ser 0; pode ser 5-6 dias, conforme a complexidade percebida do
projeto).

A Margem de Segurança reduz a Data de Necessidade informada pelo
cliente **internamente**, gerando uma **Data Alvo** mais apertada,
usada apenas no cálculo de viabilidade da Simulação (seção 14). Não
altera a data real prometida ao cliente.

---

## 14. Cálculo

Para cada recurso:

```
Necessário            = Tempo do roteiro × Quantidade
Capacidade Bruta      = Dias Produtivos × Capacidade Diária
Capacidade Efetiva    = Capacidade Bruta × Produtividade
Capacidade Disponível = Capacidade Efetiva + Horas Adicionais (Modo de Produção)
Comprometido          = Demanda existente conforme o Cenário de Demanda escolhido
Livre                 = Capacidade Disponível − Comprometido
Déficit               = Necessário − Livre
```

Resultado: Folga; Déficit; Gargalo; Recurso Restritivo; Primeira Data
Possível.

---

## 15. Roteiro em Projetos de Desenvolvimento

Em projetos de Desenvolvimento — fabricação sob encomenda cujo Produto
Final ainda não tem desenho detalhado no momento da venda —, o Roteiro
nasce agregado e estimado junto com a venda, e evolui para Roteiros
Detalhados por subconjunto conforme a Engenharia libera os desenhos,
sem exigir nenhuma estrutura de dados paralela à já existente (Produto,
Roteiro, Subconjunto). Detalhamento completo em
`knowledge/arquitetura-tecnica/2026-07-15-arquitetura-roteiro-desenvolvimento-v2.md`.

### 15.1 Terminologia

- **Roteiro Inicial**: termo oficial para o Roteiro agregado/estimado
  do Produto Final, criado no momento da venda, antes de o desenho
  detalhado existir. Substitui definitivamente os termos
  anteriormente cogitados "Roteiro Macro", "Estimativa Macro" e
  "Roteiro do Projeto" — nenhum dos três deve ser usado daqui em
  diante.
- **Roteiro Detalhado**: o Roteiro de cada produto/peça/subconjunto
  real, criado pela Engenharia após a liberação dos desenhos.
- **Horas Reais Apontadas**: os apontamentos de produção real (Ordem
  de Fabricação), usados nas comparações de precisão (seção 15.5).

### 15.2 Produto Final na Venda

O Produto Final (ex.: "Máquina de Clipe") é criado a partir da própria
solicitação do cliente, no momento da venda — não é um placeholder
genérico nem um cadastro fictício: é o produto real que o cliente está
comprando, cadastrado como qualquer outro Produto do sistema.

### 15.3 Do Roteiro Inicial ao Roteiro Detalhado

Esse Produto Final recebe um Roteiro Inicial (seção 15.4). Quando a
Engenharia libera os desenhos — o que pode acontecer bem depois da
venda —, nascem os produtos/peças/subconjuntos reais (podem ser dezenas
ou centenas), cada um com seu próprio Roteiro Detalhado. Esses produtos
se vinculam ao Produto Final através do mecanismo já existente de
"Montar Subconjunto" (Estrutura/Subconjuntos) — o mesmo usado em
qualquer outro produto do sistema, sem nenhuma adaptação especial para
projetos de Desenvolvimento.

### 15.4 Roteiro Inicial do Produto Final

O Roteiro Inicial usa o mesmo mecanismo de Roteiro já existente na
plataforma (Operações → Recurso → Tempo) — só que agregado e estimado,
porque o desenho detalhado do produto ainda não existe no momento da
venda.

O valor estimado dos materiais utilizado no Roteiro Inicial integra a
estimativa comercial do projeto e deve permanecer preservado através
do mesmo mecanismo de congelamento utilizado pela Proposta Comercial
(seção 15.7). Alterações posteriores nos preços de catálogo não
modificam a estimativa originalmente apresentada ao cliente.

O material previsto do Roteiro Inicial deverá utilizar o mesmo
mecanismo de gestão de materiais adotado pela plataforma, evitando
conceitos paralelos exclusivamente para projetos de Desenvolvimento.

### 15.5 As Três Comparações de Precisão

Com o Roteiro Inicial, os Roteiros Detalhados dos subconjuntos e as
Horas Reais Apontadas na produção, a plataforma pode calcular três
comparações de precisão, cada uma medindo uma etapa diferente do
processo:

- **Precisão da Estimativa Comercial:** Roteiro Inicial (do Produto
  Final) × soma dos Roteiros Detalhados de todos os subconjuntos
  vinculados a ele. Mede o quão perto a estimativa comercial original
  chegou do que a Engenharia efetivamente detalhou.
- **Precisão do Planejamento Técnico:** soma dos Roteiros Detalhados ×
  Horas Reais Apontadas (produção). Mede o quão perto o planejamento
  técnico da Engenharia chegou do que realmente aconteceu no chão de
  fábrica.
- **Precisão Global do Processo:** Roteiro Inicial × Horas Reais
  Apontadas. Mede o quão perto a estimativa comercial original chegou
  do resultado final real, de ponta a ponta.

O Roteiro Inicial nunca é descartado nem substituído — permanece como
registro histórico da estimativa comercial original, mesmo depois que
os subconjuntos detalhados existirem e tiverem seus próprios Roteiros
Detalhados.

### 15.6 Continuidade da Arquitetura

Não existe pendência estrutural de schema para viabilizar este fluxo:
Produto, Roteiro, Subconjunto (Estrutura) e o Congelamento de Custo
(`custo_congelado`, seção 15.7) já cobrem integralmente o que esta
seção descreve. A única peça que falta implementar é a tela/lógica de
comparação (Roteiro Inicial × Roteiros Detalhados × Horas Reais
Apontadas) — não há necessidade de nenhuma estrutura de dados paralela
exclusiva para projetos de Desenvolvimento.

### 15.7 Congelamento do Roteiro Inicial na Aprovação Comercial

Enquanto o Projeto estiver em elaboração, orçamento ou negociação, o
Roteiro Inicial pode ser alterado livremente. No momento em que o
cliente aprova o pedido: (1) o Roteiro Inicial é congelado como
referência histórica; (2) a Engenharia passa a desenvolver os produtos
detalhados.

Após a aprovação comercial do projeto, o Roteiro Inicial passa a
representar oficialmente a estimativa comercial utilizada na venda e
torna-se um registro histórico. Alterações posteriores deverão ocorrer
nos roteiros detalhados dos produtos, preservando a rastreabilidade das
comparações.

---

## 16. Situação da Base (registro histórico da aprovação desta versão)

No momento da aprovação desta versão (2026-07-15), já haviam sido
consolidados: estrutura dos Recursos Produtivos; capacidade diária
padronizada; grupos de recursos revisados; preparação da base para o
cálculo da Simulação Comercial.

O vínculo entre recursos e tecnologias, mencionado na versão original do
Motor de Simulação, está **superado** — ver
`knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md` (item 1): o vínculo vigente é
Recurso Produtivo direto na Operação (`recurso_produtivo_id`), não
Tecnologia.

Permanecem atividades de saneamento dos cadastros reais, incluindo
revisão de vínculos e complementação de recursos de mão de obra, antes
da validação definitiva do motor de simulação. Este é um registro de
status pontual — não deve ser tratado como fonte viva sobre o estado
atual do banco; para isso, consultar o banco diretamente ou as
auditorias mais recentes em `knowledge/`.

---

## 17. Evolução Futura (fora do escopo da versão 1.0)

Registrado apenas para preservar a direção arquitetural do produto —
nenhum destes itens faz parte da implementação da versão 1.0:

- **Estratégia da Simulação:** Conservadora, Realista, Otimista (muda a
  produtividade considerada — ex.: 75% / 85% / 95%).
- Sequenciamento de operações;
- APS (Advanced Planning and Scheduling) completo;
- Balanceamento automático de recursos;
- **Calendário por Recurso:** indisponibilidade individual (Manutenção
  Preventiva/Corretiva, Calibração, Upgrade, Troca de Layout, Parada
  Técnica), com prioridade sobre a capacidade daquele recurso
  específico, sem afetar os demais. O Calendário da Empresa (seção 7)
  representa eventos que afetam a capacidade global da empresa.
  Eventos que afetam apenas um recurso produtivo pertencem ao
  Calendário do Recurso e não fazem parte da primeira versão;
- Turnos;
- Recursos alternativos;
- Manutenção;
- Justificativa obrigatória em retrocessos/cancelamentos de Situação
  Comercial (seção 11) — não implementada agora, prevista como
  configuração futura por empresa;
- Situação Comercial no nível do Item do Projeto, não só do Projeto
  inteiro — para casos de venda parcial (ex.: projeto com 10 itens,
  cliente fecha 3 agora e adia os demais). Registrado aqui apenas como
  possibilidade, sem implementação prevista nesta versão.

---

## 18. Compatibilidade entre Recursos Produtivos e Motor de Avaliação Sequencial de Capacidade

Etapa 4 do motor de Simulação Comercial. Consome a fórmula da seção 14,
decidindo — para cada operação do roteiro — qual recurso é considerado
na análise de capacidade, quando o recurso originalmente previsto não
comporta a operação inteira.

**Princípio de fundo:** a Simulação Comercial verifica cenários
possíveis, sem assumir o papel do PCP. O orçamentista define o roteiro
de referência; a empresa configura quais substituições são aceitáveis;
a Simulação apenas avalia capacidade dentro desses limites, sem
executar sequenciamento ou distribuição de produção.

### 18.1 Compatibilidade entre Recursos Produtivos

> *"A Compatibilidade entre Recursos Produtivos não altera o roteiro,
> não altera o tempo da operação e não altera o recurso originalmente
> planejado. Ela apenas informa à Simulação Comercial quais recursos
> poderão ser considerados como alternativas caso o recurso
> originalmente previsto não possua capacidade disponível."*

Decisões:

1. **Direcional** — A pode substituir B sem que B substitua A. Não
   simétrica, não necessariamente transitiva (o Motor só consulta
   compatibilidades diretas do recurso original — nunca encadeia).
2. **Tempo de execução no substituto é o mesmo da operação**, vindo do
   roteiro — nenhum fator de conversão por par de recursos.
3. **Separação de responsabilidades**: Compatibilidade responde só
   "quais recursos PODEM substituir este?" (dado estático, sem
   conhecimento de capacidade). A Simulação decide se há capacidade —
   mecanismos independentes. Termo "recurso considerado pela Simulação
   Comercial para análise de capacidade" — nunca "alocação" (linguagem
   de PCP).
4. **Operação indivisível** — cada operação é avaliada inteira em um
   único recurso; a Simulação não divide carga entre recursos. Divisão
   de carga é decisão futura do PCP.
5. **Ordem de processamento das operações**: sequência do roteiro de
   fabricação (`bom_operacoes.ordem`) — representa a ordem técnica
   planejada pela engenharia, não um critério entre vários igualmente
   válidos.
6. **Reprodutibilidade obrigatória**: mesmas entradas produzem
   exatamente o mesmo resultado sempre. Proíbe estruturas sem ordem
   garantida, dependência de ordem natural de retorno do banco sem
   `ORDER BY` explícito, paralelismo não determinístico.

Modelagem: tabela dedicada `recurso_produtivo_compatibilidades`
(relação N:N direcional com atributo próprio — prioridade). FK composta
`(recurso_id, empresa_id) → recursos_produtivos(id, empresa_id)`
garante, a nível de banco, que origem e destino pertencem sempre à
mesma empresa. Configuração editável (`ativo`/`deleted_at`, PAD-004),
não log de auditoria.

### 18.2 Motor de Avaliação Sequencial de Capacidade

**Determinístico, porém não persistente** — seu estado interno
(capacidade remanescente por recurso, durante a avaliação) existe
apenas durante a execução da simulação e jamais representa um estado
oficial do sistema.

**Fronteira — Capacidade Disponível Inicial**: o Motor *recebe* o
resultado já pronto de Calendário → Dias Produtivos → Capacidade Diária
→ Produtividade → Horas Adicionais (quando existir) como entrada. O
Motor não recalcula calendário nem produtividade — só consome.

**Comprometido é dado de entrada consultado durante toda a execução**,
não uma fase que "termina antes" do Motor rodar — a capacidade
remanescente de um recurso, a qualquer momento da avaliação, é sempre
`Capacidade Disponível Inicial − Comprometido por outros projetos −
já consumido por operações anteriores desta mesma simulação`.

Algoritmo:

```
ENTRADAS (preparadas antes do laço, consultadas durante toda a execução)
├── Operações do Roteiro, na ordem do roteiro (bom_operacoes.ordem)
├── Compatibilidades diretas do recurso original, por prioridade
├── Capacidade Disponível Inicial por recurso (pronta, ver acima)
└── Comprometido por recurso (calcular_comprometido_v1, ver 18.3)

estado inicial: capacidadeRemanescente[recurso] =
    CapacidadeDisponivelInicial[recurso] − Comprometido[recurso]

para cada OPERAÇÃO, na ordem do roteiro:
  candidatos := [recurso original] + compatíveis diretos, por prioridade
  para cada candidato, em ordem:
    se capacidadeRemanescente[candidato] >= tempo da operação:
        recursoConsiderado := candidato
        capacidadeRemanescente[candidato] -= tempo da operação
        → próxima operação
  se nenhum candidato comportou a operação inteira:
        registra DÉFICIT para esta operação
        → próxima operação (o Motor NÃO para no primeiro déficit)

RESULTADO (só depois de todas as operações processadas)
└── 1 linha por OPERAÇÃO, com os 7 valores da fórmula (seção 14)
    referentes ao recurso considerado daquela operação → persistida
    nessa granularidade por aprovar_projeto_com_simulacao (ver 18.5 —
    NÃO há consolidação por recurso na persistência)
```

### 18.3 Comprometido V1 — decisão de escopo isolada

*"Nesta versão da Simulação Comercial, o comprometimento de capacidade
é calculado por recurso, considerando todos os projetos aprovados. A
distribuição temporal da carga entre projetos ainda não faz parte do
modelo e será tratada em uma evolução futura da arquitetura."*

O comprometimento (V1) é a soma de `necessario`, por recurso, de todos
os projetos aprovados (`simulacao_comercial_itens`, `vigente=true`) que
consideraram aquele recurso, excluindo o projeto sendo simulado. **Não
considera sobreposição temporal entre janelas de projetos diferentes**
— limitação conhecida e documentada, não comportamento definitivo.

Operações em déficit total não participam deste cálculo, pois não
possuem `recurso_considerado_id` (ver 18.5) — a query (`WHERE
recurso_considerado_id = p_recurso_produtivo_id`) já as exclui
naturalmente, sem necessidade de filtro adicional.

Essa simplificação é isolada num componente próprio e substituível
(`calcular_comprometido_v1(recurso_produtivo_id, projeto_excluido_id)
returns numeric`) — o Motor consome o resultado sem conhecer a
implementação interna. Uma V2 (com distribuição temporal real) pode
substituir **apenas** esse componente, sem alterar o Motor, a
Compatibilidade, ou qualquer outra peça.

> **Princípio geral:** não simplifique a arquitetura para simplificar a
> implementação. Simplifique apenas a parte que será substituída no
> futuro.

### 18.4 Camada de execução do Motor: TypeScript, não SQL

O Motor de Avaliação Sequencial de Capacidade é implementado na camada
de aplicação (TypeScript), não em PL/pgSQL — decisão explícita,
diferente do restante da persistência desta etapa (tabelas, RLS,
`calcular_comprometido_v1`, `aprovar_projeto_com_simulacao`, que
continuam em SQL).

**Justificativa**: a arquitetura já possui regra de negócio consolidada
em TypeScript — `resolverDiaProdutivo()` (seção 7, Etapa 1).
Reimplementar a lógica de precedência de calendário em PL/pgSQL criaria
duas implementações da mesma regra de negócio, com risco real de
divergência ao longo do tempo. O banco permanece responsável por
persistência, integridade, RLS e funções de apoio pontuais (consultas
agregadas, cálculos que já são naturalmente SQL); o Motor concentra a
lógica procedural/algorítmica — que tem estado interno, processamento
sequencial, e depende de reutilizar `resolverDiaProdutivo` diretamente.

```
Frontend/Server Action
  → Motor de Avaliação Sequencial (TypeScript,
    src/modules/simulacao-comercial/lib/)
      → resolverDiaProdutivo() [Etapa 1, TS, chamado diretamente]
      → calcular_produtividade_efetiva() [SQL, via supabase.rpc()]
      → calcular_comprometido_v1() [SQL, via supabase.rpc()]
      → SELECT recurso_produtivo_compatibilidades [supabase-js, RLS normal]
  → aprovar_projeto_com_simulacao() [SQL, RPC final, persiste
    atomicamente o resultado já calculado]
```

O banco nunca orquestra a simulação — só persiste o resultado final e
oferece funções de apoio pontuais que o Motor consome via RPC/`SELECT`.

> **Princípio geral** (candidato a padrão formal quando uma segunda
> instância aparecer — ex.: APS, PCP — não é convenção com uma única
> ocorrência): todo algoritmo que possua estado interno, processamento
> sequencial, ou dependa de reutilização de regras de negócio já
> implementadas em TypeScript deverá ser implementado na camada de
> aplicação, salvo justificativa técnica documentada em contrário.

### 18.5 Persistência do snapshot: granularidade por operação

> **Princípio de Persistência da Simulação Comercial:** O Motor de
> Avaliação Sequencial de Capacidade decide operação por operação.
> Portanto, o snapshot deve persistir cada decisão na mesma
> granularidade. Qualquer consolidação é apenas uma visão derivada dos
> dados, nunca a fonte primária da informação.

`simulacao_comercial_itens` tem **1 linha por operação do roteiro**
(`bom_operacao_id`), não 1 linha agregada por `recurso_considerado_id`.
Motivo concreto: se duas operações de recursos originais **diferentes**
convergirem para o mesmo recurso considerado (ex.: CNC 500 e CNC 800
ambas substituídas por CNC 1000, via Compatibilidade), uma linha
agregada só consegue registrar 1 `recurso_original_id` — a segunda
operação perderia rastreabilidade. Como o Motor já decide nessa
granularidade, o snapshot só precisa espelhar a decisão, não
reinterpretá-la.

Colunas `necessario` e `deficit` são **por operação** (o tempo daquela
operação especificamente) e sempre `NOT NULL` — são propriedades da
operação em si, conhecidas independentemente do resultado da avaliação.
Colunas `capacidade_bruta`, `capacidade_efetiva`,
`capacidade_disponivel`, `comprometido` e `livre` são do **recurso
considerado** no momento da simulação — denormalizadas deliberadamente
(repetidas em toda linha que compartilhar o mesmo recurso considerado).
Normalizar essas colunas em tabela separada é otimização prematura; só
deve ser considerada se houver gargalo real de desempenho no futuro,
não como parte desta entrega.

Qualquer visão "por recurso" (ex.: dashboard de capacidade agregada) é
uma consulta derivada (`GROUP BY recurso_considerado_id`) sobre esses
dados — nunca uma segunda forma de persistência.

**Déficit total — `recurso_considerado_id`, `motivo_consideracao` e os
5 campos de capacidade/comprometido/livre são NULLABLE, todos juntos.**
Quando NENHUM recurso (nem o original, nem nenhum compatível) comporta
a operação inteira, não existe um "recurso considerado" real — gravar
ali o recurso original, ou a capacidade dele, só para preencher as
colunas seria uma informação falsa: o original foi **tentado e
recusado**, não aceito. A linha representa isso honestamente com as 7
colunas (`recurso_considerado_id`, `motivo_consideracao`,
`capacidade_bruta`, `capacidade_efetiva`, `capacidade_disponivel`,
`comprometido`, `livre`) todas `NULL`; `deficit` (sempre igual ao
`necessario` da operação nesse caso) é a única fonte de verdade sobre o
problema, sem exigir cruzar com nenhuma outra coluna para interpretar.

`simulacao_comercial_itens_motivo_consistente_chk` aceita exatamente 3
estados, mutuamente exclusivos:

| Estado | `recurso_considerado_id` | `motivo_consideracao` | capacidade/comprometido/livre (5 campos) | `deficit` |
|---|---|---|---|---|
| Déficit total | `NULL` | `NULL` | todos `NULL` | `= necessario` (e `> 0`) |
| Original coube | `= recurso_original_id` | `'ORIGINAL'` | todos `NOT NULL` | `= 0` |
| Compatível coube | `<> recurso_original_id` (e `NOT NULL`) | `'COMPATIBILIDADE'` | todos `NOT NULL` | `= 0` |

`recurso_original_id` permanece sempre `NOT NULL` — a operação sempre
tem um recurso previsto no roteiro, isso nunca muda, independentemente
do resultado da avaliação.

### 18.6 Camada client-side: pendência de infraestrutura

`resolverDiaProdutivo()` (Etapa 1) já rodava como `"use client"` por
falta de um cliente Supabase server-safe no projeto (sem
`@supabase/ssr`, sem `createServerClient`, sem Route Handler/Server
Action usando um client autenticado fora do browser — confirmado por
inspeção do projeto). O Motor e seus módulos de apoio
(`prepararEntradasMotor.ts`, `executarSimulacao.ts`,
`agregarDiasProdutivos.ts`) herdam a mesma limitação: apesar de
executarem múltiplas consultas, percorrerem a estrutura inteira do BOM
e chamarem RPCs — trabalho tipicamente de servidor — permanecem
`"use client"` porque não há alternativa disponível hoje.

**Pendência de infraestrutura registrada, não resolvida nesta etapa**:
criar um cliente Supabase server-safe (via `@supabase/ssr` ou
equivalente) é pré-requisito para mover `resolverDiaProdutivo`, o Motor
e módulos correlatos para Server Actions/Route Handlers. Até lá, toda
essa camada roda no browser, autenticada pela sessão do usuário
logado — funcionalmente correta (RLS de `authenticated` se aplica
normalmente), só não otimizada para servidor.

---

## Princípio Final

A Simulação Comercial não substitui o PCP. Ela calcula a capacidade
disponível da empresa, compara essa capacidade com a demanda e fornece
um diagnóstico confiável para apoiar a negociação comercial. O PCP
continuará responsável por decidir como a fábrica executará o trabalho
aprovado.
