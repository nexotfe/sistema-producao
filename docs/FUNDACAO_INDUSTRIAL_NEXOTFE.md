# Fundacao Industrial NEXOTFE

## Objetivo

Consolidar a fundacao industrial utilizando linguagem operacional real de fabrica, eliminando duplicidade entre setores e criando fluxo unico de informacao.

A arquitetura deve ser:

* simples
* operacional
* rastreavel
* leve visualmente
* facil de ensinar
* facil de expandir futuramente

---

## Fora Do Escopo Atual

Nao implementar agora:

* APS
* Cenarios automaticos
* Inteligencia artificial
* PCP avancado
* Balanceamento automatico
* Workflow complexo engenharia
* Dashboard executivo pesado

O foco atual e:

```text
FUNDACAO INDUSTRIAL CORRETA
```

---

## Fluxo Industrial

```text
COMERCIAL
  -> PROJETO
  -> PN
  -> ROTEIRO FABRICACAO
  -> OF
  -> OP
  -> ESTOQUE
```

---

## Projeto

Projeto representa:

* Orcamento
* Venda
* Demanda industrial
* Necessidade futura de fabricacao

Tudo continua sendo Projeto, mesmo quando possuir:

* uma unica peca
* conjunto
* maquina completa

---

## Tipos De Projeto

A NEXOTFE deve possuir:

* Fabricacao
* Desenvolvimento

---

## Fabricacao

Fabricacao ocorre quando ja existe definicao tecnica:

* desenho tecnico
* PN existente
* materiais definidos
* roteiro conhecido
* operacoes conhecidas

Nesse modo:
o orcamento nasce mais detalhado.

---

## Desenvolvimento

Desenvolvimento ocorre quando o cliente possui uma necessidade tecnica e solicita uma solucao.

Nesse momento ainda nao existem:

* roteiro completo
* OP detalhada
* desenho final
* tempos exatos

O projeto nasce com:

* materia-prima estimada
* horas engenharia
* horas recursos principais
* premissas industriais

Objetivo principal:

```text
Antes de assumir uma data para o cliente,
responder:

Conseguimos entregar?
```

---

## Fases Desenvolvimento

Usar como referencia:

* PDR
* CDR
* FDR

---

## PDR

Preliminary Design Review

Objetivo:
avaliar conceito inicial.

---

## CDR

Critical Design Review

Objetivo:
validar projeto detalhado antes da fabricacao.

---

## FDR

Final Design Review

Objetivo:
validacao final antes da liberacao definitiva.

---

## Validacao Cliente

As etapas:

* PDR
* CDR
* FDR

tambem representam:
VALIDACAO FORMAL CLIENTE.

Ao finalizar cada etapa:

* engenharia congela versao atual
* documentacao e enviada cliente
* cliente aprova ou solicita alteracoes

---

## Regra Resposta Cliente

Cliente possui:

```text
3 dias uteis
```

para responder.

Se atrasar:
o planejamento deve ser deslocado.

Objetivo:

* cronograma realista
* engenharia com dependencia externa registrada
* datas coerentes com resposta do cliente
* planejamento sem prazo ficticio

---

## Transformacao Desenvolvimento Para Fabricacao

Depois de:

* PDR
* CDR
* FDR

o desenvolvimento passa a gerar:

* desenhos tecnicos
* PN
* roteiro fabricacao
* estrutura industrial

A partir desse momento:
passa a ser tratado como:
FABRICACAO.

---

## Impostos E Margem

Impostos e margem pertencem:
ao Projeto/Orcamento.

Nao pertencem:
ao PN nem ao Roteiro Fabricacao.

Motivo:

* impostos variam por cliente
* margem e decisao comercial
* roteiro deve focar custo industrial

---

## Numeracao

A numeracao deve ser configuravel por empresa.

Padrao atual:

```text
26xxxx
```

Arquitetura futura:

```text
Configuracoes > Numeracao
```

Cada empresa podera definir:

* prefixo
* ano
* sequencia
* tamanho
* mascara

---

## Status Projeto

Utilizar:

* em elaboracao
* em analise
* aprovado
* perdido
* cancelado

