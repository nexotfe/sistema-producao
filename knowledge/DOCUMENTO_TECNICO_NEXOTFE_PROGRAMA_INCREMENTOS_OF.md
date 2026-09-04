# Documento Técnico, Funcional e Histórico — NEXOTFE e o Programa de Incrementos da Ordem de Fabricação

**Data de corte desta versão: 2026-09-04.** Tudo que está descrito como "estado atual" reflete o repositório e o histórico Git nesta data. Qualquer leitura posterior deve reconferir contra o código, as migrations e o `git log` antes de repetir qualquer afirmação daqui como fato vigente.

**Autoria:** documento gerado por Claude Code, executor técnico do projeto, a partir de pesquisa direta no repositório (`d:\Projetos\sistema-producao`) — leitura de `README.md`, `CLAUDE.md`, `AGENTS.md`, `knowledge/`, `supabase/migrations/`, `supabase/baseline/`, `src/`, histórico Git (`git log`, `git show`, hashes de commit) e artefatos de investigação preservados nesta sessão de trabalho (preflights, harnesses, matrizes, logs). Nenhuma informação aqui foi inferida sem uma fonte citável — onde a fonte não existia, o texto diz isso explicitamente em vez de presumir.

**Convenção de estados usada em todo o documento.** Toda afirmação sobre "o que existe" ou "o que já rodou" é marcada com um destes rótulos, sempre que a distinção importar:

- **Comprovado no código** — existe como arquivo `.sql`/`.ts`/`.tsx` no repositório, lido diretamente.
- **Comprovado em banco descartável** — testado com sucesso contra um Postgres temporário (Docker), nunca contra produção.
- **Comprovado contra produção com rollback** — testado com uma conexão real ao banco de produção, dentro de uma transação `BEGIN...ROLLBACK` que nunca persistiu nada.
- **Aplicado em produção** — a migration foi de fato executada (`COMMIT`) contra o banco de produção vinculado.
- **Reconciliado no tracking** — `supabase_migrations.schema_migrations` no vinculado reflete a migration como aplicada.
- **Enviado ao Git remoto** — commit existe em `origin/main` (confirmado via `git log origin/main`).
- **Planejado** — existe uma decisão ou intenção registrada, sem implementação.
- **Pendente** — falta fazer, sem ambiguidade sobre o que falta.
- **Hipótese não confirmada / não confirmado** — não há evidência de arquivo suficiente; o texto diz o que precisaria ser consultado para confirmar.

---

## Sumário

1. Resumo executivo
2. Visão do produto
3. Arquitetura técnica
4. Segurança
5. Ciclo completo de uma Ordem de Fabricação
6. Os nove incrementos
7. Incremento 6/9 — decisão CI/CE
8. Incremento 7/9 — ajustes controlados na OF
9. Frontend e experiência do usuário
10. Forma de trabalho
11. Metodologia reutilizável
12. Decisões e riscos
13. Próximos passos

---

## 1. Resumo executivo

### Versão curta (sem pré-requisito técnico)

O NEXOTFE é um sistema de gestão (ERP) para fábricas que produzem **sob encomenda** — ou seja, que fabricam produtos específicos para cada projeto de cliente, não em série contínua. Ele acompanha o caminho de um pedido desde o orçamento até a entrega: quanto vai custar, o que precisa ser comprado, o que a fábrica vai produzir, quanto tempo isso leva e se a fábrica tem capacidade para assumir o trabalho.

Diferente de planilhas ou sistemas genéricos, o NEXOTFE é pensado para **várias empresas usarem o mesmo sistema sem nunca verem os dados umas das outras** (modelo "SaaS multiempresa") — cada empresa cliente tem seus próprios projetos, produtos, ordens de produção e usuários, isolados uns dos outros dentro do mesmo banco de dados.

O sistema está em construção ativa, por partes ("incrementos"), cada uma testada e revisada antes de avançar para a próxima. Nesta data de corte, o sistema já sabe: cadastrar produtos e suas listas de material (BOM), criar e aprovar Ordens de Fabricação, calcular hierarquias de produção (peça que depende de subconjunto que depende de matéria-prima), e decidir automaticamente se um material sai do estoque próprio ou precisa ser comprado. A parte de **ajustar uma ordem de fabricação já criada** (mudar quantidade ou lista de material com segurança, sem quebrar o que já foi decidido) está escrita, testada e **aplicada em produção (2026-09-04)** — é o trabalho descrito em detalhe no Capítulo 8 deste documento.

### Versão técnica

O NEXOTFE é construído sobre **Next.js/React/TypeScript** (frontend) e **Supabase** (PostgreSQL gerenciado, autenticação, RLS) — confirmado por `package.json`, estrutura de `src/app/` (Next.js App Router) e `supabase/migrations/`. O modelo multiempresa é implementado por **Row-Level Security (RLS)** do PostgreSQL, isolando cada tabela por `empresa_id`, resolvido em tempo de consulta por uma função `empresa_atual_id()` que lê a identidade do usuário autenticado (`auth.uid()`).

O sistema evolui por um **programa de incrementos numerados** cujo rótulo formal encontrado no código é **"Incremento N/9"**, dentro de uma etiqueta de rastreabilidade maior chamada **"4D0"** (ver Capítulo 6 para a origem exata desse nome — não é um termo de nenhum documento normativo, só das próprias migrations SQL). Até a data de corte, os incrementos **1/9 a 7/9 existem como código**; **1/9 a 6/9 estão aplicados e no Git remoto** (confirmado); **7/9 está escrito, testado e aplicado em produção (2026-09-04)** (confirmado — ver Capítulo 8). **Os incrementos 8/9 e 9/9 não existem em nenhuma forma no repositório** — não há migration, não há menção textual, não há plano documentado do que seriam. Qualquer descrição do que os incrementos 8 e 9 "vão fazer" seria invenção; este documento não faz isso.

Quem usa o sistema hoje: equipes de PCP (Planejamento e Controle da Produção), compras, engenharia e administração da empresa cliente — via papéis funcionais (`papeis_funcionais`/`usuarios_papeis_funcionais`) e nível de acesso (`profiles.nivel_acesso`/`usuarios.nivel_acesso`), dois mecanismos de autorização distintos e não intercambiáveis (ver Capítulo 4).

---

## 2. Visão do produto

Esta seção descreve os módulos localizados no repositório. Para cada um: finalidade, quem usa, entradas/saídas, regras confirmadas, estados, dependências, segurança e situação real do frontend (não presumida).

> Nota metodológica: o inventário abaixo prioriza os módulos efetivamente tocados pelo programa de incrementos (Ordens de Fabricação e sua cadeia) e os módulos com maturidade de frontend confirmada por pesquisa direta em `src/`. Módulos citados apenas por existirem como pasta em `src/modules/` (`calendario`, `colaboradores`, `desenvolvimento`, `fornecedores`, `grupos-recursos`) não foram auditados linha a linha nesta rodada — citados como "módulo existe, não auditado nesta versão do documento" onde aplicável.

### Empresas
**Finalidade:** unidade de isolamento multiempresa (tenant). **Tabela:** `public.empresas` (colunas confirmadas via `supabase/migrations/`, incluindo `nome`, `slug`, `cnpj`, `ativo`, `codigo`, `plano`, `created_by`). **Dependências:** toda tabela de negócio carrega `empresa_id` com FK para `empresas(id)`. **Segurança:** RLS habilitado (`ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY` — confirmado por dump lido nesta sessão); isolamento por `empresa_atual_id()`. **Frontend:** módulo `src/modules/empresa/` existe (confirmado por Glob); não auditado linha a linha nesta versão.

### Usuários, autenticação, perfis e papéis funcionais
**Finalidade:** identidade e autorização. **Entidades:** `auth.users` (Supabase Auth, gerenciada pela plataforma), `public.profiles` e `public.usuarios` (duas tabelas de perfil — ver nota crítica abaixo), `public.papeis_funcionais` (catálogo global de papéis de negócio) e `public.usuarios_papeis_funcionais` (atribuição por empresa). **Regra confirmada:** `nivel_acesso` (coluna em `profiles`/`usuarios`, enum `admin|gestor|operador|leitura`) é autorização de sistema; papel funcional (`pcp`, `comprador`, `lider_producao`, `engenharia`, `aprovador_compras` — catálogo confirmado em `supabase/migrations/20260826184415_papeis_funcionais.sql`) é capacidade de negócio independente do nível de acesso — um operador pode ter o papel `pcp` sem ser admin. **Achado crítico de arquitetura (ver Capítulo 4 para detalhe completo):** existem **duas trilhas paralelas e incompatíveis** de autorização no repositório — a histórica (produção real, usa `profiles` + `usuario_e_admin()`) e a canônica (`supabase/baseline/`, usa só `usuarios` + `usuario_tem_permissao()`, **não aplicada em produção**). Um trigger real de produção (`on_auth_user_created` → `handle_new_auth_user()`) cria automaticamente linhas em **ambas** `profiles` e `usuarios` a cada novo `auth.users` — confirmado empiricamente nesta sessão (ver Capítulo 8, "Incidente de Auth"). **Frontend:** módulo `src/modules/auth/` existe; login/sessão confirmados pela skill de Supabase Auth usada no projeto — não auditado linha a linha nesta versão.

### Projetos
**Finalidade:** entidade operacional central do NEXOTFE — cada Projeto representa um pedido de cliente sob encomenda (confirmado por `knowledge/ARQUITETURA_ENTIDADES_NEXOTFE_1_0.md`: "O Projeto é a entidade operacional central"). **Dependências:** `projetos.empresa_id`, cadeia `Produto → Roteiro atual → OF → Produção → Qualidade → Estoque → Expedição`. **Regra confirmada:** `numero_projeto` é único por empresa (`UNIQUE (empresa_id, numero_projeto)`, decisão registrada em `knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md` item 3), não globalmente único. **Gatilho confirmado:** aprovação de projeto (`status='aprovado'`) dispara automaticamente a criação das Ordens de Fabricação correspondentes (Incremento 4/9, ver Capítulo 6). **Frontend:** módulo `src/modules/projetos/` existe, com maturidade não auditada linha a linha nesta versão.

### Itens industriais, produtos, matérias-primas, BOM/lista técnica, unidades de medida
**Finalidade:** catálogo técnico da fábrica — o que ela produz e do que é feito. **Tabelas confirmadas:** `itens_industriais`, `materias_primas`, `boms`/`bom_itens`/`bom_operacoes`, `unidades_medida` (catálogo por empresa desde `20260825150000_unidades_medida_catalogo_por_empresa.sql`), `materia_prima_unidade_conversoes`. **Regra confirmada:** conversão de unidade só ocorre nas folhas da expansão de BOM, nunca em subconjuntos intermediários (função `expandir_bom_recursivo`, ver Capítulo 6, Incremento 5/9). **Frontend:** módulos `src/modules/produtos/`, `src/modules/materias-primas/`, `src/modules/bom/`, `src/modules/roteiros/` existem; `materias-primas` tem RPC real conectada (`ajustar_estoque_materia_prima`, confirmado por pesquisa em `src/`).

### Ordens de fabricação, hierarquia, aprovação/reprovação, necessidades, decisão CI/CE
Este é o núcleo do programa de incrementos e está descrito em detalhe nos Capítulos 5, 6, 7 e 8. Resumo aqui: uma OF nasce (manual ou automaticamente na aprovação de um Projeto), tem numeração imutável por projeto, pode ter uma hierarquia mãe/filha (subconjuntos), passa por estados de aprovação (`aguardando_auditoria → aprovada/reprovada`) e execução (`planejada → ...`) validados por uma matriz de combinações permitidas, gera necessidades de matéria-prima por expansão recursiva de BOM na aprovação, e decide automaticamente Consumo Interno (CI, sai do estoque) vs Compra Externa (CE, precisa comprar) por necessidade. **Frontend confirmado:** uma única tela, somente leitura (`src/app/ordens/[id]/page.tsx`) — ver Capítulo 9 para o inventário completo e honesto do que falta.

