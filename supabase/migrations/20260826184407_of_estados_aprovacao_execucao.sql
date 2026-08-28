-- Incremento 4D0-A (1/3) — separa estado de aprovação e estado de execução da OF.
-- status legado é preservado; um trigger determinístico mantém os dois modelos
-- coerentes enquanto coexistirem. Plano aprovado: polymorphic-tinkering-lightning
-- (Revisão 5, com correções da rodada de revisão pós-preparação local).
-- Nenhuma RPC de negócio é criada aqui — só schema + backfill + trigger de
-- sincronização. Arquivo inteiro é uma transação — qualquer falha desfaz tudo.

begin;

-- 1. Novas colunas (nullable — NULL é o sinal de "não fornecido" que o trigger
--    usa para decidir qual lado é autoritativo; nunca ficam nulas após o trigger
--    rodar, por construção).
alter table public.ordens_fabricacao
  add column estado_aprovacao text null,
  add column estado_execucao text null,
  add column estado_aprovacao_em timestamptz null,
  add column estado_aprovacao_por uuid null references auth.users(id),
  add column estado_aprovacao_origem text not null default 'fluxo_4d0',
  add column estado_aprovacao_observacao text null;

alter table public.ordens_fabricacao
  add constraint ordens_fabricacao_estado_aprovacao_chk
    check (estado_aprovacao is null or estado_aprovacao in (
      'rascunho', 'aguardando_auditoria', 'aprovada', 'reprovada', 'cancelada'
    )),
  add constraint ordens_fabricacao_estado_execucao_chk
    check (estado_execucao is null or estado_execucao in (
      'planejada', 'liberada', 'em_producao', 'suspensa', 'concluida',
      'cancelada', 'desdobrada'
    )),
  add constraint ordens_fabricacao_estado_aprovacao_origem_chk
    check (estado_aprovacao_origem in ('fluxo_4d0', 'migracao_legado'));

comment on column public.ordens_fabricacao.estado_aprovacao is
  '4D0: dimensão de aprovação da OF (rascunho/auditoria/aprovada/reprovada/cancelada) — distinta de estado_execucao.';
comment on column public.ordens_fabricacao.estado_execucao is
  '4D0: dimensão de execução da OF (planejada/liberada/produção/...) — aprovação e liberação são atos distintos.';
comment on column public.ordens_fabricacao.estado_aprovacao_origem is
  'fluxo_4d0 = passou pelo trigger/RPC do modelo novo; migracao_legado = backfill one-time desta migration, nunca reaplicado.';

-- 2. status legado ganha o sentinela usado quando o par novo não tem
--    equivalente de 1 valor no modelo antigo (aguardando_auditoria, reprovada,
--    liberada, desdobrada combinados com qualquer coisa).
alter table public.ordens_fabricacao drop constraint ordens_fabricacao_status_chk;
alter table public.ordens_fabricacao add constraint ordens_fabricacao_status_chk
  check (status in (
    'planejada', 'em_producao', 'concluida', 'suspensa', 'cancelada', 'em_fluxo_novo'
  ));

-- 3. Backfill — one-time, só nas linhas que já existiam antes desta migration.
--    Mapeamento aprovado explicitamente pelo usuário (nunca reutilizado pelo
--    trigger permanente da seção 5 — ver plano, correção 1 da Revisão 5).
--    Idempotente por WHERE: só toca linha que ainda não tem estado_aprovacao.
--    Nesta aplicação, ordens_fabricacao está vazia (confirmado por introspecção
--    direta antes de escrever este arquivo) — o UPDATE abaixo não afeta nenhuma
--    linha agora, mas fica registrado para o caso de já existir dado real no
--    momento em que esta migration for de fato aplicada.
update public.ordens_fabricacao
set
  estado_aprovacao = case status
    when 'cancelada' then 'cancelada'
    else 'aprovada'
  end,
  estado_execucao = status,
  estado_aprovacao_origem = 'migracao_legado',
  estado_aprovacao_em = now(),
  estado_aprovacao_por = null,
  estado_aprovacao_observacao =
    'Backfill 4D0: OF criada no fluxo antigo, sem etapa de auditoria — aprovação inferida a partir do status operacional pré-existente. Nunca reaplicado após esta migration.'
