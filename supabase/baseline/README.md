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

## Evoluções (`evolutivas/`)

O baseline `001..015` está **fechado**: nenhum desses 15 arquivos é editado depois de aprovado (a atestação SHA-256 acima descreve exatamente esse conjunto). Toda funcionalidade nova, a partir daqui, entra como uma **evolução** em `supabase/baseline/evolutivas/`, nunca como alteração de um módulo já numerado.

Regras das evoluções:

- nome de arquivo `YYYYMMDDNNNN_descricao.sql` (mesma convenção de `supabase/migrations/`), aplicadas em **ordem alfabética/numérica** depois do baseline `001..015` completo - nunca antes, nunca fora de ordem;
- cada evolução tem um teste correspondente em `supabase/baseline/tests/`, mesmo `BaseName` + sufixo `_test.sql` (mesma convenção dos módulos `001..015`);
- nenhuma evolução usa `IF NOT EXISTS`/`ON CONFLICT DO NOTHING` para mascarar reaplicação - uma segunda execução falha alto e claro (`relation already exists` ou equivalente), nunca em silêncio;
- toda evolução usa exclusivamente a autoridade canônica do baseline (`public.usuarios`, `public.empresa_atual_id()`, `public.usuario_tem_permissao()`) - nunca `public.profiles` nem qualquer helper que dependa dela (`015_validate.sql` já barra `public.profiles` no baseline; o mesmo vale para toda evolução).

**Instalação automatizada**: `supabase/baseline/tests/run_local.ps1` (com `-MaxModule 15`, o default para `-IncludeEvolutivas`) aplica `001..015`, depois cada arquivo de `evolutivas/` em ordem, executando o teste correspondente logo em seguida de cada um - nunca concatenação manual.

| Evolução | Estado |
|---|---|
| `202608200001_convencao_coletiva.sql` | Aprovado - baseline `001..015` + evolução aplicados em banco Supabase local descartável recém-recriado (schema `public` derrubado e recriado antes da instalação, nunca reaproveitando um container de tentativa anterior); teste correspondente (`202608200001_convencao_coletiva_test.sql`) rodado com 25 cenários `OK`, 0 `FALHOU`, 0 `PULADO`; reaplicação da evolução confirmada como rejeição alta e clara (`relation "empresa_convencao_horas_adicionais" already exists`); resíduo de dados de teste confirmado zero em consulta separada pós-`ROLLBACK`. |

### Duas trilhas paralelas - histórica (produção) vs. canônica (baseline)

O projeto Supabase vinculado (produção) **não roda o baseline `001..015`** - ele evoluiu organicamente por `supabase/migrations/*.sql` (trilha histórica) e usa uma arquitetura de identidade diferente (`public.profiles`, `public.usuario_e_admin()`). O baseline é uma reescrita completa, consolidada, ainda **não implantada** em produção (ver "Estado" acima - "não aplicar ao projeto Supabase remoto sem plano formal de implantação").

Isso significa que uma funcionalidade pode precisar de **duas implementações paralelas** enquanto as duas trilhas coexistirem:

| | Trilha histórica (produção) | Trilha canônica (baseline) |
|---|---|---|
| Onde mora | `supabase/migrations/*.sql` | `supabase/baseline/001..015` + `evolutivas/*.sql` |
| Autoridade de identidade | `public.profiles` | `public.usuarios` |
| Checagem de permissão | `public.usuario_e_admin()` (só admin/não-admin) | `public.usuario_tem_permissao(text)` (capacidade explícita, array `permissoes`) |
| Já aplicada em produção? | Sim | Não (só validada em banco local descartável) |
| Pode ser editada depois de aplicada? | Não - só migration evolutiva nova | Não (`001..015`) / evoluções só se somam, nunca reescrevem uma já commitada |

Exemplo real: `supabase/migrations/202608130001_empresa_convencao_horas_adicionais.sql` (trilha histórica, aplicada em produção) e `supabase/baseline/evolutivas/202608200001_convencao_coletiva.sql` (trilha canônica) implementam a **mesma funcionalidade de negócio**, com o **mesmo schema de dados**, mas nunca são o mesmo arquivo nem a mesma tabela física - cada uma roda contra a arquitetura de identidade da sua própria trilha. Portar uma funcionalidade da trilha histórica para a canônica nunca edita o arquivo original; sempre cria uma evolução nova.
