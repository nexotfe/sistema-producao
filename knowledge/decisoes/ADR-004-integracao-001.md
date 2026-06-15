# ADR-004 - Integracao Inicial dos Modulos

**Versao:** 1.0  
**Status:** Em revisao  
**Data:** 2026-06-14  
**Modulos relacionados:** Comercial, Suprimentos, Clientes, Fornecedores, Compras, Estoque, Producao

## Contexto

Clientes e Fornecedores passaram a seguir o padrao Nexus de UX, navegacao e cadastro.

Os demais modulos possuem logica operacional relevante, mas ainda usam padroes anteriores de navegacao e interface.

O objetivo desta decisao e conectar paginas existentes sem alterar regras de negocio, processos industriais, Supabase ou estrutura de dados.

## Rotas existentes

### Comercial

- `/central`
- `/projetos`
- `/clientes`
- `/clientes/novo`
- `/clientes/[id]`
- `/clientes/[id]/editar`
- `/projetos/novo`
- `/projetos/[id]`

### Suprimentos

- `/fornecedores`
- `/fornecedores/novo`
- `/fornecedores/[id]`
- `/fornecedores/[id]/editar`
- `/compras`
- `/compras/planejamento`
- `/compras/planejamento/[id]`
- `/compras/decisao-material`
- `/compras/pedidos/[id]`

### Estoque

- `/estoque/materias-primas`

### Producao / Engenharia

- `/roteiros/[pn]`
- `/produtos/[pn]`
- `/ordens/[id]`

## Conexoes criadas

### Comercial

Em `/projetos`, foram expostos os acessos:

- Projetos
- Novo Projeto
- Clientes
- Roteiro Fabricacao
- Estoque
- Compras

### Suprimentos

Em `/compras`, `/compras/planejamento` e `/compras/decisao-material`, foram expostos os acessos:

- Compras
- Fornecedores
- Planejamento
- Decisao material
- Estoque
- Comercial

## Dependencias funcionais identificadas

Fluxo principal:

```text
Cliente
  -> Projeto
  -> PN
  -> Roteiro Fabricacao
  -> OF
  -> Estoque
  -> Compras
  -> Fornecedor
```

Observacoes:

- Cliente nasce no Comercial.
- Fornecedor nasce em Suprimentos.
- Projeto representa orcamento, venda e demanda industrial.
- PN representa identidade tecnica unica.
- Roteiro define como fabricar.
- OF define quantidade e necessidade real.
- Estoque participa da viabilidade e da producao.
- Compras nasce quando existe necessidade externa de material.

## Componentes reutilizaveis encontrados

- `EmptyState`
- `LoadingState`
- `StatusBadge`
- Headers de listagem de Clientes e Fornecedores
- Tabelas operacionais de Clientes e Fornecedores
- Padrao de retorno `‹ Modulo`
- Padrao de acao integrada `Cadastro de X ›`

## Paginas orfas ou parcialmente isoladas

- `/produtos/[pn]`
- `/roteiros/[pn]`
- `/ordens/[id]`
- `/compras/pedidos/[id]`
- `/compras/planejamento/[id]`

Essas paginas possuem valor operacional, mas ainda precisam aderir ao padrao Nexus de navegacao.

## Pontos que precisam de validacao

- `/dashboard` foi mantido apenas como compatibilidade e redireciona para `/central`.
- A rota oficial de listagem de Projetos passa a ser `/projetos`.
- Validar se `Fornecedores` deve ficar apenas em Suprimentos ou tambem em Cadastros Mestres.
- Validar quando Produtos/PN terao listagem propria.
- Validar fluxo de Funcionarios/Usuarios, pois nao ha rota implementada.
- Validar escopo de Financeiro, documentado como futuro.

## Decisao

Realizar apenas conexoes de navegacao entre paginas existentes.

Nao alterar regras de negocio.
Nao alterar Supabase.
Nao criar novos modulos.
Nao redesenhar processos industriais.
