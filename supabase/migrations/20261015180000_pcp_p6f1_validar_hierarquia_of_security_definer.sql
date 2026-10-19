-- PCP-P6F.1 - Hardening de validar_hierarquia_of() com SECURITY DEFINER.
--
-- CAUSA RAIZ (investigada e provada no gate PCP-P6F, nao presumida):
-- validar_hierarquia_of() e um CONSTRAINT TRIGGER DEFERRABLE INITIALLY
-- DEFERRED (migration 20260826184412, 2026-08-26 - pre-existente, a
-- P6E nunca a tocou). Sendo SECURITY INVOKER, ela dispara no COMMIT da
-- transacao, fora do contexto de elevacao de qualquer funcao SECURITY
-- DEFINER que tenha feito o INSERT/UPDATE original - nesse momento,
-- current_user volta a ser a role literal da sessao/transacao. Como
-- service_role nunca teve SELECT direto em ordens_fabricacao (por
-- desenho: toda leitura/escrita de service_role passa por RPC
-- auditada, nunca acesso direto a tabela), qualquer escrita real em
-- ordens_fabricacao numa transacao cujo role no COMMIT seja
-- service_role falha com "permission denied for table
-- ordens_fabricacao" - reproduzido com encerrar_of e criar_of_retrabalho
-- em sandbox. O problema ficou invisivel em todo teste anterior porque
-- rodavam como postgres (superuser/owner, sempre com acesso implicito).
--
-- CORRECAO MINIMA: tornar a funcao SECURITY DEFINER (owner postgres, ja
-- e o owner atual) - ela passa a executar sempre como postgres,
-- independente de qual role esteja ativa no COMMIT, igual ao padrao ja
-- usado por registrar_historico_estado_of() na MESMA tabela. Nenhuma
-- outra coisa muda: mesma logica, mesmo timing deferred (preserva o
-- motivo original - permitir inserir varias filhas de divisao de lote
-- sem falhar linha a linha), mesmo search_path fixo, mesmo revoke de
-- EXECUTE de public/anon/authenticated (irrelevante de qualquer forma,
-- pois invocacao de trigger nao passa por checagem de EXECUTE - mas
-- mantido por consistencia e para nunca deixar nenhum privilegio
-- implicito sem revogar, mesmo padrao do restante do projeto).
--
-- Alternativas avaliadas e rejeitadas (decisao do usuario, gate PCP-P6F):
-- GRANT SELECT direto a service_role na tabela (amplia superficie de
-- acesso alem do necessario, contradiz o desenho arquitetural
-- deliberado do projeto); trigger imediato em vez de deferred (quebraria
-- insercao em lote de divisao de lote, motivo original do deferred).
--
-- Esta migration NAO edita a migration original de 2026-08-26 - o
-- historico de replay permanece fiel ao que de fato ocorreu (criado com
-- o bug, corrigido depois, em migration propria).

create or replace function public.validar_hierarquia_of()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_ids_a_checar uuid[];
  v_mae_id uuid;
  v_mae_empresa_id uuid;
  v_quantidade_mae numeric;
  v_justificativa text;
  v_aprovador uuid;
  v_tem_filhas boolean;
  v_soma_ativas numeric;
begin
  v_ids_a_checar := array_remove(
    array[new.id, old.of_pai_id, new.of_pai_id],
    null
  );

  foreach v_mae_id in array v_ids_a_checar loop
    select empresa_id, quantidade_planejada,
           divergencia_quantidade_justificativa, divergencia_quantidade_aprovada_por
      into v_mae_empresa_id, v_quantidade_mae, v_justificativa, v_aprovador
    from public.ordens_fabricacao
    where id = v_mae_id;

    if not found then
      continue;
    end if;

    select exists(
      select 1 from public.ordens_fabricacao
      where of_pai_id = v_mae_id and empresa_id = v_mae_empresa_id
    ) into v_tem_filhas;

    if not v_tem_filhas then
      continue; -- OF nunca foi dividida: não é cobrada por soma nenhuma
    end if;

    select coalesce(sum(quantidade_planejada), 0)
      into v_soma_ativas
    from public.ordens_fabricacao
    where of_pai_id = v_mae_id
      and empresa_id = v_mae_empresa_id
      and ativo = true
      and estado_execucao <> 'cancelada';
    -- soma=0 aqui cobre tanto "todas as filhas canceladas" quanto "todas
    -- soft-deletadas" — cai na mesma exigência de justificativa abaixo, sem
    -- regra especial (decisão do usuário: sem reversão automática da mãe).

    if v_soma_ativas is distinct from v_quantidade_mae then
      if v_justificativa is null or v_aprovador is null then
        raise exception 'ordens_fabricacao: soma das filhas ativas (%) diverge da quantidade planejada da OF-mãe % (%) sem justificativa+aprovador registrados', v_soma_ativas, v_mae_id, v_quantidade_mae;
      end if;
    end if;
  end loop;

  return null;
end;
$$;

comment on function public.validar_hierarquia_of() is
  '4D0: valida, no fim da transação, que a soma das filhas ativas fecha com a quantidade da mãe — só para OFs que já foram divididas ao menos uma vez. PCP-P6F.1 (2026-10-15): SECURITY DEFINER - trigger DEFERRABLE INITIALLY DEFERRED dispara no COMMIT com a role literal da sessão, não com o owner de quem fez o DML; sem DEFINER, service_role (sem SELECT direto em ordens_fabricacao, por desenho) falhava no COMMIT de qualquer escrita real. Lógica, timing deferred e escopo por empresa_id inalterados.';

revoke execute on function public.validar_hierarquia_of() from public, anon, authenticated;
