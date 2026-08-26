-- Incremento 4C (de 4A-4D) do fluxo vertical de Compras - ver "Desenho
-- Tecnico - Fluxo Vertical de Compras" e os Incrementos 4A/4B ja aplicados
-- (materia_prima_unidade_conversoes; estrutura do pipeline). Este
-- incremento cobre SOMENTE as seis funcoes de decisao previstas - nenhuma
-- tela (4D).
--
-- Oito partes:
-- 1. Ajusta registrar_requisicao_compra_material - MESMA assinatura (8
--    parametros), pois tem dois chamadores reais dentro do proprio banco
--    (criar_ordem_fabricacao_operacional, processar_necessidade_material)
--    fora do escopo deste incremento. So passa a resolver unidade_id.
-- 2. Cria criar_planejamento_compra_a_partir_de_requisicoes - agrupa
--    itens de requisicao existentes num novo planejamento, idempotente
--    por chave, trava deterministica (order by id) para evitar deadlock.
-- 3. Cria decidir_compra_planejamento - aplica conversao de unidade e
--    calculo de arredondamento (materia_prima_unidade_conversoes do 4A).
-- 4. Ajusta gerar_pedido_compra_rascunho - passa a congelar os 9 campos
--    de snapshot do 4B; exige status pronto_pedido; trava a linha do
--    planejamento (for update) para impedir pedido duplicado de forma
--    estrutural, nao so por checagem de aplicacao.
-- 5. Cria cadastrar_conversao_compra_material - INSERT simples, herda a
--    RLS admin-only de INSERT do 4A por ser SECURITY INVOKER (nenhuma
--    funcao deste modulo usa SECURITY DEFINER). Sempre insere linha
--    nova - nunca reativa uma conversao inativa (trilha historica).
-- 6. Cria desativar_conversao_compra_material - so ativo=false; NAO
--    toca deleted_at/deleted_by (esses ficam reservados para uma
--    exclusao real, que nenhum papel normal pode fazer - a policy de
--    SELECT do 4A deliberadamente nao filtra por ativo, so por
--    deleted_at is null, para o historico continuar visivel).
-- 7. Remove atualizar_planejamento_compra_decisao pela assinatura exata,
--    com pre-checagem de dependencias (views/triggers/outras funcoes)
--    dentro da mesma transacao - se algo depender dela, a migration
--    inteira aborta e a criacao das funcoes novas tambem e desfeita
--    (mesma transacao, ver BEGIN/COMMIT abaixo).
-- 8. UNIQUE(planejamento_compra_id) em pedidos_compra - garantia
--    estrutural independente contra pedido duplicado, alem do FOR
--    UPDATE + status pronto_pedido da PARTE 4.
--
-- Seguranca: as 6 funcoes das PARTES 1-6 sao SECURITY INVOKER (nenhuma
-- usa SECURITY DEFINER) - a autorizacao vem das RLS ja existentes nas
-- tabelas (tenant em todas; admin-only especificamente em INSERT/UPDATE
-- de materia_prima_unidade_conversoes, herdada sem codigo extra pelas
-- PARTES 5/6). Alem disso, cada uma das 6 tem EXECUTE revogado de
-- public e anon e concedido explicitamente so a authenticated -
-- decisao explicita: mesmo SECURITY INVOKER nao dependendo do grant
-- para a autorizacao de negocio (a RLS ja barra), uma superficie
-- publica desnecessaria nao se justifica so por consistencia com
-- funcoes mais antigas do modulo (que mantem o grant padrao do
-- Postgres). service_role e o dono (postgres) nao sao tocados.
--
-- BEGIN/COMMIT explicito: mesma licao das migrations anteriores.

begin;

-- ============================================================
-- PARTE 1: registrar_requisicao_compra_material - resolve unidade_id
-- ============================================================