Evitar:
"reprovado"

---

## PN

PN representa:
IDENTIDADE TECNICA UNICA.

Nao permitir:
duplicidade de PN ativo.

---

## Reutilizacao PN

Ao adicionar item projeto:

1. verificar se PN ja existe
2. se existir:
   reutilizar cadastro
3. se nao existir:
   permitir criacao assistida

---

## Revisao

Nao implementar workflow complexo revisao.

A revisao oficial permanece:
no desenho tecnico/PDF.

ERP apenas referencia operacionalmente.

Exemplo:

```text
Fabricar conforme revisao presente no desenho anexado.
```

---

## Roteiro Fabricacao

Nao utilizar:
"Ficha Tecnica"

Utilizar:

```text
Roteiro Fabricacao
```

Objetivo:

```text
COMO FABRICAR UMA PECA
```

Regra importante:
o roteiro nao possui quantidade producao.

Quantidade pertence:
EXCLUSIVAMENTE a OF.

---

## Roteiro Deve Possuir

* materia-prima
* operacoes
* tratamentos
* terceiros
* movimentacoes internas
* custos indiretos
* tempos previstos

---

## Materia-Prima

Um PN pode possuir:
mais de uma materia-prima.

Exemplo:

```text
PN 1243-01

- SAE 1045: 200mm x diametro 90
- Chapa aco carbono: 12mm x 180 x 240
```

---

## Unidade Materia-Prima

A unidade deve vir:
do cadastro materia-prima.

Nao deve ser digitada manualmente no roteiro.

---

## Consumo Unitario

O roteiro armazena:
consumo por peca.

A OF multiplica:
consumo x quantidade fabricar.

Exemplo:

```text
Roteiro:
200mm SAE 1045 por peca

OF:
50 pecas

Necessario:
10.000mm
```

---

## OF

OF representa:
ORDEM FABRICACAO.

Nasce:
quando projeto for aprovado.

Cada item projeto pode gerar:
uma OF.

---

## Numeracao OF

Formato atual:

```text
260125-0001
260125-0002
260125-0003
```

---

## OF Possui

* cliente
* quantidade
* data necessidade
* prioridade
* status producao
* materia_prima_disponivel

---

## Prioridade

* baixa
* normal
* urgente

---

## Status OF

* simulacao
* aguardando material
* pronta programacao
* programada
* producao
* parada
* finalizada

---

## Materia-Prima Disponivel

Campo:

```text
materia_prima_disponivel boolean
```

Regra principal:

```text
Sem materia-prima:
NAO EXISTE PRODUCAO REAL.
```

---

## Filas

A NEXOTFE deve diferenciar:

```text
Fila Simulacao
Fila Real Producao
```

---

## Fila Simulacao

Usada para:

* orcamento
* estimativas
* engenharia
* previsao prazo
* capacidade futura

Pode existir:
sem materia-prima disponivel.

---

## Fila Real Producao

Somente entra quando existir:

* materia-prima disponivel
* OF liberada
* aprovacoes concluidas

Regra programacao real:
a OF somente ocupa capacidade real fabrica quando:

```text
materia_prima_disponivel = true
```

---

## Simulacao Materia-Prima

A simulacao deve prever:
DATA NECESSARIA DA MP.

Objetivo:
apoiar compras e suprimentos.

---

## Estoque Ativo No Fluxo Industrial

O estoque nao deve funcionar apenas como cadastro passivo.

O estoque deve participar:

* do planejamento
* da viabilidade
* da programacao
* da producao
* das compras

---

## Materia-Prima No Roteiro

Ao adicionar materia-prima no Roteiro Fabricacao, o sistema deve:

* consultar estoque
* verificar saldo disponivel
* verificar unidade cadastrada
* calcular necessidade producao
* identificar necessidade compra

O ponto principal nao e apenas a unidade.

O ponto principal e:

```text
DISPONIBILIDADE MATERIAL
```

---

## Calculo Necessidade Material

O roteiro informa:

* materia-prima necessaria
* consumo unitario

A OF multiplica:

```text
consumo unitario x quantidade fabricar
```

Exemplo:

