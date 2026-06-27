# Padroes de Desenvolvimento NEXOTFE 1.0

**Versao:** 1.0  
**Status:** Manual operacional para desenvolvimento  
**Data:** 27/06/2026  
**Responsavel:** NEXOTFE / Flavio  
**Natureza:** define como desenvolver sem quebrar a arquitetura

## Objetivo

Este documento orienta o Codex e futuros desenvolvedores durante a evolucao do NEXOTFE.

Ele define regras de implementacao, limites de escopo, padroes visuais, fluxo de homologacao e criterios para avaliar novos prompts.

## Regra Principal

Antes de implementar qualquer prompt, avaliar se ele respeita:

- Baseline Operacional NEXOTFE 1.0;
- Arquitetura de Entidades NEXOTFE 1.0;
- Status de Homologacao atual;
- padroes visuais dos modulos homologados;
- restricoes tecnicas informadas pelo usuario.

Se houver conflito, avisar antes de escrever codigo.

## Proibicoes Padrao

Nunca fazer sem autorizacao explicita:

- criar migrations;
- alterar schema;
- criar tabelas;
- alterar banco remoto;
- conectar tela mockada ao Supabase;
- criar backend quando o pedido for apenas frontend;
- renomear tabelas existentes;
- alterar arquitetura;
- criar modulo fora do escopo;
- refatorar tela ja homologada sem necessidade comprovada;
- misturar funcionalidades de outro modulo;
- implementar IA, APS, capacidade finita ou otimizacao sem fase aprovada.

## Metodo Oficial de Trabalho

O desenvolvimento deve seguir:

```text
Inventario
->
Diagnostico
->
Plano
->
Implementacao
->
Teste tecnico
->
Teste operacional
->
Refinamento
->
Homologacao
->
Proximo modulo
```

## Um Modulo por Vez

Durante homologacao:

- trabalhar uma pagina por vez;
- trabalhar uma fase por vez;
- nao antecipar modulos futuros;
- nao melhorar paginas fora do escopo;
- registrar pendencias em vez de resolver tudo imediatamente.

## Dados Mockados vs Dados Reais

Usar dados mockados quando:

- a tela ainda esta em aceite visual;
- o usuario pediu explicitamente mock;
- a regra de negocio ainda nao foi validada;
- a conexao real traria risco ou retrabalho.

Usar dados reais quando:

- a tela ja teve aceite visual;
- a fase pede integracao com Supabase;
- o schema existente foi mapeado;
- nao ha necessidade de migration;
- a origem dos dados esta aderente ao Baseline.

## Banco de Dados

Regras:

- nao criar migrations sem solicitacao explicita;
- nao alterar schema durante homologacao de tela;
- nao criar dados ficticios no banco;
- nao inferir campos inexistentes;
- nao criar views novas sem fase aprovada;
- consultar o Baseline antes de propor mudanca estrutural.

## Padrao Visual

Os modulos homologados sao referencia:

- Clientes;
- Colaboradores;
- Fornecedores;
- Grupos de Recursos;
- Recursos Produtivos;
- Produtos, quando estiver em fase mockada aprovada.

Novas telas de cadastro devem seguir:

- mesmo espacamento;
- mesma largura de conteudo;
- mesma hierarquia visual;
- mesmos botoes;
- mesmas mensagens;
- mesmo comportamento de formulario;
- mesma navegacao.

Nao redesenhar a aplicacao sem pedido explicito.

## Botoes Padrao

Usar nomes consistentes:

- Voltar;
- Inicio;
- Novo;
- Editar;
- Salvar;
- Atualizar;
- Duplicar, quando aplicavel;
- Filtros;
- Atualizar;
- Imprimir;
- Exportar PDF;
- Exportar Excel.

Evitar navegacao antiga do tipo:

```text
< Pagina
```

Preferir botoes padrao:

```text
Voltar
Inicio
```

## Navegacao

Usar componentes compartilhados quando existirem:

- `EntityLink`;
- `ModuleBackButton`;
- `ModuleBackLink`;
- `entityRoutes`.

Evitar `Link` manual espalhado para entidades principais quando houver componente oficial.

## Nomes de Interface

Usar termos oficiais:

- Codigo, nao PN, quando for texto de interface;
- Colaboradores, nao Funcionarios;
- Produtos, nao Products;
- Cadastro de Produtos, nao Product Register;
- Grupos de Recursos Produtivos, quando o contexto for familia produtiva.

## Regras de Duplicidade

Quando a tela preparar validacoes de duplicidade:

- exibir mensagens previstas;
- nao implementar checagem real ate a fase aprovada;
- nao consultar Supabase se o modulo estiver mockado;
- nao criar logica backend antecipada.

Mensagens padrao para Produtos:

```text
Codigo ja existe. Use outro codigo.
Descricao ja existe. Use outra descricao.
```

## Performance

Quando houver dados reais:

- evitar consultas N+1;
- preferir consultas em lote;
- carregar apenas campos necessarios;
- reutilizar agregacoes existentes;
- separar regra operacional da interface.

## Commits

Commits devem ser pequenos e descritivos.

Exemplos:

```text
feat: cria estrutura frontend de produtos mockados
refactor: refina modulo produtos em portugues
docs: consolida documentos normativos nexotfe 1.0
```

## Validacao Tecnica

Sempre que houver codigo:

```text
npm run lint
npm run build
```

Para alteracoes somente documentais, lint e build nao sao obrigatorios, salvo se houver alteracao em codigo ou configuracao.

## Criterio para Recusar ou Pausar um Prompt

O Codex deve pausar e explicar antes de implementar se o prompt:

- contradiz o Baseline;
- cria duplicidade de pagina mestre;
- mistura macro PCP com micro Programacao Diaria;
- exige banco mas proibe schema necessario;
- pede dados reais sem fonte existente;
- altera modulo homologado sem justificativa;
- antecipa funcionalidade futura fora da Sprint;
- cria risco de quebrar fluxo operacional ja aprovado.