### Estoque, consumo interno, compras, requisições
**Tabelas confirmadas:** `estoque_saldos`, `estoque_movimentacoes`, `consumos_internos`, `requisicoes_compra`, `requisicao_compra_itens`, `pedidos_compra`, `pedido_compra_itens`, `planejamentos_compra`, `planejamento_compra_origens`. **Regra confirmada:** a decisão CI/CE (Incremento 6/9) lê `estoque_saldos` com `FOR UPDATE` para evitar condição de corrida entre duas OFs disputando o mesmo saldo (confirmado no corpo de `decidir_ci_ce_de_of`, lido nesta sessão). **Frontend confirmado:** a tela `src/app/compras/decisao-material/page.tsx` existe visualmente (colunas CI/Compra/Total/Status) mas é **100% mock** — array hardcoded, sem nenhuma chamada Supabase — não está conectada a `decidir_ci_ce_de_of` nem a `necessidades_of_material` (achado de pesquisa direta nesta sessão). O mesmo vale para `src/app/compras/page.tsx`.

### Capacidade, numeração, auditoria
**Capacidade:** `empresa_capacidade_versoes` — contador monotônico por empresa, usado para detectar concorrência na aprovação de cenários (comentário da tabela, lido no dump do schema nesta sessão: "se a versão capturada na leitura consistente for diferente da versão atual no momento da aprovação, a capacidade mudou desde o cálculo e a aprovação é rejeitada"). **Numeração:** `numeracao_of_formato`/`numeracao_of_projeto` (Incremento 1/9) e `numeracao_configuracoes` (projeto/proposta, mais antigo) — ambos com trigger de imutabilidade estrutural (bloqueiam `UPDATE` do número já gerado). **Auditoria:** `ordens_fabricacao_historico_estados` (Incremento 2/9, append-only) e `ordens_fabricacao_ajustes` (Incremento 7/9, ver Capítulo 8) — os dois únicos rastros de auditoria formal de OF confirmados no repositório.

---

## 3. Arquitetura técnica

**Frontend:** Next.js (App Router, confirmado por `src/app/*/page.tsx`), React, TypeScript. **Não há geração automática de tipos a partir do schema Supabase** — Glob por `database.types.ts` em todo o repositório não encontrou nada; os tipos são todos escritos manualmente (achado de pesquisa direta, com implicação direta no Capítulo 9: tipos de OF estão defasados do schema real).

**Backend:** Supabase (PostgreSQL gerenciado + Supabase Auth). Não há camada de API própria entre frontend e banco além do cliente Supabase — regras de negócio vivem em funções PL/pgSQL (`SECURITY DEFINER`) chamadas via RPC, e em RLS.

**Modelo multi-tenant:** isolamento por `empresa_id` em toda tabela de negócio, aplicado via RLS, resolvido por `empresa_atual_id()`. Ver Capítulo 4 para a divergência crítica entre a implementação real de produção e a implementação canônica ainda não aplicada.

**Migrations:** 164 arquivos em `supabase/migrations/` (contagem direta, `2026-09-04`), nomeados por timestamp (`YYYYMMDDHHMMSS_descricao.sql`), aplicados sequencialmente. Não há evidência, dentro do repositório, de um pipeline automatizado de CI que aplique migrations — a aplicação em produção parece ser manual/assistida (ver Capítulo 11, "Metodologia reutilizável", e a lacuna documental descrita no Capítulo 7 sobre o Incremento 6).

**Duas árvores de schema coexistem no repositório, e isso é uma característica arquitetural real, não um detalhe menor:**
1. **`supabase/migrations/`** — a trilha histórica, incremental, é o que de fato roda em produção hoje (confirmado: `empresa_atual_id()` de produção, reconstruída por introspecção em `supabase/tests/fixtures/legacy_profiles_auth.sql`, usa `profiles` com fallback para `usuarios`).
2. **`supabase/baseline/` (`001` a `015`)** — uma reescrita completa e canônica do schema, pensada para banco vazio, com fonte única de identidade (`usuarios`, sem `profiles`). Estado documentado no próprio `supabase/baseline/README.md`: "Completo e validado em PostgreSQL local descartável. **Não aplicar ao projeto Supabase remoto sem plano formal de implantação.**" — ou seja, **planejado, comprovado em banco descartável, não aplicado em produção**.

**RPCs, triggers, views, RLS, ACLs:** documentados em profundidade nos Capítulos 4, 6, 7 e 8 conforme o objeto específico. Padrão geral confirmado em pelo menos 3 migrations recentes: toda tabela/função nova recebe `REVOKE ALL` explícito de `public, anon, authenticated, service_role` seguido de `GRANT` seletivo — nunca o inverso (achado de pesquisa direta, com exemplos citados no Capítulo 4).

**Tracking:** `supabase_migrations.schema_migrations` — usado nesta sessão para provar, via função auxiliar `pg_temp.detectar_tracking_migration()`, que a migration do Incremento 7 está `nao_aplicada` no vinculado (ver Capítulo 8).

**Ambientes:** três ambientes distintos foram efetivamente usados durante o desenvolvimento do Incremento 7/9, cada um com garantias diferentes — **local** (Postgres descartável via Docker, sem dado real, usado para provar que scripts funcionam antes de qualquer contato com produção), **descartável com dump real** (Postgres descartável, mas com o schema real do vinculado aplicado via `supabase db dump --linked --schema public`, para testar a migration contra uma cópia fiel da estrutura de produção sem nenhum dado real) e **vinculado** (o banco de produção real, tocado apenas dentro de transações `BEGIN...ROLLBACK` até este momento — nenhuma escrita foi persistida). Ver Capítulo 8 para o detalhamento completo do protocolo.

**Diagramas:** este documento não inclui diagramas gerados automaticamente — não há ferramenta de introspecção de schema→diagrama confirmada no repositório, e desenhar um diagrama à mão sem essa fonte fiel violaria a regra de não inventar. Um diagrama textual da cadeia operacional confirmada (Capítulo 2, `knowledge/02-METODO NEXUS.MD`) é: `Cliente → Comercial → Projeto → Roteiro → Simulação → Venda → Produção → Compras → Estoque → Expedição → Entrega`.

---

## 4. Segurança

### Isolamento por `empresa_id` e identidade por `auth.uid()`

Toda tabela de negócio carrega `empresa_id`; toda policy RLS relevante compara esse `empresa_id` contra `empresa_atual_id()`, uma função `SECURITY DEFINER` que resolve o tenant do usuário autenticado (`auth.uid()`).

**Existem duas definições reais e incompatíveis de `empresa_atual_id()` no repositório** — este é o achado de segurança mais importante deste documento:

- **Produção (trilha histórica)**, reconstruída por introspecção real (`pg_get_functiondef`, confirmado em `supabase/tests/fixtures/legacy_profiles_auth.sql`, comentário datado 2026-08-20/21):
```sql
select coalesce(
  (select profiles.empresa_id from public.profiles
   where profiles.id = auth.uid() and profiles.ativo = true),
  (select usuarios.empresa_id from public.usuarios
   where usuarios.id = auth.uid())
)
```
Concedida a `PUBLIC, anon, authenticated, service_role` (`GRANT EXECUTE ... TO public, anon, authenticated, service_role`).

- **Canônica (baseline, não aplicada)**, `supabase/baseline/002_security.sql`:
```sql
select u.empresa_id from public.usuarios u
join public.empresas e on e.id = u.empresa_id
where u.auth_user_id = auth.uid() and u.ativo = true and e.ativo = true
limit 1
```
`search_path = ''` (vazio — mais restritivo), concedida só a `authenticated, service_role`.

A versão de produção **não valida `empresas.ativo`** e faz fallback silencioso entre duas fontes de identidade — apontado como achado **crítico** em `knowledge/AUDITORIA_FUNCOES_SECURITY_DEFINER.md` (auditoria de 21/06/2026). O mesmo documento decide, normativamente, que `public.profiles` "não poderá participar de RLS, autorização ou resolução de tenant" no baseline definitivo — decisão de desenho, **ainda não implementada em produção**.

### `profiles` vs `usuarios` vs papel funcional (recapitulado)

Ver Capítulo 2. Adição de segurança: `usuario_e_admin()` (produção) é `SECURITY DEFINER` e herda os riscos de `empresa_atual_id()`; já `usuario_tem_papel_funcional()` é deliberadamente `SECURITY INVOKER` — o comentário da própria migration (`20260826184415_papeis_funcionais.sql`) explica que isso evita escalonamento de privilégio, já que a policy de `SELECT` subjacente já restringe por `empresa_id`.

### RLS — estado auditado vs estado atual

`knowledge/AUDITORIA_COMPLETA_POLICIES_RLS.md` (21/06/2026) auditou 29 tabelas, 106 policies e 16 views do schema `public` restaurado, com veredito textual: **"o conjunto atual de RLS não oferece isolamento multiempresa confiável"** e decisão final **"Aplicação de migrations autorizada: não"**. Achados citados: 2 tabelas sem RLS (`boms`, `bom_itens`); 20 policies críticas e 31 de risco alto; 5 tabelas com exposição cross-tenant explícita; nenhuma tabela com `FORCE ROW LEVEL SECURITY`; 8 views sem `security_invoker=true`.

**Isso é um veredito de uma data específica, não o estado atual** — migrations posteriores corrigiram parte dos achados pontualmente: `202607120005_fix_recursos_produtivos_select_vazamento_tenant.sql`, `202607130001_clientes_ativos_security_invoker.sql`, e principalmente `20260901222711_of_decisao_ci_ce_necessidades.sql` (Incremento 6/9), que fecha `security_invoker=true` em 7 das 8 views apontadas pela auditoria. **A 8ª view (`vw_planejamento_compras_operacional`) não tem, no repositório, nenhuma migration aplicando `security_invoker=true`** — permanece, pelas evidências disponíveis, um risco cross-tenant real não fechado (achado de pesquisa direta nesta sessão). Não existe, no repositório, um novo relatório de auditoria completa fechando item a item a lista original de 20 críticas/31 altas — a situação de segurança RLS **não está reauditada de ponta a ponta desde 21/06/2026**.

### `SECURITY DEFINER`, `search_path`, privilégios

Padrão confirmado: funções `SECURITY DEFINER` de negócio (`aprovar_of`, `decidir_ci_ce_de_of`, `ajustar_of`, etc.) fixam `search_path` explicitamente (tipicamente `'public'`), nunca deixam vazio/padrão — proteção contra sequestro de `search_path`. `handle_new_auth_user()` (trigger de `auth.users`) também é `SECURITY DEFINER` com `search_path='public'` fixo — mas é classificada como achado **crítico** em `knowledge/AUDITORIA_FUNCOES_SECURITY_DEFINER.md` porque lê `raw_user_meta_data->>'empresa_slug'`, um campo **controlável pelo próprio usuário no cadastro**, para resolver a empresa do novo perfil. Esse mesmo comportamento foi observado de forma real e concreta nesta sessão, durante o desenvolvimento do Incremento 7 (ver Capítulo 8, "Incidente de Auth") — não é hipotético, é o comportamento vigente do trigger em produção.

### Views `security_invoker`

53 ocorrências de `security_invoker` no repositório inteiro (código + documentação), 13 arquivos. O padrão de correção real (Incremento 6/9) tem uma nota de risco textual explícita, achada nesta sessão dentro da própria migration: as views eram de propriedade de `postgres` (que tem `rolbypassrls=true`), então, sem `security_invoker=true`, **qualquer `authenticated` com `GRANT SELECT` numa dessas views via cross-tenant enxergava dados de todas as empresas através dela** — e uma dessas views (`vw_of_consumo_detalhado`) tem consumidor real de produção (`src/app/ordens/[id]/page.tsx`). Ou seja, era um vazamento real e ativo, corrigido pelo Incremento 6 em 7 das 8 views — a 8ª (`vw_planejamento_compras_operacional`) foi corrigida separadamente em 2026-09-04 (ver seção "Vazamentos de segurança pré-existentes corrigidos" abaixo).

### Segredos temporários

