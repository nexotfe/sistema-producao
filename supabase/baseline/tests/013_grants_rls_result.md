# Resultado - 013_grants_rls.sql

**Data:** 23/06/2026  
**Ambiente:** PostgreSQL 18 local e descartavel  
**Resultado:** APROVADO

## Estrutura aprovada

- fechamento de `CREATE` no schema `public` para `public`, `anon` e `authenticated`;
- `usage` controlado do schema para roles de execucao;
- todas as tabelas publicas possuem RLS habilitada;
- todas as tabelas publicas possuem policy RLS;
- funcoes `SECURITY DEFINER` possuem `search_path` configurado;
- `anon` nao possui privilegios indevidos de escrita em tabelas/views publicas.

## Reproducao

O conjunto `bootstrap -> 001 -> ... -> 015` foi instalado em dois bancos vazios independentes e produziu schemas normalizados identicos.

**SHA-256 do schema normalizado final:**  
`0ca39f928e8d798313eb96feb90d44dfb2c4526a43ffe84bc89ba3bb6ec7660e`

## Integridade dos arquivos

| Arquivo | SHA-256 |
|---|---|
| `013_grants_rls.sql` | `afa4396a9fbf418e2778a713097bad44b34ccf0fcb2a6d0d2e6c8bba41258844` |
| `013_grants_rls_test.sql` | `a690bac8a950bb51608d359dde6f417d4e3cdccbc86454c544067ccc5e5bb260` |

## Gate

O modulo `013_grants_rls.sql` esta encerrado e libera a documentacao do catalogo.
