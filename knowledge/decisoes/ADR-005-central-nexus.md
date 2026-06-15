# ADR-005 - Central Nexus

**Versao:** 1.0  
**Status:** Em revisao  
**Data:** 2026-06-14  
**Modulos relacionados:** Central Nexus, Comercial, Suprimentos, Estoque, Producao

## Contexto

Os modulos Clientes e Fornecedores ja seguem o padrao Nexus.

Os demais modulos existem, mas estavam acessiveis por caminhos separados, gerando sensacao de sistemas isolados.

## Problema

O login direcionava para `/dashboard`, que representa a area Comercial.

Isso confundia o papel da entrada principal do sistema, pois Comercial nao deve ser a Central do NEXOTFE.

## Decisao

Criar a rota `/central` como ponto de entrada operacional apos o login.

Criar `/projetos` como listagem Comercial oficial e manter `/dashboard` apenas como compatibilidade, redirecionando para `/central`.

## Estrutura inicial

A Central Nexus agrupa apenas rotas existentes:

- Comercial
  - Clientes
  - Projetos
  - Novo Projeto
- Suprimentos
  - Fornecedores
  - Compras
  - Planejamento
  - Decisao material
- Estoque
  - Materias-primas
- Producao
  - Roteiro exemplo
  - Produto exemplo

## Justificativa

Esta abordagem conecta os modulos atuais sem criar novas regras de negocio.

Tambem preserva o conhecimento operacional ja construido e evita reescrever modulos antes da arquitetura funcional estar validada.

## Impactos

- Login passa a direcionar para `/central`.
- `/projetos` passa a representar a listagem Comercial de Projetos.
- `/dashboard` continua existindo apenas como compatibilidade e redireciona para `/central`.
- Nenhum processo industrial foi alterado.
- Nenhuma estrutura de dados foi alterada.

## Pontos em aberto

- Validar se a Central devera exibir dados reais futuramente.
- Validar se outros atalhos antigos ainda devem apontar para `/central` ou para rotas operacionais especificas.
- Definir quando Producao tera listagem propria de OFs, roteiros e produtos.
