# Resultado — 002_security.sql

**Data:** 21/06/2026  
**Ambiente:** PostgreSQL 18 local e descartável  
**Resultado:** APROVADO

## Estrutura aprovada

- `public.empresas` criada como limite de tenant;
- `public.usuarios` criada como única autoridade de empresa, papel e permissões;
- vínculo único com `auth.users`;
- `public.profiles` ausente;
- duas funções de contexto com `SECURITY DEFINER` e `search_path` fixo;
- grants mínimos para `anon`, `authenticated` e `service_role`;
- RLS habilitada em `empresas` e `usuarios`;
- cinco policies específicas por comando;
- nenhum provisionamento derivado de metadata.

## Comportamentos aprovados

- usuário comum enxerga somente sua empresa e seu próprio registro;
- usuário comum não eleva o próprio papel;
- usuário comum não cria usuário em outro tenant;
- gestor reconhece somente permissões explicitamente armazenadas em `public.usuarios`;
- gestor visualiza usuários autorizados apenas na própria empresa;
- usuário inativo não recebe tenant e não acessa usuários;
- role anônima não executa o resolvedor de empresa;
- ausência de fallback para `profiles` comprovada.

## Reprodução

O conjunto `bootstrap de teste → 001 → 002` foi instalado em dois bancos vazios independentes. Após remover os tokens aleatórios `\\restrict` e `\\unrestrict` introduzidos pelo `pg_dump` 18, os schemas produzidos foram idênticos.

**SHA-256 do schema normalizado:**  
`4358126e362f81e3b51689cdf35b43e441a2edd3cab7b560731a72ee4c9e50f3`

## Integridade dos arquivos

| Arquivo | SHA-256 |
|---|---|
| `002_security.sql` | `6dcfcb50a83941214b69a38b698f46b8fad25a7b759879f1ff3f832636cf1ee9` |
| `000_supabase_test_bootstrap.sql` | `3b83c8e03baf0b6cac1f80b48951a9317eea25fe9ba37108e228a5389f208f93` |
| `002_security_test.sql` | `2773ecb142b5f5c5caf34144370f1e1c3e9431f5bbbe5c0dce6cf6e1af2e010d` |

## Limites

- o bootstrap existe somente para simular os elementos mínimos do Supabase Auth no PostgreSQL vazio;
- o módulo não cria usuário automaticamente;
- o módulo não define catálogo amplo de papéis; ele apenas estabelece a fonte única;
- provisionamento administrativo será uma RPC explícita e testada em etapa posterior;
- nenhuma alteração foi aplicada ao Supabase remoto.

## Gate

O módulo `002_security.sql` está encerrado e libera o início do `003_admin.sql`.

