# Arquitetura do Roteiro em Projetos de Desenvolvimento

**Data:** 2026-07-15
**Versão:** 2.0
**Status:** Vigente
**Supera:** a descrição conceitual anterior deste tema ("v1.0"), discutida
em conversa mas nunca persistida como arquivo próprio no repositório —
esta é a primeira versão deste tema salva como documento.

---

## 1. Objetivo

Este documento descreve como o Roteiro funciona em projetos de
Desenvolvimento — fabricação sob encomenda cujo Produto Final ainda não
tem desenho detalhado no momento da venda. O Roteiro nasce agregado e
estimado junto com a venda, e evolui para Roteiros Detalhados por
subconjunto conforme a Engenharia libera os desenhos, sem exigir
nenhuma estrutura de dados paralela à já existente (Produto, Roteiro,
Subconjunto).

---

## 2. Terminologia

- **Roteiro Inicial**: termo oficial para o Roteiro agregado/estimado
  do Produto Final, criado no momento da venda, antes de o desenho
  detalhado existir. Substitui definitivamente os termos
  anteriormente cogitados "Roteiro Macro", "Estimativa Macro" e
  "Roteiro do Projeto" — nenhum dos três deve ser usado daqui em
  diante.
- **Roteiro Detalhado**: o Roteiro de cada produto/peça/subconjunto
  real, criado pela Engenharia após a liberação dos desenhos.
- **Horas Reais Apontadas**: os apontamentos de produção real (Ordem
  de Fabricação), usados nas comparações de precisão (seção 6).

---

## 3. Produto Final na Venda

O Produto Final (ex.: "Máquina de Clipe") é criado a partir da própria
solicitação do cliente, no momento da venda — não é um placeholder
genérico nem um cadastro fictício: é o produto real que o cliente está
comprando, cadastrado como qualquer outro Produto do sistema.

---

## 4. Do Roteiro Inicial ao Roteiro Detalhado

Esse Produto Final recebe um Roteiro Inicial (seção 5). Quando a
Engenharia libera os desenhos — o que pode acontecer bem depois da
venda —, nascem os produtos/peças/subconjuntos reais (podem ser dezenas
ou centenas), cada um com seu próprio Roteiro Detalhado. Esses produtos
se vinculam ao Produto Final através do mecanismo já existente de
"Montar Subconjunto" (Estrutura/Subconjuntos) — o mesmo usado em
qualquer outro produto do sistema, sem nenhuma adaptação especial para
projetos de Desenvolvimento.

---

## 5. Roteiro Inicial do Produto Final

O Roteiro Inicial usa o mesmo mecanismo de Roteiro já existente na
plataforma (Operações → Recurso → Tempo) — só que agregado e estimado,
porque o desenho detalhado do produto ainda não existe no momento da
venda.

O valor estimado dos materiais utilizado no Roteiro Inicial integra a
estimativa comercial do projeto e deve permanecer preservado através
do mesmo mecanismo de congelamento utilizado pela Proposta Comercial.
Alterações posteriores nos preços de catálogo não modificam a
estimativa originalmente apresentada ao cliente.

O material previsto do Roteiro Inicial deverá utilizar o mesmo
mecanismo de gestão de materiais adotado pela plataforma, evitando
conceitos paralelos exclusivamente para projetos de Desenvolvimento.

---

## 6. As Três Comparações de Precisão

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

---

## 7. Continuidade da Arquitetura

Não existe pendência estrutural de schema para viabilizar este fluxo:
Produto, Roteiro, Subconjunto (Estrutura) e o Congelamento de Custo
(`custo_congelado`, implementado na Simulação Comercial de Capacidade)
já cobrem integralmente o que este documento descreve. A única peça
que falta implementar é a tela/lógica de comparação (Roteiro Inicial ×
Roteiros Detalhados × Horas Reais Apontadas) — não há necessidade de
nenhuma estrutura de dados paralela exclusiva para projetos de
Desenvolvimento.

---

## 8. Congelamento do Roteiro Inicial na Aprovação Comercial

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

## 9. Princípio Final

O Roteiro Inicial existe para viabilizar a venda antes que o desenho
detalhado exista — não para substituir o Roteiro Detalhado nem para
criar um fluxo de dados paralelo. Ele é, do início ao fim, o mesmo
mecanismo de Roteiro já usado em todo o sistema, aplicado de forma
agregada/estimada enquanto o detalhamento não chega, e preservado como
registro histórico depois que ele chega.
