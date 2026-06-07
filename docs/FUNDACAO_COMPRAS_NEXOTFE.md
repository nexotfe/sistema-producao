# Fundacao Compras NEXOTFE

## Objetivo

Criar o modulo Compras mantendo:

* simplicidade operacional
* fluxo industrial real
* integracao com producao
* integracao com estoque
* rastreabilidade
* baixo nivel de burocracia

O modulo Compras deve nascer:

```text
LEVE E OPERACIONAL
```

Evitar:

* ERP corporativo pesado
* excesso de aprovacoes
* excesso de telas
* excesso de automacoes complexas

---

## Conceito Principal

As necessidades de materiais podem possuir:

* origem interna
* origem externa

O sistema deve diferenciar claramente:

```text
Consumo Interno
Compra Externa
```

---

## Consumo Interno

Consumo interno ocorre quando:

* o projeto necessita material
* o estoque ja possui saldo suficiente
* nao existe necessidade de compra externa

Nesse cenario:
o estoque atende a necessidade do projeto.

Regra principal:

```text
Material existente em estoque nao significa material sem custo.
```

Quando existir saldo suficiente, o sistema deve gerar:

```text
Consumo Interno
```

O registro operacional de Consumo Interno deve:

* conferir saldo livre
* reservar o material no estoque
* registrar movimentacao de estoque
* vincular projeto, OF e materia-prima
* preservar o custo industrial do material

Consumo interno deve possuir:

* projeto
* OF
* material
* quantidade
* unidade
* saldo consumido
* custo material
* data movimentacao

Objetivo:

* custo real do projeto
* rastreabilidade do consumo
* historico do material
* separacao entre estoque e compras

---

## Compra Externa

Compra externa ocorre quando:

* o estoque nao possui saldo suficiente
* existe necessidade de aquisicao externa

Nesse cenario, o sistema deve gerar:

```text
Requisicao Compra
```

---

## Fluxo Compras

```text
Necessidade Material
  -> Verificacao Estoque
  -> Saldo livre existente?
    -> TOTAL: Consumo Interno
    -> ZERO: Requisicao Compra
    -> PARCIAL: Consumo Interno parcial + Requisicao Compra complementar
```

Regra de saldo parcial:

```text
Necessidade 100
Saldo livre 40
Consumo Interno 40
Compra Externa 60
```

A consulta operacional deve permitir enxergar por projeto, OF e materia-prima:

* quantidade atendida por Consumo Interno
* quantidade enviada para Compra Externa
* custo industrial do material consumido
* status da decisao material

---

## Tipos De Origem Compra

### Compras Por Projeto

Originadas:

* do Roteiro Fabricacao
* da OF
* da necessidade material producao

### Compras Operacionais

Originadas manualmente por:

* almoxarifado
* manutencao
* administrativo
* limpeza
* escritorio
* operacao geral

Exemplos:

* material limpeza
* ferramentas
* lixas
* discos corte
* discos desbaste
* brocas
* fresas
* abrasivos

---

## Dashboard Compras

O dashboard Compras faz sentido operacionalmente.

Deve possuir:

* requisicoes pendentes
* pedidos aguardando aprovacao
* pedidos em aberto
* NF recebidas
* recebimentos pendentes
* itens abaixo estoque minimo
* consumos internos recentes

---

## Requisicao Compra

A requisicao representa:

```text
NECESSIDADE COMPRA EXTERNA
```

Ainda nao representa pedido compra.

A requisicao pode nascer:

* automaticamente, a partir de roteiro, OF ou necessidade material
* manualmente, por solicitante autorizado

Requisicao deve possuir:

* descricao
* dimensao/material
* quantidade
* unidade
* origem
* projeto
* OF
* solicitante
* prioridade
* categoria compra

---

## Categoria Compra

Categorias iniciais:

* materia-prima
* uso consumo
* ferramenta
* manutencao
* escritorio
* terceiros

Preparar estrutura futura para:

```text
Configuracoes > Compras > Categorias
```

---

## Pedido Compra

Apos:

* cotacao
* negociacao
* escolha fornecedor

a requisicao gera:

```text
PEDIDO COMPRA
```

