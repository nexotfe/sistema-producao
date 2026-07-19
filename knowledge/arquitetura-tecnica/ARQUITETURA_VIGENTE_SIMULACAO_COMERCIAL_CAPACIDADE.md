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
Calendário Oficial / Calendário da Empresa descrita na seção 4 abaixo.

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

## 5. Arquitetura Geral

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

## 6. Calendário Operacional

O Calendário Operacional existe para determinar quais dias são
produtivos durante a janela de produção utilizada pela Simulação
Comercial. Ele **não define a capacidade dos recursos** — a capacidade
pertence exclusivamente ao cadastro dos Recursos Produtivos (seção 7).

O calendário responde apenas: *"Este dia é produtivo para esta
empresa?"* Ele nunca define horas de produção.

### 6.1 Calendário Oficial

- Responsabilidade da **SISARE** (fornecedora do sistema) — funciona
  como um "banco de CEP" ou tabela NCM/IBGE: um dado de referência
  mantido centralmente.
- **Compartilhado** por todas as empresas clientes.
- **Somente leitura** para as empresas — a empresa nunca altera esse
  calendário.
- **Versionado anualmente** (ex.: Calendário Oficial 2027, 2028...).
- Contém **exclusivamente** feriados nacionais, estaduais e municipais.
- **Sem `empresa_id`** — é dado global do sistema.
- A versão 1.0 assume Brasil: o filtro considera apenas Estado/Município
  da empresa, sem lógica de País ainda, mesmo que o campo País já exista
  no cadastro da empresa (seção 6.4).
- A simulação consulta este calendário **em tempo real**, filtrando por
  Estado/Município da empresa — **nunca copia** os dados para dentro da
  empresa.

### 6.2 Calendário da Empresa

- Pertence à empresa (`empresa_id`).
- Contém **exclusivamente** eventos internos: recesso coletivo,
  inventário, paralisações, dias excepcionalmente trabalhados.
- **Não cadastra feriados oficiais** — não existe, por exemplo, um
  "Natal" duplicado dentro do calendário de cada empresa.
- Políticas de RLS devem filtrar por `empresa_id` **desde a criação da
  tabela**, sem exceção — seguindo o mesmo padrão já corrigido em
  `recursos_produtivos` e `clientes` (ver
  `knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md`, item 4).

### 6.3 Feriado Local Temporário

Mecanismo de exceção, registrado aqui apenas como **diretriz
arquitetural** — a estratégia técnica de reconciliação ainda não está
definida.

- Objetivo: permitir que uma empresa continue operando corretamente
  mesmo quando exista um feriado municipal ainda não presente na base
  oficial.
- Uso excepcional, claramente identificado como provisório — não é a
  regra geral.
- Quando a SISARE atualizar o Calendário Oficial e o feriado passar a
  existir oficialmente, a exceção deve ser reconciliada (removida ou
  consolidada). **Como isso será feito tecnicamente não está definido
  nesta versão.**

### 6.4 Cadastro da Empresa

País, Estado e Município são informações **obrigatórias** do cadastro
da empresa. Esses dados **não existem por causa da Simulação
Comercial** — são informações cadastrais básicas, reutilizadas por
diversos módulos: Calendário Operacional, Fiscal, Endereços, Relatórios.

### Motivação da arquitetura de calendário

Pensando em um ERP vendido para centenas de empresas, duplicar feriados
oficiais por empresa geraria inconsistência e retrabalho de manutenção
(ex.: "500 natais" em vez de um único Natal). Centralizar o dado oficial
na SISARE e deixar a empresa responsável apenas pelas suas exceções
internas é a arquitetura mais limpa e escalável.

---

## 7. Recursos Produtivos e Capacidade Disponível

Cada recurso possui sua capacidade diária padrão, pertencente
exclusivamente ao cadastro do recurso — nunca alterada pelo calendário
nem pela simulação.

Exemplos: Torno CNC 01 → 9 horas/dia | Centro de Usinagem 5 Eixos → 18
horas/dia | Serra Vertical → 16 horas/dia.

O cálculo da capacidade disponível é composto por três elementos
independentes:

1. Calendário Operacional (dias produtivos da janela);
2. Capacidade diária do recurso;
3. Premissas do Modo de Produção (seção 9).

**Cálculo da Capacidade Bruta:** capacidade diária do recurso × dias
produtivos da janela.

