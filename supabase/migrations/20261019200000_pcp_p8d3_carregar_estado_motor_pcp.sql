-- PCP-P8D.3: RPC de leitura em lote para o assembler do Motor PCP
-- (DEC-P8-04). Resolve o gap encontrado no P8D.2: service_role nao tem
-- SELECT em ordens_fabricacao/ordens_fabricacao_operacoes/
-- of_operacao_dependencias (de proposito, desde o P6E - toda
-- escrita/leitura operacional passa por RPC, nunca scan direto de
-- tabela). Nao concede SELECT novo a service_role nessas tabelas, nem
-- EXECUTE novo a authenticated nas funcoes internas - mantem a barreira
-- de acesso existente.
--
-- Escopo deliberadamente estreito: entrega dados BRUTOS em lote (fila +
-- OFs cujo projeto esta na fila + OPs dessas OFs + dependencias dessas
-- OPs + resolvida/tem_inicio_real por OP, via as 2 funcoes canonicas
-- JA existentes - nunca reimplementadas). NAO decide elegibilidade de
-- OF (estado_aprovacao/estado_execucao), NAO decide elegibilidade de OP
-- (nao_aplicavel), NAO propaga dados insuficientes - isso continua
-- exclusivamente no assembler TypeScript (montarEntradaMotorPcp.ts, ja
-- com 11 testes), para nunca manter a mesma regra em 2 lugares.
--
-- Sem p_empresa_id como parametro: a empresa e SEMPRE resolvida a partir
-- de p_solicitado_por (mesmo padrao de criar_ofs_de_projeto_aprovado/
-- criar_of_substituta) - nunca confia em empresa_id passado solto.
--
-- Sem p_data_inicio/p_data_fim: esta RPC nao carrega calendario nem
-- capacidade (isso e responsabilidade do TypeScript, com
-- carregarContextoCalendario recebendo a janela explicita do chamador -
-- incluir parametro de data aqui seria enganoso, sugerindo um recorte
-- temporal que esta funcao nao aplica).
--
-- recursos_produtivos/recurso_produtivo_compatibilidades NAO entram
-- aqui - ja sao legiveis direto por service_role (confirmado por
-- leitura do catalogo real antes desta migration), sem RPC necessaria.

create or replace function public.carregar_estado_motor_pcp(p_solicitado_por uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_resultado jsonb;
begin
  select empresa_id into v_empresa_id from public.usuarios where id = p_solicitado_por;
  if v_empresa_id is null then
    raise exception 'carregar_estado_motor_pcp: solicitado_por % nao e um usuario valido.', p_solicitado_por;
  end if;

  with fila as (
    select projeto_id, posicao
    from public.pcp_fila_projetos
    where empresa_id = v_empresa_id
  ),
  ofs as (
    select of_t.id, of_t.projeto_id, of_t.quantidade_planejada, of_t.estado_aprovacao, of_t.estado_execucao
    from public.ordens_fabricacao of_t
    where of_t.empresa_id = v_empresa_id
      and of_t.projeto_id in (select projeto_id from fila)
  ),
  ops as (
    select
      op.id, op.of_id, op.nao_aplicavel, op.recurso_vigente_id, op.tempo_vigente_minutos,
      op.tempo_restante_estimado_minutos, op.recurso_restante_estimado_id,
      public.op_esta_resolvida(op.id) as resolvida,
      exists(
        select 1 from public.of_apontamentos_efetivos(op.id) e
        where e.tipo_evento in ('iniciar', 'retomar')
      ) as tem_inicio_real
    from public.ordens_fabricacao_operacoes op
    where op.of_id in (select id from ofs)
  ),
  dependencias as (
    select d.op_origem_id, d.op_dependente_id
    from public.of_operacao_dependencias d
    where d.op_origem_id in (select id from ops)
  )
  select jsonb_build_object(
    'fila', coalesce(
      (select jsonb_agg(jsonb_build_object('projeto_id', projeto_id, 'posicao', posicao)) from fila),
      '[]'::jsonb
    ),
    'ofs', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'id', id, 'projeto_id', projeto_id, 'quantidade_planejada', quantidade_planejada,
        'estado_aprovacao', estado_aprovacao, 'estado_execucao', estado_execucao
      )) from ofs),
      '[]'::jsonb
    ),
    'ops', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'id', id, 'of_id', of_id, 'nao_aplicavel', nao_aplicavel,
        'recurso_vigente_id', recurso_vigente_id, 'tempo_vigente_minutos', tempo_vigente_minutos,
        'tempo_restante_estimado_minutos', tempo_restante_estimado_minutos,
        'recurso_restante_estimado_id', recurso_restante_estimado_id,
        'resolvida', resolvida, 'tem_inicio_real', tem_inicio_real
      )) from ops),
      '[]'::jsonb
    ),
    'dependencias', coalesce(
      (select jsonb_agg(jsonb_build_object('op_origem_id', op_origem_id, 'op_dependente_id', op_dependente_id)) from dependencias),
      '[]'::jsonb
    )
  ) into v_resultado;

  return v_resultado;
end;
$function$;

comment on function public.carregar_estado_motor_pcp(uuid) is
  'PCP-P8D.3/DEC-P8-04: fotografia canonica de leitura em lote para o assembler do Motor PCP. Resolve a empresa pelo solicitado_por (nunca por parametro solto). Entrega dados BRUTOS (fila, OFs cujo projeto esta na fila, OPs dessas OFs, dependencias dessas OPs, resolvida/tem_inicio_real por OP via op_esta_resolvida/of_apontamentos_efetivos) - nunca decide elegibilidade de OF/OP nem propaga dados insuficientes, isso continua exclusivamente em montarEntradaMotorPcp.ts. Sem parametro de empresa ou de janela de datas (esta funcao nao conhece calendario/capacidade). ACL tecnica: service_role-only, fail-closed desde o nascimento.';

revoke all on function public.carregar_estado_motor_pcp(uuid) from public, anon, authenticated;
grant execute on function public.carregar_estado_motor_pcp(uuid) to service_role;
