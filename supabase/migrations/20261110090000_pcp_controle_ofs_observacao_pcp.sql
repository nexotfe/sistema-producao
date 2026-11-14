-- NEXOTFE — PCP | OBS do Controle de OFs (observacao_pcp).
--
-- APLICADA no banco vinculado em 2026-11-10 (versao 20261110090000),
-- conforme autorizacao do usuario. Este arquivo so foi registrado no
-- Git em 2026-11-14 (regularizacao pos-auditoria pre-publicacao) -
-- verificado, antes do commit, que coluna, comentario, permissao,
-- assinatura/dono/security definer/grants e corpo da funcao no banco
-- vinculado sao idênticos ao SQL executavel abaixo; nenhuma reaplicacao
-- foi executada.
--
-- Contexto de seguranca (achado real, confirmado por leitura antes de
-- escrever esta proposta): ordens_fabricacao ja teve TODOS os
-- privilegios de tabela revogados de public/anon/authenticated/
-- service_role em 20260830134415_of_trava_escrita_direta.sql - só
-- authenticated tem SELECT, via GRANT explicito. As policies de RLS de
-- UPDATE/INSERT que ainda existem na tabela (ordens_fabricacao_update_
-- tenant, _insert_tenant) sao hoje policies MORTAS - sem o GRANT de
-- tabela correspondente, nenhuma delas tem efeito pratico; nenhum papel
-- de cliente consegue fazer UPDATE direto nesta tabela hoje, nem mesmo
-- service_role. A preocupacao do usuario (RLS nao e protecao suficiente
-- se o UPDATE direto da coluna continuar liberado) ja esta coberta pelo
-- REVOKE ALL existente - esta migration NAO precisa adicionar nenhum
-- REVOKE/GRANT de coluna novo, só a coluna em si. A unica via de
-- escrita desta coluna passa a ser a RPC abaixo, SECURITY DEFINER,
-- dono postgres - roda com privilegio do dono independente do GRANT de
-- tabela do chamador (mesmo mecanismo que já permite liberar_of/
-- confirmar_necessidades_momento_y escreverem apesar do REVOKE ALL).
--
-- Padrao de autorizacao (mesmo de liberar_of/aprovar_of, nao o de
-- confirmar_necessidades_momento_y): RPC service_role-only, recebe
-- p_usuario_id de um chamador JA PRIVILEGIADO (a Server Action, que
-- resolveu auth.getUser() no client de SESSAO antes de chamar o client
-- de SERVICO só para esta RPC) - nunca aceita usuario_id vindo do corpo
-- da requisicao. usuario_tem_permissao ja documenta essa mesma garantia
-- e e' chamada aqui de dentro da funcao (current_user = postgres
-- durante a execucao desta SECURITY DEFINER, independente do REVOKE a
-- authenticated que usuario_tem_permissao já tem).

begin;

-- 1. Coluna nova, dedicada - nao reaproveita observacoes (campo morto,
--    proposito geral indefinido) nem estado_execucao_observacao (motivo
--    de transicao de liberar_of/cancelar_of, responsabilidade distinta).
--    varchar(120) ja rejeita no INSERT/UPDATE qualquer texto maior -
--    nenhum CHECK adicional necessario.
alter table public.ordens_fabricacao
  add column observacao_pcp varchar(120);

comment on column public.ordens_fabricacao.observacao_pcp is
  'Lembrete interno do PCP sobre pendencias anteriores a liberacao (Controle de OFs) - texto livre, até 120 caracteres. Editável só enquanto a OF estiver no grupo visual "Aguardando" (rascunho+planejada, aguardando_auditoria+planejada, reprovada+planejada, aprovada+planejada, aprovada+suspensa) - a RPC atualizar_observacao_pcp_of reconfirma isso a cada gravação. Nunca alterado por nenhuma outra função; conteúdo preservado indefinidamente após a liberação (sem exclusão automática), só deixa de ser exibido no Controle de OFs.';

-- 2. Permissao funcional nova - nenhuma das 6 chaves existentes (Etapa
--    P8I-B3) cobre "editar o lembrete da OF". Categoria 'comum' (não
--    altera estado da OF nem decide producao, ao contrario de
--    pcp.liberar_of/cancelar_of, que sao 'sensivel').
insert into public.permissoes (chave, recurso, acao, categoria, nome, descricao) values
  ('pcp.editar_observacao_of', 'pcp', 'editar_observacao_of', 'comum',
   'Editar observação do PCP na OF',
   'Permite registrar/editar o lembrete interno do PCP (OBS) numa OF que ainda está aguardando liberação. Não altera a situação da OF nem nenhuma condição de liberação.')
