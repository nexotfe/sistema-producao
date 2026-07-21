-- Etapa 4 do motor de Simulacao Comercial: Compatibilidade entre
-- Recursos Produtivos + extensao da Etapa 3 para distinguir recurso
-- original (do roteiro) de recurso considerado (decidido pelo Motor de
-- Avaliacao Sequencial de Capacidade, implementado em TypeScript - ver
-- src/modules/simulacao-comercial/lib/). Ver
-- ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md, nova secao
-- "Compatibilidade entre Recursos Produtivos".
--
-- Fora de escopo desta migration, registrado como pendencia separada:
-- GRANT excessivo a anon em public.boms (higiene, confirmado
-- nao-exploravel hoje porque a RLS ja restringe a authenticated);
-- coluna updated_by (convencao de auditoria ainda nao definida para o
-- projeto, fica para um PAD futuro quando houver uma segunda instancia
-- do padrao).

-- =========================================================
-- Pre-requisito: unique(id, empresa_id) em recursos_produtivos, para a
-- FK composta abaixo garantir que origem e destino da compatibilidade
-- pertencem sempre a mesma empresa. Aditivo - confirmado por inspecao
-- que nao ha nenhuma linha com empresa_id nulo hoje (36/36 preenchidas)
-- e que nenhuma FK existente e afetada.
-- =========================================================
alter table public.recursos_produtivos
  add constraint recursos_produtivos_id_empresa_uniq unique (id, empresa_id);

-- =========================================================
-- Compatibilidade entre Recursos Produtivos
-- =========================================================
-- "A Compatibilidade entre Recursos Produtivos nao altera o roteiro,
-- nao altera o tempo da operacao e nao altera o recurso originalmente
-- planejado. Ela apenas informa a Simulacao Comercial quais recursos
-- poderao ser considerados como alternativas caso o recurso
-- originalmente previsto nao possua capacidade disponivel."
--
-- Direcional (A substitui B nao implica B substitui A), nao
-- necessariamente transitiva (o Motor so consulta compatibilidades
-- diretas do recurso original, nunca encadeia). Dado estatico - so
-- responde "quais recursos PODEM substituir este", nunca decide se ha
-- capacidade (isso e responsabilidade exclusiva do Motor).
create table public.recurso_produtivo_compatibilidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  recurso_origem_id uuid not null,
  recurso_destino_id uuid not null,
  prioridade integer not null check (prioridade > 0),
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint recurso_produtivo_compatibilidades_origem_destino_chk
    check (recurso_origem_id <> recurso_destino_id),
  -- FK composta: impossivel cadastrar origem ou destino de empresa
  -- diferente da linha - o banco recusa antes de qualquer logica de
  -- aplicacao rodar.
  constraint recurso_produtivo_compatibilidades_origem_fkey
    foreign key (recurso_origem_id, empresa_id)
    references public.recursos_produtivos (id, empresa_id),
  constraint recurso_produtivo_compatibilidades_destino_fkey
    foreign key (recurso_destino_id, empresa_id)
    references public.recursos_produtivos (id, empresa_id)
);

comment on table public.recurso_produtivo_compatibilidades is
  'Compatibilidade direcional entre Recursos Produtivos - dado estatico consultado pelo Motor de Avaliacao Sequencial de Capacidade (Simulacao Comercial). Nao altera roteiro, tempo de operacao nem recurso original. Ver ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md.';

-- prioridade unica por origem, entre ativos
create unique index recurso_produtivo_compatibilidades_origem_prioridade_unico
  on public.recurso_produtivo_compatibilidades (recurso_origem_id, prioridade)
  where deleted_at is null and ativo = true;

-- par (origem, destino) unico, entre ativos
create unique index recurso_produtivo_compatibilidades_par_unico
  on public.recurso_produtivo_compatibilidades (recurso_origem_id, recurso_destino_id)
  where deleted_at is null and ativo = true;

create index recurso_produtivo_compatibilidades_empresa_idx
  on public.recurso_produtivo_compatibilidades (empresa_id);

alter table public.recurso_produtivo_compatibilidades enable row level security;

-- Configuracao editavel (PAD-004: soft delete via ativo/deleted_at, nao
-- log de auditoria) - padrao de calendario_operacional_empresa, nao de
-- historico_situacao_comercial. UPDATE restrito a admin. Sem policy de
-- DELETE (bloqueado, exclusao logica via UPDATE de ativo/deleted_at).
create policy recurso_produtivo_compatibilidades_select_tenant
  on public.recurso_produtivo_compatibilidades
  for select to authenticated
  using (empresa_id = public.empresa_atual_id());