Exemplo: 10 dias produtivos, Torno CNC 9 horas/dia → 90 horas
disponíveis.

---

## 8. Produtividade do Recurso

A **Produtividade Padrão** é configurável por Grupo de Recursos —
decisão livre de cada empresa, que nomeia e organiza seus próprios
Grupos (ex.: a ENIFER tem 13 grupos hoje, como "Tornos CN" e
"Caldeiraria/Soldagem"); cada Grupo recebe sua própria Produtividade
Padrão, usada para reduzir a Capacidade Bruta (seção 7) ao valor
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

## 9. Modo de Produção

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

## 10. Situação Comercial e Cenário de Demanda

Substitui integralmente o modelo anterior de "Demanda: Confirmada /
Provável / Potencial", com definições fixas do sistema.

### 10.1 Situação Comercial

Novo campo em `projetos` — `situacao_comercial`. Representa fatos
observáveis da negociação com o cliente, evoluindo em fases: **Consulta
→ Proposta Enviada → Negociação → Compromisso Verbal → Pedido
Recebido**.

É um eixo **independente** do `status` (o workflow interno do projeto:
Rascunho / Em Análise / Aprovado / Reprovado). Situação Comercial
descreve onde a negociação está com o cliente; `status` descreve onde o
projeto está no fluxo interno da empresa. Os dois evoluem de forma
desacoplada.

### 10.2 Relação com o Status do Projeto

Existe uma relação de **limite lógico**, não automática, entre os dois
eixos: ao registrar um Pedido de Compra do cliente (número + data) na
Situação Comercial, o sistema **sugere** a aprovação do `status` — nunca
força automaticamente. A decisão de aprovar continua sendo do usuário.

### 10.3 Histórico da Situação Comercial

Toda mudança de Situação Comercial é registrada na nova tabela
`historico_situacao_comercial` — uma linha por mudança, com:
`projeto_id`, situação anterior, situação nova, `usuario_id`,
data/hora, e origem (Manual / Automática / Importação / Integração).

Esse histórico é **obrigatório desde a primeira versão**, não uma
evolução futura — diferente de outros dados da Simulação, que têm ao
menos um valor de referência atual e podem ser reconstruídos, mudanças
de negociação comercial não podem ser reconstruídas retroativamente se
não forem capturadas no momento em que acontecem.

### 10.4 Cenário de Demanda

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

### 10.5 Princípio: Preferir Gatilhos por Dado Objetivo

Onde for possível, a arquitetura prefere gatilhos baseados em dado
objetivo observável, não em escolha manual de uma lista. Precedentes já
aplicados nesta base:

- **Custo congelado** — disparado pela mudança real de `status` do
  projeto, não por um botão separado de "congelar".
- **Produtividade por Grupo** (seção 8) — herdada do dado já cadastrado
  no Grupo, não escolhida numa lista de categorias fixas do sistema.
- **Sugestão de aprovação de status** (seção 10.2) — disparada pelo
  registro do Número do Pedido de Compra, um fato objetivo, não pela
  simples seleção de "Pedido Recebido" numa lista.

---

## 11. Cenários

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

## 12. Margem de Segurança

Campo configurável diretamente na tela de Simulação, ajustável pelo
orçamentista a cada rodada de simulação — em **dias produtivos** (pode
ser 0; pode ser 5-6 dias, conforme a complexidade percebida do
projeto).

A Margem de Segurança reduz a Data de Necessidade informada pelo
cliente **internamente**, gerando uma **Data Alvo** mais apertada,
usada apenas no cálculo de viabilidade da Simulação (seção 13). Não
altera a data real prometida ao cliente.

---

## 13. Cálculo

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

## 14. Roteiro em Projetos de Desenvolvimento

Em projetos de Desenvolvimento — fabricação sob encomenda cujo Produto
Final ainda não tem desenho detalhado no momento da venda —, o Roteiro
nasce agregado e estimado junto com a venda, e evolui para Roteiros
Detalhados por subconjunto conforme a Engenharia libera os desenhos,
sem exigir nenhuma estrutura de dados paralela à já existente (Produto,
Roteiro, Subconjunto). Detalhamento completo em
`knowledge/arquitetura-tecnica/2026-07-15-arquitetura-roteiro-desenvolvimento-v2.md`.

### 14.1 Terminologia