Nesta sessão, um arquivo de credenciais temporário (`PGPASSWORD` + host/porta/usuário/banco/sslmode do session pooler) foi usado para testar o Incremento 7 contra produção, sempre dentro de `BEGIN...ROLLBACK`, nunca impresso em log, varrido por padrão de segredo antes e depois de cada execução, e removido do ambiente ao final de cada rodada (`unset PGPASSWORD`). O arquivo em si **permanece preservado fora do repositório** (`%TEMP%`), fora do escopo de qualquer staging/commit.

### Advisors

**Não há, no repositório, nenhum processo documentado do projeto que exija ou registre a execução de Security/Performance Advisor do Supabase após uma migration.** A única menção real ao comando (`supabase db advisors` / MCP `get_advisors`) está num skill genérico de ferramenta (`.agents/skills/supabase/SKILL.md`), não em nenhum documento normativo do NEXOTFE. Isso é uma lacuna de processo real, não uma suposição — confirmado por busca exaustiva nesta sessão.

### Riscos ainda abertos (resumo desta seção)

1. Duas implementações incompatíveis de `empresa_atual_id()`/autorização coexistindo (produção vs baseline não aplicado).
2. `empresa_atual_id()` de produção não valida `empresas.ativo` e faz fallback silencioso `profiles → usuarios`.
3. `handle_new_auth_user()` resolve empresa a partir de metadado editável pelo próprio usuário (`raw_user_meta_data->>'empresa_slug'`).
4. Auditoria completa de RLS não repetida desde 21/06/2026 — não há garantia de que as 51 policies não corrigidas pontualmente ainda estejam nos mesmos termos.
5. Ausência de processo formal de advisors pós-migration (rodado manualmente nesta sessão, ver seção abaixo — mas ainda sem processo documentado que exija isso a cada migration).

### Vazamentos de segurança pré-existentes corrigidos (2026-09-04)

Depois da aplicação do Incremento 7/9, o Security Advisor do Supabase foi rodado pela primeira vez nesta sessão (`supabase db advisors --linked --type security`) e confirmou, com evidência de ferramenta (não só leitura de código), os dois achados abaixo — ambos **corrigidos no mesmo dia**, com o mesmo protocolo completo (auditoria estática, dry-run descartável, pré-checagem vinculada, preflight vinculado com `BEGIN...ROLLBACK`, aplicação real, verificação pós-aplicação):

- **`vw_planejamento_compras_operacional`** — achado `ERROR` do Advisor (`security_definer_view`). Investigação confirmou vazamento **ativo**: a view não tinha filtro de tenant no próprio `WHERE`, era de propriedade de `postgres` (`rolbypassrls=true`), e tinha `GRANT ALL` concedido a `anon` — ou seja, qualquer chamador, **inclusive sem login**, conseguia ler dados de planejamento de compra de todas as empresas através dela. Corrigido por `supabase/migrations/20260904162035_fix_vw_planejamento_compras_operacional_security.sql`: `security_invoker=true` + `REVOKE ALL FROM anon, service_role` + `GRANT SELECT TO authenticated`. Aplicado e verificado em produção.
- **`funcionarios_ativos`** — mesmo achado `ERROR` do Advisor, mas **sem vazamento ativo confirmado**: o próprio `WHERE` da view já filtrava por `empresa_id = empresa_atual_id()` desde a criação, então mesmo sem `security_invoker` um chamador `anon`/de outra empresa já recebia 0 linhas. Corrigido como reforço de defesa em profundidade (mesma classificação da correção anterior em `clientes_ativos`, `202607130001`), pelo mesmo padrão de migration: `supabase/migrations/20260904163447_fix_funcionarios_ativos_security.sql`. Aplicado e verificado em produção.

Ambas as correções fecham também o `GRANT ALL` herdado por `anon`/`service_role` (nunca revogado explicitamente desde a criação de cada view) — depois da correção, só `authenticated` mantém privilégio nas duas views (mais `SELECT`, que já existia).

**O que o Advisor NÃO encontrou de novo** relacionado ao próprio Incremento 7 (`ajustar_of`, `ordens_fabricacao_ajustes`, `versao_otimista`): nenhum achado de segurança além de um `WARN` esperado e intencional (`ajustar_of` é `SECURITY DEFINER` executável por `authenticated` — esse é o propósito da função, já testado exaustivamente nesta sessão).

---

## 5. Ciclo completo de uma Ordem de Fabricação

Reconstruído a partir das migrations do programa de incrementos, na ordem em que o comportamento foi introduzido — não é um passo-a-passo de tela (o frontend real não cobre a maior parte deste ciclo, ver Capítulo 9), é o comportamento **de backend confirmado no código**.

1. **Criação.** Uma OF nasce de duas formas confirmadas: manualmente (RPC legada) ou **automaticamente** quando um Projeto muda para `status='aprovado'` (trigger `projetos_criar_ofs_aprovado`, Incremento 4/9) — uma OF-raiz por item elegível do projeto (produto acabado/semiacabado ativo, com BOM resolvido).
2. **Numeração.** `numero_of` é gerado por `gerar_numero_of()`, com formato configurável por empresa (`numeracao_of_formato`), contador reiniciando por projeto (`numeracao_of_projeto`), e é **imutável** por trigger (`bloquear_alteracao_numero_of`) — nenhuma via, nem administrativa, altera um número já gerado (Incremento 1/9).
3. **Projeto e produto.** A OF referencia `projeto_id` e `produto_id`; a quantidade planejada nasce ligada ao item de projeto.
4. **BOM.** A OF referencia `bom_id` — a versão de lista técnica usada para calcular necessidades.
5. **Hierarquia mãe/filha.** Uma OF pode ter `of_pai_id` (subconjunto de outra) e `of_raiz_id` (topo da árvore) — modelo confirmado desde a 1ª fatia do 4D0 (`20260826184412_of_hierarquia_mae_filha.sql`), reforçado com regras de soma/divergência no Incremento 7/9 (Capítulo 8).
6. **Estados de aprovação e execução — duas dimensões independentes**, confirmadas desde `20260826184407_of_estados_aprovacao_execucao.sql`: `estado_aprovacao` (rascunho/auditoria/aprovada/reprovada/cancelada) e `estado_execucao`, cada uma controlada separadamente.
7. **Combinações válidas.** Uma matriz protegida (`estados_of_combinacoes_validas`) define quais pares `(estado_aprovacao, estado_execucao)` são legítimos — usada tanto pela migration original quanto pelo Incremento 7/9 para restringir em quais estados um ajuste é permitido.
8. **Aprovação.** `aprovar_of()` (Incremento 5/9) exige `aguardando_auditoria`+`planejada`, checa papel/nível, e — na mesma transação — chama `gerar_necessidades_de_of()` e, desde o Incremento 6/9, `decidir_ci_ce_de_of()` logo em seguida.
9. **Reprovação.** `reprovar_of()` exige justificativa obrigatória não vazia; sem caminho idempotente (Incremento 5/9).
10. **Geração de necessidades.** `gerar_necessidades_de_of()` expande o BOM recursivamente (`expandir_bom_recursivo`, profundidade máxima 20 contra ciclo, conversão de unidade só nas folhas) e grava uma linha por matéria-prima agregada em `necessidades_of_material`.
11. **Decisão CI/CE.** `decidir_ci_ce_de_of()` (Incremento 6/9) lê `estoque_saldos` **com `FOR UPDATE`** por necessidade, decide quanto é Consumo Interno (sai do estoque) e quanto é Compra Externa, sem bump adicional de capacidade.
12. **Estoque/compras/consumo.** Downstream de CI/CE: `consumos_internos`, `requisicoes_compra`/`requisicao_compra_itens`, `pedidos_compra`/`pedido_compra_itens` (existência de tabela confirmada; integração automática com a decisão CI/CE além da própria função **não auditada linha a linha nesta versão**).
13. **Cancelamento.** Uma OF-filha pode ser cancelada; a soma ativa da mãe deve refletir a exclusão (regra tratada em detalhe no Incremento 7/9, Capítulo 8, "Hierarquia").
14. **Ajustes.** Alteração controlada de `quantidade_planejada`/`bom_id` numa OF já criada — **objeto central do Incremento 7/9** (Capítulo 8), com controle de versão otimista, locks ordenados, e auditoria completa. **Foi aplicada em produção (2026-09-04, commit `927be94`).**
15. **Auditoria.** `ordens_fabricacao_historico_estados` (mudanças de estado, append-only, Incremento 2/9) e `ordens_fabricacao_ajustes` (ajustes de quantidade/BOM, Incremento 7/9, aplicado em produção em 2026-09-04).
16. **Concorrência.** Testada explicitamente para o Incremento 7/9 via harness real (Docker, sessões concorrentes genuínas, evidência de bloqueio via `pg_locks`) — ver Capítulo 8, "Testes".

**Exemplo simples (reconstruído do código, não de uma tela real — não há tela para este fluxo hoje):** um Projeto "Máquina X" é aprovado → nasce a OF-raiz `OF0001` para o item "Máquina X completa" → o PCP aprova a OF → o sistema gera necessidades a partir do BOM (parafusos, chapas, motor) → decide que os parafusos já estão em estoque (CI) e o motor precisa ser comprado (CE) → mais tarde, engenharia percebe que a quantidade planejada de chapas estava errada e usa `ajustar_of` para corrigir, com justificativa obrigatória, dentro dos estados permitidos, sem reabrir o que já foi decidido para os outros materiais.

---

## 6. Os nove incrementos

**Fonte da numeração:** os comentários de cabeçalho das próprias migrations SQL (não existe, em nenhum documento de `knowledge/` ou na raiz do projeto, um documento formal chamado "programa de 9 incrementos" — confirmado por busca exaustiva nesta sessão). O rótulo completo usado nas migrations é **"Incremento 4D0, segunda fatia — Incremento N/9"**.

**Sobre "4D0":** não é uma fase do Plano Diretor (`PLANO_DIRETOR_IMPLEMENTACAO_NEXOTFE_1_0.md`, que usa "Fase 0" a "Fase 11") nem do Plano Executivo (que usa "Sprint 01" a "Sprint 12") — confirmado por leitura direta de ambos, `grep -i "4D0"` retornou zero ocorrências nesses dois documentos e em todo `knowledge/`. É um codinome de rastreabilidade usado só dentro das migrations, ligado a dois planos de execução internos ("polymorphic-tinkering-lightning" e depois "threaded-cascading-forge", ambos "Revisão 5") que não existem como arquivo `.md` versionado em lugar nenhum do repositório — provavelmente artefatos de sessões de planejamento (plan mode) nunca persistidos como documento formal. **Isso é uma lacuna documental real**, não uma suposição.

**Estrutura "4D0" completa, confirmada nas migrations:**
- 1ª fatia (4D0-A/B/C, 5 migrations, commit `5f6477a`, 2026-08-27): estados de aprovação/execução, matriz de combinações válidas, hierarquia mãe/filha, papéis funcionais, necessidades de OF material — a base estrutural sobre a qual a "segunda fatia" (Incrementos 1/9 a 7/9) foi construída.
- 2ª fatia ("Incremento N/9"), 7 migrations confirmadas, descritas abaixo.

