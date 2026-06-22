# Catálogo do Banco Restaurado — NEXOTFE

**Data:** 21/06/2026  
**Origem:** `nexotfe_public_20260621_000436.dump`  
**Banco local:** `nexotfe_restore` — PostgreSQL 18.4  
**Escopo do backup:** schema `public`, estrutura e dados

## Resultado da restauração

Restauração concluída nas seções `pre-data`, `data` e `post-data`, todas com interrupção obrigatória em caso de erro. O servidor local foi encerrado normalmente após as verificações.

Como o backup contém somente `public`, foram criados no ambiente descartável os contratos externos mínimos exigidos pelas definições restauradas:

- schema `auth`;
- função `auth.uid()` retornando `NULL`;
- tabela de suporte `auth.users(id)`;
- role local `authenticated NOLOGIN`.

Esses objetos são exclusivamente suportes de restauração e não pertencem ao catálogo normativo do schema `public`.

## Gate de integridade

| Métrica | Resultado |
|---|---:|
| Tabelas | 29 |
| Views | 16 |
| Funções | 23 |
| Policies | 106 |
| Chaves estrangeiras | 117 |
| Triggers | 29 |
| Tabelas com RLS | 27 |
| Sequences físicas | 1 |
| Valores de enum | 4 |
| Constraints inválidas | 0 |
| Índices inválidos | 0 |
| Linhas restauradas em `public` | 33 |

**Resultado:** restauração íntegra para o escopo do backup.

## Alertas arquiteturais encontrados

- `boms` e `bom_itens` são as duas tabelas sem RLS habilitado.
- Existem nove funções `SECURITY DEFINER`; elas exigem auditoria específica de `search_path`, autorização e isolamento multiempresa.
- O backup foi criado com `--no-privileges`; portanto grants não fazem parte desta restauração e devem ser auditados diretamente no ambiente Supabase ou em exportação específica.
- O schema `auth`, seus usuários e os demais schemas internos do Supabase não fazem parte deste backup.

## Artefatos

- `tables.csv`: tabelas, RLS, comentários e tamanho;
- `columns.csv`: colunas, tipos, nulabilidade e defaults;
- `views.csv`: definições completas das views;
- `functions.csv`: assinaturas e definições das funções;
- `constraints.csv`: constraints e estado de validação;
- `indexes.csv`: índices e validade;
- `triggers.csv`: triggers e definições;
- `policies.csv`: policies RLS completas;
- `enums.csv`: enums e valores;
- `sequences.csv`: sequences;
- `row_counts.csv`: contagem exata por tabela;
- `schemas.csv`: schemas restaurados e de suporte;
- `validacao_resumo.txt`: resumo bruto do gate.

## Decisão

Os gates de backup, restauração e catálogo estão concluídos. A auditoria das migrations pode ser iniciada sem aplicação de SQL no banco remoto.