- **Roteiro Inicial**: termo oficial para o Roteiro agregado/estimado
  do Produto Final, criado no momento da venda, antes de o desenho
  detalhado existir. Substitui definitivamente os termos
  anteriormente cogitados "Roteiro Macro", "Estimativa Macro" e
  "Roteiro do Projeto" — nenhum dos três deve ser usado daqui em
  diante.
- **Roteiro Detalhado**: o Roteiro de cada produto/peça/subconjunto
  real, criado pela Engenharia após a liberação dos desenhos.
- **Horas Reais Apontadas**: os apontamentos de produção real (Ordem
  de Fabricação), usados nas comparações de precisão (seção 14.5).

### 14.2 Produto Final na Venda

O Produto Final (ex.: "Máquina de Clipe") é criado a partir da própria
solicitação do cliente, no momento da venda — não é um placeholder
genérico nem um cadastro fictício: é o produto real que o cliente está
comprando, cadastrado como qualquer outro Produto do sistema.

### 14.3 Do Roteiro Inicial ao Roteiro Detalhado

Esse Produto Final recebe um Roteiro Inicial (seção 14.4). Quando a
Engenharia libera os desenhos — o que pode acontecer bem depois da
venda —, nascem os produtos/peças/subconjuntos reais (podem ser dezenas
ou centenas), cada um com seu próprio Roteiro Detalhado. Esses produtos
se vinculam ao Produto Final através do mecanismo já existente de
"Montar Subconjunto" (Estrutura/Subconjuntos) — o mesmo usado em
qualquer outro produto do sistema, sem nenhuma adaptação especial para
projetos de Desenvolvimento.

### 14.4 Roteiro Inicial do Produto Final

O Roteiro Inicial usa o mesmo mecanismo de Roteiro já existente na
plataforma (Operações → Recurso → Tempo) — só que agregado e estimado,
porque o desenho detalhado do produto ainda não existe no momento da
venda.

O valor estimado dos materiais utilizado no Roteiro Inicial integra a
estimativa comercial do projeto e deve permanecer preservado através
do mesmo mecanismo de congelamento utilizado pela Proposta Comercial
(seção 14.7). Alterações posteriores nos preços de catálogo não
modificam a estimativa originalmente apresentada ao cliente.

O material previsto do Roteiro Inicial deverá utilizar o mesmo
mecanismo de gestão de materiais adotado pela plataforma, evitando
conceitos paralelos exclusivamente para projetos de Desenvolvimento.

### 14.5 As Três Comparações de Precisão

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

### 14.6 Continuidade da Arquitetura

Não existe pendência estrutural de schema para viabilizar este fluxo:
Produto, Roteiro, Subconjunto (Estrutura) e o Congelamento de Custo
(`custo_congelado`, seção 14.7) já cobrem integralmente o que esta
seção descreve. A única peça que falta implementar é a tela/lógica de
comparação (Roteiro Inicial × Roteiros Detalhados × Horas Reais
Apontadas) — não há necessidade de nenhuma estrutura de dados paralela
exclusiva para projetos de Desenvolvimento.

### 14.7 Congelamento do Roteiro Inicial na Aprovação Comercial

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

## 15. Situação da Base (registro histórico da aprovação desta versão)

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

## 16. Evolução Futura (fora do escopo da versão 1.0)

Registrado apenas para preservar a direção arquitetural do produto —
nenhum destes itens faz parte da implementação da versão 1.0:

- **Estratégia da Simulação:** Conservadora, Realista, Otimista (muda a
  produtividade considerada — ex.: 75% / 85% / 95%).
- Sequenciamento de operações;
- APS (Advanced Planning and Scheduling) completo;
- Balanceamento automático de recursos;
- Calendários específicos por recurso;
- Turnos;
- Recursos alternativos;
- Manutenção;
- Justificativa obrigatória em retrocessos/cancelamentos de Situação
  Comercial (seção 10) — não implementada agora, prevista como
  configuração futura por empresa;
- Situação Comercial no nível do Item do Projeto, não só do Projeto
  inteiro — para casos de venda parcial (ex.: projeto com 10 itens,
  cliente fecha 3 agora e adia os demais). Registrado aqui apenas como
  possibilidade, sem implementação prevista nesta versão.

---

## Princípio Final

A Simulação Comercial não substitui o PCP. Ela calcula a capacidade
disponível da empresa, compara essa capacidade com a demanda e fornece
um diagnóstico confiável para apoiar a negociação comercial. O PCP
continuará responsável por decidir como a fábrica executará o trabalho
aprovado.
