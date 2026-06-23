# Baseline SQL — NEXOTFE 1.0

Este diretório contém a instalação reproduzível do schema definitivo em banco vazio.

## Ordem planejada

1. `001_extensions.sql` — schemas técnicos e extensões mínimas;
2. `002_security.sql` — empresa, usuário, contexto, papéis, permissões, grants e RLS-base;
3. `003_admin.sql` — configurações, numeração, tecnologias, recursos e colaboradores;
4. `004_comercial.sql` — clientes, contatos, projetos, orçamentos e aprovações;
5. `005_engenharia.sql` — itens, PN, documentos, revisões, BOM e Roteiro;
6. `006_pcp.sql` — OF, necessidades, decisões, dependências e programação;
7. `007_estoque.sql` — locais, saldos, reservas, movimentos físicos e consumos;
8. `008_suprimentos.sql` — fornecedores, requisições, planejamento, pedidos e recebimento;
9. `009_producao.sql` — OPs, alocações, apontamentos e terceiros;
10. `010_qualidade.sql` — inspeções, certificados, não conformidades e liberações;
11. `011_expedicao.sql` — produtos acabados, separação, expedição e entrega;
12. `012_views.sql` — projeções de leitura com segurança invocadora;
13. `013_grants_rls.sql` — fechamento de grants, RLS e policies por módulo;
14. `014_comments.sql` — documentação do catálogo;
15. `015_validate.sql` — invariantes finais do baseline.

## Regras

- executar estritamente na ordem numérica;
- cada arquivo deve ser transacional quando tecnicamente possível;
- cada módulo possui teste correspondente em `tests/`;
- nenhum arquivo depende das migrations históricas;
- nenhum script lê `.env.local` ou contém credenciais;
- execução inicial e repetição controlada devem ser testadas em ambiente descartável;
- somente após todos os testes será produzido o baseline consolidado e serão permitidas migrations evolutivas.

## Estado

Completo e validado em PostgreSQL local descartável. Não aplicar ao projeto Supabase remoto sem plano formal de implantação.

| Módulo | Estado |
|---|---|
| `001_extensions.sql` | Aprovado em banco vazio |
| `002_security.sql` | Aprovado em banco vazio e em teste de reprodução |
| `003_admin.sql` | Aprovado em banco vazio e em teste de reprodução |
| `004_comercial.sql` | Aprovado em banco vazio e em teste de reprodução |
| `005_engenharia.sql` | Aprovado em banco vazio e em teste de reprodução |
| `006_pcp.sql` | Aprovado em banco vazio e em teste de reprodução |
| `007_estoque.sql` | Aprovado em banco vazio e em teste de reprodução |
| `008_suprimentos.sql` | Aprovado em banco vazio e em teste de reprodução |
| `009_producao.sql` | Aprovado em banco vazio e em teste de reprodução |
| `010_qualidade.sql` | Aprovado em banco vazio e em teste de reprodução |
| `011_expedicao.sql` | Aprovado em banco vazio e em teste de reprodução |
| `012_views.sql` | Aprovado em banco vazio e em teste de reprodução |
| `013_grants_rls.sql` | Aprovado em banco vazio e em teste de reprodução |
| `014_comments.sql` | Aprovado em banco vazio e em teste de reprodução |
| `015_validate.sql` | Aprovado em banco vazio e em teste de reprodução |

## Evidência final

O conjunto completo `001..015` foi instalado em dois bancos vazios independentes e produziu schemas normalizados idênticos.

**SHA-256 do schema normalizado final:** `0ca39f928e8d798313eb96feb90d44dfb2c4526a43ffe84bc89ba3bb6ec7660e`