Antes do Pedido Compra, o sistema deve permitir:

```text
Planejamento de Compras
```

Planejamento de Compras agrupa requisicoes compativeis por material,
dimensao e unidade de compra, mantendo vinculo com cada OF/projeto.

O agrupamento nao deve ser automatico apenas por descricao do material.
Deve usar chave industrial de compra:

```text
material base + forma + bitola/espessura + criterio de calculo
```

O comprador pode escolher:

* somar todas as OFs compativeis
* comprar por OF separada
* criar agrupamento parcial com apenas algumas OFs
* manter o calculo manual quando dimensoes exigirem analise

Cada origem permanece separada para rastreabilidade.

A consulta operacional do planejamento deve mostrar:

* chave industrial de compra
* modo escolhido pelo comprador
* soma total das necessidades incluidas
* campo Comprar informado pelo comprador
* sobra prevista resultante da sugestao
* OFs incluidas e excluidas

Quando o modo for agrupamento parcial, o comprador deve escolher quais OFs
entram no planejamento e quais ficam fora para outro planejamento.

Exemplo:

```text
OF 001 -> SAE 1045 redondo 4" x 100mm
OF 002 -> SAE 1045 redondo 4" x 500mm
OF 003 -> SAE 1045 redondo 4" x 1000mm

Compra planejada:
1 barra SAE 1045 redondo 4"
```

Para chapa, bloco ou corte especial, o planejamento deve preservar as dimensoes
de cada OF e nao somar medidas sem criterio industrial.

O planejamento nao representa pedido, fornecedor, NF ou financeiro.

Pedido compra deve possuir tudo da requisicao, mais:

* comprador responsavel
* fornecedor
* aprovacao
* data aprovacao
* previsao entrega
* forma transporte
* condicao pagamento

---

## Cadastro Fornecedor

Criar pagina futura:

```text
Cadastro Fornecedores
```

Fornecedor deve possuir:

* razao social
* nome fantasia
* CNPJ
* contato
* telefone
* email
* observacoes

---

## NF Recebida

A NF recebida representa:

```text
DOCUMENTO FISCAL RECEBIDO
```

Preparar arquitetura para:

* recebimento XML NF-e
* leitura automatica futura
* importacao informacoes fiscais

Neste momento:
nao implementar parser fiscal complexo.

---

## Recebimento

NF recebida nao significa material aprovado.

Recebimento deve possuir:

* conferido
* aprovado
* reprovado
* divergencia

O almoxarifado deve comparar:

```text
Pedido Compra
VS
NF Recebida
VS
Material Fisico
```

Quando recebimento for aprovado:

* gerar entrada estoque
* atualizar saldo
* liberar material producao

---

## Futuro Financeiro

Preparar arquitetura para:

```text
NF Recebida -> Contas a Pagar
```

Nao implementar financeiro agora.

---

## Estoque Minimo

A NEXOTFE deve suportar estoque minimo, principalmente para:

* uso e consumo
* ferramentas
* materiais recorrentes

Cadastro produto estoque deve suportar:

* estoque_minimo
* estoque_ideal
* compra_recorrente

Exemplo:

```text
Disco Corte

estoque_minimo = 20
estoque_ideal = 50
saldo_atual = 8
```

Resultado esperado:

```text
Sugestao Compra
```

A sugestao nao deve comprar automaticamente.

A decisao continua humana.

---

## Planejamento Producao

Sem materia-prima:

```text
NAO EXISTE PRODUCAO REAL
```

Fila Simulacao pode existir sem material disponivel.

Fila Real Producao somente entra quando existir:

* materia-prima disponivel
* OF liberada
* aprovacoes concluidas

---

## Objetivo Arquitetura

A NEXOTFE deve conectar:

* engenharia
* estoque
* compras
* producao
* almoxarifado

SEM:

* burocracia excessiva
* ERP pesado
* complexidade prematura

---

## Objetivo Final

O modulo Compras deve:

* apoiar producao
* antecipar necessidades
* reduzir falta material
* integrar estoque e producao
* registrar consumo interno
* controlar compras externas
* manter simplicidade operacional

Utilizando:
fluxo industrial real.
