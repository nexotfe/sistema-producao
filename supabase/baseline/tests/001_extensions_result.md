# Resultado — 001_extensions.sql

**Data:** 21/06/2026  
**Ambiente:** PostgreSQL 18 local e descartável  
**Banco de teste:** `nexotfe_baseline_001_test`, removido após a validação  
**Resultado:** APROVADO

## Evidências

- primeira execução em banco vazio: aprovada;
- teste estrutural e funcional: aprovado;
- segunda execução do módulo: aprovada;
- repetição do teste: aprovada;
- `pgcrypto` instalado no schema `extensions`;
- `extensions.gen_random_uuid()` gerou UUIDs válidos e distintos;
- banco de teste removido;
- servidor PostgreSQL local encerrado;
- nenhuma conexão ou alteração no Supabase remoto.

## Integridade

| Arquivo | SHA-256 |
|---|---|
| `001_extensions.sql` | `0649aa0a07d06ec5b9210e2d88a123b28cc51b4b787a1081277cc452b5004d56` |
| `001_extensions_test.sql` | `ece048191800fbc28d304f5dfc486016f1582410c777450e1d808234f5bd2611` |

## Gate

O módulo `001_extensions.sql` está encerrado e libera o início controlado do `002_security.sql`.

