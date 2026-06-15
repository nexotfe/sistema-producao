# ADR-006 - Rota Oficial de Projetos

**Versao:** 1.0  
**Status:** Em revisao  
**Data:** 2026-06-14  
**Modulos relacionados:** Central Nexus, Comercial, Projetos

## Contexto

A listagem comercial de Projetos estava implementada em `/dashboard`.

Com a criacao da Central Nexus, `/dashboard` deixou de representar corretamente a entrada principal do sistema.

## Decisao

Criar `/projetos` como rota oficial para consulta e navegacao de Projetos.

Manter `/dashboard` apenas como rota de compatibilidade, redirecionando para `/central`.

## Justificativa

Esta separacao evita ambiguidade:

- `/central` representa a entrada operacional do Nexus.
- `/projetos` representa a area Comercial de Projetos.
- `/dashboard` nao deve carregar responsabilidade funcional de modulo.

## Impactos

- Central Nexus passa a apontar Projetos para `/projetos`.
- Atalhos de Suprimentos e Estoque que apontavam para Comercial passam a abrir `/projetos`.
- Paginas de novo projeto e detalhe de projeto retornam para `/projetos`.
- Nenhuma regra de negocio foi alterada.
- Nenhuma estrutura de dados foi alterada.