```text
Roteiro:
200mm SAE 1045 por peca

OF:
50 pecas

Necessario:
10.000mm
```

---

## Consulta Estoque

O sistema deve verificar:

* saldo disponivel
* saldo reservado
* saldo real livre

Se existir saldo suficiente:

* material pode ser reservado futuramente
* OF pode seguir programacao
* OF pode entrar fila real producao
* sistema deve registrar consumo interno

Se nao existir saldo suficiente:

```text
GERAR NECESSIDADE DE COMPRA
```

---

## Consumo Interno E Compra Externa

Material existente em estoque nao significa material sem custo.

Quando existir saldo suficiente, o sistema deve registrar:

```text
Consumo Interno
```

Quando nao existir saldo suficiente, o sistema deve gerar:

```text
Requisicao Compra
```

Referencia detalhada:

```text
docs/FUNDACAO_COMPRAS_NEXOTFE.md
```

---

## Requisicao Compra

O sistema deve permitir gerar Requisicao Compra com base na necessidade calculada.

A requisicao deve possuir:

* materia-prima
* quantidade necessaria
* unidade
* projeto
* OF relacionada
* data necessidade material

Neste momento, implementar apenas:

* verificacao estoque
* calculo necessidade
* geracao necessidade compra

Nao implementar agora:

* MRP avancado
* calculo automatico fornecedor
* sugestao automatica compra
* lead time complexo
* reserva inteligente
* explosao completa necessidades

---

## Inferencia Materia-Prima Disponivel

O campo:

```text
materia_prima_disponivel
```

nao deve ser apenas manual.

O sistema deve conseguir inferir automaticamente.

Regra:

```text
saldo livre suficiente = materia_prima_disponivel true
saldo livre insuficiente = materia_prima_disponivel false
```

---

## OP

OP representa:
OPERACAO FABRICACAO.

---

## Numeracao OP

Padrao:

* OP10
* OP20
* OP30
* OP40

---

## OP Deve Falar Linguagem Operador

Exemplos:

* Preparar material
* Cortar conforme desenho
* Desbastar conforme desenho
* Inspecionar conforme desenho

---

## OP Possui

* descricao operacional
* recurso/maquina
* tempo previsto
* observacao operacional

---

## Nao Implementar Agora

Nao implementar:

* setup
* perda prevista
* apontamento complexo
* APS
* capacidade automatica
* workflow revisao

---

## Planejamento Inicial

A NEXOTFE deve ajudar responder:

```text
A data prometida e realista?
```

Utilizando:

* estimativas
* eficiencia operacional
* regras internas fabrica

---

## Configuracoes Iniciais

| Configuracao | Valor |
| --- | --- |
| dias_buffer_entrega | 3 |
| considerar_sabado | nao |
| eficiencia_engenharia | 0.75 |
| eficiencia_producao | 0.85 |
| eficiencia_montagem | 0.75 |
| prazo_resposta_cliente_dias_uteis | 3 |

---

## Buffer Entrega

A data prometida cliente nao deve ser usada diretamente.

Exemplo:

```text
Cliente:
20/agosto/2026

Buffer:
3 dias uteis

Data interna:
17/agosto/2026
```

---

## Eficiencia Operacional

Os tempos informados representam:
TEMPO IDEAL.

O sistema deve aplicar:
fator eficiencia.

Exemplo:

```text
Estimativa:
100h engenharia

Eficiencia:
0.75

Tempo real capacidade:
133h
```

Objetivo:

* evitar promessa irreal
* planejamento otimista
* atraso constante
* sobrecarga producao

---

## Finalizacao OF

Ao finalizar OF:
futuramente gerar movimentacao entrada estoque.

Objetivo:
disponibilizar produto acabado para:

* estoque
* expedicao
* faturamento

---

## Objetivo Final

A NEXOTFE deve:

* eliminar retrabalho setores
* reutilizar engenharia
* centralizar informacao
* transformar experiencia fabrica em regra digital
* conectar comercial e producao
* ajudar assumir prazos reais

SEM:

* burocracia
* ERP pesado
* excesso preenchimento
* complexidade prematura