create or replace function public.registrar_requisicao_compra_material(
  p_projeto_id uuid,
  p_of_numero text,
  p_materia_prima_id uuid,
  p_quantidade numeric,
  p_unidade text,
  p_data_necessidade_material date,
  p_observacoes text default null,
  p_of_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_requisicao_id uuid;
  v_unidade_id uuid;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  if p_quantidade <= 0 then
    raise exception 'Quantidade da requisicao deve ser maior que zero.';
  end if;

  if p_unidade not in ('kg', 'metro', 'barra', 'chapa', 'peca') then
    raise exception 'Unidade invalida para requisicao de compra.';
  end if;

  select id into v_unidade_id
  from public.unidades_medida
  where empresa_id = v_empresa_id
    and codigo = lower(btrim(p_unidade));

  if v_unidade_id is null then
    raise exception 'Unidade "%" nao encontrada no catalogo de unidades da empresa atual - nao e possivel registrar a requisicao sem uma unidade valida.', p_unidade;
  end if;

  insert into public.requisicoes_compra (
    empresa_id,
    projeto_id,
    of_numero,
    of_id,
    data_necessidade_material,
    status,
    observacoes,
    created_by
  )
  values (
    v_empresa_id,
    p_projeto_id,
    p_of_numero,
    p_of_id,
    p_data_necessidade_material,
    'aberta',
    coalesce(p_observacoes, 'Compra externa gerada por falta de saldo livre'),
    auth.uid()
  )
  returning id into v_requisicao_id;

  insert into public.requisicao_compra_itens (
    empresa_id,
    requisicao_compra_id,
    materia_prima_id,
    quantidade_necessaria,
    unidade,
    unidade_id,
    observacoes,
    created_by
  )
  values (
    v_empresa_id,
    v_requisicao_id,
    p_materia_prima_id,
    p_quantidade,
    p_unidade,
    v_unidade_id,
    p_observacoes,
    auth.uid()
  );

  return v_requisicao_id;
end;
$$;

revoke execute on function public.registrar_requisicao_compra_material(uuid, text, uuid, numeric, text, date, text, uuid) from public, anon;
grant execute on function public.registrar_requisicao_compra_material(uuid, text, uuid, numeric, text, date, text, uuid) to authenticated;

comment on function public.registrar_requisicao_compra_material(uuid, text, uuid, numeric, text, date, text, uuid) is
  'Registra requisicao de compra externamente vinculada a uma OF. Desde o Incremento 4C, resolve e grava unidade_id (FK para unidades_medida) a partir de p_unidade - erro explicito se a unidade nao existir no catalogo da empresa atual, nunca grava unidade_id nulo silenciosamente. Assinatura preservada identica: registrar_consumo_interno de processar_necessidade_material (7 args, p_of_id implicito null) e criar_ordem_fabricacao_operacional (8 args) continuam chamando sem alteracao.';

-- ============================================================
-- PARTE 2: criar_planejamento_compra_a_partir_de_requisicoes
-- ============================================================

create or replace function public.criar_planejamento_compra_a_partir_de_requisicoes(
  p_requisicao_compra_item_ids uuid[],
  p_chave_idempotencia text,
  p_modo_planejamento text default 'manual',
  p_descricao_compra text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_pedidos_ordenados uuid[];
  v_existente_id uuid;
  v_existente_itens uuid[];
  v_materia_prima_id uuid;
  v_unidade_id uuid;
  v_unidade_texto text;
  v_descricao_mp text;
  v_descricao_final text;
  v_quantidade_total numeric;
  v_count_encontrado int := 0;
  v_planejamento_id uuid;
  v_item record;
  v_constraint_name text;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  if p_requisicao_compra_item_ids is null or array_length(p_requisicao_compra_item_ids, 1) is null then
    raise exception 'Informe ao menos um item de requisicao para agrupar.';
  end if;

  if p_chave_idempotencia is null or btrim(p_chave_idempotencia) = '' then
    raise exception 'chave_idempotencia obrigatoria e nao pode ser vazia ou apenas espacos.';
  end if;

  if p_modo_planejamento not in ('manual', 'somar_todas', 'por_of', 'agrupamento_parcial') then
    raise exception 'Modo de planejamento invalido.';
  end if;

  if array_length(p_requisicao_compra_item_ids, 1) <> (
    select count(distinct x) from unnest(p_requisicao_compra_item_ids) as x
  ) then
    raise exception 'A lista de itens de requisicao nao pode conter IDs repetidos.';
  end if;

  -- Conjunto pedido, normalizado (ordenado) para comparacao
  -- independente da ordem recebida - lista ja garantida sem repeticao
  -- pela checagem acima.
  select array_agg(x order by x) into v_pedidos_ordenados
  from unnest(p_requisicao_compra_item_ids) as x;

  -- Idempotencia: replay real (retorna o planejamento ja criado), nao
  -- erro de retry. So aceita o replay se o conjunto de itens bater
  -- exatamente (ordem-independente) com o que foi usado da primeira vez
  -- - reuso da mesma chave para um conjunto diferente e um erro real.
  select id into v_existente_id
  from public.planejamentos_compra
  where empresa_id = v_empresa_id
    and chave_idempotencia = p_chave_idempotencia;

  if found then
    select array_agg(requisicao_compra_item_id order by requisicao_compra_item_id) into v_existente_itens
    from public.planejamento_compra_origens
    where planejamento_compra_id = v_existente_id
      and origem_ativa = true;

    if v_existente_itens is distinct from v_pedidos_ordenados then
      raise exception 'chave_idempotencia "%" ja foi usada para agrupar um conjunto diferente de itens de requisicao - use uma chave nova para um agrupamento diferente.', p_chave_idempotencia;
    end if;

    return jsonb_build_object('planejamento_id', v_existente_id, 'ja_existia', true);
  end if;

  -- Trava deterministica (order by id) dos itens a agrupar - evita
  -- deadlock com outra chamada concorrente que agrupe um subconjunto
  -- sobreposto. RLS de requisicao_compra_itens ja restringe a leitura
  -- a linhas ativas da empresa atual.
  for v_item in
    select * from public.requisicao_compra_itens
    where id = any(p_requisicao_compra_item_ids)
    order by id
    for update
  loop
    v_count_encontrado := v_count_encontrado + 1;

    if v_materia_prima_id is null then
      v_materia_prima_id := v_item.materia_prima_id;
    elsif v_materia_prima_id <> v_item.materia_prima_id then
      raise exception 'Todos os itens de requisicao agrupados em um planejamento devem ser da mesma materia-prima.';
    end if;

    if v_item.unidade_id is null then
      raise exception 'Item de requisicao % nao tem unidade_id resolvida no catalogo - normalize esse item antes de agrupar.', v_item.id;
    end if;

    if v_unidade_id is null then
      v_unidade_id := v_item.unidade_id;
      v_unidade_texto := v_item.unidade;
    elsif v_unidade_id <> v_item.unidade_id then
      raise exception 'Todos os itens de requisicao agrupados em um planejamento devem estar na mesma unidade tecnica.';
    end if;

    v_quantidade_total := coalesce(v_quantidade_total, 0) + v_item.quantidade_necessaria;
  end loop;

  if v_count_encontrado <> array_length(p_requisicao_compra_item_ids, 1) then
    raise exception 'Um ou mais IDs de item de requisicao nao foram encontrados na empresa atual.';
  end if;

  select descricao into v_descricao_mp from public.materias_primas where id = v_materia_prima_id;
  v_descricao_final := coalesce(p_descricao_compra, v_descricao_mp, 'Planejamento de compra');

  -- Bloco com EXCEPTION cria um savepoint implicito: cobre TANTO a
  -- corrida na chave_idempotencia (23505 na UNIQUE do 4B, quando duas
  -- chamadas concorrentes passam pela checagem "not found" acima antes
  -- de qualquer uma commitar) QUANTO uma origem ja vinculada em outro
  -- planejamento ativo (23505 no indice parcial do 4B) - se qualquer
  -- INSERT falhar aqui, TUDO deste bloco (planejamento + origens ja
  -- inseridas) e desfeito junto, nao fica planejamento parcial.
  -- GET STACKED DIAGNOSTICS ... CONSTRAINT_NAME desambigua qual das
  -- duas constraints foi violada para tratar cada caso corretamente.
  begin
    insert into public.planejamentos_compra (
      empresa_id, materia_prima_id, descricao_compra, unidade_necessidade, unidade_necessidade_id,
      quantidade_necessaria_total, modo_planejamento, chave_idempotencia, created_by
    ) values (
      v_empresa_id, v_materia_prima_id, v_descricao_final, v_unidade_texto, v_unidade_id,
      v_quantidade_total, p_modo_planejamento, p_chave_idempotencia, auth.uid()
    )
    returning id into v_planejamento_id;

    for v_item in
      select * from public.requisicao_compra_itens where id = any(p_requisicao_compra_item_ids)
    loop
      insert into public.planejamento_compra_origens (
        empresa_id, planejamento_compra_id, requisicao_compra_id, requisicao_compra_item_id,
        quantidade_necessaria, unidade, created_by
      ) values (
        v_empresa_id, v_planejamento_id, v_item.requisicao_compra_id, v_item.id,
        v_item.quantidade_necessaria, v_item.unidade, auth.uid()
      );
    end loop;
  exception when unique_violation then
    get stacked diagnostics v_constraint_name = constraint_name;

    if v_constraint_name = 'planejamentos_compra_empresa_chave_idemp_uniq' then
      -- Perdedor real da corrida na chave idempotente: trata como
      -- replay verdadeiro, nao como erro - mesma semantica do "if
      -- found" no topo da funcao, so que descoberta tarde (na hora do
      -- INSERT) em vez de cedo (na hora do SELECT).
      select id into v_existente_id
      from public.planejamentos_compra
      where empresa_id = v_empresa_id
        and chave_idempotencia = p_chave_idempotencia;

      select array_agg(requisicao_compra_item_id order by requisicao_compra_item_id) into v_existente_itens
      from public.planejamento_compra_origens
      where planejamento_compra_id = v_existente_id
        and origem_ativa = true;

      if v_existente_itens is distinct from v_pedidos_ordenados then
        raise exception 'chave_idempotencia "%" ja foi usada (por uma chamada concorrente) para agrupar um conjunto diferente de itens de requisicao - use uma chave nova para um agrupamento diferente.', p_chave_idempotencia;
      end if;

      return jsonb_build_object('planejamento_id', v_existente_id, 'ja_existia', true);
    else
      raise exception 'Uma ou mais requisicoes selecionadas ja estao vinculadas a outro planejamento ativo.';
    end if;
  end;

  return jsonb_build_object('planejamento_id', v_planejamento_id, 'ja_existia', false);
end;
$$;

revoke execute on function public.criar_planejamento_compra_a_partir_de_requisicoes(uuid[], text, text, text) from public, anon;
grant execute on function public.criar_planejamento_compra_a_partir_de_requisicoes(uuid[], text, text, text) to authenticated;

comment on function public.criar_planejamento_compra_a_partir_de_requisicoes(uuid[], text, text, text) is
  'Agrupa itens de requisicao de compra existentes em um novo planejamento, criando o vinculo de origem ativa para cada um (garantia estrutural contra vinculo duplicado ja existe no indice unico parcial do 4B). Idempotente por (empresa_id, chave_idempotencia), inclusive sob corrida real: duas chamadas concorrentes com a mesma chave nunca criam dois planejamentos (UNIQUE do 4B) - a perdedora da corrida detecta o 23505 via GET STACKED DIAGNOSTICS CONSTRAINT_NAME e retorna {planejamento_id, ja_existia:true} do vencedor, em vez de erro. Replay/corrida so aceitos se o conjunto de itens bater exatamente (comparado independente de ordem, sem aceitar IDs repetidos no array); erro se a mesma chave for reusada com um conjunto diferente. Itens travados em ordem deterministica (order by id, FOR UPDATE) para evitar deadlock com agrupamentos concorrentes sobrepostos. Retorno jsonb {planejamento_id uuid, ja_existia boolean}.';

-- ============================================================
-- PARTE 3: decidir_compra_planejamento
-- ============================================================

create or replace function public.decidir_compra_planejamento(
  p_planejamento_compra_id uuid,
  p_unidade_compra_id uuid,
  p_preco_unitario_estimado numeric default null
)
returns jsonb
language plpgsql
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_planejamento record;
  v_conversao record;
  v_rendimento numeric;
  v_multiplo numeric;
  v_admite_fracao boolean;
  v_regra text;
  v_quantidade_base numeric;
  v_quantidade_comprada numeric;
  v_sobra numeric;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  if p_preco_unitario_estimado is not null and p_preco_unitario_estimado < 0 then
    raise exception 'Preco unitario estimado nao pode ser negativo.';
  end if;

  select * into v_planejamento
  from public.planejamentos_compra
  where id = p_planejamento_compra_id
    and empresa_id = v_empresa_id
    and ativo = true
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Planejamento de compras nao encontrado.';
  end if;

  if v_planejamento.status <> 'em_planejamento' then
    raise exception 'Planejamento com status "%" nao pode receber nova decisao de compra - apenas planejamentos em_planejamento.', v_planejamento.status;
  end if;

  -- Conversao ativa e exata para empresa + materia-prima + unidade
  -- tecnica + unidade de compra informada (4A). Mesma unidade tecnica e
  -- de compra SEM conversao cadastrada = caminho direto (rendimento 1,
  -- sem lote minimo, sobra zero). Unidade diferente SEM conversao =
  -- erro - nao ha como converter sem o registro. Mesma unidade COM
  -- conversao cadastrada tambem aplica a conversao normalmente (caso
  -- do lote minimo mesmo na mesma unidade, ex.: saco de 25 kg).
  select * into v_conversao
  from public.materia_prima_unidade_conversoes
  where empresa_id = v_empresa_id
    and materia_prima_id = v_planejamento.materia_prima_id
    and unidade_tecnica_id = v_planejamento.unidade_necessidade_id
    and unidade_compra_id = p_unidade_compra_id
    and ativo = true;

  if not found then
    if p_unidade_compra_id = v_planejamento.unidade_necessidade_id then
      v_rendimento := 1;
      v_multiplo := 1;
      v_admite_fracao := true;
    else
      raise exception 'Nao existe conversao ativa cadastrada para esta materia-prima entre a unidade de necessidade e a unidade de compra informada - cadastre a conversao antes de decidir a compra.';
    end if;
  else
    v_rendimento := v_conversao.rendimento_tecnico_por_unidade_comprada;
    v_multiplo := v_conversao.multiplo_minimo_compra;
    v_admite_fracao := v_conversao.admite_fracao;
  end if;

  -- Formula ja aprovada: quantidade-base = necessidade / rendimento;
  -- admite fracao e multiplo=1 -> compra exata, sem regra; admite
  -- fracao e multiplo<>1 -> arredonda para cima no multiplo (que pode
  -- ser fracionario); nao admite fracao -> arredonda para cima no
  -- multiplo (sempre inteiro). Sobra = comprada * rendimento - necessidade.
  --
  -- Precisao decimal (numeric sem escala fixa nas colunas - politica
  -- aplicada aqui na funcao, nao no schema): quantidade-base fica SEM
  -- arredondamento intermediario ate aqui, justamente para o ceil()
  -- operar sobre o valor exato (arredondar antes do ceil() e que
  -- causaria excesso/falta artificial na quantidade comprada).
  -- rendimento_aplicado/multiplo_aplicado NUNCA sao arredondados - sao
  -- copiados verbatim do cadastro (ou fixados em 1 no caminho direto),
  -- preservando a precisao que o administrador registrou. O resultado
  -- FINAL (quantidade comprada) e SEMPRE arredondado PARA CIMA em 4
  -- casas decimais (CEIL(x*10000)/10000, nunca ROUND) no momento de
  -- gravar - arredondar para o mais proximo (ou para baixo) entregaria
  -- menos material do que a necessidade pede (ex.: necessidade=10,
  -- rendimento=3 -> base=3.333...; ROUND daria 3.3333, cobrindo so
  -- 9.9999 - CEIL da 3.3334, cobrindo 10.0002, nunca menos que 10). A
  -- sobra e calculada a partir da quantidade JA arredondada para cima
  -- (para os dois numeros gravados serem consistentes entre si) - por
  -- construcao (CEIL so aumenta), sobra nunca e negativa antes mesmo do
  -- GREATEST(...,0), que fica so como protecao residual (nunca deve
  -- mascarar uma compra insuficiente, so blindar contra um raro residuo
  -- negativo de arredondamento no proprio ROUND da sobra).
  v_quantidade_base := v_planejamento.quantidade_necessaria_total / v_rendimento;

  if v_admite_fracao then
    if v_multiplo = 1 then
      v_quantidade_comprada := v_quantidade_base;
      v_regra := 'automatico_sem_regra';
    else
      v_quantidade_comprada := ceil(v_quantidade_base / v_multiplo) * v_multiplo;
      v_regra := 'multiplo_fracionavel';
    end if;
  else
    v_quantidade_comprada := ceil(v_quantidade_base / v_multiplo) * v_multiplo;
    v_regra := 'multiplo_inteiro';
  end if;

  v_quantidade_comprada := ceil(v_quantidade_comprada * 10000) / 10000;

  -- Assert interno: a quantidade comprada (ja arredondada) tem que
  -- cobrir a necessidade - se isto disparar, e um erro de logica desta
  -- funcao, nao uma condicao de negocio esperada.
  if v_quantidade_comprada * v_rendimento < v_planejamento.quantidade_necessaria_total then
    raise exception 'Erro interno: quantidade comprada (%) x rendimento (%) = % e menor que a necessidade (%) - arredondamento nao pode permitir compra insuficiente.',
      v_quantidade_comprada, v_rendimento, v_quantidade_comprada * v_rendimento, v_planejamento.quantidade_necessaria_total;
  end if;

  v_sobra := greatest(round(v_quantidade_comprada * v_rendimento - v_planejamento.quantidade_necessaria_total, 4), 0);

  update public.planejamentos_compra
  set unidade_compra_id = p_unidade_compra_id,
      rendimento_aplicado = v_rendimento,
      multiplo_aplicado = v_multiplo,
      regra_arredondamento = v_regra,
      quantidade_planejada_compra = v_quantidade_comprada,
      sobra_prevista = v_sobra,
      preco_unitario_estimado = p_preco_unitario_estimado,
      status = 'pronto_pedido'
  where id = p_planejamento_compra_id;

  return jsonb_build_object(
    'planejamento_id', p_planejamento_compra_id,
    'rendimento_aplicado', v_rendimento,
    'multiplo_aplicado', v_multiplo,
    'regra_arredondamento', v_regra,
    'quantidade_planejada_compra', v_quantidade_comprada,
    'sobra_prevista', v_sobra
  );
end;
$$;

revoke execute on function public.decidir_compra_planejamento(uuid, uuid, numeric) from public, anon;
grant execute on function public.decidir_compra_planejamento(uuid, uuid, numeric) to authenticated;

comment on function public.decidir_compra_planejamento(uuid, uuid, numeric) is
  'Aplica a conversao de unidade e o calculo de arredondamento sobre um planejamento em_planejamento, usando materia_prima_unidade_conversoes (4A) quando existir uma conversao ativa exata para a combinacao empresa+materia-prima+unidade tecnica+unidade de compra; mesma unidade sem conversao cadastrada usa caminho direto (rendimento 1, sem lote minimo); mesma unidade COM conversao cadastrada aplica a conversao normalmente (cobre lote minimo mesmo sem trocar de unidade, ex. saco de 25kg). Precisao: rendimento_aplicado/multiplo_aplicado nunca sao arredondados (copiados verbatim); quantidade_planejada_compra e SEMPRE arredondada PARA CIMA em 4 casas decimais (CEIL(x*10000)/10000, nunca ROUND) para nunca entregar menos material que a necessidade - garantido por um assert interno (quantidade*rendimento >= necessidade). sobra_prevista arredondada normalmente e passa por GREATEST(...,0) so como protecao residual, nao para mascarar compra insuficiente. Move o planejamento para pronto_pedido. Substitui atualizar_planejamento_compra_decisao (ver PARTE 7).';

-- ============================================================
-- PARTE 4: gerar_pedido_compra_rascunho - congela snapshot do 4B
-- ============================================================

create or replace function public.gerar_pedido_compra_rascunho(
  p_planejamento_compra_id uuid,
  p_fornecedor_nome text default null
)
returns uuid
language plpgsql
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_planejamento record;
  v_unidade_compra_codigo text;
  v_pedido_id uuid;
begin
  -- FOR UPDATE trava a linha do planejamento: se duas chamadas
  -- concorrentes tentarem gerar pedido do mesmo planejamento, a segunda
  -- so prossegue apos a primeira commitar - e nesse ponto o status ja
  -- e convertido_pedido, entao a checagem abaixo rejeita. Garantia
  -- estrutural contra pedido duplicado, nao so checagem de aplicacao.
  select * into v_planejamento
  from public.planejamentos_compra
  where id = p_planejamento_compra_id
    and empresa_id = v_empresa_id
    and ativo = true
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Planejamento de compras nao encontrado.';
  end if;

  if v_planejamento.status <> 'pronto_pedido' then
    raise exception 'Planejamento com status "%" nao pode gerar pedido - e necessario decidir a compra primeiro (status pronto_pedido).', v_planejamento.status;
  end if;

  select codigo into v_unidade_compra_codigo
  from public.unidades_medida
  where id = v_planejamento.unidade_compra_id;

  insert into public.pedidos_compra (
    empresa_id, planejamento_compra_id, fornecedor_nome, status, created_by
  )
  values (v_empresa_id, p_planejamento_compra_id, p_fornecedor_nome, 'rascunho', auth.uid())
  returning id into v_pedido_id;

  insert into public.pedido_compra_itens (
    empresa_id, pedido_compra_id, planejamento_compra_id, materia_prima_id,
    descricao_compra, quantidade, unidade, comprar_descricao, created_by,
    unidade_necessidade_id, unidade_compra_id, rendimento_aplicado, multiplo_aplicado,
    regra_arredondamento, quantidade_necessaria, sobra_calculada, preco_unitario
  )
  values (
    v_empresa_id, v_pedido_id, p_planejamento_compra_id, v_planejamento.materia_prima_id,
    v_planejamento.descricao_compra, v_planejamento.quantidade_planejada_compra, v_unidade_compra_codigo,
    v_planejamento.comprar_descricao, auth.uid(),
    v_planejamento.unidade_necessidade_id, v_planejamento.unidade_compra_id, v_planejamento.rendimento_aplicado,
    v_planejamento.multiplo_aplicado, v_planejamento.regra_arredondamento, v_planejamento.quantidade_necessaria_total,
    v_planejamento.sobra_prevista, v_planejamento.preco_unitario_estimado
  );

  update public.planejamentos_compra
  set status = 'convertido_pedido'
  where id = p_planejamento_compra_id;

  return v_pedido_id;
end;
$$;

revoke execute on function public.gerar_pedido_compra_rascunho(uuid, text) from public, anon;
grant execute on function public.gerar_pedido_compra_rascunho(uuid, text) to authenticated;

comment on function public.gerar_pedido_compra_rascunho(uuid, text) is
  'Gera pedido de compra em rascunho a partir de um planejamento pronto_pedido, congelando os 9 campos de snapshot/preco do 4B em pedido_compra_itens (imutaveis depois via trigger da PARTE 4 do 4B). Exige status pronto_pedido; trava a linha do planejamento (FOR UPDATE) e move para convertido_pedido na mesma transacao, o que impede estruturalmente gerar um segundo pedido para o mesmo planejamento.';

-- ============================================================
-- PARTE 5: cadastrar_conversao_compra_material
-- ============================================================

create or replace function public.cadastrar_conversao_compra_material(
  p_materia_prima_id uuid,
  p_unidade_tecnica_id uuid,
  p_unidade_compra_id uuid,
  p_rendimento_tecnico_por_unidade_comprada numeric,
  p_multiplo_minimo_compra numeric default 1,
  p_admite_fracao boolean default false
)
returns uuid
language plpgsql
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_conversao_id uuid;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  begin
    insert into public.materia_prima_unidade_conversoes (
      empresa_id, materia_prima_id, unidade_tecnica_id, unidade_compra_id,
      rendimento_tecnico_por_unidade_comprada, multiplo_minimo_compra, admite_fracao, created_by
    ) values (
      v_empresa_id, p_materia_prima_id, p_unidade_tecnica_id, p_unidade_compra_id,
      p_rendimento_tecnico_por_unidade_comprada, p_multiplo_minimo_compra, p_admite_fracao, auth.uid()
    )
    returning id into v_conversao_id;
  exception when unique_violation then
    raise exception 'Ja existe uma conversao ATIVA cadastrada para esta combinacao de materia-prima, unidade tecnica e unidade de compra - desative a existente antes de cadastrar uma nova.';
  end;

  return v_conversao_id;
end;
$$;

revoke execute on function public.cadastrar_conversao_compra_material(uuid, uuid, uuid, numeric, numeric, boolean) from public, anon;
grant execute on function public.cadastrar_conversao_compra_material(uuid, uuid, uuid, numeric, numeric, boolean) to authenticated;

comment on function public.cadastrar_conversao_compra_material(uuid, uuid, uuid, numeric, numeric, boolean) is
  'Cadastra uma nova conversao de unidade para uma materia-prima (SECURITY INVOKER - herda a RLS admin-only de INSERT do 4A). Sempre insere uma linha nova, mesmo se ja existir uma conversao INATIVA para a mesma chave - nunca reativa, para preservar trilha historica inequivoca (decisao explicita). Erro legivel se ja existir uma conversao ATIVA para a mesma chave (violaria o indice unico parcial do 4A).';

-- ============================================================
-- PARTE 6: desativar_conversao_compra_material
-- ============================================================

create or replace function public.desativar_conversao_compra_material(
  p_conversao_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  -- So ativo=false. NAO toca deleted_at/deleted_by de proposito: a
  -- policy de SELECT do 4A filtra por deleted_at is null mas
  -- deliberadamente NAO por ativo, para que conversoes desativadas
  -- continuem visiveis como historico. Nao bloqueia por planejamentos
  -- em andamento que ja usaram esta conversao (decisao explicita) - os
  -- valores ja aplicados foram congelados em planejamentos_compra no
  -- momento da decisao e nao dependem da conversao continuar ativa;
  -- so novas decisoes deixam de encontra-la a partir de agora.
  update public.materia_prima_unidade_conversoes
  set ativo = false
  where id = p_conversao_id
    and empresa_id = v_empresa_id
    and ativo = true;

  if not found then
    raise exception 'Conversao de unidade nao encontrada ou ja inativa.';
  end if;

  return p_conversao_id;
end;
$$;

revoke execute on function public.desativar_conversao_compra_material(uuid) from public, anon;
grant execute on function public.desativar_conversao_compra_material(uuid) to authenticated;

comment on function public.desativar_conversao_compra_material(uuid) is
  'Desativa uma conversao de unidade (ativo=false) sem apagar fisicamente e sem tocar deleted_at/deleted_by - permanece visivel como historico (RLS de SELECT do 4A nao filtra por ativo). Nao bloqueia desativacao de conversao usada por planejamento em andamento (decisao explicita): valores ja congelados independem da linha continuar ativa.';

-- ============================================================
-- PARTE 7: remove atualizar_planejamento_compra_decisao (superada
-- por decidir_compra_planejamento, PARTE 3, ja criada acima)
-- ============================================================

-- Pre-checagem de dependencias reais no banco, dentro da MESMA
-- transacao desta migration - se qualquer coisa depender da funcao
-- antiga, aborta aqui e a criacao das 6 funcoes acima tambem e desfeita
-- (BEGIN/COMMIT unico). Evidencia de ausencia de dependentes ja foi
-- levantada manualmente antes desta migration (grep em src/, scan de
-- pg_proc/pg_views/pg_trigger) - este bloco e a mesma checagem lado
-- banco, reconferida no exato momento da execucao real.
do $$
declare
  v_views int;
  v_triggers int;
  v_funcs int;
begin
  select count(*) into v_views
  from pg_views
  where schemaname = 'public'
    and definition ilike '%atualizar_planejamento_compra_decisao%';

  select count(*) into v_triggers
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where p.prosrc ilike '%atualizar_planejamento_compra_decisao%';

  select count(*) into v_funcs
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosrc ilike '%atualizar_planejamento_compra_decisao%'
    and p.proname <> 'atualizar_planejamento_compra_decisao';

  if v_views > 0 or v_triggers > 0 or v_funcs > 0 then
    raise exception 'atualizar_planejamento_compra_decisao ainda tem dependentes no banco (views=%, triggers=%, funcoes=%) - abortando remocao.', v_views, v_triggers, v_funcs;
  end if;
end $$;

drop function public.atualizar_planejamento_compra_decisao(uuid, text, text, numeric, text, numeric);

-- ============================================================
-- PARTE 8: unicidade estrutural de pedido por planejamento - reforca
-- a garantia da PARTE 4 (FOR UPDATE + status pronto_pedido) com uma
-- constraint independente de qualquer raciocinio sobre timing de
-- transacao. pedidos_compra tem 0 linhas hoje - sem pre-checagem
-- customizada, so um assert direto (mesmo espirito da Etapa 4A).
-- Nao parcial: planejamento_compra_id nullable ja permite multiplos
-- NULL sob UNIQUE (nulls nao colidem entre si no Postgres). Uma futura
-- funcao de cancelamento/regeneracao de pedido precisaria revisitar
-- isto (indice parcial excluindo status='cancelado'), mas essa funcao
-- nao existe neste incremento.
-- ============================================================

do $$
declare
  v_dup int;
begin
  select count(*) into v_dup from (
    select planejamento_compra_id
    from public.pedidos_compra
    where planejamento_compra_id is not null
    group by planejamento_compra_id
    having count(*) > 1
  ) d;

  if v_dup > 0 then
    raise exception 'Existem % planejamento(s) de compra com mais de um pedido vinculado - resolva manualmente antes de aplicar a UNIQUE.', v_dup;
  end if;
end $$;

alter table public.pedidos_compra
  add constraint pedidos_compra_planejamento_compra_id_uniq
  unique (planejamento_compra_id);

comment on constraint pedidos_compra_planejamento_compra_id_uniq on public.pedidos_compra is
  'No maximo um pedido por planejamento de compras - garantia estrutural contra pedido duplicado, independente do FOR UPDATE de gerar_pedido_compra_rascunho (defesa em profundidade, mesmo espirito do trigger de imutabilidade do 4B). NULL permitido multiplas vezes (Postgres nao trata NULL como duplicado em UNIQUE).';

commit;
