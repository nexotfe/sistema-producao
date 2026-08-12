-- TESTE 1/4 da migration 202608110001_cenarios_schema_fase6.sql -
-- ESTRUTURA. NÃO É UMA MIGRATION - vive em supabase/tests/, fora do
-- padrão de nome de migration, NUNCA deve ser aplicado em produção.
--
-- Escopo deste script: tabelas, colunas, constraints, índices, FKs, backfill e RLS das 3 tabelas novas + 2 tabelas estendidas por esta migration.
--
-- Estrutura: BEGIN; conteúdo INTEGRAL da migration (idêntico - qualquer
-- erro aqui já aborta a transação inteira, exatamente como aconteceria
-- na aplicação real); só então os cenários deste script; ROLLBACK
-- obrigatório no final - nenhuma linha fica de fato gravada. Os 4
-- scripts são INDEPENDENTES entre si (cada um reinstala o schema
-- inteiro dentro da própria transação, já que tudo é desfeito no final
-- do anterior) - rode em qualquer ordem, ou só o que falhou, sem
-- precisar repetir os demais.
--
-- Depois de rodar, em uma NOVA conexão/aba do SQL Editor (fora desta
-- transação), rode a query de verificação de resíduo no final deste
-- arquivo - precisa devolver "schema NÃO existe" para confirmar que o
-- ROLLBACK não deixou nada para trás.

begin;

-- =====================================================================
-- PARTE 1: conteúdo INTEGRAL da migration 202608110001 (idêntico -
-- reextraído automaticamente do arquivo real, mesmo corpo nos 4 scripts)
-- =====================================================================
-- 1. Pré-requisitos: unique(id, empresa_id) em tabelas que ainda não têm
--    (necessário para as FKs compostas desta migration - "garantir
--    vínculo pela mesma empresa_id, preferencialmente com FK composta
--    onde possível", decisão confirmada com o usuário)
-- =====================================================================

alter table public.bom_operacoes
  add constraint bom_operacoes_id_empresa_uniq unique (id, empresa_id);

alter table public.bom_itens
  add constraint bom_itens_id_empresa_uniq unique (id, empresa_id);

alter table public.simulacao_comercial_item_distribuicoes
  add constraint simulacao_comercial_item_distribuicoes_id_empresa_uniq unique (id, empresa_id);

-- =====================================================================
-- 2. empresa_capacidade_versoes (DEC-007 §14) + backfill + trigger de
--    criação para empresas futuras
-- =====================================================================

create table public.empresa_capacidade_versoes (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  versao bigint not null default 1
);

comment on table public.empresa_capacidade_versoes is
  'Contador monotônico de versão de capacidade por empresa (DEC-007 §14) - usado na aprovação de cenários (Fase 9) para detectar concorrência: se a versão capturada na leitura consistente for diferente da versão atual no momento da aprovação, a capacidade mudou desde o cálculo e a aprovação é rejeitada. O contador PODE avançar várias vezes numa mesma operação (cada trigger de versão abaixo dispara seu próprio incremento) - isso é esperado, nunca documentar como "um incremento por evento".';

insert into public.empresa_capacidade_versoes (empresa_id)
select id from public.empresas
on conflict (empresa_id) do nothing;

create or replace function public.trg_empresas_criar_capacidade_versao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.empresa_capacidade_versoes (empresa_id) values (new.id)
  on conflict (empresa_id) do nothing;
  return new;
end;
$function$;

comment on function public.trg_empresas_criar_capacidade_versao() is
  'Cria a linha de versão de capacidade (empresa_capacidade_versoes) para toda empresa nova - garante que a Fase 9 sempre encontra uma versão para ler/travar, sem precisar de coalesce/default espalhado pelo resto do sistema.';

revoke execute on function public.trg_empresas_criar_capacidade_versao() from public, anon, authenticated;

drop trigger if exists empresas_criar_capacidade_versao on public.empresas;
create trigger empresas_criar_capacidade_versao
  after insert on public.empresas
  for each row
  execute function public.trg_empresas_criar_capacidade_versao();

alter table public.empresa_capacidade_versoes enable row level security;

create policy empresa_capacidade_versoes_select_tenant
  on public.empresa_capacidade_versoes
  for select to authenticated
  using (empresa_id = public.empresa_atual_id());

-- Append-only estrutural: nenhuma policy de INSERT/UPDATE/DELETE para
-- authenticated - toda escrita é via SECURITY DEFINER (este trigger + os
-- triggers de incremento de versão, §7 abaixo, + a futura RPC de
-- aprovação, Fase 9, que lê com FOR UPDATE).
revoke all on public.empresa_capacidade_versoes from public, anon, authenticated;
grant select on public.empresa_capacidade_versoes to authenticated;

-- =====================================================================
-- 3. bom_operacao_dependencias_subconjunto (DEC-007 §6)
-- =====================================================================

create table public.bom_operacao_dependencias_subconjunto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  bom_operacao_id uuid not null,
  bom_item_id uuid not null,
  ativo boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  -- FK composta: impossível o vínculo referenciar uma operação ou um
  -- item de OUTRA empresa - mesmo padrão de tenant isolation estrutural
  -- já usado em simulacao_comercial_item_distribuicoes (202608020001).
  constraint bom_operacao_dependencias_subconjunto_operacao_fkey
    foreign key (bom_operacao_id, empresa_id)
    references public.bom_operacoes (id, empresa_id),
  constraint bom_operacao_dependencias_subconjunto_item_fkey
    foreign key (bom_item_id, empresa_id)
    references public.bom_itens (id, empresa_id)
);

comment on table public.bom_operacao_dependencias_subconjunto is
  'Vínculo mestre "esta operação de montagem consome este subconjunto" (DEC-007 §6, Regra 2 de precedência) - dado de cadastro do roteiro, não presumido. Sem vínculo aqui, o motor de precedência (Fase 1, grafoPrecedencia.ts) usa o fallback conservador (todas as operações do pai dependem de todos os subconjuntos diretos). Manutenção pela interface fica para a Fase 7.';

-- Índice único parcial só sobre vínculos VIVOS - permite excluir e
-- recriar o mesmo vínculo (soft delete), mesmo padrão de todo o resto do
-- schema com deleted_at.
create unique index bom_operacao_dependencias_subconjunto_par_vivo_uniq
  on public.bom_operacao_dependencias_subconjunto (empresa_id, bom_operacao_id, bom_item_id)
  where deleted_at is null;

create index bom_operacao_dependencias_subconjunto_empresa_idx
  on public.bom_operacao_dependencias_subconjunto (empresa_id);
create index bom_operacao_dependencias_subconjunto_operacao_idx
  on public.bom_operacao_dependencias_subconjunto (bom_operacao_id);
create index bom_operacao_dependencias_subconjunto_item_idx
  on public.bom_operacao_dependencias_subconjunto (bom_item_id);

alter table public.bom_operacao_dependencias_subconjunto enable row level security;

create policy bom_operacao_dependencias_subconjunto_select_tenant
  on public.bom_operacao_dependencias_subconjunto
  for select to authenticated
  using (empresa_id = public.empresa_atual_id());

-- Escrita: mesma política de manutenção de roteiro já usada em
-- bom_operacoes/bom_itens (RLS de escrita dessas tabelas não é
-- redefinida aqui) fica para a Fase 7 (interface de manutenção do
-- vínculo) - por ora, NENHUMA policy de INSERT/UPDATE/DELETE para
-- authenticated é criada, o que nega por padrão (RLS sem policy
-- permissiva = negado), consistente com "não decidir sozinho regra de
-- acesso que ainda não foi desenhada".

