# Resultado — 003_admin.sql

**Data:** 21/06/2026  
**Ambiente:** PostgreSQL 18 local e descartável  
**Resultado:** APROVADO

## Estrutura aprovada

- 9 tabelas administrativas;
- configurações por empresa e chave estável;
- numeração transacional por empresa e entidade;
- grupos de tecnologias e tecnologias separados;
- grupos de recursos e recursos produtivos separados;
- colaboradores e qualificações por tecnologia;
- relação muitos-para-muitos recurso–tecnologia;
- FKs compostas impedindo relacionamentos entre tenants;
- 27 policies RLS;
- função transacional `gerar_numero_entidade`.

## Comportamentos aprovados

- leitura limitada à empresa atual;
- usuário sem permissão não altera cadastros;
- usuário sem permissão não gera números;
- gestor utiliza somente permissões explícitas de `public.usuarios`;
- numeração sequencial gerou `PRJ-20260001` e `PRJ-20260002`;
- tentativa de relacionar tecnologia da Empresa B a registro da Empresa A foi rejeitada;
- exclusão lógica direta foi bloqueada, permanecendo reservada a RPC explícita futura;
- nenhum objeto utiliza `profiles` ou metadata de autenticação.

## Reprodução

O conjunto `bootstrap → 001 → 002 → 003` foi instalado em dois bancos vazios independentes e produziu schemas normalizados idênticos.

**SHA-256 do schema normalizado:**  
`0284a0a667d8adb95d36c1730e9bc69cd37ddcee7cde24bc7044b36c6d443589`

## Executor automático

Foi criado `tests/run_local.ps1`. O executor:

- cria somente banco descartável com nome protegido;
- aplica os módulos na ordem numérica;
- executa os testes correspondentes;
- interrompe na primeira falha nativa;
- remove o banco de teste;
- encerra o servidor local somente quando ele próprio o iniciou.

A cadeia 001–003 foi aprovada novamente pelo executor.

## Integridade dos arquivos

| Arquivo | SHA-256 |
|---|---|
| `003_admin.sql` | `9113ddf2b47986cc858aecec47ec1ef80797de8c17bee5fa556e46d09d450417` |
| `003_admin_test.sql` | `d85e4802f492c1ad98ca7231a536e92de2ac909fbfa105c5bb84ec119389f051` |
| `run_local.ps1` | `1e08f9a79a54cdd0de2d0dba2db40fbc8fb5c3ab6504b288445b56864e95a8ce` |

## Gate

O módulo `003_admin.sql` está encerrado e libera o início do `004_comercial.sql`.