create policy recurso_produtivo_compatibilidades_insert_tenant
  on public.recurso_produtivo_compatibilidades
  for insert to authenticated
  with check (empresa_id = public.empresa_atual_id());

create policy recurso_produtivo_compatibilidades_update_tenant
  on public.recurso_produtivo_compatibilidades
  for update to authenticated
  using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin())
  with check (empresa_id = public.empresa_atual_id());

-- =========================================================
-- Extensao da Etapa 3: granularidade por OPERACAO, nao por recurso
-- =========================================================
-- recurso_produtivo_id e REMOVIDA (nao mantida como sinonimo) - nenhum
-- consumidor no frontend le esta tabela ainda (Etapa 3 so tinha o
-- backend), entao nao ha custo de compatibilidade, e manter as duas
-- colunas em paralelo violaria o principio de nao duplicar dado (secao
-- 3 da arquitetura - Responsabilidade Unica) sem nenhum beneficio real.
alter table public.simulacao_comercial_itens
  drop constraint simulacao_comercial_itens_recurso_produtivo_id_fkey,
  drop column recurso_produtivo_id;

-- Principio de Persistencia da Simulacao Comercial: o Motor de
-- Avaliacao Sequencial de Capacidade decide operacao por operacao.
-- Portanto, o snapshot deve persistir cada decisao na mesma
-- granularidade - 1 linha por bom_operacao_id, nao 1 linha agregada por
-- recurso_considerado_id. Uma consolidacao por recurso pode ser
-- derivada destes dados (SUM/GROUP BY em consulta), mas nunca e a fonte
-- primaria da informacao. Motivo concreto: sem isso, duas operacoes de
-- recursos originais DIFERENTES que convirjam para o mesmo recurso
-- considerado (ex: CNC 500 e CNC 800 ambas substituidas por CNC 1000)
-- perderiam rastreabilidade - so caberia 1 recurso_original_id por
-- linha. Ver ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md,
-- secao 18.
alter table public.simulacao_comercial_itens
  add column bom_operacao_id uuid,
  add column recurso_original_id uuid,
  add column recurso_considerado_id uuid,
  add column motivo_consideracao text;

update public.simulacao_comercial_itens set recurso_original_id = null
where false; -- no-op, tabela vazia (Etapa 3 nunca teve uso real em producao ainda) - sem backfill necessario

-- bom_operacao_id e recurso_original_id sao SEMPRE conhecidos (a
-- operacao sempre existe no roteiro, com um recurso previsto) -
-- permanecem NOT NULL. recurso_considerado_id e motivo_consideracao
-- ficam NULLABLE: quando NENHUM recurso (original nem compativel)
-- comporta a operacao inteira (deficit total), nao existe um "recurso
-- considerado" real - gravar um valor ali (ex: o proprio original) para
-- preencher a coluna seria uma mentira. NULL/NULL representa
-- honestamente "nenhum recurso viavel encontrado"; a coluna deficit
-- (> 0 neste caso) e a unica fonte de verdade sobre o problema.
alter table public.simulacao_comercial_itens
  alter column bom_operacao_id set not null,
  alter column recurso_original_id set not null;

-- capacidade_bruta, capacidade_efetiva, capacidade_disponivel,
-- comprometido e livre vieram NOT NULL da Etapa 3 (recurso sempre
-- existia). Em deficit total nao ha recurso considerado, logo nao ha
-- "a capacidade de qual recurso" reportar nessas colunas - gravar os
-- valores do recurso_original_id (que foi tentado e RECUSADO, nao
-- aceito) seria uma informacao enganosa. Ficam NULLABLE; NULL nas 5
-- exatamente quando recurso_considerado_id e NULL (ver CHECK abaixo).
-- necessario e deficit continuam NOT NULL - sao propriedades da
-- OPERACAO, sempre conhecidas independente do resultado da avaliacao.
alter table public.simulacao_comercial_itens
  alter column capacidade_bruta drop not null,
  alter column capacidade_efetiva drop not null,
  alter column capacidade_disponivel drop not null,
  alter column comprometido drop not null,
  alter column livre drop not null;