on conflict (chave) do nothing;

-- 3. RPC de gravacao - unica via de escrita de observacao_pcp.
create or replace function public.atualizar_observacao_pcp_of(p_of_id uuid, p_usuario_id uuid, p_observacao text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_of record;
  v_empresa_id_usuario uuid;
  v_observacao_normalizada text;
begin
  if not public.usuario_tem_permissao(p_usuario_id, 'pcp.editar_observacao_of') then
    raise exception 'atualizar_observacao_pcp_of: usuario % sem permissao pcp.editar_observacao_of.', p_usuario_id;
  end if;

  v_observacao_normalizada := nullif(btrim(coalesce(p_observacao, '')), '');
  if v_observacao_normalizada is not null and char_length(v_observacao_normalizada) > 120 then
    raise exception 'atualizar_observacao_pcp_of: observacao excede 120 caracteres.';
  end if;

  -- Existencia confirmada ANTES do "select * into record" - um record
  -- plpgsql nao-encontrado fica "nao atribuido" (referenciar v_of.id
  -- nesse estado levanta erro, nunca devolve null) - mesmo cuidado que
  -- liberar_of ja aplica (confirma com uma coluna escalar primeiro).
  if not exists (select 1 from public.ordens_fabricacao where id = p_of_id) then
    raise exception 'atualizar_observacao_pcp_of: OF % nao encontrada.', p_of_id;
  end if;

  -- Lock de linha - mesmo padrao de liberar_of, fecha a janela entre a
  -- leitura da situacao e a gravacao (requisito "impedir que duas acoes
  -- concorrentes permitam alterar a OBS apos a liberacao").
  select * into v_of from public.ordens_fabricacao where id = p_of_id for update;

  select empresa_id into v_empresa_id_usuario from public.usuarios where id = p_usuario_id;
  if v_empresa_id_usuario is null or v_empresa_id_usuario is distinct from v_of.empresa_id then
    raise exception 'atualizar_observacao_pcp_of: usuario % nao pertence a empresa % da OF %.', p_usuario_id, v_of.empresa_id, p_of_id;
  end if;

  -- Grupo visual "Aguardando" (ver GRUPOS_STATUS_SIMPLIFICADO em
  -- buscarOfsPcp.ts - fonte unica, os mesmos 5 pares, nunca reimplementados
  -- com valores diferentes aqui). Decisao aprovada pelo usuario: OBS
  -- editavel em todo o grupo "Aguardando", nao só aprovada+planejada.
  update public.ordens_fabricacao
    set observacao_pcp = v_observacao_normalizada
    where id = p_of_id
      and (estado_aprovacao, estado_execucao) in (
        ('rascunho', 'planejada'),
        ('aguardando_auditoria', 'planejada'),
        ('reprovada', 'planejada'),
        ('aprovada', 'planejada'),
        ('aprovada', 'suspensa')
      );

  if not found then
    raise exception 'atualizar_observacao_pcp_of: OF % em %/% nao esta aguardando liberacao - OBS nao pode ser editada.', p_of_id, v_of.estado_aprovacao, v_of.estado_execucao;
  end if;

  return jsonb_build_object('resultado', 'gravado', 'of_id', p_of_id);
end;
$function$;

comment on function public.atualizar_observacao_pcp_of(uuid, uuid, text) is
  'Controle de OFs (PCP): grava o lembrete interno observacao_pcp. Unica via de escrita dessa coluna (ordens_fabricacao tem REVOKE ALL de authenticated/service_role desde 20260830134415 - esta funcao escreve como dona, postgres). Reconfirma, no momento da gravacao e sob lock de linha, que a OF ainda esta no grupo visual "Aguardando" (os mesmos 5 pares de buscarOfsPcp.ts) - nunca confia no estado que a tela tinha ao abrir. p_usuario_id chega de um chamador JA PRIVILEGIADO (service_role) - mesma garantia documentada em usuario_tem_permissao, nunca aceito do corpo da requisicao. Nao altera estado_aprovacao/estado_execucao nem nenhuma outra coluna.';

alter function public.atualizar_observacao_pcp_of(uuid, uuid, text) owner to postgres;
revoke all on function public.atualizar_observacao_pcp_of(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.atualizar_observacao_pcp_of(uuid, uuid, text) to service_role;

commit;