where estado_aprovacao is null
  and status in ('planejada', 'em_producao', 'concluida', 'suspensa', 'cancelada');

-- 4. Função auxiliar — mapeia um par (estado_aprovacao, estado_execucao) já
--    válido para o valor de status legado equivalente, ou o sentinela quando
--    não há equivalente de 1 valor. Assume que o par já é válido pela matriz de
--    combinações (migration seguinte, 4D0-A 2/3) — não é ela quem decide se o
--    par é permitido, só traduz um par permitido para o modelo antigo.
create or replace function public.derivar_status_legado_de_estado(
  p_estado_aprovacao text,
  p_estado_execucao text
) returns text
language sql
immutable
as $$
  select case
    when p_estado_execucao = 'cancelada' then 'cancelada'
    when p_estado_aprovacao = 'aprovada' and p_estado_execucao = 'planejada' then 'planejada'
    when p_estado_aprovacao = 'aprovada' and p_estado_execucao = 'em_producao' then 'em_producao'
    when p_estado_aprovacao = 'aprovada' and p_estado_execucao = 'concluida' then 'concluida'
    when p_estado_aprovacao = 'aprovada' and p_estado_execucao = 'suspensa' then 'suspensa'
    else 'em_fluxo_novo'
  end;
$$;

comment on function public.derivar_status_legado_de_estado(text, text) is
  '4D0: traduz um par (estado_aprovacao, estado_execucao) já válido para o status legado equivalente, ou ''em_fluxo_novo'' quando não há equivalente de 1 valor.';

-- ACL explícita: chamada de dentro de sync_estado_of (SECURITY INVOKER), que
-- roda como o papel que disparou o INSERT/UPDATE (authenticated) — precisa
-- de EXECUTE concedido, senão todo INSERT/UPDATE de ordens_fabricacao por um
-- usuário comum falharia por falta de permissão nesta função interna.
--
-- CORREÇÃO (achado real): pg_default_acl concede EXECUTE a anon/authenticated
-- individualmente em toda função nova — "REVOKE FROM PUBLIC" sozinho não
-- alcançava essas concessões individuais. Revoga dos três explicitamente e só
-- depois concede de volta a authenticated (nunca a anon).
revoke execute on function public.derivar_status_legado_de_estado(text, text) from public, anon, authenticated;
grant execute on function public.derivar_status_legado_de_estado(text, text) to authenticated;