alter table public.simulacao_comercial_itens
  add constraint simulacao_comercial_itens_bom_operacao_fkey
    foreign key (bom_operacao_id) references public.bom_operacoes(id),
  add constraint simulacao_comercial_itens_recurso_original_fkey
    foreign key (recurso_original_id) references public.recursos_produtivos(id),
  add constraint simulacao_comercial_itens_recurso_considerado_fkey
    foreign key (recurso_considerado_id) references public.recursos_produtivos(id),
  add constraint simulacao_comercial_itens_motivo_consideracao_chk
    check (motivo_consideracao is null or motivo_consideracao in ('ORIGINAL', 'COMPATIBILIDADE')),
  -- 3 estados validos, mutuamente exclusivos - inclui agora os 5 campos
  -- de capacidade/comprometido/livre como parte da definicao de cada
  -- estado (NULL nos 3 juntos com recurso_considerado_id/motivo em
  -- deficit total; preenchidos nos outros 2 estados):
  -- 1) deficit total - nenhum recurso comportou a operacao: considerado,
  --    motivo e os 5 campos de capacidade todos NULL; deficit = necessario e > 0.
  -- 2) recurso original comportou: motivo=ORIGINAL, considerado=original,
  --    os 5 campos preenchidos, deficit = 0.
  -- 3) recurso compativel comportou: motivo=COMPATIBILIDADE, considerado<>original,
  --    os 5 campos preenchidos, deficit = 0.
  add constraint simulacao_comercial_itens_motivo_consistente_chk
    check (
      (
        recurso_considerado_id is null
        and motivo_consideracao is null
        and capacidade_bruta is null
        and capacidade_efetiva is null
        and capacidade_disponivel is null
        and comprometido is null
        and livre is null
        and deficit = necessario
        and deficit > 0
      )
      or
      (
        motivo_consideracao = 'ORIGINAL'
        and recurso_considerado_id = recurso_original_id
        and capacidade_bruta is not null
        and capacidade_efetiva is not null
        and capacidade_disponivel is not null
        and comprometido is not null
        and livre is not null
        and deficit = 0
      )
      or
      (
        motivo_consideracao = 'COMPATIBILIDADE'
        and recurso_considerado_id is not null
        and recurso_considerado_id <> recurso_original_id
        and capacidade_bruta is not null
        and capacidade_efetiva is not null
        and capacidade_disponivel is not null
        and comprometido is not null
        and livre is not null
        and deficit = 0
      )
    );

create index simulacao_comercial_itens_bom_operacao_idx
  on public.simulacao_comercial_itens (bom_operacao_id);

-- Nao-unico de proposito: multiplas linhas (operacoes diferentes) legitimamente
-- compartilham o mesmo recurso_considerado_id.
create index simulacao_comercial_itens_recurso_considerado_idx
  on public.simulacao_comercial_itens (recurso_considerado_id);

comment on column public.simulacao_comercial_itens.bom_operacao_id is
  'Operacao do roteiro (bom_operacoes) a que esta linha se refere. Granularidade do snapshot e por OPERACAO, nao por recurso - ver Principio de Persistencia da Simulacao Comercial, secao 18 da arquitetura.';
comment on column public.simulacao_comercial_itens.recurso_original_id is
  'Recurso previsto no roteiro (bom_operacoes.recurso_produtivo_id) para esta operacao (bom_operacao_id) - nunca alterado pela Simulacao.';
comment on column public.simulacao_comercial_itens.recurso_considerado_id is
  'Recurso efetivamente considerado pelo Motor de Avaliacao Sequencial de Capacidade para esta operacao - igual a recurso_original_id quando motivo_consideracao=ORIGINAL, um recurso compativel quando motivo_consideracao=COMPATIBILIDADE, ou NULL quando NENHUM recurso comportou a operacao (deficit total - ver constraint motivo_consistente_chk).';
comment on column public.simulacao_comercial_itens.motivo_consideracao is
  'ORIGINAL: recurso do roteiro tinha capacidade suficiente para esta operacao. COMPATIBILIDADE: recurso do roteiro nao tinha capacidade, um recurso compativel (recurso_produtivo_compatibilidades) foi considerado no lugar. NULL: nenhum recurso (original nem compativel) comportou a operacao inteira - deficit total, ver coluna deficit.';
comment on column public.simulacao_comercial_itens.necessario is
  'Horas necessarias APENAS para esta operacao (bom_operacao_id) - nao agregado por recurso.';
