# Projetos / Orçamentos

Fundação industrial do módulo de Projetos da NEXOTFE.

## Escopo atual

- Todo orçamento é um Projeto.
- Projeto usa numeração `AANNNN`.
- Projeto possui itens.
- Cada item referencia um PN existente.
- PN é a identidade técnica única da peça/produto.
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
PN = identidade técnica única
Item do projeto = linha do orçamento
OF = fabricação futura da peça dentro do projeto
```
