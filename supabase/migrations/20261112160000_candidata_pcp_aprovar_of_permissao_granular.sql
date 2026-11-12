-- NEXOTFE-PCP — Autorização granular de aprovar_of (Grupo de Acesso).
--
-- *** MIGRATION CANDIDATA — ARTEFATO DE DESENVOLVIMENTO ***
-- Preparada em resposta a uma divergência real encontrada ao investigar
-- a integração do botão "Aprovar OF" à interface oficial: aprovar_of
-- (e só ela, nesta rodada) autorizava por
-- `usuario_e_admin() OR usuario_tem_papel_funcional('pcp')` - modelo
-- antigo, sem chave no catálogo granular `permissoes` que o resto do
-- PCP já usa (pcp.liberar_of). Isso quebraria a regra GLOBAL já
-- decidida para o NEXOTFE: autorização por AÇÃO, via Grupos de Acesso
-- configurados pelo ADM - nunca por papel/flag solto.
--
-- NÃO aplicada contra o banco remoto/produção até autorização expressa
-- e separada (CLAUDE.md Regra 9). Testada SÓ em ambiente descartável
-- local. Ver
-- supabase/tests/pcp_aprovar_of_permissao_granular_teste.sql.
--
-- Escopo DELIBERADAMENTE LIMITADO a aprovar_of (o que está sendo
-- conectado à interface agora). reprovar_of/resubmeter_of_para_auditoria/
-- ajustar_of têm a MESMA lacuna (mesmo modelo antigo) - registrada como
-- pendência separada, fora desta rodada, para não misturar decisões.
--
-- Continuidade verificada por leitura direta do banco vinculado ANTES
-- desta migration: os 3 administradores reais hoje (2 na empresa
-- f835684a-..., 1 na d7b40f3a-...) já pertencem a um grupo com
-- e_grupo_adm=true e já passam usuario_tem_permissao(...) para a chave
-- pcp.liberar_of existente - a troca de fonte de autorização em
-- aprovar_of não os bloqueia. O papel funcional 'pcp'
-- (usuarios_papeis_funcionais) tem ZERO usuários vinculados hoje - a
-- troca não afeta ninguém que dependesse dele.

insert into public.permissoes (chave, recurso, acao, categoria, nome, descricao) values
  ('pcp.aprovar_of', 'pcp', 'aprovar_of', 'sensivel',
   'Aprovar Ordem de Fabricação',
   'Permite aprovar uma OF em auditoria (aguardando_auditoria -> aprovada), liberando-a para preparação do PCP.')
on conflict (chave) do nothing;

create or replace function public.aprovar_of(p_of_id uuid, p_observacao text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid;
  v_empresa_id uuid;
  v_of record;
  v_rows integer;
  v_necessidades jsonb;
  v_ci_ce jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'aprovar_of: sessao invalida.';
  end if;

  v_empresa_id := public.empresa_atual_id();
  if v_empresa_id is null then
    raise exception 'aprovar_of: empresa atual nao encontrada.';
  end if;

  if not coalesce(public.usuario_tem_permissao(v_uid, 'pcp.aprovar_of'), false) then
    raise exception 'aprovar_of: usuario sem permissao para aprovar OF.';
  end if;

  perform 1 from public.ordens_fabricacao where id = p_of_id and empresa_id = v_empresa_id;
  if not found then
    raise exception 'aprovar_of: OF nao encontrada.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_id::text, 0));

  select * into v_of from public.ordens_fabricacao where id = p_of_id and empresa_id = v_empresa_id;
  if not found then
    raise exception 'aprovar_of: OF nao encontrada.';
  end if;

  if v_of.estado_aprovacao is not distinct from 'aprovada'
     and v_of.estado_execucao is not distinct from 'planejada' then
    return jsonb_build_object('resultado', 'ja_aprovada', 'of_id', v_of.id, 'numero_of', v_of.numero_of);
  end if;

  if v_of.estado_aprovacao is distinct from 'aguardando_auditoria'
     or v_of.estado_execucao is distinct from 'planejada' then
    raise exception 'aprovar_of: transicao invalida - OF % em %/%.', v_of.numero_of, v_of.estado_aprovacao, v_of.estado_execucao;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('subconjunto-grafo:' || v_empresa_id::text, 0));

  update public.ordens_fabricacao
    set estado_aprovacao = 'aprovada',
        estado_execucao = 'planejada',
        estado_aprovacao_em = now(),
        estado_aprovacao_por = v_uid,
        estado_aprovacao_observacao = p_observacao
    where id = p_of_id
      and empresa_id = v_empresa_id
      and estado_aprovacao = 'aguardando_auditoria'
      and estado_execucao = 'planejada';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'aprovar_of: falha ao aprovar OF % - estado mudou durante a operacao.', p_of_id;
  end if;

  -- Momento Y: quando o interruptor desta empresa esta ligado, a
  -- necessidade oficial e a decisao CI/CE deixam de nascer aqui -
  -- ficam pendentes de confirmar_necessidades_momento_y. Nenhuma
  -- mudanca de comportamento para empresas sem o interruptor ligado.
  if public.momento_y_ativo_para_empresa(v_empresa_id) then
    return jsonb_build_object(
      'resultado', 'aprovada', 'of_id', p_of_id, 'numero_of', v_of.numero_of,
      'momento_y_pendente', true
    );
  end if;

  v_necessidades := public.gerar_necessidades_de_of(p_of_id, v_empresa_id);

  -- Incremento 6 (fluxo legado, inalterado): decisao automatica CI/CE,
  -- mesma transacao, sem handler - falha aqui desfaz TUDO (aprovacao +
  -- necessidades geradas), mesma propagacao natural ja usada entre
  -- aprovar_of/gerar_necessidades_de_of.
  v_ci_ce := public.decidir_ci_ce_de_of(p_of_id, v_empresa_id);

  return jsonb_build_object(
    'resultado', 'aprovada', 'of_id', p_of_id, 'numero_of', v_of.numero_of,
    'necessidades', v_necessidades,
    'decisao_ci_ce', v_ci_ce
  );
end;
$function$;