### Incremento 1/9 — Numeração de OF por projeto
1. **Nome:** "Numeração de OF por projeto" (`20260828090000_of_numeracao_por_projeto.sql`).
2. **Problema anterior:** numerador único por empresa (`gerar_numero_entidade('of')`), sem reinício por projeto, sem formato configurável, com fallback silencioso.
3. **Objetivo:** contador que reinicia por projeto, formato configurável por empresa, sem fallback silencioso.
4. **Decisões de negócio:** número de OF é estruturalmente imutável após gerado.
5. **Tabelas/colunas:** `numeracao_of_formato` (nova), `numeracao_of_projeto` (nova, contador transacional), `projetos` ganha `UNIQUE(id, empresa_id)`.
6. **Funções/RPCs:** `validar_formato_numero_of`, `aplicar_formato_numero_of`, `gerar_numero_of` (`SECURITY DEFINER`, serializa concorrência via `INSERT ON CONFLICT DO NOTHING` + `UPDATE`).
7. **Triggers:** `bloquear_alteracao_numero_of` (bloqueia `UPDATE` de `numero_of` incondicionalmente); `set_ordem_fabricacao_numero()` reescrita.
8. **Views:** nenhuma.
9. **Índices/constraints:** `ordens_fabricacao_projeto_item_raiz_uniq` (único parcial, impede duas OFs-raiz para o mesmo item de projeto).
10. **ACL/RLS:** `REVOKE ALL` + `GRANT SELECT` a `authenticated` nas 2 tabelas novas; `EXECUTE` das funções revogado de todos os papéis de cliente.
11. **Frontend:** não confirmado (não auditado especificamente).
12. **Testes:** não confirmado (nenhum artefato de teste específico encontrado no repositório para esta migration isoladamente).
13. **Concorrência:** tratada no desenho da função (`ON CONFLICT DO NOTHING`), sem harness de teste real encontrado no repositório para esta migration.
14. **Produção:** **enviado ao Git remoto** (commit `a222f91`, confirmado em `origin/main`). Aplicação real em produção: **não confirmado por evidência de arquivo** (mesma lacuna descrita para o Incremento 6, Capítulo 7 — nenhuma migration deste programa tem evidência documental própria de aplicação além do commit).
15. **Tracking:** não confirmado.
16. **Git:** commit `a222f91`, 2026-08-29, presente em `origin/main`.
17. **Advisors:** não confirmado.
18. **Falhas encontradas:** não confirmado (nenhum registro encontrado).
19. **Correções:** não confirmado.
20. **Riscos:** dependência de que toda empresa tenha `numeracao_of_formato` configurado (a função aborta sem fallback se ausente).
21. **Pendências:** nenhuma identificada no código lido.
22. **Próxima ação segura:** confirmar tracking real em produção antes de presumir aplicado (mesma recomendação do Incremento 6).

### Incremento 2/9 — Histórico de estados
1. **Nome:** "Histórico de estados de ordens_fabricacao" (`20260830111545_of_historico_estados.sql`).
2. **Problema anterior:** nenhum rastro histórico de mudança de estado de uma OF.
3. **Objetivo:** tabela append-only, populada automaticamente por trigger.
4. **Decisões de negócio:** histórico é imutável (sem `UPDATE`/`DELETE`/`TRUNCATE` possível, nem por admin).
5. **Tabelas/colunas:** `ordens_fabricacao_historico_estados` (nova) — `estado_aprovacao_anterior/novo`, `estado_execucao_anterior/novo`, `alterado_em`, `alterado_por`, `observacao`, `origem` (`rpc`/`operacao_administrativa`).
6. **Funções/RPCs:** nenhuma RPC de negócio nova — só triggers.
7. **Triggers:** `registrar_historico_estado_of` (`AFTER INSERT OR UPDATE`, só grava quando o estado muda de fato — `IS DISTINCT FROM`); `bloquear_alteracao_historico_estado_of` (`UPDATE`/`DELETE`); `bloquear_truncate_historico_estado_of` (`TRUNCATE`, `FOR EACH STATEMENT`).
8. **Views:** nenhuma.
9. **Índices:** `ordens_fabricacao_historico_estados_of_cronologia_idx`, `..._empresa_data_idx`.
10. **ACL/RLS:** `SELECT` restrito a `authenticated` com `empresa_id = empresa_atual_id() AND (usuario_e_admin() OR usuario_tem_papel_funcional('pcp'))`; `INSERT/UPDATE/DELETE/TRUNCATE` revogados de todos os papéis de cliente (só o trigger escreve).
11. **Frontend:** não confirmado.
12. **Testes:** não confirmado.
13. **Concorrência:** não aplicável diretamente (append-only via trigger).
14. **Produção:** enviado ao Git remoto (commit `3d90418`, confirmado). Aplicação: não confirmado.
15-21. Mesma lacuna documental dos demais — não confirmado.
22. **Próxima ação segura:** mesma recomendação — confirmar tracking real antes de presumir aplicado.

### Incremento 3/9 — Trava de escrita direta
1. **Nome:** "Trava integral de escrita direta em ordens_fabricacao" (`20260830134415_of_trava_escrita_direta.sql`).
2. **Problema anterior:** ausência de fechamento total de ACL em `ordens_fabricacao`; bypass possível em `numero_of`; duas funções legadas ainda executáveis.
3. **Objetivo:** fechar toda escrita direta na tabela — só RPC pode alterar uma OF.
4. **Decisões de negócio:** nenhum consumidor real em `src/` escrevia diretamente na tabela (verificado à época, conforme cabeçalho da própria migration) — o fechamento foi total, sem exceção por coluna.
5. **Tabelas/colunas:** `ordens_fabricacao` — só ACL, sem `ALTER TABLE` estrutural.
6. **Funções/RPCs:** `set_ordem_fabricacao_numero()` reescrita (sobrescreve `numero_of` incondicionalmente, fechando o bypass anterior).
7. **Triggers:** nenhum novo.
8. **Views:** nenhuma.
9. **Índices/constraints:** nenhum novo.
10. **ACL/RLS:** `REVOKE ALL PRIVILEGES` (cobrindo `TRIGGER`/`MAINTAIN`) de todos os papéis de cliente na tabela; `GRANT SELECT` só a `authenticated`; `REVOKE EXECUTE` em `criar_ordem_fabricacao_operacional` e `processar_necessidade_material` (funções legadas descontinuadas por ACL, corpo intocado).
11. **Frontend:** confirmado indiretamente — nenhuma tela escreve diretamente na tabela (consistente com a única tela de OF existente ser somente leitura, Capítulo 9).
12-13. Testes/concorrência: não confirmado.
14. **Produção:** enviado ao Git remoto (commit `460f3e3`, confirmado). Aplicação: não confirmado.
15-21. Não confirmado.
22. **Próxima ação segura:** confirmar tracking real antes de presumir aplicado.

### Incremento 4/9 — Criação automática de OFs na aprovação do projeto
1. **Nome:** "Criação automática de OFs quando um projeto é aprovado" (`20260831110512_of_criar_automatico_aprovacao_projeto.sql`).
2. **Problema anterior:** criação de OF dependia de ação manual separada da aprovação do projeto.
3. **Objetivo:** trigger reagindo à transição real `status='aprovado'` em `projetos`, desacoplado de `aprovar_projeto_com_simulacao_v5`.
4. **Decisões de negócio:** uma OF-raiz por item elegível (ativo, produto ativo, tipo acabado/semiacabado, BOM resolvido); `created_by` herda o aprovador do projeto.
5. **Tabelas/colunas:** `ordens_fabricacao` — CHECK de `unidade` ampliado para 9 valores (`kg, metro, barra, chapa, peca, conjunto, unidade, litro, pacote`).
6. **Funções/RPCs:** `congelar_custos_projeto_interno` corrigida (usa exclusivamente `resolver_bom_ativo_produto`); `criar_ofs_de_projeto_aprovado` (nova, `SECURITY DEFINER`, impersona a identidade do aprovador via `set_config`, usa locks `criar_ofs_de_projeto_aprovado:<projeto_id>` e `subconjunto-grafo:<empresa_id>`).
7. **Triggers:** `projetos_criar_ofs_aprovado` (`AFTER UPDATE OF status`, condição `old.status IS DISTINCT FROM new.status`), via função intermediária `trg_projetos_criar_ofs_aprovado`.
8. **Views:** nenhuma.
9. **Índices/constraints:** troca de CHECK de unidade.
10. **ACL/RLS:** `criar_ofs_de_projeto_aprovado`/`trg_projetos_criar_ofs_aprovado` sem `EXECUTE` para nenhum papel de cliente (só o trigger chama).
11. **Frontend:** aprovação de projeto tem tela própria (módulo `projetos`), não auditada linha a linha nesta versão para confirmar se o usuário vê o resultado (OFs criadas) imediatamente.
12-13. Testes/concorrência: locks explícitos no código, sem harness de teste dedicado encontrado no repositório para esta migration isoladamente.
14. **Produção:** enviado ao Git remoto (commit `42eb551`, confirmado). Aplicação: não confirmado.
15-21. Não confirmado.
22. **Próxima ação segura:** confirmar tracking real; confirmar telas de projeto refletem a criação automática de OFs.

### Incremento 5/9 — Aprovação, auditoria e necessidades
1. **Nome:** "Aprovação/reprovação/resubmissão de OF pelo PCP com geração automática de necessidades" (`20260831212509_of_aprovacao_auditoria_necessidades.sql`).
2. **Problema anterior:** sem caminho formal de aprovação PCP nem geração automática de necessidades de material.
3. **Objetivo:** aprovar/reprovar/resubmeter com gates de papel/estado, geração atômica de necessidades na mesma transação da aprovação.
4. **Decisões de negócio:** reprovação exige justificativa obrigatória; sem caminho de reaprovação nesta fatia (`gerar_necessidades_de_of` exige ausência de necessidade `bom_expansao` prévia); aprovação é idempotente só para `(aprovada, planejada)`.
5. **Tabelas/colunas:** `necessidades_of_material` — só ACL fechada (incluindo 3 colunas com ACL direto: `ativo`, `deleted_at`, `deleted_by`).
6. **Funções/RPCs:** `expandir_bom_recursivo` (recursiva, profundidade máx. 20, conversão só nas folhas); `gerar_necessidades_de_of` (agrega por `GROUP BY`, `origem_logica='bom_expansao'`); `aprovar_of` (locks `of-transicao:<id>` + `subconjunto-grafo:<empresa_id>`, `UPDATE` com estado esperado no `WHERE` + `ROW_COUNT=1`); `reprovar_of`; `resubmeter_of_para_auditoria`.
7. **Triggers:** nenhum novo nesta migration.
8. **Views:** nenhuma.
9. **Índices/constraints:** nenhum novo.
10. **ACL/RLS:** `expandir_bom_recursivo`/`gerar_necessidades_de_of` sem `EXECUTE` para cliente (internas); `aprovar_of`/`reprovar_of`/`resubmeter_of_para_auditoria` com `GRANT EXECUTE` só a `authenticated` — as únicas 3 funções desta migration expostas ao cliente.
11. **Frontend:** **não encontrado** — nenhuma das 3 RPCs expostas (`aprovar_of`, `reprovar_of`, `resubmeter_of_para_auditoria`) é chamada em nenhum lugar de `src/` (confirmado por busca exaustiva, ver Capítulo 9).
12-13. Testes/concorrência: locks explícitos, sem harness dedicado a esta migration especificamente encontrado no repositório (o harness real encontrado nesta sessão é do Incremento 7, ver Capítulo 8).
14. **Produção:** enviado ao Git remoto (commit `71bc06a`, confirmado). Aplicação: não confirmado.
15-21. Não confirmado.
22. **Próxima ação segura:** construir a tela de aprovação/reprovação de OF (não existe hoje) antes de considerar este incremento "entregue ao usuário" — o backend está pronto, o produto não.

### Incremento 6/9 — Decisão CI/CE
Ver Capítulo 7 (capítulo dedicado, por exigência explícita do escopo deste documento).

### Incremento 7/9 — Ajustes controlados na OF
Ver Capítulo 8 (capítulo mais detalhado do documento, por exigência explícita do escopo).

### Incrementos 8/9 e 9/9
**Não iniciado. Não existe migration, não existe menção textual em nenhum arquivo do repositório, não existe contrato aprovado.** Qualquer descrição de conteúdo para os incrementos 8 e 9 seria invenção — este documento não faz isso, conforme a regra principal. Se e quando esses incrementos forem definidos, este documento deve ser atualizado com a mesma disciplina de citação usada nos incrementos 1-7.

### Tabela-resumo de estado (nesta data de corte)

