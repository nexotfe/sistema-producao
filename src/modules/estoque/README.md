# Modulo Estoque

O modulo Estoque participa do planejamento industrial.

Responsavel por:

* materia-prima
* produtos acabados
* saldo disponivel
* saldo reservado
* saldo livre
* necessidade de compra
* movimentacoes futuras

Regra principal:

```text
Sem materia-prima, nao existe producao real.
```

Neste momento o modulo deve ser simples.

Implementar apenas:

* verificacao estoque
* calculo necessidade
* geracao consumo interno quando houver saldo livre suficiente
* geracao necessidade compra

Nao implementar agora:

* MRP avancado
* fornecedor automatico
* lead time complexo
* reserva inteligente
* explosao completa necessidades
