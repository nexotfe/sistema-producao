# Modulo Compras

O modulo Compras nasce leve e operacional.

Responsavel por:

* consumo interno
* requisicao compra
* compra externa
* pedidos compra futuros
* fornecedores futuros
* NF recebida futura
* recebimento futuro

Regra principal:

```text
Necessidade material com saldo suficiente gera Consumo Interno.
Necessidade material sem saldo suficiente gera Requisicao Compra.
```

Consumo Interno e o registro de material ja existente em estoque usado por
projeto/OF. Ele compoe custo industrial e rastreabilidade, mas nao representa
pedido de compra, fornecedor, NF ou financeiro.

Neste momento, nao implementar:

* ERP de compras pesado
* aprovacao complexa
* cotacao automatica
* fornecedor automatico
* parser fiscal XML
* financeiro