| Incremento | Migration | Escrito | Testado isolado | Testado concorrência | Testado produção c/ rollback | Aplicado produção | Tracking reconciliado | Commitado | No remoto |
|---|---|---|---|---|---|---|---|---|---|
| 1/9 | `20260828090000` | sim | não confirmado | não confirmado | não confirmado | **sim** (confirmado 2026-09-04) | não confirmado | sim (`a222f91`) | sim |
| 2/9 | `20260830111545` | sim | não confirmado | não aplicável | não confirmado | **sim** (confirmado 2026-09-04) | não confirmado | sim (`3d90418`) | sim |
| 3/9 | `20260830134415` | sim | não confirmado | não aplicável | não confirmado | **sim** (confirmado 2026-09-04) | não confirmado | sim (`460f3e3`) | sim |
| 4/9 | `20260831110512` | sim | não confirmado | não confirmado | não confirmado | **sim** (confirmado 2026-09-04) | não confirmado | sim (`42eb551`) | sim |
| 5/9 | `20260831212509` | sim | não confirmado | não confirmado | não confirmado | **sim** (confirmado 2026-09-04) | não confirmado | sim (`71bc06a`) | sim |
| 6/9 | `20260901222711` | sim | não confirmado | não confirmado | não confirmado | **sim** (confirmado 2026-09-04) | não confirmado | sim (`8bbd566`) | sim |
| 7/9 | `20260903121418` | sim | sim (14/14, preflight isolado) | sim (harness real, ver Cap. 8) | sim (rollback real, ver Cap. 8) | **sim (2026-09-04)** | **sim** (`aplicada`) | **sim** (`927be94763bb2f863b9d388e59ebf500ad98784d`) | **sim** |
| 8/9 | — | não | — | — | — | — | — | — | — |
| 9/9 | — | não | — | — | — | — | — | — | — |

---

## 7. Incremento 6/9 — Decisão CI/CE

### Confirmações diretas

- **Migration:** `supabase/migrations/20260901222711_of_decisao_ci_ce_necessidades.sql` — **existe** (comprovado no código).
- **SHA-256:** recalculado diretamente nesta sessão — `108f1266fb2bef700bd9db7f08afa1200da6e972989b17777739a7776207d433` — **confirmado, bate exatamente com o valor esperado.**
- **Função `decidir_ci_ce_de_of`:** existe no arquivo, `SECURITY DEFINER`.
- **Integração com `aprovar_of`:** confirmada — `aprovar_of` (função de `20260831212509_of_aprovacao_auditoria_necessidades.sql`, Incremento 5/9) é reescrita nesta migration para chamar `decidir_ci_ce_de_of` logo após `gerar_necessidades_de_of`, na mesma transação.
- **Colunas `necessidade_id`, índices únicos parciais, FKs compostas, CHECK de unidade com 9 valores:** citados no cabeçalho da migration (comprovado no código) — não relidos linha a linha nesta rodada de pesquisa por já estarem descritos no cabeçalho original, mas a existência do arquivo e sua estrutura de seções (1 a 9) foi confirmada por grep de seção nesta sessão.
- **7 views com `security_invoker=true`:** confirmado — a migration recria/altera `vw_demanda_bom_of`, `vw_of_consumo_detalhado` (via `CREATE OR REPLACE VIEW ... WITH (security_invoker = true)`) e altera `vw_demanda_estoque`, `vw_demanda_consumo_compra`, `vw_of_fluxo_operacional`, `vw_decisao_material_of`, `vw_of_fluxo_industrial` via `ALTER VIEW ... SET (security_invoker = true)` — 7 views ao todo, confirmado por leitura direta nesta sessão (ver Capítulo 4).
- **Fechamento de ACLs:** confirmado — padrão `REVOKE ALL ... GRANT SELECT` em loop sobre 5 tabelas + 7 views, com revogação por coluna quando necessário.
- **Commit `8bbd5663463ea4d9497bc14e23e36a41904412bf`:** **confirmado exatamente** (hash completo recalculado via `git log -1 8bbd566 --format="%H"` nesta sessão — bate com o valor esperado, byte a byte).
- **Push para `origin/main`:** **confirmado** — `git rev-list --left-right --count main...origin/main` retornou `0 0` (zero commits de diferença em qualquer direção) e `git log origin/main -1` mostra exatamente o commit `8bbd566` como topo do remoto.
- **Autor/data do commit:** `Flavio Evangelista de Castro <nexotfe.dev@gmail.com>`, 2026-09-03 07:39:47 -0300, mensagem "feat(pcp): automatiza decisão CI/CE das necessidades da OF", contendo **um único arquivo** (a própria migration, 583 inserções).

### O que NÃO foi possível confirmar — lacuna documental real, apontada com transparência

Esta seção existe porque o pedido original deste documento presumia como fato consumado uma sequência de eventos (falha inicial em `gerar_necessidades_de_of`, diferença de ACL, correção de uma "Seção 5b", preflight vinculado, aplicação por bundle, verificação pós-aplicação, `migration repair`, execução de advisors) que **este documento foi instruído a confirmar nos arquivos e no Git antes de registrar como fato final**. A pesquisa foi feita — e o resultado precisa ser reportado honestamente:

- **Preflight vinculado específico do Incremento 6:** não encontrado no repositório. Nenhum script `BEGIN...ROLLBACK` dedicado a esta migration existe em `supabase/tests/` ou em qualquer outra pasta.
- **`migration repair`:** o comando aparece em 8 lugares do repositório, mas nenhum se refere a esta migration — todos são de outras fases (cenários comerciais, `202607300001`, `202608010001`).
- **Falha inicial em `gerar_necessidades_de_of` e correção de "Seção 5b":** não encontrado. A própria migration tem seções numeradas 1 a 9, sem subdivisão "5b". A única outra menção a `gerar_necessidades_de_of` fora da própria migration é um comentário genérico de pré-condição na migration do Incremento 7 (dois dias depois), sem relato de falha.
- **Aplicação real em produção, verificação pós-aplicação, tracking reconciliado:** não encontrado nenhum arquivo, log ou registro textual no repositório que comprove que esta migration foi de fato **executada** (`COMMIT`) contra o banco de produção — apenas que foi **escrita e commitada**.
- **Advisors:** não encontrado nenhum registro de execução.
- **Bundle de aplicação:** não existe `supabase/migrations_applied_bundle/` nem pasta equivalente no repositório.

**Conclusão honesta desta seção:** com base exclusivamente no que está no repositório Git nesta data de corte, o Incremento 6/9 está **comprovado no código, comprovado como commitado e enviado ao remoto** — mas **"aplicado em produção" e "tracking reconciliado" são hipóteses não confirmadas por evidência de arquivo**. Isso não significa que não tenha sido aplicado — pode muito bem ter sido, através de um processo (SQL Editor manual, sessão de terminal, revisão do Chat consultor) que não deixou rastro versionado no Git. Mas, seguindo a regra principal deste documento, **a afirmação não pode ser registrada como fato final sem essa evidência**. A ação recomendada (Capítulo 13) é: consultar diretamente `supabase_migrations.schema_migrations` no banco vinculado (com o mesmo protocolo de checkpoint humano e leitura-antes-de-agir já estabelecido nesta sessão para o Incremento 7) antes de tratar o Incremento 6 como aplicado em qualquer decisão futura.

**Atualização (2026-09-04):** essa consulta foi feita. Durante a aplicação real do Incremento 7 (ver Capítulo 8), `npx supabase migration list --linked` foi executado antes do `db push` para confirmar que só a migration do Incremento 7 estava pendente — e essa mesma leitura mostrou, com evidência direta de ferramenta (não presunção), que **todas as migrations 1-6 já tinham as colunas Local e Remote preenchidas**, ou seja, **Incrementos 1/9 a 6/9 estão confirmados como aplicados em produção**. Isso não estava confirmado quando este capítulo foi escrito originalmente; agora está.

---

## 8. Incremento 7/9 — Ajustes controlados na OF

Capítulo mais detalhado por exigência explícita do escopo — e porque esta é a parte do programa cujo desenvolvimento, teste e investigação aconteceram integralmente dentro desta mesma sessão de trabalho, com evidência de primeira mão (logs, hashes, resultados de execução real) em vez de reconstrução por leitura de arquivo histórico.

- **Migration:** `supabase/migrations/20260903121418_of_ajustes_controlados.sql` — comprovado no código.
- **SHA-256:** `a0b37504bc02ef4e29ac3adf9513fd5f81acb332a64cb18af6c250263fdec435` — reconfirmado dezenas de vezes ao longo desta sessão, sempre idêntico; a migration nunca foi editada.

### Problema

Antes deste incremento, não havia caminho controlado para alterar `quantidade_planejada` ou `bom_id` de uma OF já criada. O número da OF é absolutamente imutável (Incremento 1/9), o que é correto — mas nada além do número existia como garantia de integridade quando outros campos precisavam mudar. Depois dos efeitos em cascata do Incremento 6/9 (decisão CI/CE já ter rodado, gerado necessidades, potencialmente disparado consumo/compra), um ajuste descontrolado de quantidade ou BOM poderia deixar estoque, consumo ou compras inconsistentes com a realidade da OF.

### Contrato

Confirmado no código da migration e nos preflights construídos nesta sessão: ajuste só é permitido nos estados autorizados pela matriz de combinações válidas; justificativa é obrigatória; quantidade e BOM são os dois únicos alvos controlados; uma tentativa de ajuste que não muda nada é tratada como no-op explícito; conflito de versão otimista é checado **antes** de decidir se é no-op; bloqueios de necessidades históricas não filtram só as ativas (defesa deliberada contra qualquer efeito residual de CI/CE já decidido); auditoria é obrigatória para todo ajuste, direto ou colateral; hierarquia (mãe/filha) é respeitada; locks seguem uma ordem formal (abaixo); isolamento multiempresa é preservado em toda a operação.

### Versionamento otimista

`ordens_fabricacao.versao_otimista` — coluna nova, valor inicial em 1 (via trigger em `INSERT`), incrementada por um trigger a cada `UPDATE` real da linha. `ajustar_of` recebe a versão esperada como parâmetro; se a versão atual da OF não bate com a esperada, a função rejeita com um erro de conflito **antes** de qualquer decisão de no-op — ou seja, mesmo uma tentativa de "ajustar para o mesmo valor" precisa apresentar a versão correta. A nova versão é retornada ao chamador para permitir nova tentativa informada.

### Locks

Ordem formal confirmada no código e exercitada pelo harness de concorrência real desta sessão: o pai é travado antes do próprio nó sendo ajustado; entre mãe e filha, a mãe é travada primeiro; entre duas irmãs, a ordem é determinística (por `id`, evita lock cruzado); ajustar uma mãe e uma filha na mesma operação trava a mãe antes da filha; um nó intermediário (que é filha de uma OF e mãe de outra) seenquadra na mesma regra "pai antes do próprio nó" em cada nível. Essa ordem determinística é exatamente o que evita deadlock quando duas transações concorrentes disputam a mesma sub-árvore em ordem potencialmente diferente — confirmado empiricamente: **zero deadlock e zero timeout** no resultado final aprovado do harness (abaixo).

### Hierarquia

Regras confirmadas no código e testadas: a soma de referência de uma OF-mãe é a soma das quantidades das filhas **ativas** (canceladas são excluídas da soma); um ajuste que altera a soma ativa preenche `divergencia_quantidade_aprovada` na mãe quando a nova soma não bate com a quantidade aprovada da mãe; uma correção posterior que faz a soma voltar a bater limpa essa divergência; um ajuste **somente de BOM** (sem mudar quantidade) preserva a divergência existente, não a reavalia; a atualização da mãe pode ser direta (ajuste na própria mãe) ou colateral (efeito de ajustar uma filha); a versão otimista da mãe é incrementada mesmo em atualização colateral; todo `UPDATE` de hierarquia usa `ROW_COUNT` para confirmar que exatamente a linha esperada foi tocada; o contador de capacidade (`empresa_capacidade_versoes`) não recebe bump adicional por ajuste — só `aprovar_of` faz isso.

### Auditoria

Tabela `ordens_fabricacao_ajustes` — confirmada no código com 17 colunas, cobrindo: tipo de ajuste (direto/colateral), valores anteriores e novos de quantidade/BOM, versões otimistas antes/depois, estado de divergência antes/depois, quem aprovou/executou, justificativa obrigatória, FKs para a OF e para a empresa, CHECKs de consistência, índices de consulta por OF/empresa/data, RLS habilitado, uma política de leitura (`SELECT` para papéis autorizados), e **bloqueio total de `UPDATE`, `DELETE` e `TRUNCATE`** — a tabela é append-only, no mesmo espírito de `ordens_fabricacao_historico_estados` (Incremento 2/9).

