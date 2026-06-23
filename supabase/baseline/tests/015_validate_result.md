# Resultado - 015_validate.sql

**Data:** 23/06/2026  
**Ambiente:** PostgreSQL 18 local e descartavel  
**Resultado:** APROVADO

## Invariantes finais aprovadas

- `public.profiles` nao integra o baseline;
- existem 72 tabelas publicas;
- existem 16 views operacionais;
- nao existem enums nativos no schema `public`;
- todas as tabelas publicas possuem RLS habilitada;
- views nao dependem de `public.profiles`.

## Reproducao

O conjunto completo `bootstrap -> 001 -> ... -> 015` foi instalado em dois bancos vazios independentes e produziu schemas normalizados identicos.

**SHA-256 do schema normalizado final:**  
`0ca39f928e8d798313eb96feb90d44dfb2c4526a43ffe84bc89ba3bb6ec7660e`

## Integridade dos arquivos

| Arquivo | SHA-256 |
|---|---|
| `015_validate.sql` | `2411e6b1807d6c796f8967839486e2a845e979dc74a8c9a67ce7b58752f484f9` |
| `015_validate_test.sql` | `c5a2622638ae66f9c25aa54375c63a60a94d16d2b3137d78f525cf407ee33b40` |

## Gate

O baseline SQL `001..015` esta encerrado em banco vazio local e reproduzivel.
