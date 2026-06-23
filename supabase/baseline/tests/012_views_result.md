# Resultado - 012_views.sql

**Data:** 23/06/2026  
**Ambiente:** PostgreSQL 18 local e descartavel  
**Resultado:** APROVADO

## Estrutura aprovada

- 16 views operacionais;
- todas as views com `security_invoker=true`;
- views de leitura sem criacao de estado;
- grants de leitura para `authenticated` e `service_role`;
- isolamento tenant preservado por RLS das tabelas base.

## Reproducao

O conjunto `bootstrap -> 001 -> ... -> 015` foi instalado em dois bancos vazios independentes e produziu schemas normalizados identicos.

**SHA-256 do schema normalizado final:**  
`0ca39f928e8d798313eb96feb90d44dfb2c4526a43ffe84bc89ba3bb6ec7660e`

## Integridade dos arquivos

| Arquivo | SHA-256 |
|---|---|
| `012_views.sql` | `317fed1491fed893c73244cb46fab7f46ed68ec98e6c2ef168ad63f338663dcc` |
| `012_views_test.sql` | `7684f3fda43b3043ad2e6a7c72b4d132960b8e73fb86eaa8bdde86863fbe4c90` |

## Gate

O modulo `012_views.sql` esta encerrado e libera o fechamento de grants/RLS.