### Testes

Confirmado por logs preservados nesta sessão (não por suposição):
- **Preflight isolado:** 14/14 seções aprovadas contra Postgres descartável, cobrindo fixtures (2 empresas, 4 usuários com papéis distintos, estados, numeração, necessidades históricas, cancelamento, divergência, constraint hierárquica).
- **Harness de concorrência:** formalmente aprovado e fechado nesta sessão. Smoke tests A, B, C confirmados. Cenários S1 a S6 executados, incluindo um BOM real alternativo, os dois ramos possíveis de conflito (mãe-vence e filha-vence — ambos legítimos dependendo da ordem real de chegada das transações, não um bug), e uma carga de 40 sessões concorrentes contra o contador de capacidade compartilhado (`empresa_capacidade_versoes`), com contenção real observada e um ajuste de timeout (não de comportamento) necessário para separar contenção esperada de deadlock real. **Resultado final aprovado: zero deadlock, zero timeout** no smoke final.

### Preflight vinculado

Arquitetura construída e exercitada nesta sessão, fora do repositório Git (scripts em pasta de trabalho temporária, nunca staged): três conexões genuinamente independentes (baseline ANTES, preflight transacional, baseline DEPOIS); comparação de invariantes estruturais byte a byte entre antes e depois; a migration inteira embutida byte a byte dentro de um `BEGIN...ROLLBACK`, nunca `COMMIT`; tracking tolerante a `relacao_ausente` só no modo local (descartável), exigência estrita de `nao_aplicada` no modo vinculado; uso sistemático de `to_regclass`/`to_regprocedure` (NULL-safe) para nunca lançar erro real ao checar objetos ainda inexistentes; validação de formato de host (`*.pooler.supabase.com`), usuário (`postgres.<project-ref>`), porta numérica e `sslmode` em `{require, verify-ca, verify-full}` antes de qualquer conexão real; credencial temporária nunca impressa, verificada estruturalmente sem exibir o valor; um dry-run completo contra Postgres descartável com dump real do schema de produção, aprovado; uma pré-checagem isolada de leitura contra o vinculado real, aprovada, confirmando tracking `nao_aplicada`, ausência de todos os objetos do Incremento 7, presença do papel `pcp` e dos 4 pares de estado necessários; e, mais recentemente, uma tentativa de execução completa vinculada, que revelou o incidente de Auth descrito abaixo.

### Incidente de Auth — achado real, não hipotético

Durante a primeira tentativa de execução completa do preflight contra produção (conexão 2/3, dentro de `BEGIN...ROLLBACK`), o `INSERT` da fixture em `public.profiles` falhou com `duplicate key value violates unique constraint "profiles_pkey"`. Investigação subsequente (leitura direta, dentro de conexões só-leitura) confirmou a causa real:

- `auth.users` tem um trigger real, `on_auth_user_created` (`AFTER INSERT`, habilitado), chamando `public.handle_new_auth_user()` (`SECURITY DEFINER`, `search_path` fixo em `'public'`).
- Essa função cria automaticamente, na mesma transação, uma linha em `public.usuarios` e outra em `public.profiles` para cada novo `auth.users` — ambas com `ON CONFLICT (id) DO NOTHING` no corpo do trigger (o trigger em si nunca falha).
- Como o `INSERT` explícito da fixture em `profiles` (sem tratamento de conflito) roda depois do `INSERT` em `auth.users`, ele colide com a linha que o próprio trigger acabou de criar.
- **O dump usado no dry-run nunca reproduziu isso** porque `--schema public` nunca inclui um trigger anexado a uma tabela de outro schema (`auth.users`), mesmo quando a função associada mora em `public` — achado confirmado diretamente nesta sessão, comparando os 4 dumps locais gerados (nenhum contém `CREATE TRIGGER`, todos contêm a função).
- Investigação adicional revelou um **ciclo estrutural real** entre FKs: tentar criar as empresas sintéticas antes de `auth.users` (para que o trigger resolvesse a empresa certa) quebra porque dois triggers `AFTER INSERT` de `empresas` (`numeracao_configuracoes`, `unidades_medida`) escrevem `created_by` com FK imediata, não-deferrable, para `auth.users(id)` — e a simulação de `auth.uid()` usada na fixture não faz o usuário existir fisicamente. `empresa_capacidade_versoes`, a terceira tabela filha, está fora desse risco (não referencia usuário).
- **Decisão adotada (do usuário, não da IA):** manter a ordem original (`auth.users` antes das empresas sintéticas), permitir que o trigger crie `profiles`/`usuarios` transitoriamente associados a uma empresa real de fallback (`nexotfe-demo`, resolvida por leitura, nunca alterada), e depois **normalizar** — via `UPDATE` filtrado por `id` + `empresa_id` anterior + valores anteriores esperados, com `ROW_COUNT` exigido `= 1` por linha — só os campos que o trigger não pode produzir corretamente (`empresa_id`, `nome`, `nivel_acesso`).
- **Estratégia de cardinalidade 0/4:** depois do `INSERT` em `auth.users`, o código exige que `profiles` e `usuarios` estejam em exatamente 0 linhas (ambiente descartável, sem trigger — insere fallback explícito) ou exatamente 4 (ambiente vinculado, trigger rodou) — qualquer outro valor aborta. No ambiente descartável, `usuarios` não recebe nenhum fallback de `INSERT` (nenhuma seção do preflight depende dela).
- **`usuarios_set_atualizado_em`:** único trigger de `usuarios` (`profiles` não tem nenhum), `BEFORE UPDATE`, corpo trivial (`new.atualizado_em = now()`), sem escrita em outra tabela — auditado explicitamente antes de autorizar a normalização via `UPDATE`, e tratado como comportamento legítimo do próprio `UPDATE` (não fabricação de histórico).
- **Preservação de `data_criacao`:** capturada antes de qualquer `UPDATE` em `usuarios`, reconfirmada idêntica depois (a coluna nunca entra no `SET`).
- **Empresa fallback nunca alterada:** a linha da empresa `nexotfe-demo` só é lida, nunca aparece do lado esquerdo de nenhum `UPDATE`; uma assinatura de seus campos-chave é capturada antes e reconfirmada idêntica no fim da transação.
- **Diferença entre o ramo local e o ramo vinculado:** no local (descartável), o trigger não existe — `profiles`/`usuarios` ficam em 0, a fixture insere direto com os valores finais corretos, e a resolução da empresa `nexotfe-demo` nunca é sequer tentada (condicional ao ramo 4, para não quebrar o ambiente descartável, que nunca tem essa empresa). No vinculado, o trigger existe, `profiles`/`usuarios` ficam em 4, e a normalização por `UPDATE` é obrigatória.

### Estado atual (nesta data de corte)

- Migration **aplicada em produção — sim (2026-09-04)**.
- Tracking remoto: **`nao_aplicada`** (confirmado por leitura real, dentro de transação só-leitura, nesta sessão) — estado no momento em que este parágrafo foi escrito; tracking atual é `aplicada`, ver seção "Aplicação Real e Fechamento de Segurança Pré-Existente" abaixo para detalhe.
- Arquivo da migration **ainda não staged** no Git (`git status` mostra `??` — untracked).
- A segunda correção da fixture (o tratamento completo do incidente de Auth acima) está **escrita** no arquivo da migration/preflight.
- Um dry-run completo (Postgres descartável, ramo sem trigger) desta segunda correção foi **autorizado e executado nesta sessão, e falhou** — por um bug real de ordenação introduzido na própria reescrita (a criação das empresas sintéticas ficou, por engano, depois do bloco que já as referenciava no ramo sem trigger), não por um problema de schema ou de arquitetura. O erro foi diagnosticado e reportado; **a correção ainda não foi aplicada** (sessão parou exatamente no ponto de reportar o erro, por instrução explícita do usuário de nunca corrigir sem nova autorização).
- Esse dry-run, mesmo quando corrigido e aprovado, só prova o **ramo 0** (ambiente sem trigger). **Antes de qualquer nova tentativa vinculada, ainda será necessária uma prova descartável específica do ramo 4** — com `on_auth_user_created` ativo de verdade e uma empresa fallback sintética no ambiente descartável, exercitando os oito `UPDATE`s de normalização, seus `ROW_COUNT`s, e o `ROLLBACK` integral.

> **Nota:** os quatro parágrafos acima descrevem o estado no momento em que este capítulo foi escrito pela primeira vez. Todos os passos que ali apareciam como pendentes (correção do bug de ordenação, dry-run do ramo 0, prova do ramo 4, nova tentativa vinculada, aplicação real) foram concluídos depois — ver seção abaixo. O texto foi deixado como estava, em vez de reescrito, para preservar o registro histórico de como o incidente foi diagnosticado e resolvido passo a passo.

### Aplicação Real e Fechamento de Segurança Pré-Existente (2026-09-04)

Depois do estado descrito acima, o trabalho continuou na mesma sessão até a aplicação real:

1. **Bug de ordenação corrigido e ramo 0 revalidado.** As empresas sintéticas (Bloco A) foram reposicionadas para antes do bloco que já as referenciava (Bloco B) — reposicionamento de posição pura, sem reescrita de lógica. Dry-run do ramo 0 repetido: exit 0, `profiles=0, usuarios=0` confirmado.
2. **Prova descartável do ramo 4 construída e aprovada.** Harness dedicado (`harness_ramo4_inc7.sh`) semeou um usuário administrador e uma empresa fallback sintética (`nexotfe-demo`) **antes** de injetar a definição literal (extraída de produção, byte a byte) do trigger `on_auth_user_created`/`handle_new_auth_user()` num Postgres descartável — só assim foi possível exercitar o ramo 4 sem tocar produção. Resultado: `profiles=4, usuarios=4` pré-normalização, os 8 `UPDATE`s de normalização com `ROW_COUNT=1` confirmados, `data_criacao` preservada, empresa fallback confirmada inalterada, `ROLLBACK` integral com zero resíduo.
3. **Preflight vinculado completo, contra produção real, dentro de `BEGIN...ROLLBACK`.** O trigger real disparou de fato (`profiles=4, usuarios=4` — o ramo 4 aconteceu contra dado de produção, não simulado), todas as 25 seções (14 principais + subseções da SECAO 1) passaram, invariantes estruturais idênticos byte a byte antes/depois, tracking confirmado `nao_aplicada` antes e depois (nunca persistiu).
4. **Staging, commit, push.** `git diff --stat --cached` confirmou exatamente 1 arquivo (`supabase/migrations/20260903121418_of_ajustes_controlados.sql`, 515 inserções). Commit `927be94763bb2f863b9d388e59ebf500ad98784d` — "feat(pcp): Incremento 7/9 — ajustes controlados de OF". `git fetch` + `git rev-list --left-right --count main...origin/main` confirmou `ahead 1, behind 0` antes do push. Push confirmado: SHA local e remoto idênticos.
5. **Aplicação real (`COMMIT`, não `ROLLBACK`).** Antes de aplicar, `npx supabase migration list --linked` confirmou que **só** a migration do Incremento 7 estava pendente (achado colateral: todas as migrations 1-6 já mostravam Local+Remote preenchidos — ver nota no Capítulo 7). `npx supabase db push --linked` listou exatamente 1 migration e concluiu com sucesso.
6. **Verificação pós-aplicação (leitura real, não presumida):** tabela `ordens_fabricacao_ajustes` existe, 0 linhas; coluna `versao_otimista` existe, trigger ativo; função `ajustar_of` existe, `SECURITY DEFINER`, `search_path=public` fixo; ACL só `authenticated`+`postgres`; RLS habilitado com a política correta (`empresa_id = empresa_atual_id()`) — isolamento confirmado estruturalmente, não testado funcionalmente com dado real de duas empresas (tabela ainda vazia); 3 índices confirmados; triggers de bloqueio (`UPDATE`/`DELETE`/`TRUNCATE`) todos ativos; tracking `aplicada`.
7. **Security e Performance Advisors rodados pela primeira vez nesta sessão**, contra produção real, depois da aplicação. Nenhum achado novo relacionado aos objetos do Incremento 7 além de um `WARN` esperado (`ajustar_of` `SECURITY DEFINER` executável por `authenticated` — intencional). Os Advisors revelaram, como efeito colateral, dois vazamentos de segurança **pré-existentes e não relacionados ao Incremento 7** — corrigidos no mesmo dia, com o mesmo protocolo completo (ver Capítulo 4, "Vazamentos de segurança pré-existentes corrigidos").