comment on column public.simulacao_comercial_itens.capacidade_bruta is
  'Capacidade bruta do recurso_considerado_id desta linha, no momento da aprovacao. NULL em deficit total (recurso_considerado_id NULL) - nao ha recurso considerado para essa capacidade se referir; o recurso_original_id foi tentado e RECUSADO, reportar a capacidade dele aqui seria enganoso. Denormalizado nos outros 2 estados: linhas diferentes que compartilham o mesmo recurso considerado repetem o mesmo valor - normalizar em tabela separada e otimizacao prematura, so considerar se houver gargalo real de desempenho.';
comment on column public.simulacao_comercial_itens.capacidade_efetiva is
  'Capacidade efetiva do recurso_considerado_id desta linha. NULL em deficit total - mesma logica de capacidade_bruta.';
comment on column public.simulacao_comercial_itens.capacidade_disponivel is
  'Capacidade disponivel do recurso_considerado_id desta linha. NULL em deficit total - mesma logica de capacidade_bruta.';
comment on column public.simulacao_comercial_itens.comprometido is
  'Comprometido do recurso_considerado_id desta linha (calcular_comprometido_v1), no momento da aprovacao. NULL em deficit total - mesma logica de capacidade_bruta.';
comment on column public.simulacao_comercial_itens.livre is
  'Capacidade livre do recurso_considerado_id desta linha (capacidade_disponivel - comprometido). NULL em deficit total - mesma logica de capacidade_bruta.';
comment on column public.simulacao_comercial_itens.deficit is
  'Horas desta operacao que nenhum recurso considerado comportou. Em deficit total, igual a necessario (nada foi absorvido); nos outros 2 estados, sempre 0 (operacoes sao indivisiveis - ou cabem inteiras, ou ficam inteiras em deficit).';

-- =========================================================
-- calcular_comprometido_v1: componente isolado e substituivel
-- =========================================================
-- Interface CONGELADA (recurso_produtivo_id, projeto_excluido_id) ->
-- numeric. Implementacao (V1): soma de necessario, por recurso, de
-- todos os projetos aprovados (vigente=true), excluindo o projeto
-- sendo simulado. NAO considera sobreposicao temporal entre projetos -
-- limitacao conhecida e documentada da V1, nao comportamento
-- definitivo.
--
-- "Nesta versao da Simulacao Comercial, o comprometimento de
-- capacidade e calculado por recurso, considerando todos os projetos
-- aprovados. A distribuicao temporal da carga entre projetos ainda nao
-- faz parte do modelo e sera tratada em uma evolucao futura da
-- arquitetura."
--
-- "Nao simplifique a arquitetura para simplificar a implementacao.
-- Simplifique apenas a parte que sera substituida no futuro." - por
-- isso esta e uma function isolada (sufixo _v1 sinaliza que uma V2 e
-- esperada), consumida pelo Motor (TypeScript) via supabase.rpc(), sem
-- que o Motor conheca esta implementacao interna.
create or replace function public.calcular_comprometido_v1(
  p_recurso_produtivo_id uuid,
  p_projeto_excluido_id uuid
)
returns numeric
language sql
stable
as $function$
  select coalesce(sum(sci.necessario), 0)
  from public.simulacao_comercial_itens sci
  join public.simulacoes_comerciais sc on sc.id = sci.simulacao_comercial_id
  where sci.recurso_considerado_id = p_recurso_produtivo_id
    and sc.vigente = true
    and sc.projeto_id <> p_projeto_excluido_id
    and sc.empresa_id = public.empresa_atual_id();
$function$;

comment on function public.calcular_comprometido_v1(uuid, uuid) is
  'Comprometido de capacidade de um recurso (V1): soma de necessario de todos os projetos aprovados que o consideraram, excluindo o projeto informado. simulacao_comercial_itens tem granularidade por OPERACAO - varias linhas podem compartilhar o mesmo recurso_considerado_id; o SUM soma corretamente atraves dessas linhas, sem exigir agregacao previa. Operacoes em deficit total nao participam deste calculo, pois nao possuem recurso_considerado_id - o WHERE recurso_considerado_id = p_recurso_produtivo_id ja as exclui naturalmente, sem necessidade de filtro adicional. NAO considera sobreposicao temporal entre janelas de projetos - limitacao documentada, nao definitiva. Interface (parametros/retorno) congelada para permitir uma V2 sem alterar quem a consome. security invoker (padrao) - respeita RLS normal de quem chama.';