-- 5. Trigger permanente — único ponto de tradução entre os dois modelos,
--    a partir desta migration em diante. Nunca reutiliza o mapeamento de
--    backfill do passo 3. Ver plano (Revisão 5, seção A.1) para a tabela de
--    decisão completa — implementada linha a linha nos comentários abaixo.
create or replace function public.sync_estado_of()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_status_esperado text;
begin
  if tg_op = 'INSERT' then
    if new.estado_aprovacao is not null and new.estado_execucao is not null then
      -- Modelo novo autoritativo, incondicional — nunca consulta o status
      -- recebido (explícito ou default), mesmo que tenha vindo preenchido.
      new.status := public.derivar_status_legado_de_estado(new.estado_aprovacao, new.estado_execucao);
    elsif new.estado_aprovacao is null and new.estado_execucao is null then
      -- Legado autoritativo — mas NUNCA aprova automaticamente. Toda OF nova
      -- que entra só com status (qualquer valor, incluindo o default
      -- 'planejada') nasce precisando de auditoria do PCP no modelo novo.
      -- estado_aprovacao_origem fica no default 'fluxo_4d0' (não mexido aqui):
      -- essa marca é exclusiva do backfill do passo 3.
      new.estado_aprovacao := 'aguardando_auditoria';
      new.estado_execucao := 'planejada';
      -- CORREÇÃO: o status recebido (explícito ou default) é descartado e
      -- recalculado a partir do par forçado acima — senão a linha ficaria
      -- com status='em_producao' (por exemplo) e estado_aprovacao=
      -- 'aguardando_auditoria' simultaneamente, os dois modelos divergentes.
      -- aguardando_auditoria+planejada não tem equivalente de 1 valor no
      -- modelo antigo, então isto sempre resulta em 'em_fluxo_novo' — correto
      -- e esperado: nenhum valor de status legado jamais significou "aguardando
      -- auditoria do PCP", então nenhum deveria ser exibido aqui.
      new.status := public.derivar_status_legado_de_estado(new.estado_aprovacao, new.estado_execucao);
    else
      raise exception 'ordens_fabricacao: estado_aprovacao e estado_execucao devem ser fornecidos juntos ou nenhum dos dois (INSERT)';
    end if;

  elsif tg_op = 'UPDATE' then
    if new.estado_aprovacao is distinct from old.estado_aprovacao
       or new.estado_execucao is distinct from old.estado_execucao then
      -- Par novo mudou (com ou sem status também mudando na mesma instrução).
      v_status_esperado := public.derivar_status_legado_de_estado(new.estado_aprovacao, new.estado_execucao);
      if new.status is distinct from old.status then
        -- Os dois lados mudaram na mesma instrução — checa coerência.
        if new.status is distinct from v_status_esperado then
          raise exception 'ordens_fabricacao: status (%) incoerente com estado_aprovacao/estado_execucao (%/%) na mesma instrução — grave só um lado por vez, ou grave os dois coerentes', new.status, new.estado_aprovacao, new.estado_execucao;
        end if;
      else
        -- Só o par novo mudou — novo autoritativo, deriva status.
        new.status := v_status_esperado;
      end if;

    elsif new.status is distinct from old.status then
      -- Só status mudou.
      if new.status = 'em_fluxo_novo' then
        raise exception 'ordens_fabricacao: não é permitido gravar status=''em_fluxo_novo'' diretamente — informe estado_aprovacao e estado_execucao explicitamente na mesma instrução, o sentinela representa mais de um par possível';
      elsif old.estado_aprovacao = 'aprovada' then
        -- Já passou pela auditoria — avançar a execução via o campo legado é
        -- compatibilidade legítima, não um jeito de pular aprovação.
        new.estado_execucao := new.status;
      else
        if new.status = 'planejada' then
          null; -- no-op efetivo, já é o estado inicial
        elsif new.status = 'cancelada' then
          -- Cancelamento legado sempre foi "a OF inteira morreu" — cancela os
          -- dois eixos juntos, é a tradução mais fiel ao significado histórico.
          new.estado_aprovacao := 'cancelada';
          new.estado_execucao := 'cancelada';
        else
          raise exception 'ordens_fabricacao: escrita legada não pode avançar a execução (status=%) de uma OF ainda não aprovada no modelo novo (estado_aprovacao atual=%)', new.status, old.estado_aprovacao;
        end if;
      end if;
    end if;
    -- Nenhum dos dois mudou: no-op, cai direto na checagem defensiva abaixo.
  end if;

  if new.estado_aprovacao is null or new.estado_execucao is null then
    raise exception 'ordens_fabricacao: estado_aprovacao/estado_execucao não podem ficar nulos após sync_estado_of (OF %)', coalesce(new.numero_of, new.id::text);
  end if;

  return new;
end;
$$;

comment on function public.sync_estado_of() is
  '4D0: único ponto de tradução entre status (legado) e estado_aprovacao/estado_execucao (novo). Ver plano polymorphic-tinkering-lightning, Revisão 5, seção A.1.';

-- ACL: função de trigger, nunca chamada diretamente via SQL por um usuário —
-- o mecanismo de trigger não exige EXECUTE do papel que dispara o INSERT/
-- UPDATE. Revoga de PUBLIC, anon e authenticated explicitamente (achado
-- real: pg_default_acl concede EXECUTE individualmente a cada um, não só via
-- PUBLIC), sem conceder a ninguém.
revoke execute on function public.sync_estado_of() from public, anon, authenticated;

create trigger sync_estado_of
  before insert or update on public.ordens_fabricacao
  for each row
  execute function public.sync_estado_of();

commit;