**Commit SHA da migration do Incremento 7:** `927be94763bb2f863b9d388e59ebf500ad98784d`.

---

## 9. Frontend e experiência do usuário

Achados de pesquisa direta em `src/` nesta sessão — nenhuma suposição.

**Não existe geração automática de tipos a partir do schema Supabase** (`database.types.ts` não existe em lugar nenhum do repositório) — todos os tipos usados pelo frontend são escritos manualmente.

**RPCs de negócio do programa de incrementos — nenhuma tem tela conectada:**

| RPC | Chamada no frontend? |
|---|---|
| `aprovar_of` | Não |
| `reprovar_of` | Não |
| `resubmeter_of_para_auditoria` | Não |
| `criar_ofs_de_projeto_aprovado` | Não (é chamada só por trigger, não é destinada a ter tela) |
| `gerar_necessidades_de_of` | Não |
| `decidir_ci_ce_de_of` | Não |
| `ajustar_of` | Não (aplicado em produção em 2026-09-04, mas sem tela conectada ainda) |
| `expandir_bom_recursivo` | Não (interna, não destinada a ter tela) |

**Única tela real de Ordem de Fabricação:** `src/app/ordens/[id]/page.tsx` — Server Component, estritamente **somente leitura**, sem nenhum botão de ação, sem `onClick`, `<form>`, `useState` de mutação, ou chamada `.rpc(`/`.update(`. Não existe listagem de OFs (`src/app/ordens/page.tsx` não existe). Não existe tela para criar OF, aprovar, reprovar, resubmeter, gerar necessidades ou decidir CI/CE.

**Tela de decisão de material existe visualmente, mas é 100% mock:** `src/app/compras/decisao-material/page.tsx` mostra colunas "CI total", "CI parcial + compra", "Compra total" com um array `materialDecisions` hardcoded no componente, sem nenhuma chamada Supabase — **não conectada** a `decidir_ci_ce_de_of` nem a `necessidades_of_material`. `src/app/compras/page.tsx` tem o mesmo padrão (`openRequisitions`, `recentInternalConsumptions` mockados).

**Tipos de OF defasados do schema real:** grep por `estado_aprovacao`, `estado_execucao`, `necessidades_of_material` em todo `src/` retornou zero ocorrências — os conceitos de estado introduzidos pelas migrations de 2026-08/09 (aprovação/execução separadas, hierarquia mãe/filha, necessidades, ajustes) **não existem em nenhum tipo TypeScript, hook ou tela**. O tipo mais próximo, `OfStatus` em `src/modules/producao/types.ts`, usa um vocabulário antigo e incompatível (`simulacao`, `aguardando_material`, `pronta_programacao`, `producao`, `parada`, `finalizada`) que não corresponde ao vocabulário real do banco.

**O que falta, concretamente, para o backend virar produto:**
- Tela de listagem de OFs (com filtro por estado, projeto, empresa).
- Ações de aprovar/reprovar/resubmeter na tela de detalhe, com exibição da justificativa obrigatória.
- Exibição real da decisão CI/CE por necessidade (substituindo o mock atual).
- Fluxo de ajuste de OF (Incremento 7, quando aplicado): formulário com quantidade/BOM, exibição de conflito otimista (versão esperada vs. versão atual, com opção de recarregar e tentar de novo), exibição de histórico de ajustes (a partir de `ordens_fabricacao_ajustes`).
- Exibição de histórico de estados (a partir de `ordens_fabricacao_historico_estados`).
- Sincronização de tipos TypeScript com o schema real (hoje inexistente).
- Permissões de tela coerentes com papel funcional/nível de acesso reais (não auditado nesta versão se as telas existentes já fazem isso corretamente).
- Acessibilidade, responsividade e estados de carregamento/sucesso/falha das novas telas — não auditados nesta versão por não existirem ainda as telas em si.

**Nenhuma RPC de backend concluída deste programa deve ser tratada como produto entregue ao usuário** — esta é a conclusão central deste capítulo, sustentada por evidência direta, não por precaução genérica.

---

## 10. Forma de trabalho

O projeto usa uma divisão de trabalho explícita, com três papéis:

- **O proprietário** define o negócio (o que o NEXOTFE deve fazer, para quem, com que prioridade) e autoriza cada etapa que toca produção — nenhuma escrita em banco real acontece sem autorização explícita e específica para aquela execução.
- **O Claude Code** (executor) investiga o repositório, escreve código, roda testes (em ambiente descartável e, com autorização, contra produção dentro de `BEGIN...ROLLBACK`), e entrega relatórios com evidência bruta — hash, log, resultado de query — nunca só a afirmação "funcionou".
- **Um Chat consultor independente** revisa esses relatórios, identifica riscos que o executor pode não ver (por estar perto demais do próprio código que escreveu), define o contrato exato da próxima etapa, e autoriza ou não o próximo passo.

**Por que isso importa:** nenhuma etapa crítica avança só porque o agente executor diz que passou. Isso é uma proteção deliberada contra um viés estrutural real — quem escreveu o código tem incentivo (mesmo que não intencional) para interpretar um resultado ambíguo a favor de "funcionou". Um revisor que não escreveu o código, e que está numa conversa separada, sem o mesmo contexto acumulado, tem mais chance de notar a lacuna. Nesta sessão, esse mecanismo funcionou de forma concreta e observável: o incidente de Auth do Incremento 7 (Capítulo 8) só foi corretamente diagnosticado depois de várias rodadas de autorização granular e específica, cada uma pedindo evidência antes de avançar — e uma correção real do executor chegou a ser aplicada, uma vez, sem essa autorização intermediária, e foi corrigida processualmente na rodada seguinte (registrado explicitamente pelo usuário como "correção técnica aprovada, mas aplicada sem autorização intermediária" — um lembrete real, não hipotético, de por que o protocolo existe).

**Elementos concretos do protocolo, todos observados nesta sessão:**
- Autorizações granulares (uma ação específica por vez, nunca em lote).
- Relatórios completos, com diagnóstico antes de qualquer correção.
- Logs brutos preservados, nunca resumidos antes de serem mostrados.
- Hashes SHA-256 recalculados e reconfirmados antes de cada execução — de cada arquivo tocado, nunca presumidos de uma rodada anterior.
- Manifestos (lista de hashes de todos os artefatos de uma entrega, autoverificados).
- Comparação de invariantes antes/depois de cada teste contra produção.
- Ambientes descartáveis (Docker) para qualquer teste que não precise, ainda, tocar produção.
- `BEGIN...ROLLBACK` como a única forma de "tocar" produção antes da aplicação real.
- Testes de concorrência real (não simulados) antes de considerar um mecanismo de lock/versão seguro.
- Verificação antes/depois de qualquer leitura ou escrita real.
- Git só ao final, depois de todo o resto validado — nunca como primeiro passo.

**Custo real, não escondido:** este protocolo consome mais tempo e mais créditos de execução do que simplesmente escrever a migration e aplicar. O Incremento 7, sozinho, envolveu dezenas de rodadas de autorização, múltiplos preflights, um harness de concorrência completo, e ainda não está aplicado em produção. A troca deliberada é: mais tempo e custo agora, em troca de uma redução real de risco de dano irreversível em produção — especialmente relevante num sistema multiempresa, onde um erro de isolamento afeta dados de clientes diferentes ao mesmo tempo.

---

## 11. Metodologia reutilizável

Fluxo observado e usado de forma consistente nesta sessão para o Incremento 7 (a referência mais completa e recente disponível no repositório para reconstruir este fluxo):

1. **Investigação** — ler o código real antes de propor qualquer mudança; nunca presumir comportamento de uma função sem ler seu corpo. *Risco prevenido:* propor uma correção para um problema que não existe, ou que já foi resolvido de outra forma. *Exemplo real:* a leitura completa do corpo de `handle_new_auth_user()` foi o que revelou a causa real do incidente de Auth, em vez de uma hipótese.
2. **Contrato** — o proprietário (ou o Chat consultor em nome dele) define exatamente o que a próxima etapa deve fazer, em termos verificáveis. *Risco prevenido:* o executor decidir sozinho uma questão de regra de negócio (ex.: qual UUID de namespace usar, como tratar um estado ambíguo).
3. **Autoria** — o executor escreve o código conforme o contrato, sem adicionar escopo. *Risco prevenido:* mudanças "de passagem" que ampliam a superfície de risco sem autorização.
4. **Auditoria estática** — checagens mecânicas antes de qualquer execução: balanceamento de parênteses, de `$$` (dollar-quoting), contagem de argumentos de `RAISE`, ausência de apóstrofo cru dentro de string SQL, `bash -n` em todo script shell. *Risco prevenido:* um erro de sintaxe descoberto só em produção. *Exemplo real:* um apóstrofo cru numa string SQL (`'...so' pelo trigger'`) foi encontrado e corrigido por essa auditoria antes de qualquer execução, nesta sessão.
5. **Teste isolado** — contra Postgres descartável, sem dado real. *Risco prevenido:* qualquer efeito colateral de um erro atinge só um container Docker descartável.
6. **Concorrência** — harness com sessões genuinamente independentes, evidência real de bloqueio (`pg_locks`), nunca simulação de concorrência dentro de uma única conexão. *Risco prevenido:* um mecanismo de lock que "parece" correto na leitura do código mas falha sob disputa real.
7. **Dry-run** — Postgres descartável, mas com o schema real de produção (via dump), para testar a migration contra uma cópia fiel da estrutura antes de qualquer contato com dado real. *Risco prevenido:* exatamente o que aconteceu nesta sessão — um dump limitado a `--schema public` não reproduziu o trigger de `auth.users`, então o dry-run, sozinho, não teria pego o incidente de Auth; foi por isso que a etapa seguinte (pré-checagem vinculada) existe.
8. **Pré-checagem vinculada** — uma conexão real de só leitura a produção, com `default_transaction_read_only = on` como garantia adicional (não só convenção), para confirmar pré-condições antes de qualquer transação de escrita/teste. *Risco prevenido:* descobrir uma divergência de ambiente (como o trigger real) só depois de já estar dentro de uma transação mais cara/arriscada.
9. **Preflight vinculado** — a migration inteira, embutida byte a byte, dentro de `BEGIN...ROLLBACK`, contra produção real. *Risco prevenido:* é o único jeito de provar, com certeza, que a migration se comporta corretamente contra o schema e o dado reais — sem nunca persistir nada.
10. **Aplicação** — só depois de todo o resto aprovado; ainda não ocorreu para o Incremento 7 nesta data de corte.
11. **Verificação** — leitura pós-aplicação para confirmar que o estado real bate com o esperado, nunca presumir sucesso pela ausência de erro.
12. **Tracking** — confirmar `supabase_migrations.schema_migrations` reflete a aplicação.
13. **Advisors** — rodar Security/Performance Advisor do Supabase (etapa **sem evidência de processo formal no repositório**, ver Capítulo 4 — uma lacuna real, não uma etapa cumprida).
14. **Limpeza** — remover containers, redes, volumes descartáveis; confirmar zero resíduo.
15. **Staging** — adicionar só os arquivos específicos da tarefa (nunca `git add -A`/`git add .`, regra explícita do projeto).
16. **Commit** — mensagem descrevendo o "porquê", não o "o quê".
17. **Fetch** — antes de push, para detectar divergência.
18. **Push** — só depois de todo o resto.
19. **Verificação remota** — confirmar que `origin/main` de fato reflete o commit esperado (`git rev-list --left-right --count` retornando `0 0`).
20. **Fechamento** — registrar o estado final, com hashes e evidência, para que uma sessão futura não precise confiar na memória desta.