-- validar_dependencia_subconjunto (DEC-007 §6) - validação de campo
-- (mesma empresa, mesmo bom_id do pai, componente_tipo=subconjunto,
-- ambos ativos) ESTENDIDA (decisão confirmada com o usuário) para
-- também revalidar a estrutura do BOM pai via o mecanismo de ciclo já
-- existente (202608040001) - reaproveita validar_estrutura_bom sem
-- nenhuma modificação nela: este vínculo não introduz uma aresta NOVA no
-- grafo produto-a-produto (bom_item_id já precisa ser uma linha
-- bom_itens com componente_tipo=subconjunto, já coberta pelo grafo
-- existente) - a revalidação aqui é defensiva (mesmo lock advisory,
-- mesma disciplina de "nunca decidir sozinho estado que pode estar
-- obsoleto"), não uma extensão estrutural da travessia.
create or replace function public.validar_dependencia_subconjunto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_op record;
  v_item record;
begin
  select empresa_id, bom_id, ativo, deleted_at into v_op
    from public.bom_operacoes where id = new.bom_operacao_id;
  select empresa_id, bom_id, componente_tipo, ativo, deleted_at into v_item
    from public.bom_itens where id = new.bom_item_id;

  if v_op.empresa_id is distinct from new.empresa_id or v_item.empresa_id is distinct from new.empresa_id then
    raise exception 'bom_operacao_id e bom_item_id precisam pertencer à mesma empresa do vínculo.';
  end if;
  if v_op.bom_id is distinct from v_item.bom_id then
    raise exception 'bom_operacao_id e bom_item_id precisam pertencer ao mesmo bom_id (mesmo roteiro pai).';
  end if;
  if v_item.componente_tipo is distinct from 'subconjunto' then
    raise exception 'bom_item_id precisa ter componente_tipo=subconjunto.';
  end if;
  if not v_op.ativo or v_op.deleted_at is not null then
    raise exception 'bom_operacao_id precisa estar ativo.';
  end if;
  if not v_item.ativo or v_item.deleted_at is not null then
    raise exception 'bom_item_id precisa estar ativo.';
  end if;

  -- Revalidação defensiva da estrutura do BOM pai (ver comentário acima).
  perform pg_advisory_xact_lock(hashtextextended('subconjunto-grafo:' || new.empresa_id::text, 0));
  perform public.validar_estrutura_bom(new.empresa_id, (
    select produto_id from public.boms where id = v_op.bom_id and empresa_id = new.empresa_id
  ));

  return new;
end;
$function$;

comment on function public.validar_dependencia_subconjunto() is
  'Valida um vínculo bom_operacao_dependencias_subconjunto (DEC-007 §6): mesma empresa, mesmo bom_id pai, componente_tipo=subconjunto, ambos ativos - e revalida a estrutura do BOM pai via validar_estrutura_bom (202608040001), mesmo lock advisory, como defesa adicional (este vínculo não introduz aresta nova no grafo produto-a-produto).';

revoke execute on function public.validar_dependencia_subconjunto() from public, anon;

drop trigger if exists bom_operacao_dependencias_subconjunto_validar on public.bom_operacao_dependencias_subconjunto;
create trigger bom_operacao_dependencias_subconjunto_validar
  before insert or update on public.bom_operacao_dependencias_subconjunto
  for each row
  execute function public.validar_dependencia_subconjunto();

-- =====================================================================
-- 4. simulacoes_comerciais: ajuste_cenario + custo_adicional_total
--    (DEC-007 §12) + estados da estimativa método v2 (DEC-007 §8.2)
-- =====================================================================

alter table public.simulacoes_comerciais
  add column ajuste_cenario jsonb,
  add column custo_adicional_total numeric,
  add column estimativa_data_fim_real date,
  add column estimativa_folga_dias_civis integer;

comment on column public.simulacoes_comerciais.ajuste_cenario is
  'AjusteCenarioPersistido completo (DEC-007 §12) - capacidade extra, contratações, terceirizações, recursos temporários, prioridade base/proposta, projetos deslocados, totais. NULL para todo snapshot aprovado sem cenário (caso comum hoje) ou anterior a esta migration. Escrita só pela RPC v6 (Fase 9) - validação estrutural mínima aqui (jsonb_typeof=object, versaoFormato=1, custo_adicional_total coerente com ajuste_cenario.totais.custoAdicionalTotal); validação profunda do conteúdo é responsabilidade do TypeScript (Fase 4-5) antes de montar o payload, nunca da CHECK.';

comment on column public.simulacoes_comerciais.custo_adicional_total is
  'Denormalização de ajuste_cenario.totais.custoAdicionalTotal - coluna própria (não só dentro do jsonb) para permitir filtro/relatório sem parsear JSON. Sempre coerente com o valor dentro de ajuste_cenario (CHECK abaixo) - nunca uma fonte de verdade paralela.';

comment on column public.simulacoes_comerciais.estimativa_data_fim_real is
  'D* real (Calculador Reverso conjunto, DEC-007 §8, metodoVersao=2) - quando a cadeia do orçamento REALMENTE termina, separado formalmente de estimativa_inicio_necessario (a data de INÍCIO). Presente para os 3 estados do método v2 (viavel/viavel_no_limite/prazo_inviavel) - inclusive prazo_inviavel, onde estimativa_inicio_necessario fica NULL (D* não encontrado) mas a conclusão real ainda é conhecida. NULL para método v1 (não existia) e para snapshots legados.';

comment on column public.simulacoes_comerciais.estimativa_folga_dias_civis is
  'Distância com sinal em DIAS CIVIS (não produtivos - eixo diferente de folga_dias_produtivos, exclusivo do método v1): positivo=folga (viavel), zero=exatamente no limite (viavel_no_limite), negativo=atraso (prazo_inviavel, magnitude = diasCivisDeAtraso). NULL para método v1.';

alter table public.simulacoes_comerciais
  add constraint simulacoes_comerciais_ajuste_cenario_coerente_chk
  check (
    (
      (ajuste_cenario is null and custo_adicional_total is null)
      or
      (
        ajuste_cenario is not null
        and custo_adicional_total is not null
        and jsonb_typeof(ajuste_cenario) = 'object'
        and (ajuste_cenario->>'versaoFormato') is not null
        and (ajuste_cenario->>'versaoFormato')::int = 1
        and custo_adicional_total >= 0
        and abs(custo_adicional_total - coalesce((ajuste_cenario #>> '{totais,custoAdicionalTotal}')::numeric, -1)) < 0.000001
      )
    ) is true
  );

-- Substitui simulacoes_comerciais_estimativa_coerente_chk (202608030001)
-- por uma versão que distingue explicitamente método v1 (viavel,
-- viavel_no_limite, janela_insuficiente - eixo MATERIAL × D*) de método
-- v2 (viavel, viavel_no_limite, prazo_inviavel - eixo PRAZO × conclusão
-- real, DEC-007 §8.2) - "janela_insuficiente" permanece EXCLUSIVO do
-- método v1 (já persistido pela RPC v5 com esse significado - nunca
-- reinterpretado); "prazo_inviavel" é o nome novo, exclusivo do método
-- v2. dados_insuficientes/horizonte_tecnico_excedido são estados
-- TÉCNICOS que bloqueiam a aprovação antes de chegar aqui, nos dois
-- métodos - nunca aparecem nesta coluna, em nenhum dos dois metodo_versao.
alter table public.simulacoes_comerciais
  drop constraint simulacoes_comerciais_estimativa_coerente_chk;

alter table public.simulacoes_comerciais
  add constraint simulacoes_comerciais_estimativa_coerente_chk
  check (
    (
      ( -- legado - antes do Calculador Reverso existir (v1-v4)
        estimativa_inicio_necessario is null and estimativa_estado is null and estimativa_metodo_versao is null
        and folga_dias_produtivos is null
        and estimativa_data_fim_real is null and estimativa_folga_dias_civis is null
      )
      or
      ( -- v1, viavel - material disponível ANTES do início necessário
        estimativa_metodo_versao = 1 and estimativa_estado = 'viavel'
        and estimativa_inicio_necessario is not null
        and folga_dias_produtivos is not null and folga_dias_produtivos > 0
        and estimativa_data_fim_real is null and estimativa_folga_dias_civis is null
        and janela_inicio is not null and janela_fim is not null
        and janela_inicio < estimativa_inicio_necessario and estimativa_inicio_necessario <= janela_fim
      )
      or
      ( -- v1, viavel_no_limite - material disponível EXATAMENTE no início necessário
        estimativa_metodo_versao = 1 and estimativa_estado = 'viavel_no_limite'
        and estimativa_inicio_necessario is not null and folga_dias_produtivos = 0
        and estimativa_data_fim_real is null and estimativa_folga_dias_civis is null
        and janela_inicio is not null and janela_fim is not null
        and janela_inicio = estimativa_inicio_necessario and estimativa_inicio_necessario <= janela_fim
      )
      or
      ( -- v1, janela_insuficiente - material disponível DEPOIS do início necessário (eixo MATERIAL - exclusivo v1)
        estimativa_metodo_versao = 1 and estimativa_estado = 'janela_insuficiente'
        and estimativa_inicio_necessario is not null
        and folga_dias_produtivos is not null and folga_dias_produtivos < 0
        and estimativa_data_fim_real is null and estimativa_folga_dias_civis is null
        and janela_inicio is not null and janela_fim is not null
        and janela_inicio > estimativa_inicio_necessario and estimativa_inicio_necessario <= janela_fim
      )
      or
      ( -- v2, viavel - D* encontrado, com folga real (dias civis)
        estimativa_metodo_versao = 2 and estimativa_estado = 'viavel'
        and estimativa_inicio_necessario is not null
        and estimativa_data_fim_real is not null
        and estimativa_folga_dias_civis is not null and estimativa_folga_dias_civis > 0
        and folga_dias_produtivos is null
        and janela_fim is not null and estimativa_data_fim_real <= janela_fim
      )
      or
      ( -- v2, viavel_no_limite - D* encontrado, folga zero
        estimativa_metodo_versao = 2 and estimativa_estado = 'viavel_no_limite'
        and estimativa_inicio_necessario is not null
        and estimativa_data_fim_real is not null and estimativa_folga_dias_civis = 0
        and folga_dias_produtivos is null
        and janela_fim is not null and estimativa_data_fim_real = janela_fim
      )
      or
      ( -- v2, prazo_inviavel - D* NÃO encontrado (eixo PRAZO, não material - nunca confundir com janela_insuficiente v1)
        estimativa_metodo_versao = 2 and estimativa_estado = 'prazo_inviavel'
        and estimativa_inicio_necessario is null
        and estimativa_data_fim_real is not null
        and estimativa_folga_dias_civis is not null and estimativa_folga_dias_civis < 0
        and folga_dias_produtivos is null
        and janela_fim is not null and estimativa_data_fim_real > janela_fim
      )
    ) is true
  );

-- =====================================================================
-- 5. simulacao_comercial_item_distribuicoes: extensão para distribuições
--    externas (DEC-007 §11)
-- =====================================================================

alter table public.simulacao_comercial_item_distribuicoes
  alter column recurso_id drop not null,
  add column recurso_externo_tipo text check (recurso_externo_tipo in ('maquina_alugada', 'freelancer', 'terceirizacao')),
  add column recurso_externo_nome text,
  add column recurso_externo_referencia_id uuid,
  add column contratacao_id text,
  add column data_inicio_calculada date,
  add column data_fim_calculada date,
  add column custo numeric;

comment on column public.simulacao_comercial_item_distribuicoes.recurso_externo_referencia_id is
  'Recurso REAL de referência - produtividade herdada dele (DEC-007 §10), nunca digitada. Obrigatório para RECURSO_TEMPORARIO; NULL para TERCEIRIZADO (processo externo opaco, sem produtividade a herdar).';
comment on column public.simulacao_comercial_item_distribuicoes.contratacao_id is
  'Referência lógica a Contratacao dentro de simulacoes_comerciais.ajuste_cenario (jsonb) - NÃO é FK, Contratacao não vira tabela própria nesta fase (DEC-007 §11). Nulo para ORIGINAL/COMPATIBILIDADE (recurso interno - custo de hora extra rastreado POR DIA em simulacao_comercial_item_distribuicao_dias, nunca duplicado aqui); obrigatório para RECURSO_TEMPORARIO/TERCEIRIZADO (contrato principal). Todo contratacao_id aqui precisa existir em ajuste_cenario.contratacoes - validado autoritativamente pela RPC v6 (Fase 9), não checável nesta migration (CHECK não enxerga o jsonb de outra coluna do mesmo tipo de forma prática nem faz sentido comparar contra um array dentro do MESMO row de forma genérica aqui).';
comment on column public.simulacao_comercial_item_distribuicoes.custo is
  'Custo desta distribuição - nulo para recurso interno (ORIGINAL/COMPATIBILIDADE), obrigatório (>=0) para externo.';

alter table public.simulacao_comercial_item_distribuicoes
  add constraint simulacao_comercial_item_distribuicoes_recurso_externo_ref_fkey
  foreign key (recurso_externo_referencia_id, empresa_id)
  references public.recursos_produtivos (id, empresa_id);

-- Substitui o CHECK inline original de origem (só ORIGINAL/COMPATIBILIDADE
-- - nome gerado automaticamente pelo Postgres para CHECK de coluna
-- inline, confirmado pela convenção {tabela}_{coluna}_check; se o nome
-- real divergir, o DROP abaixo falha explicitamente no teste
-- BEGIN...ROLLBACK, nunca silenciosamente).
alter table public.simulacao_comercial_item_distribuicoes
  drop constraint simulacao_comercial_item_distribuicoes_origem_check;

alter table public.simulacao_comercial_item_distribuicoes
  add constraint simulacao_comercial_item_distribuicoes_origem_chk
    check (origem in ('ORIGINAL', 'COMPATIBILIDADE', 'TERCEIRIZADO', 'RECURSO_TEMPORARIO')),
  -- XOR recurso_id × recurso_externo_* (presença/ausência)
  add constraint simulacao_comercial_item_distribuicoes_recurso_xor_chk
    check (
      (origem in ('ORIGINAL', 'COMPATIBILIDADE')
        and recurso_id is not null
        and recurso_externo_tipo is null and recurso_externo_nome is null and recurso_externo_referencia_id is null)
      or
      (origem in ('TERCEIRIZADO', 'RECURSO_TEMPORARIO')
        and recurso_id is null
        and recurso_externo_tipo is not null and recurso_externo_nome is not null)
    ),
  -- Amarra o VALOR de recurso_externo_tipo ao origem específico (gap
  -- identificado no §11, anotações para a Fase 6 - o XOR acima só
  -- garante presença/ausência, não a correspondência de valores).
  add constraint simulacao_comercial_item_distribuicoes_origem_tipo_externo_chk
    check (
      (origem = 'TERCEIRIZADO' and recurso_externo_tipo = 'terceirizacao')
      or (origem = 'RECURSO_TEMPORARIO' and recurso_externo_tipo in ('maquina_alugada', 'freelancer'))
      or (origem in ('ORIGINAL', 'COMPATIBILIDADE'))
    ),
  add constraint simulacao_comercial_item_distribuicoes_referencia_origem_chk
    check (
      (origem = 'RECURSO_TEMPORARIO' and recurso_externo_referencia_id is not null)
      or (origem = 'TERCEIRIZADO' and recurso_externo_referencia_id is null)
      or (origem in ('ORIGINAL', 'COMPATIBILIDADE'))
    ),
  add constraint simulacao_comercial_item_distribuicoes_contratacao_origem_chk
    check (
      (origem in ('ORIGINAL', 'COMPATIBILIDADE') and contratacao_id is null)
      or (origem in ('TERCEIRIZADO', 'RECURSO_TEMPORARIO') and contratacao_id is not null)
    ),
  add constraint simulacao_comercial_item_distribuicoes_custo_por_origem_chk
    check (
      (origem in ('ORIGINAL', 'COMPATIBILIDADE') and custo is null)
      or (origem in ('TERCEIRIZADO', 'RECURSO_TEMPORARIO') and custo is not null and custo >= 0)
    ),
  -- Datas calculadas: só TERCEIRIZADO (opera fora do calendário
  -- produtivo interno, DEC-007 §10) - ambas ou nenhuma, fim >= início.
  add constraint simulacao_comercial_item_distribuicoes_datas_por_origem_chk
    check (
      (origem = 'TERCEIRIZADO'
        and data_inicio_calculada is not null and data_fim_calculada is not null
        and data_fim_calculada >= data_inicio_calculada)
      or
      (origem in ('ORIGINAL', 'COMPATIBILIDADE', 'RECURSO_TEMPORARIO')
        and data_inicio_calculada is null and data_fim_calculada is null)
    );

-- Colunas de capacidade dia-a-dia: NULLABLE, obrigatórias conforme
-- origem (decisão confirmada com o usuário - 0 significaria capacidade
-- real nula; para TERCEIRIZADO o conceito de capacidade dia-a-dia
-- simplesmente não se aplica, são coisas diferentes). Os CHECKs
-- aritméticos originais (saldo/horas_maquina/capacidade_efetiva/
-- disponivel_inicial coerentes) continuam válidos sem alteração -
-- `abs(NULL - NULL) < 0.000001` avalia NULL, e Postgres trata CHECK com
-- resultado NULL como aprovado (não violado), então passam vacuamente
-- para as linhas TERCEIRIZADO onde tudo fica NULL.
alter table public.simulacao_comercial_item_distribuicoes
  alter column capacidade_bruta_periodo drop not null,
  alter column produtividade_considerada drop not null,
  alter column capacidade_efetiva drop not null,
  alter column comprometido_inicial drop not null,
  alter column capacidade_disponivel_inicial drop not null,
  alter column capacidade_disponivel_antes drop not null,
  alter column horas_padrao_alocadas drop not null,
  alter column horas_maquina_estimadas drop not null,
  alter column capacidade_disponivel_depois drop not null;

alter table public.simulacao_comercial_item_distribuicoes
  add constraint simulacao_comercial_item_distribuicoes_capacidade_origem_chk
  check (
    (
      origem in ('ORIGINAL', 'COMPATIBILIDADE', 'RECURSO_TEMPORARIO')
      and capacidade_bruta_periodo is not null and produtividade_considerada is not null
      and capacidade_efetiva is not null and comprometido_inicial is not null
      and capacidade_disponivel_inicial is not null and capacidade_disponivel_antes is not null
      and horas_padrao_alocadas is not null and horas_maquina_estimadas is not null
      and capacidade_disponivel_depois is not null
    )
    or
    (
      origem = 'TERCEIRIZADO'
      and capacidade_bruta_periodo is null and produtividade_considerada is null
      and capacidade_efetiva is null and comprometido_inicial is null
      and capacidade_disponivel_inicial is null and capacidade_disponivel_antes is null
      and horas_padrao_alocadas is null and horas_maquina_estimadas is null
      and capacidade_disponivel_depois is null
    )
  );

-- =====================================================================
-- 6. simulacao_comercial_item_distribuicao_dias (DEC-007 §11, com
--    contratacao_id por dia - decisão confirmada com o usuário: o
--    esboço original do DEC-007 só tinha contratacao_id na tabela PAI,
--    mas o TypeScript já implementado (AlocacaoDiaria/FaixaCapacidadeDia,
--    Fase 0) exige contratacaoId JUNTO da natureza, POR DIA - sem isso,
--    uma distribuição que usa capacidade normal em alguns dias e hora
--    extra/fim de semana em outros (com contratos possivelmente
--    diferentes) perderia rastreabilidade de custo diário)
-- =====================================================================

create table public.simulacao_comercial_item_distribuicao_dias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  simulacao_comercial_item_distribuicao_id uuid not null,
  data date not null,
  horas_maquina numeric not null check (horas_maquina > 0),
  horas_padrao numeric not null check (horas_padrao > 0),
  natureza text not null check (natureza in ('normal', 'hora_extra', 'sabado', 'domingo', 'feriado')),
  -- Espelha EXATAMENTE a invariante já validada em alocarOperacaoDiaAdia.ts
  -- (validarFaixasDoDia, Fase 0): natureza="normal" ⟺ contratacaoId nulo.
  -- Texto sem FK física (mesma razão da coluna homônima na tabela pai -
  -- Contratacao vive dentro do jsonb ajuste_cenario, não é tabela própria
  -- nesta fase) - todo contratacao_id aqui precisa existir em
  -- ajuste_cenario.contratacoes, validado autoritativamente pela RPC v6
  -- (Fase 9), não checável por CHECK de banco. O hash de idempotência v6
  -- (Fase 9) também precisa incluir o contratacao_id de cada dia.
  contratacao_id text,
  constraint simulacao_comercial_item_distribuicao_dias_nat_contrato_chk
    check ((natureza = 'normal') = (contratacao_id is null)),
  constraint simulacao_comercial_item_distribuicao_dias_uniq
    unique (simulacao_comercial_item_distribuicao_id, data, natureza),
  -- FK composta: garante que a linha diária pertence à MESMA empresa da
  -- distribuição pai - FK simples para simulacao_comercial_item_distribuicao_id
  -- não garantiria isso sozinha (DEC-007 §11, anotação para a Fase 6).
  constraint simulacao_comercial_item_distribuicao_dias_pai_fkey
    foreign key (simulacao_comercial_item_distribuicao_id, empresa_id)
    references public.simulacao_comercial_item_distribuicoes (id, empresa_id)
);

comment on table public.simulacao_comercial_item_distribuicao_dias is
  'Alocação diária real de uma distribuição (DEC-007 §11) - granularidade que o cabeçalho simulacao_comercial_item_distribuicoes não tem (só o total agregado na janela inteira). A soma de horas_padrao/custo dos dias precisa bater com a distribuição pai - validado pela RPC v6 (Fase 9) antes do INSERT, não por CHECK (Postgres não permite subquery entre tabelas em CHECK). Append-only, igual a toda a árvore de tabelas filhas de simulacoes_comerciais.';
comment on column public.simulacao_comercial_item_distribuicao_dias.contratacao_id is
  'Contrato desta faixa específica do dia - NULO quando natureza=normal (recurso interno operando em capacidade normal cadastrada), OBRIGATÓRIO quando natureza é hora_extra/sabado/domingo/feriado. Para recurso temporário/terceirização, o contrato PRINCIPAL já está na distribuição pai (simulacao_comercial_item_distribuicoes.contratacao_id) - este campo não o duplica sem necessidade; só é usado aqui quando o PRÓPRIO dia carrega uma natureza diferente de normal.';

create index simulacao_comercial_item_distribuicao_dias_pai_idx
  on public.simulacao_comercial_item_distribuicao_dias (simulacao_comercial_item_distribuicao_id);
create index simulacao_comercial_item_distribuicao_dias_empresa_idx
  on public.simulacao_comercial_item_distribuicao_dias (empresa_id);

alter table public.simulacao_comercial_item_distribuicao_dias enable row level security;

create policy simulacao_comercial_item_distribuicao_dias_select_tenant
  on public.simulacao_comercial_item_distribuicao_dias
  for select to authenticated
  using (empresa_id = public.empresa_atual_id());

-- Append-only real, mesmo padrão de simulacao_comercial_item_distribuicoes
-- (202608020001) - nenhuma policy permissiva de escrita para authenticated.
revoke all on public.simulacao_comercial_item_distribuicao_dias from public, anon, authenticated;
grant select on public.simulacao_comercial_item_distribuicao_dias to authenticated;

-- TERCEIRIZADO opera só pelas datas calculadas (data_inicio_calculada/
-- data_fim_calculada na distribuição pai), sem alocação diária (DEC-007
-- §10) - o CHECK da tabela não alcança a distribuição pai (Postgres não
-- permite subquery entre tabelas em CHECK, ver comentário da tabela
-- acima), por isso a validação é por trigger, não por CHECK.
create or replace function public.validar_distribuicao_dia_origem()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_origem_pai text;
begin
  select origem into v_origem_pai
  from public.simulacao_comercial_item_distribuicoes
  where id = new.simulacao_comercial_item_distribuicao_id;

  if v_origem_pai = 'TERCEIRIZADO' then
    raise exception 'simulacao_comercial_item_distribuicao_dias não aceita linha diária quando a distribuição pai tem origem=TERCEIRIZADO - terceirização (DEC-007 §10) opera fora do calendário produtivo interno, só por datas calculadas, nunca por alocação diária.';
  end if;

  return new;
end;
$function$;

comment on function public.validar_distribuicao_dia_origem() is
  'Rejeita qualquer linha em simulacao_comercial_item_distribuicao_dias cuja distribuição pai (simulacao_comercial_item_distribuicoes) tenha origem=TERCEIRIZADO - terceirização (DEC-007 §10) não tem alocação diária, só datas calculadas fixas.';

revoke execute on function public.validar_distribuicao_dia_origem() from public, anon, authenticated;

drop trigger if exists simulacao_comercial_item_distribuicao_dias_validar_origem on public.simulacao_comercial_item_distribuicao_dias;
create trigger simulacao_comercial_item_distribuicao_dias_validar_origem
  before insert on public.simulacao_comercial_item_distribuicao_dias
  for each row
  execute function public.validar_distribuicao_dia_origem();

-- =====================================================================
-- 7. Funções de incremento de versão (DEC-007 §14)
-- =====================================================================

-- Caso comum: a própria linha (NEW em INSERT/UPDATE, OLD em DELETE) tem
-- empresa_id - incrementa só a versão dessa empresa.
create or replace function public.trg_bump_capacidade_versao_por_empresa_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
begin
  v_empresa_id := coalesce(new.empresa_id, old.empresa_id);
  update public.empresa_capacidade_versoes
  set versao = versao + 1
  where empresa_id = v_empresa_id;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

comment on function public.trg_bump_capacidade_versao_por_empresa_id() is
  'Incrementa empresa_capacidade_versoes.versao para a empresa da linha que mudou (DEC-007 §14, inventário de gatilhos de versão) - reaproveitada por todas as tabelas do inventário QUE TÊM empresa_id na própria linha (todas, exceto calendario_oficial_feriados, ver função irmã abaixo). O contador é monotônico e pode avançar várias vezes na mesma operação - nunca documentar como "um incremento por evento".';

-- Caso especial: calendario_oficial_feriados é GLOBAL (sem empresa_id -
-- mantida externamente, confirmado em 202607180002) - uma mudança nela
-- afeta o calendário produtivo de TODAS as empresas simultaneamente, não
-- de uma só.
create or replace function public.trg_bump_capacidade_versao_todas_empresas()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.empresa_capacidade_versoes
  set versao = versao + 1;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

comment on function public.trg_bump_capacidade_versao_todas_empresas() is
  'Incrementa empresa_capacidade_versoes.versao para TODAS as empresas - única exceção do inventário §14, usada apenas por calendario_oficial_feriados (tabela global, sem empresa_id) - um feriado nacional novo/alterado invalida o cálculo de capacidade de toda empresa, não de uma só.';

revoke execute on function public.trg_bump_capacidade_versao_por_empresa_id() from public, anon, authenticated;
revoke execute on function public.trg_bump_capacidade_versao_todas_empresas() from public, anon, authenticated;

-- =====================================================================
-- 8. Triggers de incremento de versão - inventário NOMINAL completo
--    (DEC-007 §14, corrigido contra o schema real - ver cabeçalho desta
--    migration para as correções de nome de tabela/coluna). 19 triggers
--    (não 20 - o item original "operacoes_producao" foi removido do
--    inventário: a tabela não existe e não há equivalente no schema
--    real, confirmado por preflight direto no remoto - ver cabeçalho e
--    DEC-007 §17.1).
-- =====================================================================

-- 8.1 projeto_itens: produto_id, quantidade, ativo, deleted_at
drop trigger if exists projeto_itens_bump_capacidade_versao on public.projeto_itens;
create trigger projeto_itens_bump_capacidade_versao
  after insert or update of produto_id, quantidade, ativo, deleted_at or delete
  on public.projeto_itens
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- 8.2 boms: produto_id, status, ativo, deleted_at
drop trigger if exists boms_bump_capacidade_versao on public.boms;
create trigger boms_bump_capacidade_versao
  after insert or update of produto_id, status, ativo, deleted_at or delete
  on public.boms
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- 8.3 bom_operacoes: bom_id, ordem, tempo_estimado_minutos, recurso_produtivo_id, ativo, deleted_at
drop trigger if exists bom_operacoes_bump_capacidade_versao on public.bom_operacoes;
create trigger bom_operacoes_bump_capacidade_versao
  after insert or update of bom_id, ordem, tempo_estimado_minutos, recurso_produtivo_id, ativo, deleted_at or delete
  on public.bom_operacoes
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- 8.4 bom_itens: bom_id, componente_tipo, componente_produto_id, materia_prima_id, quantidade, ativo, deleted_at
drop trigger if exists bom_itens_bump_capacidade_versao on public.bom_itens;
create trigger bom_itens_bump_capacidade_versao
  after insert or update of bom_id, componente_tipo, componente_produto_id, materia_prima_id, quantidade, ativo, deleted_at or delete
  on public.bom_itens
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- 8.5 bom_operacao_dependencias_subconjunto: INSERT/UPDATE/DELETE (tabela nova desta migration)
drop trigger if exists bom_operacao_dependencias_subconjunto_bump_capacidade_versao on public.bom_operacao_dependencias_subconjunto;
create trigger bom_operacao_dependencias_subconjunto_bump_capacidade_versao
  after insert or update or delete
  on public.bom_operacao_dependencias_subconjunto
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- 8.6 itens_industriais: ativo, deleted_at
drop trigger if exists itens_industriais_bump_capacidade_versao on public.itens_industriais;
create trigger itens_industriais_bump_capacidade_versao
  after insert or update of ativo, deleted_at or delete
  on public.itens_industriais
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- 8.7 materias_primas: ativo, deleted_at
drop trigger if exists materias_primas_bump_capacidade_versao on public.materias_primas;
create trigger materias_primas_bump_capacidade_versao
  after insert or update of ativo, deleted_at or delete
  on public.materias_primas
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- 8.8 recursos_produtivos: capacidade_horas_dia, produtividade, grupo_id, ativo, deleted_at
drop trigger if exists recursos_produtivos_bump_capacidade_versao on public.recursos_produtivos;
create trigger recursos_produtivos_bump_capacidade_versao
  after insert or update of capacidade_horas_dia, produtividade, grupo_id, ativo, deleted_at or delete
  on public.recursos_produtivos
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- 8.9 grupos_recursos: produtividade_padrao, ativo, deleted_at
drop trigger if exists grupos_recursos_bump_capacidade_versao on public.grupos_recursos;
create trigger grupos_recursos_bump_capacidade_versao
  after insert or update of produtividade_padrao, ativo, deleted_at or delete
  on public.grupos_recursos
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- 8.10 recurso_produtivo_compatibilidades: recurso_origem_id, recurso_destino_id, prioridade, ativo, deleted_at
drop trigger if exists recurso_produtivo_compatibilidades_bump_capacidade_versao on public.recurso_produtivo_compatibilidades;
create trigger recurso_produtivo_compatibilidades_bump_capacidade_versao
  after insert or update of recurso_origem_id, recurso_destino_id, prioridade, ativo, deleted_at or delete
  on public.recurso_produtivo_compatibilidades
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- 8.11 simulacoes_comerciais: INSERT e UPDATE de vigente
drop trigger if exists simulacoes_comerciais_bump_capacidade_versao on public.simulacoes_comerciais;
create trigger simulacoes_comerciais_bump_capacidade_versao
  after insert or update of vigente
  on public.simulacoes_comerciais
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- 8.12-8.14 simulacao_comercial_itens / _distribuicoes / _dias: INSERT (append-only, nunca UPDATE/DELETE - ver §9)
drop trigger if exists simulacao_comercial_itens_bump_capacidade_versao on public.simulacao_comercial_itens;
create trigger simulacao_comercial_itens_bump_capacidade_versao
  after insert
  on public.simulacao_comercial_itens
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

drop trigger if exists simulacao_comercial_item_distribuicoes_bump_capacidade_versao on public.simulacao_comercial_item_distribuicoes;
create trigger simulacao_comercial_item_distribuicoes_bump_capacidade_versao
  after insert
  on public.simulacao_comercial_item_distribuicoes
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

drop trigger if exists simulacao_comercial_item_distribuicao_dias_bump_capacidade_versao on public.simulacao_comercial_item_distribuicao_dias;
create trigger simulacao_comercial_item_distribuicao_dias_bump_capacidade_versao
  after insert
  on public.simulacao_comercial_item_distribuicao_dias
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- 8.15 projetos: situacao_comercial, prioridade, data_objetivo, ativo, deleted_at
drop trigger if exists projetos_bump_capacidade_versao on public.projetos;
create trigger projetos_bump_capacidade_versao
  after insert or update of situacao_comercial, prioridade, data_objetivo, ativo, deleted_at or delete
  on public.projetos
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- 8.16 calendario_operacional_empresa: qualquer mudança (tem empresa_id, sem ativo/deleted_at - 1 linha/empresa)
drop trigger if exists calendario_operacional_empresa_bump_capacidade_versao on public.calendario_operacional_empresa;
create trigger calendario_operacional_empresa_bump_capacidade_versao
  after insert or update or delete
  on public.calendario_operacional_empresa
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- 8.17 calendario_empresa_eventos: qualquer mudança (tem empresa_id, ativo, deleted_at)
drop trigger if exists calendario_empresa_eventos_bump_capacidade_versao on public.calendario_empresa_eventos;
create trigger calendario_empresa_eventos_bump_capacidade_versao
  after insert or update or delete
  on public.calendario_empresa_eventos
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- 8.18 calendario_oficial_feriados: qualquer mudança - SEM empresa_id (tabela global), incrementa TODAS as empresas (função irmã, §7)
drop trigger if exists calendario_oficial_feriados_bump_capacidade_versao on public.calendario_oficial_feriados;
create trigger calendario_oficial_feriados_bump_capacidade_versao
  after insert or update or delete
  on public.calendario_oficial_feriados
  for each row
  execute function public.trg_bump_capacidade_versao_todas_empresas();

-- 8.19 ordens_fabricacao: qualquer mudança (DEC-007 §14 chama esta tabela de "ordens_producao" - nome real confirmado é ordens_fabricacao)
drop trigger if exists ordens_fabricacao_bump_capacidade_versao on public.ordens_fabricacao;
create trigger ordens_fabricacao_bump_capacidade_versao
  after insert or update or delete
  on public.ordens_fabricacao
  for each row
  execute function public.trg_bump_capacidade_versao_por_empresa_id();

-- 8.20 REMOVIDO (auditoria remota) - DEC-007 §14 listava "operacoes_producao"
-- (operação de produção, granularidade abaixo de ordens_fabricacao) como
-- tabela do inventário de versão. Preflight direto no schema real
-- (information_schema.tables, filtro por %oper%/%ordem%/%apont%/%aloc%)
-- confirmou que essa tabela NÃO EXISTE e não há equivalente hoje - só
-- bom_operacoes (tabela de ROTEIRO/cadastro, não de execução - já não
-- fazia sentido como alvo deste trigger), calendario_operacional_empresa
-- (já coberta no item 8.16) e 2 views (vw_of_fluxo_operacional,
-- vw_planejamento_compras_operacional - não recebem trigger de escrita).
-- O inventário desta migration fica com 19 triggers, não 20 - ver
-- DEC-007 §17.1 para o registro completo da correção. Se uma tabela de
-- execução de operações vier a existir numa fase futura, o trigger deve
-- ser adicionado então, não presumido aqui.

-- =====================================================================
-- 9. Funções e triggers de imutabilidade (DEC-007 §14)
-- =====================================================================

-- Marca transacional - "vigente" só muda dentro de uma RPC de aprovação
-- que setou explicitamente a marca ANTES do UPDATE, para o projeto exato
-- da linha - impede tanto UPDATE direto sem marca quanto reativação
-- (false→true) mesmo COM a marca presente.
create or replace function public.impedir_alteracao_vigente_sem_marca()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_marca text;
begin
  v_marca := current_setting('app.aprovacao_em_andamento_projeto_id', true);
  if v_marca is null or v_marca is distinct from old.projeto_id::text then
    raise exception 'Alteração de vigente só é permitida dentro da RPC de aprovação, para o projeto em andamento.';
  end if;
  if old.vigente = false and new.vigente = true then
    raise exception 'Reativação direta de snapshot antigo não é permitida, mesmo com a marca presente.';
  end if;
  return new;
end;
$function$;

comment on function public.impedir_alteracao_vigente_sem_marca() is
  'Exige que a RPC de aprovação (Fase 9) tenha chamado set_config(''app.aprovacao_em_andamento_projeto_id'', p_projeto_id::text, true) IMEDIATAMENTE ANTES do UPDATE que desativa o snapshot anterior - bloqueia qualquer alteração de vigente fora desse fluxo, e bloqueia reativação (false→true) mesmo com a marca presente (DEC-007 §14).';

revoke execute on function public.impedir_alteracao_vigente_sem_marca() from public, anon, authenticated;

drop trigger if exists simulacoes_comerciais_impedir_alteracao_vigente_sem_marca on public.simulacoes_comerciais;
create trigger simulacoes_comerciais_impedir_alteracao_vigente_sem_marca
  before update of vigente on public.simulacoes_comerciais
  for each row
  when (old.vigente is distinct from new.vigente)
  execute function public.impedir_alteracao_vigente_sem_marca();

-- Imutabilidade de conteúdo - comparação por to_jsonb do registro
-- INTEIRO (exceto vigente), cobre automaticamente QUALQUER coluna
-- presente na tabela, inclusive as adicionadas por esta própria migration
-- (ajuste_cenario, custo_adicional_total, estimativa_data_fim_real,
-- estimativa_folga_dias_civis) e qualquer coluna futura - nunca precisa
-- ser reeditada a cada campo novo (DEC-007 §14).
create or replace function public.impedir_alteracao_conteudo_snapshot()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if (to_jsonb(old) - 'vigente') is distinct from (to_jsonb(new) - 'vigente') then
    raise exception 'Conteúdo do snapshot aprovado é imutável - só vigente pode mudar, e só pela RPC de aprovação.';
  end if;
  return new;
end;
$function$;

comment on function public.impedir_alteracao_conteudo_snapshot() is
  'Compara o registro INTEIRO (to_jsonb, exceto vigente) - cobre automaticamente toda coluna presente na tabela, sem precisar ser reeditada a cada campo novo (DEC-007 §14). Roda em conjunto com o trigger de marca transacional acima.';

revoke execute on function public.impedir_alteracao_conteudo_snapshot() from public, anon, authenticated;

drop trigger if exists simulacoes_comerciais_impedir_alteracao_conteudo on public.simulacoes_comerciais;
create trigger simulacoes_comerciais_impedir_alteracao_conteudo
  before update on public.simulacoes_comerciais
  for each row
  execute function public.impedir_alteracao_conteudo_snapshot();

-- Append-only real nas 3 tabelas filhas do snapshot - rejeita QUALQUER
-- UPDATE/DELETE, sem exceção (confirmado por leitura: a RPC v4/v5 só faz
-- INSERT nelas hoje).
create or replace function public.impedir_alteracao_snapshot_filho()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  raise exception 'Tabela append-only - UPDATE/DELETE não permitidos em %.', tg_table_name;
end;
$function$;

comment on function public.impedir_alteracao_snapshot_filho() is
  'Rejeita qualquer UPDATE/DELETE nas tabelas filhas do snapshot (simulacao_comercial_itens, simulacao_comercial_item_distribuicoes, simulacao_comercial_item_distribuicao_dias) - append-only real, segunda linha de defesa independente da ACL (que já nega authenticated hoje, só service_role via RPC SECURITY DEFINER escreve).';

revoke execute on function public.impedir_alteracao_snapshot_filho() from public, anon, authenticated;

drop trigger if exists simulacao_comercial_itens_impedir_alteracao on public.simulacao_comercial_itens;
create trigger simulacao_comercial_itens_impedir_alteracao
  before update or delete on public.simulacao_comercial_itens
  for each row
  execute function public.impedir_alteracao_snapshot_filho();

drop trigger if exists simulacao_comercial_item_distribuicoes_impedir_alteracao on public.simulacao_comercial_item_distribuicoes;
create trigger simulacao_comercial_item_distribuicoes_impedir_alteracao
  before update or delete on public.simulacao_comercial_item_distribuicoes
  for each row
  execute function public.impedir_alteracao_snapshot_filho();

drop trigger if exists simulacao_comercial_item_distribuicao_dias_impedir_alteracao on public.simulacao_comercial_item_distribuicao_dias;
create trigger simulacao_comercial_item_distribuicao_dias_impedir_alteracao
  before update or delete on public.simulacao_comercial_item_distribuicao_dias
  for each row
  execute function public.impedir_alteracao_snapshot_filho();

-- =====================================================================
-- 9.1. Compatibilização da RPC aprovar_projeto_com_simulacao_v5 com o
--      trigger impedir_alteracao_vigente_sem_marca (seção 9 acima).
--
-- Problema: a v5 (202608030001), inalterada, insere o novo snapshot com
-- vigente=false e só depois faz UPDATE...SET vigente=true - uma
-- transição false→true que o novo trigger bloqueia INCONDICIONALMENTE,
-- mesmo com a marca presente. Sem esta correção, a primeira aprovação
-- via v5 após esta migration falharia.
--
-- Correção (CREATE OR REPLACE da mesma assinatura - aditiva, nenhuma
-- validação/mensagem/retorno existente foi alterado): trava por
-- projeto (pg_advisory_xact_lock, mesmo padrão de
-- 202608040001_bom_subconjunto_protecao_ciclo.sql) + nova checagem de
-- idempotência autoritativa SOB a trava (a checagem otimista original,
-- antes da validação de itens, permanece intacta como otimização) +
-- marca transacional + UPDATE de desativação do antigo ANTES do INSERT
-- do novo, que agora já nasce com vigente=true (elimina o UPDATE de
-- ativação separado que o trigger bloqueava).
-- =====================================================================

create or replace function public.aprovar_projeto_com_simulacao_v5(
  p_aprovado_por uuid,
  p_projeto_id uuid,
  p_cenario_demanda text,
  p_modo_producao text,
  p_data_necessidade date,
  p_margem_seguranca_dias integer,
  p_data_prevista_aprovacao_pedido date,
  p_data_chegada_prevista date,
  p_janela_inicio date,
  p_janela_fim date,
  p_estimativa_inicio_necessario date,
  p_estimativa_estado text,
  p_estimativa_metodo_versao smallint,
  p_folga_dias_produtivos integer,
  p_itens jsonb,
  p_chave_idempotencia text,
  p_hash_solicitacao text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_projeto_empresa_id uuid;
  v_snapshot_id uuid;
  v_hash_existente text;
  v_item jsonb;
  v_dist jsonb;
  v_bom_operacao_empresa_id uuid;
  v_recurso_original_empresa_id uuid;
  v_recurso_empresa_id uuid;
  v_recurso_key text;
  v_recursos_vistos_no_item text[];
  v_base_por_recurso jsonb := '{}'::jsonb;
  v_base_existente jsonb;
  v_saldo_esperado numeric;
  v_soma_alocada numeric;
  v_item_id uuid;
begin
  if p_aprovado_por is null then
    raise exception 'p_aprovado_por e obrigatorio - deve vir de auth.getUser() no servidor, nunca de parametro do navegador.';
  end if;

  if p_chave_idempotencia is null or btrim(p_chave_idempotencia) = '' then
    raise exception 'p_chave_idempotencia e obrigatoria.';
  end if;

  if p_hash_solicitacao is null or btrim(p_hash_solicitacao) = '' then
    raise exception 'p_hash_solicitacao e obrigatorio.';
  end if;

  if p_data_prevista_aprovacao_pedido is null then
    raise exception 'p_data_prevista_aprovacao_pedido e obrigatoria (PAD-008 v2.1 secao 17).';
  end if;

  if p_data_chegada_prevista is null then
    raise exception 'p_data_chegada_prevista e obrigatoria - deve vir do recalculo autoritativo no servidor.';
  end if;

  if p_janela_inicio is null or p_janela_fim is null then
    raise exception 'p_janela_inicio e p_janela_fim sao obrigatorios.';
  end if;

  if p_janela_fim < p_janela_inicio then
    raise exception 'p_janela_fim (%) nao pode ser anterior a p_janela_inicio (%).', p_janela_fim, p_janela_inicio;
  end if;

  -- ===== NOVO NA V5: obrigatoriedade e coerencia da estimativa =====
  if p_estimativa_estado is null or btrim(p_estimativa_estado) = '' then
    raise exception 'p_estimativa_estado e obrigatorio - a aprovacao via v5 exige uma Estimativa de Inicio Necessario ja calculada (estados tecnicos dados_insuficientes/horizonte_tecnico_excedido bloqueiam a aprovacao antes do cliente chegar aqui).';
  end if;

  if p_estimativa_estado not in ('viavel', 'viavel_no_limite', 'janela_insuficiente') then
    raise exception 'p_estimativa_estado invalido (%) - esperado viavel, viavel_no_limite ou janela_insuficiente (dados_insuficientes/horizonte_tecnico_excedido nunca sao persistidos).', p_estimativa_estado;
  end if;

  if p_estimativa_inicio_necessario is null then
    raise exception 'p_estimativa_inicio_necessario e obrigatorio.';
  end if;

  -- Esta versao da RPC (v5) so reconhece a versao 1 do metodo de
  -- calculo - diferente da COLUNA (estimativa_metodo_versao > 0 no
  -- CHECK), que fica aberta para versoes futuras do metodo sem exigir
  -- nova migration a cada evolucao do algoritmo. Cada versao da RPC so
  -- aceita a versao do metodo que ela propria implementa - uma v6
  -- futura, se o algoritmo mudar, aceitaria 2, nunca 1 nem qualquer
  -- positivo.
  if p_estimativa_metodo_versao is null or p_estimativa_metodo_versao <> 1 then
    raise exception 'p_estimativa_metodo_versao invalido (%) - esta versao da RPC (v5) so reconhece a versao 1 do metodo de calculo (ESTIMATIVA_METODO_VERSAO em estimarInicioNecessario.ts).', p_estimativa_metodo_versao;
  end if;

  if p_folga_dias_produtivos is null then
    raise exception 'p_folga_dias_produtivos e obrigatorio.';
  end if;

  -- D* nunca pode ser posterior ao Prazo Interno - a busca binaria
  -- (buscarMaiorIndiceViavel) so escolhe indices dentro de P, que e
  -- limitada a [floorDate, prazoInterno]; um p_estimativa_inicio_necessario
  -- > p_janela_fim so pode vir de um cliente adulterado ou de um bug -
  -- rejeitado aqui, antes de chegar perto do CHECK da tabela.
  if p_estimativa_inicio_necessario > p_janela_fim then
    raise exception 'p_estimativa_inicio_necessario (%) nao pode ser posterior a p_janela_fim/Prazo Interno (%).', p_estimativa_inicio_necessario, p_janela_fim;
  end if;

  if p_estimativa_estado = 'viavel'
     and (p_folga_dias_produtivos <= 0 or p_janela_inicio >= p_estimativa_inicio_necessario) then
    raise exception 'Inconsistencia em viavel: p_folga_dias_produtivos=%, p_janela_inicio=%, p_estimativa_inicio_necessario=% - exige folga > 0 e janela_inicio < estimativa.', p_folga_dias_produtivos, p_janela_inicio, p_estimativa_inicio_necessario;
  end if;

  if p_estimativa_estado = 'viavel_no_limite'
     and (p_folga_dias_produtivos <> 0 or p_janela_inicio <> p_estimativa_inicio_necessario) then
    raise exception 'Inconsistencia em viavel_no_limite: p_folga_dias_produtivos=%, p_janela_inicio=%, p_estimativa_inicio_necessario=% - exige folga = 0 e janela_inicio = estimativa.', p_folga_dias_produtivos, p_janela_inicio, p_estimativa_inicio_necessario;
  end if;

  if p_estimativa_estado = 'janela_insuficiente'
     and (p_folga_dias_produtivos >= 0 or p_janela_inicio <= p_estimativa_inicio_necessario) then
    raise exception 'Inconsistencia em janela_insuficiente: p_folga_dias_produtivos=%, p_janela_inicio=%, p_estimativa_inicio_necessario=% - exige folga < 0 e janela_inicio > estimativa.', p_folga_dias_produtivos, p_janela_inicio, p_estimativa_inicio_necessario;
  end if;
  -- ===== FIM NOVO NA V5 =====

  select empresa_id into v_empresa_id
  from public.usuarios
  where id = p_aprovado_por;

  if v_empresa_id is null then
    raise exception 'Usuario aprovador % nao encontrado em public.usuarios.', p_aprovado_por;
  end if;

  -- Checagem antecipada de idempotencia - so' otimizacao (evita rodar a
  -- validacao pesada de itens abaixo para uma repeticao obvia), a
  -- protecao real esta na re-checagem sob a trava, logo antes do
  -- UPDATE/INSERT que tocam vigente.
  select id, hash_solicitacao into v_snapshot_id, v_hash_existente
  from public.simulacoes_comerciais
  where empresa_id = v_empresa_id
    and chave_idempotencia = p_chave_idempotencia;

  if v_snapshot_id is not null then
    if v_hash_existente is distinct from p_hash_solicitacao then
      raise exception 'Conflito de idempotencia: chave % ja foi usada para uma solicitacao com conteudo diferente.', p_chave_idempotencia;
    end if;

    return v_snapshot_id;
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'p_itens nao pode ser vazio - uma simulacao sem nenhum recurso nao e valida.';
  end if;

  select empresa_id into v_projeto_empresa_id
  from public.projetos
  where id = p_projeto_id;

  if v_projeto_empresa_id is null then
    raise exception 'Projeto % nao encontrado.', p_projeto_id;
  end if;

  if v_projeto_empresa_id is distinct from v_empresa_id then
    raise exception 'Projeto % nao pertence a empresa do aprovador.', p_projeto_id;
  end if;

  -- =========================================================
  -- Validacao por item + cadeia matematica completa das distribuicoes.
  -- v_base_por_recurso acumula, POR RECURSO, a base de calculo (bruta,
  -- produtividade, efetiva, comprometido inicial, disponivel inicial) e
  -- o saldo corrente - unico para a simulacao INTEIRA, nao reiniciado
  -- por item, espelhando o capacidadeRemanescente compartilhado do
  -- nucleo TypeScript.
  -- =========================================================
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    if not (v_item ? 'bom_operacao_id') or not (v_item ? 'recurso_original_id')
       or not (v_item ? 'necessario') or not (v_item ? 'deficit') or not (v_item ? 'distribuicoes') then
      raise exception 'Item de simulacao incompleto - bom_operacao_id, recurso_original_id, necessario, deficit e distribuicoes sao obrigatorios: %', v_item;
    end if;

    select empresa_id into v_bom_operacao_empresa_id
    from public.bom_operacoes
    where id = (nullif(v_item->>'bom_operacao_id', ''))::uuid;

    if v_bom_operacao_empresa_id is null then
      raise exception 'Operacao de roteiro % nao encontrada.', v_item->>'bom_operacao_id';
    end if;

    if v_bom_operacao_empresa_id <> v_empresa_id then
      raise exception 'Operacao de roteiro % nao pertence a empresa do aprovador.', v_item->>'bom_operacao_id';
    end if;

    select empresa_id into v_recurso_original_empresa_id
    from public.recursos_produtivos
    where id = (nullif(v_item->>'recurso_original_id', ''))::uuid;

    if v_recurso_original_empresa_id is null then
      raise exception 'Recurso original % nao encontrado.', v_item->>'recurso_original_id';
    end if;

    if v_recurso_original_empresa_id <> v_empresa_id then
      raise exception 'Recurso original % nao pertence a empresa do aprovador.', v_item->>'recurso_original_id';
    end if;

    if (nullif(v_item->>'necessario', ''))::numeric < 0 or (nullif(v_item->>'deficit', ''))::numeric < 0 then
      raise exception 'Item de simulacao com necessario/deficit negativo na operacao %: %', v_item->>'bom_operacao_id', v_item;
    end if;

    if (nullif(v_item->>'deficit', ''))::numeric > (nullif(v_item->>'necessario', ''))::numeric then
      raise exception 'deficit maior que necessario na operacao %: %', v_item->>'bom_operacao_id', v_item;
    end if;

    if jsonb_typeof(v_item->'distribuicoes') <> 'array' then
      raise exception 'distribuicoes precisa ser um array na operacao %.', v_item->>'bom_operacao_id';
    end if;

    v_soma_alocada := 0;
    v_recursos_vistos_no_item := array[]::text[];

    for v_dist in select * from jsonb_array_elements(v_item->'distribuicoes')
    loop
      if not (v_dist ? 'recurso_id') or not (v_dist ? 'origem')
         or not (v_dist ? 'capacidade_bruta_periodo') or not (v_dist ? 'produtividade_considerada')
         or not (v_dist ? 'capacidade_efetiva') or not (v_dist ? 'comprometido_inicial')
         or not (v_dist ? 'capacidade_disponivel_inicial') or not (v_dist ? 'capacidade_disponivel_antes')
         or not (v_dist ? 'horas_padrao_alocadas') or not (v_dist ? 'horas_maquina_estimadas')
         or not (v_dist ? 'capacidade_disponivel_depois') then
        raise exception 'Distribuicao incompleta na operacao %: %', v_item->>'bom_operacao_id', v_dist;
      end if;

      v_recurso_key := v_dist->>'recurso_id';

      if v_recurso_key = any(v_recursos_vistos_no_item) then
        raise exception 'Recurso % duplicado entre as distribuicoes da operacao % - corrupcao de dado.', v_recurso_key, v_item->>'bom_operacao_id';
      end if;
      v_recursos_vistos_no_item := array_append(v_recursos_vistos_no_item, v_recurso_key);

      if (v_dist->>'origem') not in ('ORIGINAL', 'COMPATIBILIDADE') then
        raise exception 'origem invalida (%) na distribuicao do recurso % - esperado ORIGINAL ou COMPATIBILIDADE.', v_dist->>'origem', v_recurso_key;
      end if;

      -- ordem_consideracao: 0 exatamente para ORIGINAL, > 0 exatamente
      -- para COMPATIBILIDADE (prioridade cadastrada, sempre > 0 por
      -- recurso_produtivo_compatibilidades_prioridade_check).
      if v_dist->>'origem' = 'ORIGINAL' and (nullif(v_dist->>'ordem_consideracao', ''))::integer <> 0 then
        raise exception 'ordem_consideracao precisa ser 0 para origem ORIGINAL no recurso %.', v_recurso_key;
      end if;

      if v_dist->>'origem' = 'COMPATIBILIDADE' and (nullif(v_dist->>'ordem_consideracao', ''))::integer <= 0 then
        raise exception 'ordem_consideracao precisa ser > 0 para origem COMPATIBILIDADE no recurso %.', v_recurso_key;
      end if;

      select empresa_id into v_recurso_empresa_id
      from public.recursos_produtivos
      where id = (nullif(v_recurso_key, ''))::uuid;

      if v_recurso_empresa_id is null then
        raise exception 'Recurso % nao encontrado.', v_recurso_key;
      end if;

      if v_recurso_empresa_id <> v_empresa_id then
        raise exception 'Recurso % nao pertence a empresa do aprovador.', v_recurso_key;
      end if;

      if (nullif(v_dist->>'produtividade_considerada', ''))::numeric <= 0
         or (nullif(v_dist->>'produtividade_considerada', ''))::numeric > 1 then
        raise exception 'produtividade_considerada fora da faixa (0,1] para o recurso % - mesma faixa do cadastro (recursos_produtivos.produtividade).', v_recurso_key;
      end if;

      if (nullif(v_dist->>'horas_padrao_alocadas', ''))::numeric <= 0 then
        raise exception 'horas_padrao_alocadas precisa ser positiva para o recurso %.', v_recurso_key;
      end if;

      if (nullif(v_dist->>'capacidade_bruta_periodo', ''))::numeric < 0
         or (nullif(v_dist->>'capacidade_efetiva', ''))::numeric < 0
         or (nullif(v_dist->>'comprometido_inicial', ''))::numeric < 0
         or (nullif(v_dist->>'capacidade_disponivel_inicial', ''))::numeric < 0
         or (nullif(v_dist->>'capacidade_disponivel_antes', ''))::numeric < 0
         or (nullif(v_dist->>'capacidade_disponivel_depois', ''))::numeric < 0 then
        raise exception 'Distribuicao do recurso % com valor negativo.', v_recurso_key;
      end if;

      -- capacidade efetiva = bruta x produtividade
      if abs((v_dist->>'capacidade_efetiva')::numeric
           - (v_dist->>'capacidade_bruta_periodo')::numeric * (v_dist->>'produtividade_considerada')::numeric) > 0.000001 then
        raise exception 'capacidade_efetiva incoerente com capacidade_bruta_periodo x produtividade para o recurso %.', v_recurso_key;
      end if;

      -- capacidade disponivel inicial = max(0, efetiva - comprometido)
      if abs((v_dist->>'capacidade_disponivel_inicial')::numeric
           - greatest(0, (v_dist->>'capacidade_efetiva')::numeric - (v_dist->>'comprometido_inicial')::numeric)) > 0.000001 then
        raise exception 'capacidade_disponivel_inicial incoerente para o recurso %.', v_recurso_key;
      end if;

      if v_base_por_recurso ? v_recurso_key then
        v_base_existente := v_base_por_recurso -> v_recurso_key;

        -- 2a+ aparicao do MESMO recurso nesta simulacao: a base inteira
        -- (nao so o saldo) precisa ser identica a 1a aparicao - senao
        -- o snapshot fica contraditorio (mesmo recurso, mesmo periodo,
        -- "capacidades" diferentes em linhas diferentes).
        if abs((v_dist->>'capacidade_bruta_periodo')::numeric - (v_base_existente->>'capacidade_bruta_periodo')::numeric) > 0.000001
        or abs((v_dist->>'produtividade_considerada')::numeric - (v_base_existente->>'produtividade_considerada')::numeric) > 0.000001
        or abs((v_dist->>'capacidade_efetiva')::numeric - (v_base_existente->>'capacidade_efetiva')::numeric) > 0.000001
        or abs((v_dist->>'comprometido_inicial')::numeric - (v_base_existente->>'comprometido_inicial')::numeric) > 0.000001
        or abs((v_dist->>'capacidade_disponivel_inicial')::numeric - (v_base_existente->>'capacidade_disponivel_inicial')::numeric) > 0.000001
        then
          raise exception
            'Base de calculo do recurso % mudou entre alocacoes da mesma simulacao - capacidade bruta/produtividade/efetiva/comprometido/disponivel inicial devem ser identicos toda vez que o mesmo recurso aparece.',
            v_recurso_key;
        end if;

        v_saldo_esperado := (v_base_existente->>'saldo_atual')::numeric;
      else
        v_saldo_esperado := (v_dist->>'capacidade_disponivel_inicial')::numeric;
      end if;

      if abs((v_dist->>'capacidade_disponivel_antes')::numeric - v_saldo_esperado) > 0.000001 then
        raise exception
          'capacidade_disponivel_antes nao bate com o saldo acumulado do recurso % - capacidade artificial entre operacoes.',
          v_recurso_key;
      end if;

      if abs((v_dist->>'capacidade_disponivel_depois')::numeric
           - ((v_dist->>'capacidade_disponivel_antes')::numeric - (v_dist->>'horas_padrao_alocadas')::numeric)) > 0.000001 then
        raise exception 'Saldo apos alocacao incoerente para o recurso %.', v_recurso_key;
      end if;

      if abs((v_dist->>'horas_maquina_estimadas')::numeric
           - ((v_dist->>'horas_padrao_alocadas')::numeric / (v_dist->>'produtividade_considerada')::numeric)) > 0.000001 then
        raise exception 'Horas de maquina incoerentes para o recurso %.', v_recurso_key;
      end if;

      v_base_por_recurso := jsonb_set(
        v_base_por_recurso, array[v_recurso_key],
        jsonb_build_object(
          'capacidade_bruta_periodo', (v_dist->>'capacidade_bruta_periodo')::numeric,
          'produtividade_considerada', (v_dist->>'produtividade_considerada')::numeric,
          'capacidade_efetiva', (v_dist->>'capacidade_efetiva')::numeric,
          'comprometido_inicial', (v_dist->>'comprometido_inicial')::numeric,
          'capacidade_disponivel_inicial', (v_dist->>'capacidade_disponivel_inicial')::numeric,
          'saldo_atual', (v_dist->>'capacidade_disponivel_depois')::numeric
        )
      );

      v_soma_alocada := v_soma_alocada + (v_dist->>'horas_padrao_alocadas')::numeric;
    end loop;

    if abs(v_soma_alocada + (v_item->>'deficit')::numeric - (v_item->>'necessario')::numeric) > 0.000001 then
      raise exception 'Soma das distribuicoes + deficit diferente de necessario para a operacao %.', v_item->>'bom_operacao_id';
    end if;
  end loop;

  -- =========================================================
  -- FASE 6: trava por projeto (serializa aprovações concorrentes do
  -- MESMO projeto - mesmo padrão de
  -- 202608040001_bom_subconjunto_protecao_ciclo.sql) + re-checagem de
  -- idempotência AUTORITATIVA sob a trava + marca transacional + troca
  -- do vigente ANTES do insert do novo snapshot, que já nasce
  -- vigente=true.
  --
  -- Por quê nesta ordem: o trigger impedir_alteracao_vigente_sem_marca
  -- (seção 9) exige a marca antes de qualquer UPDATE de vigente e
  -- bloqueia INCONDICIONALMENTE toda transição false→true, mesmo com a
  -- marca presente - por isso o novo snapshot precisa nascer com
  -- vigente=true diretamente, nunca mais via UPDATE de ativação
  -- separado. E por quê a re-checagem sob a trava: sem ela, duas
  -- chamadas concorrentes com a MESMA chave_idempotencia poderiam
  -- ambas passar pela checagem otimista antes de qualquer uma
  -- confirmar - a segunda, ao adquirir a trava depois que a primeira
  -- já comitou, desativaria por engano o snapshot que a primeira
  -- acabou de ativar. Com a re-checagem, uma repetição (idêntica ou
  -- conflitante) é detectada e tratada SEM nenhuma escrita em vigente.
  -- =========================================================
  perform pg_advisory_xact_lock(hashtextextended('simulacoes_comerciais_aprovacao:' || p_projeto_id::text, 0));

  select id, hash_solicitacao into v_snapshot_id, v_hash_existente
  from public.simulacoes_comerciais
  where empresa_id = v_empresa_id
    and chave_idempotencia = p_chave_idempotencia;

  if v_snapshot_id is not null then
    if v_hash_existente is distinct from p_hash_solicitacao then
      raise exception 'Conflito de idempotencia: chave % ja foi usada para uma solicitacao com conteudo diferente.', p_chave_idempotencia;
    end if;

    return v_snapshot_id;
  end if;

  perform set_config('app.aprovacao_em_andamento_projeto_id', p_projeto_id::text, true);

  update public.simulacoes_comerciais
  set vigente = false
  where projeto_id = p_projeto_id
    and vigente = true;

  -- =========================================================
  -- Insercao atomica com tratamento de conflito - mesma logica da v4,
  -- com os 4 campos novos de estimativa incluidos. NA FASE 6: vigente
  -- gravado como true diretamente (o antigo ja foi desativado acima,
  -- sob a trava) - nao ha mais UPDATE de ativacao subsequente. O
  -- ON CONFLICT permanece como defesa em profundidade, ainda que sob a
  -- trava + re-checagem acima ele normalmente nao deva mais ser
  -- alcancado.
  -- =========================================================
  insert into public.simulacoes_comerciais (
    empresa_id, projeto_id, cenario_demanda, modo_producao, data_necessidade,
    margem_seguranca_dias, data_prevista_aprovacao_pedido, data_chegada_prevista,
    janela_inicio, janela_fim,
    estimativa_inicio_necessario, estimativa_estado, estimativa_metodo_versao, folga_dias_produtivos,
    aprovado_por,
    chave_idempotencia, hash_solicitacao, vigente
  )
  values (
    v_empresa_id, p_projeto_id, p_cenario_demanda, p_modo_producao, p_data_necessidade,
    p_margem_seguranca_dias, p_data_prevista_aprovacao_pedido, p_data_chegada_prevista,
    p_janela_inicio, p_janela_fim,
    p_estimativa_inicio_necessario, p_estimativa_estado, p_estimativa_metodo_versao, p_folga_dias_produtivos,
    p_aprovado_por,
    p_chave_idempotencia, p_hash_solicitacao, true
  )
  on conflict (empresa_id, chave_idempotencia) where chave_idempotencia is not null
  do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is null then
    select id, hash_solicitacao into v_snapshot_id, v_hash_existente
    from public.simulacoes_comerciais
    where empresa_id = v_empresa_id
      and chave_idempotencia = p_chave_idempotencia;

    if v_snapshot_id is null then
      raise exception 'Falha ao localizar snapshot apos conflito de insercao para chave %.', p_chave_idempotencia;
    end if;

    if v_hash_existente is distinct from p_hash_solicitacao then
      raise exception 'Conflito de idempotencia: chave % ja foi usada para uma solicitacao com conteudo diferente.', p_chave_idempotencia;
    end if;

    return v_snapshot_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    insert into public.simulacao_comercial_itens (
      empresa_id, simulacao_comercial_id, versao_resultado_motor,
      bom_operacao_id, recurso_original_id,
      necessario, deficit
    )
    values (
      v_empresa_id, v_snapshot_id, 2,
      (nullif(v_item->>'bom_operacao_id', ''))::uuid,
      (nullif(v_item->>'recurso_original_id', ''))::uuid,
      (nullif(v_item->>'necessario', ''))::numeric,
      (nullif(v_item->>'deficit', ''))::numeric
    )
    returning id into v_item_id;

    for v_dist in select * from jsonb_array_elements(v_item->'distribuicoes')
    loop
      insert into public.simulacao_comercial_item_distribuicoes (
        empresa_id, simulacao_comercial_item_id, recurso_id, ordem_consideracao, origem,
        capacidade_bruta_periodo, produtividade_considerada, capacidade_efetiva,
        comprometido_inicial, capacidade_disponivel_inicial,
        capacidade_disponivel_antes, horas_padrao_alocadas, horas_maquina_estimadas,
        capacidade_disponivel_depois
      )
      values (
        v_empresa_id, v_item_id, (nullif(v_dist->>'recurso_id', ''))::uuid,
        (nullif(v_dist->>'ordem_consideracao', ''))::integer,
        v_dist->>'origem',
        (nullif(v_dist->>'capacidade_bruta_periodo', ''))::numeric,
        (nullif(v_dist->>'produtividade_considerada', ''))::numeric,
        (nullif(v_dist->>'capacidade_efetiva', ''))::numeric,
        (nullif(v_dist->>'comprometido_inicial', ''))::numeric,
        (nullif(v_dist->>'capacidade_disponivel_inicial', ''))::numeric,
        (nullif(v_dist->>'capacidade_disponivel_antes', ''))::numeric,
        (nullif(v_dist->>'horas_padrao_alocadas', ''))::numeric,
        (nullif(v_dist->>'horas_maquina_estimadas', ''))::numeric,
        (nullif(v_dist->>'capacidade_disponivel_depois', ''))::numeric
      );
    end loop;
  end loop;

  perform set_config('app.aprovacao_via_function', 'true', true);

  update public.projetos
  set status = 'aprovado'
  where id = p_projeto_id;

  return v_snapshot_id;
end;
$function$;

comment on function public.aprovar_projeto_com_simulacao_v5(uuid, uuid, text, text, date, integer, date, date, date, date, date, text, smallint, integer, jsonb, text, text) is
  'Versao 5 da aprovacao da Simulacao Comercial (PAD-008 v2.1, secao 20 - Calculador Reverso) - so chamavel por service_role. Aditiva sobre a v4, que permanece intacta como caminho de rollback. Acrescenta a Estimativa de Inicio Necessario ao snapshot (estimativa_inicio_necessario, estimativa_estado, estimativa_metodo_versao, folga_dias_produtivos) - so os 3 estados comerciais persistiveis (viavel, viavel_no_limite, janela_insuficiente); dados_insuficientes e horizonte_tecnico_excedido bloqueiam a aprovacao antes de chegar aqui e sao rejeitados explicitamente se, por algum bug, chegarem mesmo assim. Esta versao da RPC so aceita estimativa_metodo_versao = 1 (a coluna aceita qualquer valor positivo, para versoes futuras do metodo nao exigirem nova migration de schema, mas cada versao da RPC so reconhece a versao que ela propria implementa). Valida tambem que estimativa_inicio_necessario nunca e posterior a p_janela_fim (Prazo Interno) - a busca binaria de origem (buscarMaiorIndiceViavel) e limitada a P, que nunca ultrapassa o Prazo Interno. Mesma validacao/idempotencia/atomicidade da v4 para tudo o mais. FASE 6: passa a travar por projeto (pg_advisory_xact_lock) e a inserir o novo snapshot ja com vigente=true (nunca mais via UPDATE de ativacao separado), para ser compativel com impedir_alteracao_vigente_sem_marca - nenhuma validacao, mensagem de erro, retorno ou garantia de idempotencia pre-existente foi alterada. Nao recalcula os valores recebidos a partir de cadastros atuais - responsabilidade de quem chama (Server Action, que recalcula tudo no servidor antes de chamar).';

revoke execute on function public.aprovar_projeto_com_simulacao_v5(uuid, uuid, text, text, date, integer, date, date, date, date, date, text, smallint, integer, jsonb, text, text) from public;
revoke execute on function public.aprovar_projeto_com_simulacao_v5(uuid, uuid, text, text, date, integer, date, date, date, date, date, text, smallint, integer, jsonb, text, text) from anon;
revoke execute on function public.aprovar_projeto_com_simulacao_v5(uuid, uuid, text, text, date, integer, date, date, date, date, date, text, smallint, integer, jsonb, text, text) from authenticated;
grant execute on function public.aprovar_projeto_com_simulacao_v5(uuid, uuid, text, text, date, integer, date, date, date, date, date, text, smallint, integer, jsonb, text, text) to service_role;

-- =====================================================================
-- 9.2. Compatibilização da RPC aprovar_projeto_com_simulacao_v4
--      (caminho de ROLLBACK, ver comentário da v5 acima: "Aditiva sobre
--      a v4, que permanece intacta como caminho de rollback") com o
--      mesmo trigger impedir_alteracao_vigente_sem_marca.
--
-- Mesmo problema da v5 (seção 9.1): a v4, inalterada, insere o snapshot
-- com vigente=false e só depois faz UPDATE...SET vigente=true - a
-- transição que o trigger bloqueia incondicionalmente. Se a v4 fosse
-- realmente usada como rollback sem esta correção, a primeira aprovação
-- via v4 após esta migration falharia, tornando o "caminho de rollback"
-- documentado inutilizável exatamente quando mais precisaria funcionar.
--
-- Correção idêntica em espírito à da v5 (CREATE OR REPLACE da mesma
-- assinatura de 13 parâmetros - a v4 nunca teve os 4 campos de
-- estimativa da v5 - nenhuma validação/mensagem/retorno/idempotência
-- pré-existente alterada): trava por projeto + re-checagem de
-- idempotência sob a trava + marca transacional + desativação do
-- antigo ANTES do insert do novo, que já nasce vigente=true.
-- =====================================================================

create or replace function public.aprovar_projeto_com_simulacao_v4(
  p_aprovado_por uuid,
  p_projeto_id uuid,
  p_cenario_demanda text,
  p_modo_producao text,
  p_data_necessidade date,
  p_margem_seguranca_dias integer,
  p_data_prevista_aprovacao_pedido date,
  p_data_chegada_prevista date,
  p_janela_inicio date,
  p_janela_fim date,
  p_itens jsonb,
  p_chave_idempotencia text,
  p_hash_solicitacao text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_projeto_empresa_id uuid;
  v_snapshot_id uuid;
  v_hash_existente text;
  v_item jsonb;
  v_dist jsonb;
  v_bom_operacao_empresa_id uuid;
  v_recurso_original_empresa_id uuid;
  v_recurso_empresa_id uuid;
  v_recurso_key text;
  v_recursos_vistos_no_item text[];
  v_base_por_recurso jsonb := '{}'::jsonb;
  v_base_existente jsonb;
  v_saldo_esperado numeric;
  v_soma_alocada numeric;
  v_item_id uuid;
begin
  if p_aprovado_por is null then
    raise exception 'p_aprovado_por e obrigatorio - deve vir de auth.getUser() no servidor, nunca de parametro do navegador.';
  end if;

  if p_chave_idempotencia is null or btrim(p_chave_idempotencia) = '' then
    raise exception 'p_chave_idempotencia e obrigatoria.';
  end if;

  if p_hash_solicitacao is null or btrim(p_hash_solicitacao) = '' then
    raise exception 'p_hash_solicitacao e obrigatorio.';
  end if;

  if p_data_prevista_aprovacao_pedido is null then
    raise exception 'p_data_prevista_aprovacao_pedido e obrigatoria (PAD-008 v2.0 secao 17).';
  end if;

  if p_data_chegada_prevista is null then
    raise exception 'p_data_chegada_prevista e obrigatoria - deve vir do recalculo autoritativo no servidor.';
  end if;

  if p_janela_inicio is null or p_janela_fim is null then
    raise exception 'p_janela_inicio e p_janela_fim sao obrigatorios.';
  end if;

  if p_janela_fim < p_janela_inicio then
    raise exception 'p_janela_fim (%) nao pode ser anterior a p_janela_inicio (%).', p_janela_fim, p_janela_inicio;
  end if;

  select empresa_id into v_empresa_id
  from public.usuarios
  where id = p_aprovado_por;

  if v_empresa_id is null then
    raise exception 'Usuario aprovador % nao encontrado em public.usuarios.', p_aprovado_por;
  end if;

  -- Checagem antecipada de idempotencia - so' otimizacao (evita rodar a
  -- validacao pesada de itens abaixo para uma repeticao obvia), a
  -- protecao real esta na re-checagem sob a trava, logo antes do
  -- UPDATE/INSERT que tocam vigente.
  select id, hash_solicitacao into v_snapshot_id, v_hash_existente
  from public.simulacoes_comerciais
  where empresa_id = v_empresa_id
    and chave_idempotencia = p_chave_idempotencia;

  if v_snapshot_id is not null then
    if v_hash_existente is distinct from p_hash_solicitacao then
      raise exception 'Conflito de idempotencia: chave % ja foi usada para uma solicitacao com conteudo diferente.', p_chave_idempotencia;
    end if;

    return v_snapshot_id;
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'p_itens nao pode ser vazio - uma simulacao sem nenhum recurso nao e valida.';
  end if;

  select empresa_id into v_projeto_empresa_id
  from public.projetos
  where id = p_projeto_id;

  if v_projeto_empresa_id is null then
    raise exception 'Projeto % nao encontrado.', p_projeto_id;
  end if;

  if v_projeto_empresa_id is distinct from v_empresa_id then
    raise exception 'Projeto % nao pertence a empresa do aprovador.', p_projeto_id;
  end if;

  -- =========================================================
  -- Validacao por item + cadeia matematica completa das distribuicoes.
  -- v_base_por_recurso acumula, POR RECURSO, a base de calculo (bruta,
  -- produtividade, efetiva, comprometido inicial, disponivel inicial) e
  -- o saldo corrente - unico para a simulacao INTEIRA, nao reiniciado
  -- por item, espelhando o capacidadeRemanescente compartilhado do
  -- nucleo TypeScript.
  -- =========================================================
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    if not (v_item ? 'bom_operacao_id') or not (v_item ? 'recurso_original_id')
       or not (v_item ? 'necessario') or not (v_item ? 'deficit') or not (v_item ? 'distribuicoes') then
      raise exception 'Item de simulacao incompleto - bom_operacao_id, recurso_original_id, necessario, deficit e distribuicoes sao obrigatorios: %', v_item;
    end if;

    select empresa_id into v_bom_operacao_empresa_id
    from public.bom_operacoes
    where id = (nullif(v_item->>'bom_operacao_id', ''))::uuid;

    if v_bom_operacao_empresa_id is null then
      raise exception 'Operacao de roteiro % nao encontrada.', v_item->>'bom_operacao_id';
    end if;

    if v_bom_operacao_empresa_id <> v_empresa_id then
      raise exception 'Operacao de roteiro % nao pertence a empresa do aprovador.', v_item->>'bom_operacao_id';
    end if;

    select empresa_id into v_recurso_original_empresa_id
    from public.recursos_produtivos
    where id = (nullif(v_item->>'recurso_original_id', ''))::uuid;

    if v_recurso_original_empresa_id is null then
      raise exception 'Recurso original % nao encontrado.', v_item->>'recurso_original_id';
    end if;

    if v_recurso_original_empresa_id <> v_empresa_id then
      raise exception 'Recurso original % nao pertence a empresa do aprovador.', v_item->>'recurso_original_id';
    end if;

    if (nullif(v_item->>'necessario', ''))::numeric < 0 or (nullif(v_item->>'deficit', ''))::numeric < 0 then
      raise exception 'Item de simulacao com necessario/deficit negativo na operacao %: %', v_item->>'bom_operacao_id', v_item;
    end if;

    if (nullif(v_item->>'deficit', ''))::numeric > (nullif(v_item->>'necessario', ''))::numeric then
      raise exception 'deficit maior que necessario na operacao %: %', v_item->>'bom_operacao_id', v_item;
    end if;

    if jsonb_typeof(v_item->'distribuicoes') <> 'array' then
      raise exception 'distribuicoes precisa ser um array na operacao %.', v_item->>'bom_operacao_id';
    end if;

    v_soma_alocada := 0;
    v_recursos_vistos_no_item := array[]::text[];

    for v_dist in select * from jsonb_array_elements(v_item->'distribuicoes')
    loop
      if not (v_dist ? 'recurso_id') or not (v_dist ? 'origem')
         or not (v_dist ? 'capacidade_bruta_periodo') or not (v_dist ? 'produtividade_considerada')
         or not (v_dist ? 'capacidade_efetiva') or not (v_dist ? 'comprometido_inicial')
         or not (v_dist ? 'capacidade_disponivel_inicial') or not (v_dist ? 'capacidade_disponivel_antes')
         or not (v_dist ? 'horas_padrao_alocadas') or not (v_dist ? 'horas_maquina_estimadas')
         or not (v_dist ? 'capacidade_disponivel_depois') then
        raise exception 'Distribuicao incompleta na operacao %: %', v_item->>'bom_operacao_id', v_dist;
      end if;

      v_recurso_key := v_dist->>'recurso_id';

      if v_recurso_key = any(v_recursos_vistos_no_item) then
        raise exception 'Recurso % duplicado entre as distribuicoes da operacao % - corrupcao de dado.', v_recurso_key, v_item->>'bom_operacao_id';
      end if;
      v_recursos_vistos_no_item := array_append(v_recursos_vistos_no_item, v_recurso_key);

      if (v_dist->>'origem') not in ('ORIGINAL', 'COMPATIBILIDADE') then
        raise exception 'origem invalida (%) na distribuicao do recurso % - esperado ORIGINAL ou COMPATIBILIDADE.', v_dist->>'origem', v_recurso_key;
      end if;

      -- ordem_consideracao: 0 exatamente para ORIGINAL, > 0 exatamente
      -- para COMPATIBILIDADE (prioridade cadastrada, sempre > 0 por
      -- recurso_produtivo_compatibilidades_prioridade_check).
      if v_dist->>'origem' = 'ORIGINAL' and (nullif(v_dist->>'ordem_consideracao', ''))::integer <> 0 then
        raise exception 'ordem_consideracao precisa ser 0 para origem ORIGINAL no recurso %.', v_recurso_key;
      end if;

      if v_dist->>'origem' = 'COMPATIBILIDADE' and (nullif(v_dist->>'ordem_consideracao', ''))::integer <= 0 then
        raise exception 'ordem_consideracao precisa ser > 0 para origem COMPATIBILIDADE no recurso %.', v_recurso_key;
      end if;

      select empresa_id into v_recurso_empresa_id
      from public.recursos_produtivos
      where id = (nullif(v_recurso_key, ''))::uuid;

      if v_recurso_empresa_id is null then
        raise exception 'Recurso % nao encontrado.', v_recurso_key;
      end if;

      if v_recurso_empresa_id <> v_empresa_id then
        raise exception 'Recurso % nao pertence a empresa do aprovador.', v_recurso_key;
      end if;

      if (nullif(v_dist->>'produtividade_considerada', ''))::numeric <= 0
         or (nullif(v_dist->>'produtividade_considerada', ''))::numeric > 1 then
        raise exception 'produtividade_considerada fora da faixa (0,1] para o recurso % - mesma faixa do cadastro (recursos_produtivos.produtividade).', v_recurso_key;
      end if;

      if (nullif(v_dist->>'horas_padrao_alocadas', ''))::numeric <= 0 then
        raise exception 'horas_padrao_alocadas precisa ser positiva para o recurso %.', v_recurso_key;
      end if;

      if (nullif(v_dist->>'capacidade_bruta_periodo', ''))::numeric < 0
         or (nullif(v_dist->>'capacidade_efetiva', ''))::numeric < 0
         or (nullif(v_dist->>'comprometido_inicial', ''))::numeric < 0
         or (nullif(v_dist->>'capacidade_disponivel_inicial', ''))::numeric < 0
         or (nullif(v_dist->>'capacidade_disponivel_antes', ''))::numeric < 0
         or (nullif(v_dist->>'capacidade_disponivel_depois', ''))::numeric < 0 then
        raise exception 'Distribuicao do recurso % com valor negativo.', v_recurso_key;
      end if;

      -- capacidade efetiva = bruta x produtividade
      if abs((v_dist->>'capacidade_efetiva')::numeric
           - (v_dist->>'capacidade_bruta_periodo')::numeric * (v_dist->>'produtividade_considerada')::numeric) > 0.000001 then
        raise exception 'capacidade_efetiva incoerente com capacidade_bruta_periodo x produtividade para o recurso %.', v_recurso_key;
      end if;

      -- capacidade disponivel inicial = max(0, efetiva - comprometido)
      if abs((v_dist->>'capacidade_disponivel_inicial')::numeric
           - greatest(0, (v_dist->>'capacidade_efetiva')::numeric - (v_dist->>'comprometido_inicial')::numeric)) > 0.000001 then
        raise exception 'capacidade_disponivel_inicial incoerente para o recurso %.', v_recurso_key;
      end if;

      if v_base_por_recurso ? v_recurso_key then
        v_base_existente := v_base_por_recurso -> v_recurso_key;

        -- 2a+ aparicao do MESMO recurso nesta simulacao: a base inteira
        -- (nao so o saldo) precisa ser identica a 1a aparicao - senao
        -- o snapshot fica contraditorio (mesmo recurso, mesmo periodo,
        -- "capacidades" diferentes em linhas diferentes).
        if abs((v_dist->>'capacidade_bruta_periodo')::numeric - (v_base_existente->>'capacidade_bruta_periodo')::numeric) > 0.000001
        or abs((v_dist->>'produtividade_considerada')::numeric - (v_base_existente->>'produtividade_considerada')::numeric) > 0.000001
        or abs((v_dist->>'capacidade_efetiva')::numeric - (v_base_existente->>'capacidade_efetiva')::numeric) > 0.000001
        or abs((v_dist->>'comprometido_inicial')::numeric - (v_base_existente->>'comprometido_inicial')::numeric) > 0.000001
        or abs((v_dist->>'capacidade_disponivel_inicial')::numeric - (v_base_existente->>'capacidade_disponivel_inicial')::numeric) > 0.000001
        then
          raise exception
            'Base de calculo do recurso % mudou entre alocacoes da mesma simulacao - capacidade bruta/produtividade/efetiva/comprometido/disponivel inicial devem ser identicos toda vez que o mesmo recurso aparece.',
            v_recurso_key;
        end if;

        v_saldo_esperado := (v_base_existente->>'saldo_atual')::numeric;
      else
        v_saldo_esperado := (v_dist->>'capacidade_disponivel_inicial')::numeric;
      end if;

      if abs((v_dist->>'capacidade_disponivel_antes')::numeric - v_saldo_esperado) > 0.000001 then
        raise exception
          'capacidade_disponivel_antes nao bate com o saldo acumulado do recurso % - capacidade artificial entre operacoes.',
          v_recurso_key;
      end if;

      if abs((v_dist->>'capacidade_disponivel_depois')::numeric
           - ((v_dist->>'capacidade_disponivel_antes')::numeric - (v_dist->>'horas_padrao_alocadas')::numeric)) > 0.000001 then
        raise exception 'Saldo apos alocacao incoerente para o recurso %.', v_recurso_key;
      end if;

      if abs((v_dist->>'horas_maquina_estimadas')::numeric
           - ((v_dist->>'horas_padrao_alocadas')::numeric / (v_dist->>'produtividade_considerada')::numeric)) > 0.000001 then
        raise exception 'Horas de maquina incoerentes para o recurso %.', v_recurso_key;
      end if;

      v_base_por_recurso := jsonb_set(
        v_base_por_recurso, array[v_recurso_key],
        jsonb_build_object(
          'capacidade_bruta_periodo', (v_dist->>'capacidade_bruta_periodo')::numeric,
          'produtividade_considerada', (v_dist->>'produtividade_considerada')::numeric,
          'capacidade_efetiva', (v_dist->>'capacidade_efetiva')::numeric,
          'comprometido_inicial', (v_dist->>'comprometido_inicial')::numeric,
          'capacidade_disponivel_inicial', (v_dist->>'capacidade_disponivel_inicial')::numeric,
          'saldo_atual', (v_dist->>'capacidade_disponivel_depois')::numeric
        )
      );

      v_soma_alocada := v_soma_alocada + (v_dist->>'horas_padrao_alocadas')::numeric;
    end loop;

    if abs(v_soma_alocada + (v_item->>'deficit')::numeric - (v_item->>'necessario')::numeric) > 0.000001 then
      raise exception 'Soma das distribuicoes + deficit diferente de necessario para a operacao %.', v_item->>'bom_operacao_id';
    end if;
  end loop;

  -- =========================================================
  -- FASE 6: trava por projeto (serializa aprovações concorrentes do
  -- MESMO projeto) + re-checagem de idempotência AUTORITATIVA sob a
  -- trava + marca transacional + troca do vigente ANTES do insert do
  -- novo snapshot, que já nasce vigente=true. Ver justificativa
  -- completa no mesmo bloco da v5 (seção 9.1) - idêntica aqui.
  -- =========================================================
  perform pg_advisory_xact_lock(hashtextextended('simulacoes_comerciais_aprovacao:' || p_projeto_id::text, 0));

  select id, hash_solicitacao into v_snapshot_id, v_hash_existente
  from public.simulacoes_comerciais
  where empresa_id = v_empresa_id
    and chave_idempotencia = p_chave_idempotencia;

  if v_snapshot_id is not null then
    if v_hash_existente is distinct from p_hash_solicitacao then
      raise exception 'Conflito de idempotencia: chave % ja foi usada para uma solicitacao com conteudo diferente.', p_chave_idempotencia;
    end if;

    return v_snapshot_id;
  end if;

  perform set_config('app.aprovacao_em_andamento_projeto_id', p_projeto_id::text, true);

  update public.simulacoes_comerciais
  set vigente = false
  where projeto_id = p_projeto_id
    and vigente = true;

  -- =========================================================
  -- Insercao atomica com tratamento de conflito - mesma logica da v3.
  -- NA FASE 6: vigente gravado como true diretamente (o antigo ja foi
  -- desativado acima, sob a trava) - nao ha mais UPDATE de ativacao
  -- subsequente.
  -- =========================================================
  insert into public.simulacoes_comerciais (
    empresa_id, projeto_id, cenario_demanda, modo_producao, data_necessidade,
    margem_seguranca_dias, data_prevista_aprovacao_pedido, data_chegada_prevista,
    janela_inicio, janela_fim, aprovado_por,
    chave_idempotencia, hash_solicitacao, vigente
  )
  values (
    v_empresa_id, p_projeto_id, p_cenario_demanda, p_modo_producao, p_data_necessidade,
    p_margem_seguranca_dias, p_data_prevista_aprovacao_pedido, p_data_chegada_prevista,
    p_janela_inicio, p_janela_fim, p_aprovado_por,
    p_chave_idempotencia, p_hash_solicitacao, true
  )
  on conflict (empresa_id, chave_idempotencia) where chave_idempotencia is not null
  do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is null then
    select id, hash_solicitacao into v_snapshot_id, v_hash_existente
    from public.simulacoes_comerciais
    where empresa_id = v_empresa_id
      and chave_idempotencia = p_chave_idempotencia;

    if v_snapshot_id is null then
      raise exception 'Falha ao localizar snapshot apos conflito de insercao para chave %.', p_chave_idempotencia;
    end if;

    if v_hash_existente is distinct from p_hash_solicitacao then
      raise exception 'Conflito de idempotencia: chave % ja foi usada para uma solicitacao com conteudo diferente.', p_chave_idempotencia;
    end if;

    return v_snapshot_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    insert into public.simulacao_comercial_itens (
      empresa_id, simulacao_comercial_id, versao_resultado_motor,
      bom_operacao_id, recurso_original_id,
      necessario, deficit
    )
    values (
      v_empresa_id, v_snapshot_id, 2,
      (nullif(v_item->>'bom_operacao_id', ''))::uuid,
      (nullif(v_item->>'recurso_original_id', ''))::uuid,
      (nullif(v_item->>'necessario', ''))::numeric,
      (nullif(v_item->>'deficit', ''))::numeric
    )
    returning id into v_item_id;

    for v_dist in select * from jsonb_array_elements(v_item->'distribuicoes')
    loop
      insert into public.simulacao_comercial_item_distribuicoes (
        empresa_id, simulacao_comercial_item_id, recurso_id, ordem_consideracao, origem,
        capacidade_bruta_periodo, produtividade_considerada, capacidade_efetiva,
        comprometido_inicial, capacidade_disponivel_inicial,
        capacidade_disponivel_antes, horas_padrao_alocadas, horas_maquina_estimadas,
        capacidade_disponivel_depois
      )
      values (
        v_empresa_id, v_item_id, (nullif(v_dist->>'recurso_id', ''))::uuid,
        (nullif(v_dist->>'ordem_consideracao', ''))::integer,
        v_dist->>'origem',
        (nullif(v_dist->>'capacidade_bruta_periodo', ''))::numeric,
        (nullif(v_dist->>'produtividade_considerada', ''))::numeric,
        (nullif(v_dist->>'capacidade_efetiva', ''))::numeric,
        (nullif(v_dist->>'comprometido_inicial', ''))::numeric,
        (nullif(v_dist->>'capacidade_disponivel_inicial', ''))::numeric,
        (nullif(v_dist->>'capacidade_disponivel_antes', ''))::numeric,
        (nullif(v_dist->>'horas_padrao_alocadas', ''))::numeric,
        (nullif(v_dist->>'horas_maquina_estimadas', ''))::numeric,
        (nullif(v_dist->>'capacidade_disponivel_depois', ''))::numeric
      );
    end loop;
  end loop;

  perform set_config('app.aprovacao_via_function', 'true', true);

  update public.projetos
  set status = 'aprovado'
  where id = p_projeto_id;

  return v_snapshot_id;
end;
$function$;

comment on function public.aprovar_projeto_com_simulacao_v4(uuid, uuid, text, text, date, integer, date, date, date, date, jsonb, text, text) is
  'Versao 4 da aprovacao da Simulacao Comercial - caminho de ROLLBACK preservado caso a v5 precise ser revertida (comentario original da v5: "Aditiva sobre a v4, que permanece intacta"). FASE 6: passa a travar por projeto (pg_advisory_xact_lock) e a inserir o novo snapshot ja com vigente=true (nunca mais via UPDATE de ativacao separado), para ser compativel com impedir_alteracao_vigente_sem_marca - sem esta correcao, o caminho de rollback documentado ficaria inutilizavel (bloqueado pelo mesmo trigger que protege vigente). Nenhuma validacao, mensagem de erro, retorno ou garantia de idempotencia pre-existente foi alterada. Nao recalcula os valores recebidos a partir de cadastros atuais.';

revoke execute on function public.aprovar_projeto_com_simulacao_v4(uuid, uuid, text, text, date, integer, date, date, date, date, jsonb, text, text) from public;
revoke execute on function public.aprovar_projeto_com_simulacao_v4(uuid, uuid, text, text, date, integer, date, date, date, date, jsonb, text, text) from anon;
revoke execute on function public.aprovar_projeto_com_simulacao_v4(uuid, uuid, text, text, date, integer, date, date, date, date, jsonb, text, text) from authenticated;
grant execute on function public.aprovar_projeto_com_simulacao_v4(uuid, uuid, text, text, date, integer, date, date, date, date, jsonb, text, text) to service_role;

-- =====================================================================
-- 10. Asserts defensivos dentro da própria migration
-- =====================================================================

do $$
declare
  v_empresas_sem_versao integer;
begin
  select count(*) into v_empresas_sem_versao
  from public.empresas e
  where not exists (
    select 1 from public.empresa_capacidade_versoes v where v.empresa_id = e.id
  );

  if v_empresas_sem_versao <> 0 then
    raise exception 'Backfill de empresa_capacidade_versoes incompleto - % empresa(s) sem linha de versão.', v_empresas_sem_versao;
  end if;
end;
$$;

do $$
declare
  v_total_versoes integer;
  v_total_empresas integer;
begin
  select count(*) into v_total_versoes from public.empresa_capacidade_versoes;
  select count(*) into v_total_empresas from public.empresas;

  if v_total_versoes <> v_total_empresas then
    raise exception 'empresa_capacidade_versoes tem % linha(s), mas há % empresa(s) - backfill não bateu 1:1.', v_total_versoes, v_total_empresas;
  end if;
end;
$$;

-- =====================================================================
-- PARTE 2: CENÁRIOS DE TESTE - ESTRUTURA
-- =====================================================================

-- ---------------------------------------------------------------------
-- TESTE E1: as 3 tabelas novas desta migration existem
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.empresa_capacidade_versoes') is null then
    raise exception 'TESTE E1 FALHOU: tabela empresa_capacidade_versoes não foi criada.';
  end if;
  if to_regclass('public.bom_operacao_dependencias_subconjunto') is null then
    raise exception 'TESTE E1 FALHOU: tabela bom_operacao_dependencias_subconjunto não foi criada.';
  end if;
  if to_regclass('public.simulacao_comercial_item_distribuicao_dias') is null then
    raise exception 'TESTE E1 FALHOU: tabela simulacao_comercial_item_distribuicao_dias não foi criada.';
  end if;
  raise notice 'TESTE E1 OK: as 3 tabelas novas existem.';
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE E2: colunas novas em simulacoes_comerciais e
-- simulacao_comercial_item_distribuicoes existem
-- ---------------------------------------------------------------------
do $$
declare
  v_faltando text[];
begin
  select array_agg(esperado) into v_faltando
  from unnest(array['ajuste_cenario','custo_adicional_total','estimativa_data_fim_real','estimativa_folga_dias_civis']) as esperado
  where esperado not in (
    select column_name from information_schema.columns
    where table_schema='public' and table_name='simulacoes_comerciais'
  );
  if v_faltando is not null then
    raise exception 'TESTE E2 FALHOU: colunas ausentes em simulacoes_comerciais: %.', v_faltando;
  end if;

  select array_agg(esperado) into v_faltando
  from unnest(array['recurso_externo_tipo','recurso_externo_nome','recurso_externo_referencia_id','contratacao_id','data_inicio_calculada','data_fim_calculada','custo']) as esperado
  where esperado not in (
    select column_name from information_schema.columns
    where table_schema='public' and table_name='simulacao_comercial_item_distribuicoes'
  );
  if v_faltando is not null then
    raise exception 'TESTE E2 FALHOU: colunas ausentes em simulacao_comercial_item_distribuicoes: %.', v_faltando;
  end if;

  raise notice 'TESTE E2 OK: todas as colunas novas existem nas 2 tabelas estendidas.';
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE E3: constraints nomeadas (UNIQUE/CHECK/FK) desta migration existem
-- ---------------------------------------------------------------------
do $$
declare
  v_faltando text[];
begin
  select array_agg(esperado) into v_faltando
  from unnest(array[
    'bom_operacoes_id_empresa_uniq','bom_itens_id_empresa_uniq','simulacao_comercial_item_distribuicoes_id_empresa_uniq',
    'simulacoes_comerciais_ajuste_cenario_coerente_chk','simulacoes_comerciais_estimativa_coerente_chk',
    'simulacao_comercial_item_distribuicoes_origem_chk','simulacao_comercial_item_distribuicoes_recurso_xor_chk',
    'simulacao_comercial_item_distribuicoes_origem_tipo_externo_chk','simulacao_comercial_item_distribuicoes_referencia_origem_chk',
    'simulacao_comercial_item_distribuicoes_contratacao_origem_chk','simulacao_comercial_item_distribuicoes_custo_por_origem_chk',
    'simulacao_comercial_item_distribuicoes_datas_por_origem_chk','simulacao_comercial_item_distribuicoes_capacidade_origem_chk',
    'simulacao_comercial_item_distribuicoes_recurso_externo_ref_fkey',
    'simulacao_comercial_item_distribuicao_dias_nat_contrato_chk','simulacao_comercial_item_distribuicao_dias_uniq',
    'simulacao_comercial_item_distribuicao_dias_pai_fkey',
    'bom_operacao_dependencias_subconjunto_operacao_fkey','bom_operacao_dependencias_subconjunto_item_fkey'
  ]) as esperado
  where esperado not in (select conname from pg_constraint);

  if v_faltando is not null then
    raise exception 'TESTE E3 FALHOU: constraints ausentes: %.', v_faltando;
  end if;
  raise notice 'TESTE E3 OK: todas as constraints nomeadas desta migration existem.';
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE E4: índices esperados existem
-- ---------------------------------------------------------------------
do $$
declare
  v_faltando text[];
begin
  select array_agg(esperado) into v_faltando
  from unnest(array[
    'bom_operacao_dependencias_subconjunto_par_vivo_uniq',
    'bom_operacao_dependencias_subconjunto_empresa_idx',
    'bom_operacao_dependencias_subconjunto_operacao_idx',
    'bom_operacao_dependencias_subconjunto_item_idx',
    'simulacao_comercial_item_distribuicao_dias_pai_idx',
    'simulacao_comercial_item_distribuicao_dias_empresa_idx'
  ]) as esperado
  where esperado not in (select indexname from pg_indexes where schemaname = 'public');

  if v_faltando is not null then
    raise exception 'TESTE E4 FALHOU: índices ausentes: %.', v_faltando;
  end if;
  raise notice 'TESTE E4 OK: todos os índices esperados existem.';
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE E5: RLS habilitado + policy de SELECT por tenant nas 3 tabelas novas
-- ---------------------------------------------------------------------
do $$
declare
  v_sem_rls text[];
  v_faltando text[];
begin
  select array_agg(t) into v_sem_rls
  from unnest(array['empresa_capacidade_versoes','bom_operacao_dependencias_subconjunto','simulacao_comercial_item_distribuicao_dias']) as t
  where not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t and c.relrowsecurity
  );
  if v_sem_rls is not null then
    raise exception 'TESTE E5 FALHOU: RLS não habilitado em: %.', v_sem_rls;
  end if;

  select array_agg(esperado) into v_faltando
  from unnest(array['empresa_capacidade_versoes_select_tenant','bom_operacao_dependencias_subconjunto_select_tenant','simulacao_comercial_item_distribuicao_dias_select_tenant']) as esperado
  where esperado not in (select policyname from pg_policies where schemaname = 'public');
  if v_faltando is not null then
    raise exception 'TESTE E5 FALHOU: policies de select tenant ausentes: %.', v_faltando;
  end if;

  raise notice 'TESTE E5 OK: RLS habilitado e policy de tenant presente nas 3 tabelas novas.';
end;
$$;

-- ---------------------------------------------------------------------
-- TESTE E6: backfill de empresa_capacidade_versoes 1:1 com empresas
-- (a própria migration já garante isso na seção 10 - repetido aqui como
-- teste explícito e nomeado, isolado do resto da migration)
-- ---------------------------------------------------------------------
do $$
declare
  v_total_versoes integer;
  v_total_empresas integer;
begin
  select count(*) into v_total_versoes from public.empresa_capacidade_versoes;
  select count(*) into v_total_empresas from public.empresas;
  if v_total_versoes <> v_total_empresas then
    raise exception 'TESTE E6 FALHOU: empresa_capacidade_versoes tem % linha(s), mas há % empresa(s).', v_total_versoes, v_total_empresas;
  end if;
  raise notice 'TESTE E6 OK: backfill 1:1 confirmado (% empresas).', v_total_empresas;
end;
$$;


rollback;

-- =====================================================================
-- APÓS RODAR O SCRIPT ACIMA (que termina em ROLLBACK), rode ISTO
-- SEPARADAMENTE, em uma NOVA aba/conexão do SQL Editor, para confirmar
-- que não sobrou nenhum resíduo:
-- =====================================================================
--
-- select to_regclass('public.empresa_capacidade_versoes') as deve_ser_null,
--        to_regclass('public.bom_operacao_dependencias_subconjunto') as deve_ser_null,
--        to_regclass('public.simulacao_comercial_item_distribuicao_dias') as deve_ser_null,
--        (select column_name from information_schema.columns
--          where table_schema='public' and table_name='simulacoes_comerciais' and column_name='ajuste_cenario') as deve_ser_null;