revoke execute on function public.calcular_comprometido_v1(uuid, uuid) from public;
revoke execute on function public.calcular_comprometido_v1(uuid, uuid) from anon;
grant execute on function public.calcular_comprometido_v1(uuid, uuid) to authenticated;

-- =========================================================
-- aprovar_projeto_com_simulacao: estendida para recurso_original /
-- recurso_considerado / motivo_consideracao
-- =========================================================
create or replace function public.aprovar_projeto_com_simulacao(
  p_projeto_id uuid,
  p_cenario_demanda text,
  p_modo_producao text,
  p_data_necessidade date,
  p_margem_seguranca_dias integer,
  p_janela_inicio date,
  p_janela_fim date,
  p_itens jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_snapshot_id uuid;
  v_item jsonb;
  v_bom_operacao_empresa_id uuid;
  v_recurso_original_empresa_id uuid;
  v_recurso_considerado_empresa_id uuid;
  v_motivo text;
begin
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'p_itens nao pode ser vazio - uma simulacao sem nenhum recurso nao e valida.';
  end if;

  select empresa_id into v_empresa_id
  from public.projetos
  where id = p_projeto_id;

  if v_empresa_id is null then
    raise exception 'Projeto % nao encontrado.', p_projeto_id;
  end if;

  -- empresa_atual_id() retorna NULL para chamador nao autenticado (ex:
  -- role anon, sem JWT valido). "<>" com NULL de qualquer lado avalia
  -- para NULL em SQL, e "if NULL then" e tratado como falso pelo
  -- PL/pgSQL - checagem explicita de NULL primeiro, depois "is distinct
  -- from" (nao "<>") para o caso em que ambos os lados tem valor mas
  -- sao diferentes.
  if public.empresa_atual_id() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if v_empresa_id is distinct from public.empresa_atual_id() then
    raise exception 'Projeto % nao pertence a empresa atual.', p_projeto_id;
  end if;

  -- Valida cada item (1 por OPERACAO do roteiro) ANTES de qualquer
  -- escrita: a operacao existe e pertence a empresa, os dois recursos
  -- existem e pertencem a mesma empresa, motivo_consideracao valido e
  -- consistente com original/considerado, e os 7 valores numericos sao
  -- nao-negativos. CHECKs das colunas ficam como defesa em
  -- profundidade.
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    if not (v_item ? 'bom_operacao_id') or not (v_item ? 'recurso_original_id') or not (v_item ? 'recurso_considerado_id') or not (v_item ? 'motivo_consideracao') then
      raise exception 'Item de simulacao incompleto - bom_operacao_id, recurso_original_id, recurso_considerado_id e motivo_consideracao sao obrigatorios: %', v_item;
    end if;

    -- nullif(..., '') antes de todo cast a partir de v_item->>'...':
    -- endurecimento defensivo contra um client que envie string vazia
    -- no lugar de JSON null (que o operador ->> ja trata como NULL SQL
    -- normalmente) - sem isso, '' cairia num erro cru de cast
    -- (ex: invalid input syntax for type uuid) em vez de uma mensagem
    -- de negocio clara.
    select empresa_id into v_bom_operacao_empresa_id
    from public.bom_operacoes
    where id = (nullif(v_item->>'bom_operacao_id', ''))::uuid;

    if v_bom_operacao_empresa_id is null then
      raise exception 'Operacao de roteiro % nao encontrada.', v_item->>'bom_operacao_id';
    end if;

    if v_bom_operacao_empresa_id <> v_empresa_id then
      raise exception 'Operacao de roteiro % nao pertence a empresa do projeto.', v_item->>'bom_operacao_id';
    end if;

    -- 3 estados validos (mesma regra da constraint
    -- simulacao_comercial_itens_motivo_consistente_chk): deficit total
    -- (motivo e considerado ambos NULL, deficit > 0), ORIGINAL
    -- (considerado = original, deficit = 0), ou COMPATIBILIDADE
    -- (considerado <> original, deficit = 0). Validado aqui tambem para
    -- dar uma mensagem de erro clara antes do INSERT tentar e falhar no
    -- CHECK da tabela.
    v_motivo := v_item->>'motivo_consideracao';

    if v_motivo is null and (v_item->>'recurso_considerado_id') is not null then
      raise exception 'motivo_consideracao NULL exige recurso_considerado_id tambem NULL (deficit total): %', v_item;
    end if;

    if v_motivo is not null and (v_item->>'recurso_considerado_id') is null then
      raise exception 'recurso_considerado_id NULL exige motivo_consideracao tambem NULL (deficit total): %', v_item;
    end if;

    if v_motivo is not null and v_motivo not in ('ORIGINAL', 'COMPATIBILIDADE') then
      raise exception 'motivo_consideracao invalido (%) - esperado ORIGINAL, COMPATIBILIDADE ou NULL (deficit total).', v_motivo;
    end if;

    if v_motivo = 'ORIGINAL' and (v_item->>'recurso_original_id') <> (v_item->>'recurso_considerado_id') then
      raise exception 'motivo_consideracao=ORIGINAL exige recurso_considerado_id igual a recurso_original_id: %', v_item;
    end if;

    if v_motivo = 'COMPATIBILIDADE' and (v_item->>'recurso_original_id') = (v_item->>'recurso_considerado_id') then
      raise exception 'motivo_consideracao=COMPATIBILIDADE exige recurso_considerado_id diferente de recurso_original_id: %', v_item;
    end if;

    if v_motivo is null and (
      (nullif(v_item->>'deficit', ''))::numeric <> (nullif(v_item->>'necessario', ''))::numeric
      or (nullif(v_item->>'deficit', ''))::numeric <= 0
    ) then
      raise exception 'Operacao em deficit total (motivo_consideracao NULL) exige deficit = necessario e > 0: %', v_item;
    end if;

    if v_motivo is not null and (nullif(v_item->>'deficit', ''))::numeric <> 0 then
      raise exception 'Operacao com recurso considerado (motivo_consideracao=%) exige deficit = 0: %', v_motivo, v_item;
    end if;

    -- Os 5 campos de capacidade/comprometido/livre acompanham
    -- recurso_considerado_id: todos NULL juntos em deficit total (nao
    -- ha recurso considerado para essa capacidade se referir), todos
    -- preenchidos juntos nos outros 2 estados. Mistura (ex: considerado
    -- NULL mas capacidade_bruta preenchida) e rejeitada aqui antes do
    -- INSERT cair no CHECK da tabela.
    if (v_item->>'recurso_considerado_id') is null then
      if (v_item->>'capacidade_bruta') is not null
        or (v_item->>'capacidade_efetiva') is not null
        or (v_item->>'capacidade_disponivel') is not null
        or (v_item->>'comprometido') is not null
        or (v_item->>'livre') is not null
      then
        raise exception 'Operacao em deficit total (recurso_considerado_id NULL) exige capacidade_bruta, capacidade_efetiva, capacidade_disponivel, comprometido e livre tambem NULL: %', v_item;
      end if;
    else
      if (v_item->>'capacidade_bruta') is null
        or (v_item->>'capacidade_efetiva') is null
        or (v_item->>'capacidade_disponivel') is null
        or (v_item->>'comprometido') is null
        or (v_item->>'livre') is null
      then
        raise exception 'Operacao com recurso considerado exige capacidade_bruta, capacidade_efetiva, capacidade_disponivel, comprometido e livre preenchidos: %', v_item;
      end if;
    end if;

    select empresa_id into v_recurso_original_empresa_id
    from public.recursos_produtivos
    where id = (nullif(v_item->>'recurso_original_id', ''))::uuid;

    if v_recurso_original_empresa_id is null then
      raise exception 'Recurso original % nao encontrado.', v_item->>'recurso_original_id';
    end if;

    if v_recurso_original_empresa_id <> v_empresa_id then
      raise exception 'Recurso original % nao pertence a empresa do projeto.', v_item->>'recurso_original_id';
    end if;

    -- recurso_considerado_id e opcional (NULL em deficit total) - so
    -- valida existencia/empresa quando presente.
    if (v_item->>'recurso_considerado_id') is not null then
      select empresa_id into v_recurso_considerado_empresa_id
      from public.recursos_produtivos
      where id = (nullif(v_item->>'recurso_considerado_id', ''))::uuid;

      if v_recurso_considerado_empresa_id is null then
        raise exception 'Recurso considerado % nao encontrado.', v_item->>'recurso_considerado_id';
      end if;

      if v_recurso_considerado_empresa_id <> v_empresa_id then
        raise exception 'Recurso considerado % nao pertence a empresa do projeto.', v_item->>'recurso_considerado_id';
      end if;
    end if;

    if (nullif(v_item->>'necessario', ''))::numeric < 0
      or (nullif(v_item->>'capacidade_bruta', ''))::numeric < 0
      or (nullif(v_item->>'capacidade_efetiva', ''))::numeric < 0
      or (nullif(v_item->>'capacidade_disponivel', ''))::numeric < 0
      or (nullif(v_item->>'comprometido', ''))::numeric < 0
      or (nullif(v_item->>'livre', ''))::numeric < 0
      or (nullif(v_item->>'deficit', ''))::numeric < 0
    then
      raise exception 'Item de simulacao com valor negativo na operacao %: %', v_item->>'bom_operacao_id', v_item;
    end if;
  end loop;

  update public.simulacoes_comerciais
  set vigente = false
  where projeto_id = p_projeto_id
    and vigente = true;

  insert into public.simulacoes_comerciais (
    empresa_id, projeto_id, cenario_demanda, modo_producao, data_necessidade,
    margem_seguranca_dias, janela_inicio, janela_fim, aprovado_por
  )
  values (
    v_empresa_id, p_projeto_id, p_cenario_demanda, p_modo_producao, p_data_necessidade,
    p_margem_seguranca_dias, p_janela_inicio, p_janela_fim, auth.uid()
  )
  returning id into v_snapshot_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    insert into public.simulacao_comercial_itens (
      empresa_id, simulacao_comercial_id,
      bom_operacao_id, recurso_original_id, recurso_considerado_id, motivo_consideracao,
      necessario, capacidade_bruta, capacidade_efetiva, capacidade_disponivel,
      comprometido, livre, deficit
    )
    values (
      v_empresa_id, v_snapshot_id,
      (nullif(v_item->>'bom_operacao_id', ''))::uuid,
      (nullif(v_item->>'recurso_original_id', ''))::uuid, (nullif(v_item->>'recurso_considerado_id', ''))::uuid, v_item->>'motivo_consideracao',
      (nullif(v_item->>'necessario', ''))::numeric, (nullif(v_item->>'capacidade_bruta', ''))::numeric,
      (nullif(v_item->>'capacidade_efetiva', ''))::numeric, (nullif(v_item->>'capacidade_disponivel', ''))::numeric,
      (nullif(v_item->>'comprometido', ''))::numeric, (nullif(v_item->>'livre', ''))::numeric, (nullif(v_item->>'deficit', ''))::numeric
    );
  end loop;

  perform set_config('app.aprovacao_via_function', 'true', true);

  update public.projetos
  set status = 'aprovado'
  where id = p_projeto_id;

  return v_snapshot_id;
end;
$function$;

comment on function public.aprovar_projeto_com_simulacao(uuid, text, text, date, integer, date, date, jsonb) is
  'Aprova um projeto e grava o snapshot de simulacao comercial (cabecalho + 1 item por OPERACAO do roteiro, com bom_operacao_id/recurso_original/recurso_considerado/motivo_consideracao) numa unica transacao atomica. recurso_considerado_id, motivo_consideracao e os 5 campos de capacidade/comprometido/livre podem ser NULL, todos juntos (deficit total - nenhum recurso comportou a operacao), validado nos 3 estados aceitos pela constraint motivo_consistente_chk. SECURITY DEFINER: valida manualmente que o projeto, a operacao e os recursos de cada item pertencem a empresa atual. Marca o snapshot anterior do projeto como vigente=false antes de inserir o novo. Seta a flag app.aprovacao_via_function antes do UPDATE de status, exigida pela trigger projetos_bloquear_aprovacao_direta. Unico caminho valido para aprovar um projeto com simulacao associada - ver ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md.';

-- Ja tinha sido revogado de public/anon na Etapa 3 - reafirma
-- explicitamente apos o CREATE OR REPLACE (assinatura identica, sem
-- mudanca de tipos, mas reafirmar e mais seguro que assumir).
revoke execute on function public.aprovar_projeto_com_simulacao(uuid, text, text, date, integer, date, date, jsonb) from public;
revoke execute on function public.aprovar_projeto_com_simulacao(uuid, text, text, date, integer, date, date, jsonb) from anon;
grant execute on function public.aprovar_projeto_com_simulacao(uuid, text, text, date, integer, date, date, jsonb) to authenticated;
