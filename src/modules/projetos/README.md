# Projetos / Orçamentos

Fundação industrial do módulo de Projetos da NEXOTFE.

## Escopo atual

- Todo orçamento é um Projeto.
- Projeto usa numeração `AANNNN`.
- Projeto possui itens.
- Cada item referencia um Código (produto/peça) existente.
- Código é a identidade técnica única da peça/produto. "PN" é legado
  técnico — permanece só como nome da coluna física `projeto_itens.pn`,
  nunca como termo de interface (ver
  `../../../knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md` item 6).
- Ao aprovar projeto, cada item poderá gerar uma OF futuramente.

## Fora do escopo atual

- Geração automática completa de OF.
- OPs detalhadas.
- APS.
- Cenários de capacidade.
- Simulação avançada de entrega.

## Regra central

```text
Projeto = contexto comercial/orçamento
Código = identidade técnica única (PN é legado técnico, não usar na interface)
Item do projeto = linha do orçamento
OF = fabricação futura da peça dentro do projeto
```