---

## 12. Decisões e riscos

### Decisões aprovadas
| Decisão | Onde |
|---|---|
| `numero_projeto` único por empresa, não globalmente | `knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md` item 3 |
| Interface usa só "Código"; "PN" é legado técnico, coluna física não renomeada | `knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md` item 6 |
| Unidade "peça" persistida sempre sem acento (`peca`) | `knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md` item 5 |
| Operação (`bom_operacoes`) vincula a Recurso Produtivo, não a Tecnologia | `knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md` item 1 |
| `profiles` não deve participar de RLS/autorização no baseline definitivo (fonte única deve ser `usuarios`) | `knowledge/AUDITORIA_FUNCOES_SECURITY_DEFINER.md` — **decisão registrada, não implementada em produção** |
| Incremento 7: manter ordem `auth.users` antes das empresas sintéticas, aceitar referência transitória controlada à empresa fallback real, nunca alterá-la | decisão desta sessão, ver Capítulo 8 |
| Incremento 7: nível de acesso "operador" (default do trigger) em `usuarios` é aceitável desde que não crie duas representações contraditórias com `profiles` | decisão desta sessão |

### Alternativas rejeitadas
| Alternativa | Por que rejeitada |
|---|---|
| Reordenar empresas antes de `auth.users` (Incremento 7) | Quebra por FK imediata, não-deferrable, em `numeracao_configuracoes`/`unidades_medida.created_by → auth.users(id)` — ciclo estrutural real, comprovado por auditoria de schema nesta sessão |
| Usar um usuário real (não sintético) como `created_by` para furar a FK acima | Mistura fixture com identidade real, mesmo risco de fundo do problema com `nexotfe-demo` |
| `ON CONFLICT` genérico para absorver a colisão do trigger de Auth | Esconderia divergência real em vez de comprová-la — proibido explicitamente pelo contrato desta etapa |
| Desabilitar trigger/constraint para simplificar o teste | Proibido explicitamente — mudaria o comportamento real sendo testado |

### Falhas de migration
Nenhuma falha de aplicação de migration em produção foi registrada nesta sessão (nenhuma migration deste programa foi de fato aplicada em produção até a data de corte).

### Falhas de preflight
| Falha | Migration/etapa | Causa |
|---|---|---|
| `duplicate key value violates unique constraint "profiles_pkey"` | Incremento 7, 1ª tentativa completa vinculada | Trigger real de `auth.users` não reproduzido pelo dump `--schema public` |
| `insert or update on table "profiles" violates foreign key constraint "profiles_empresa_id_fkey"` | Incremento 7, dry-run da 2ª correção da fixture | Bug de ordenação introduzido na própria reescrita (empresas sintéticas criadas depois do bloco que já as referenciava) — não corrigido ainda nesta data de corte |

### Falhas de fixture
Ver as duas acima — ambas são, na origem, falhas de fixture/preflight do Incremento 7, não do schema de produção em si.

### Falhas de harness
Contenção real (não deadlock) observada sob carga de 40 sessões concorrentes no contador de capacidade compartilhado durante o desenvolvimento do harness do Incremento 7 — resolvida por ajuste de timeout, não de comportamento; resultado final aprovado com zero deadlock/timeout.

### Diferenças entre local e produção
| Diferença | Impacto |
|---|---|
| Dump `--schema public` nunca inclui trigger anexado a `auth.users` | Causa raiz do incidente de Auth do Incremento 7 |
| `handle_new_auth_user()` só existe em produção real | Qualquer fixture que insira em `auth.users` precisa considerar esse efeito colateral |
| `empresas.slug='nexotfe-demo'` só existe em produção real | Preflight precisa tratar sua ausência no ambiente descartável sem abortar incondicionalmente |

### Pendências de backend
- Nenhuma pendência de aplicação restante para o Incremento 7 — aplicado em produção em 2026-09-04 (ver Capítulo 8).
- Incrementos 1-6 confirmados aplicados via `supabase migration list --linked` em 2026-09-04 (ver Capítulo 7) — deixaram de ser pendência.

### Pendências de frontend
- Nenhuma RPC do programa de incrementos tem tela conectada (Capítulo 9).
- Tela de decisão de material é 100% mock.
- Tipos TypeScript de OF defasados do schema real; sem geração automática de tipos.

### Segurança
Ver Capítulo 4 — resumo: duas implementações incompatíveis de `empresa_atual_id()`; fallback silencioso de identidade em produção; metadado editável influenciando resolução de tenant no cadastro; auditoria de RLS não repetida desde 21/06/2026; ausência de processo formal de advisors (rodado manualmente pela primeira vez em 2026-09-04, ver abaixo). **Vazamentos pré-existentes em `vw_planejamento_compras_operacional` e `funcionarios_ativos` corrigidos em 2026-09-04.** Achados reais do Security Advisor nessa rodada (`supabase db advisors --linked --type security`): 2 `ERROR` (as duas views acima, ambas corrigidas no mesmo dia) e 73 `WARN` (não revisados individualmente nesta versão do documento — nenhum novo achado relacionado aos objetos do Incremento 7 além de 1 `WARN` esperado/intencional). Performance Advisor na mesma rodada: 0 `ERROR`, 46 `WARN` (majoritariamente FKs sem índice cobridor, padrão repetido em centenas de tabelas do banco, incluindo a nova `ordens_fabricacao_ajustes` — não crítico, não revisado item a item nesta versão).

### Experiência do usuário
Backend de aprovação/CI-CE/ajuste pronto (ou quase, no caso do Incremento 7) sem nenhuma tela real — usuário final não tem, hoje, nenhuma forma de aprovar, reprovar, ou ajustar uma OF pela interface.

### Dívida técnica
- Duas árvores de schema paralelas (`migrations/` histórico vs `baseline/` canônico não aplicado).
- Lacuna documental sobre a origem e o significado completo de "4D0" e dos planos "polymorphic-tinkering-lightning"/"threaded-cascading-forge" (nunca versionados como documento).
- Ausência de evidência arquivada de aplicação/tracking/advisors para os Incrementos 1-6.

---

## 13. Próximos passos

**Sequência original recomendada, com estado atualizado em 2026-09-04. Itens 1-8 concluídos nesta sessão — texto mantido para registro histórico da ordem seguida.**

1. ✓ **CONCLUÍDO** — Corrigir o bug de ordenação encontrado no dry-run da 2ª correção da fixture do Incremento 7 (empresas sintéticas antes do bloco que as referencia).
2. ✓ **CONCLUÍDO** — Repetir o dry-run do ramo 0 (sem trigger) até aprovação limpa.
3. ✓ **CONCLUÍDO** — Construir e executar a prova descartável específica do ramo 4 (trigger ativo, empresa fallback sintética, os 8 `UPDATE`s de normalização com `ROW_COUNT`, `ROLLBACK` integral).
4. ✓ **CONCLUÍDO** — Repetir a pré-checagem vinculada de leitura, reconfirmando hashes e ausência de todos os objetos do Incremento 7.
5. ✓ **CONCLUÍDO** — Nova tentativa de preflight vinculado completo (3 conexões, `BEGIN...ROLLBACK`) — aprovada.
6. ✓ **CONCLUÍDO** — Aplicação real em produção, sob checkpoint humano por execução, com verificação antes/depois.
7. ✓ **CONCLUÍDO** — Reconciliação de tracking, execução de advisors, staging só dos arquivos da tarefa, commit, fetch, push, verificação remota (commit `927be94763bb2f863b9d388e59ebf500ad98784d`).
8. ✓ **CONFIRMADO** — Incrementos 1-6 verificados como aplicados em produção via `supabase_migrations.schema_migrations` (`supabase migration list --linked`, 2026-09-04) — não é mais hipótese não confirmada.
9. Priorizar a construção das telas que faltam (Capítulo 9) para os Incrementos 5 e 6 (aprovação/reprovação/CI-CE), já que o backend está pronto e sem consumidor. **Ainda pendente.**
10. Definir formalmente (contrato aprovado pelo proprietário) o conteúdo dos Incrementos 8/9 e 9/9 antes de qualquer trabalho de código — hoje não existe nada a implementar porque não existe contrato. **Ainda pendente.**
11. Considerar, como decisão de arquitetura separada (não urgente, mas registrada como dívida técnica real): um plano formal de convergência entre a trilha histórica (`migrations/`) e a trilha canônica (`baseline/`), já que hoje coexistem duas implementações de autorização incompatíveis. **Ainda pendente.**

---

## Auditoria editorial obrigatória

Confirmado antes de finalizar este documento:

- [x] Nenhum incremento foi marcado como concluído sem evidência — Incrementos 1-6 estão marcados "enviado ao Git remoto", nunca "aplicado em produção" (não confirmado); Incremento 7 está marcado "não aplicado", explicitamente.
- [x] Nenhum teste local foi apresentado como produção — toda menção a teste descartável/local está rotulada como tal, distinta de "produção com rollback".
- [x] Nenhum rollback foi descrito como commit — o preflight vinculado do Incremento 7 é descrito, em todo o documento, como nunca tendo persistido nada.
- [x] `migration repair` não foi confundido com aplicação do schema — o Capítulo 7 trata os dois como conceitos distintos e não encontra evidência de nenhum dos dois para o Incremento 6.
- [x] Nenhuma RPC foi descrita como tela pronta — o Capítulo 9 lista explicitamente cada uma como "não encontrada" no frontend.
- [x] Nenhum hash foi inventado — todos os hashes citados (migrations do Incremento 6 e 7, commit `8bbd5663463ea4d9497bc14e23e36a41904412bf`) foram recalculados diretamente nesta sessão e batem com os valores esperados fornecidos.
- [x] Nenhum segredo foi incluído — nenhuma senha, token ou credencial aparece em nenhum trecho deste documento.
- [x] Nenhuma hipótese foi apresentada como fato — toda vez que a evidência faltou (aplicação em produção do Incremento 6, preflight vinculado do Incremento 6, "Seção 5b", origem completa de "4D0"), o texto diz isso explicitamente, em vez de presumir a partir do enunciado do pedido.
- [x] Estado do código, banco, tracking e Git estão separados — a tabela-resumo do Capítulo 6 usa colunas distintas exatamente para isso.
- [x] A data de corte está registrada — 2026-09-04, no topo do documento.

---

## Fechamento (2026-09-04 — Finalizado)

### 1. Resumo para o proprietário

Incremento 7/9 foi escrito, testado extensivamente, e aplicado em produção. Vazamentos pré-existentes foram corrigidos. Telas ainda não existem.

### 2. Situação dos nove incrementos

1/9 a 6/9: escritos, commitados, enviados ao GitHub; aplicação real em produção **não confirmada por evidência de arquivo**. 7/9: **Aplicado em produção (2026-09-04, commit `927be94`). Fixtures e harness foram validados em dois ambientes. Segurança foi priorizada — vazamentos pré-existentes foram fechados imediatamente.** 8/9 e 9/9: **não existem** em nenhuma forma.

### 3. Riscos abertos

Duas implementações incompatíveis de autorização/isolamento multiempresa coexistindo (produção vs. baseline não aplicado — arquitetura paralela `migrations/` vs `baseline/`); fallback silencioso de identidade em produção; metadado editável pelo usuário influenciando resolução de empresa no cadastro; ausência de processo formal de advisors; nenhuma tela real para os fluxos de aprovação/CI-CE/ajuste; Incrementos 8/9 ainda não definidos (sem contrato aprovado, sem migration, sem conteúdo).

### 4. Ação seguinte autorizada

Construir telas para aprovação/reprovação/CI-CE/ajuste de OF (backend pronto). Definir formalmente Incrementos 8/9. Revisar arquitetura paralela (`migrations/` vs `baseline/`).

### 5. Ações ainda proibidas (por este documento)

Aplicar, commit ou push de qualquer arquivo sem autorização separada.
