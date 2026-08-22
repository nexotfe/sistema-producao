-- Corrige a causa raiz investigada no orcamento 260007: o congelamento
-- de projeto_itens.custo_congelado disparava ao SAIR de 'rascunho' para
-- QUALQUER outro status (inclusive 'em_analise', o mais cedo possivel),
-- nao especificamente ao ser 'aprovado'. Resultado: orcamentos ainda em
-- construcao congelavam o custo minutos/horas apos a criacao e nunca
-- mais refletiam edicoes reais no roteiro do produto (Resumo Produtivo
-- e Cenarios continuam ao vivo - so o custo do Orcamento/Proposta
-- ficava preso). Decisao de negocio confirmada pelo usuario (2026-08-22):
--   nao aprovado -> aprovado: congela, somente via RPC de aprovacao
--   aprovado -> qualquer outro status: bloqueado, sem excecao, ate
--     existir uma RPC formal de revisao/reabertura (ainda nao existe)
--
-- Historico de design revisado com o usuario antes desta versao final:
-- Revisao 1 usava um parametro de sessao (app.reabertura_projeto_aprovado)
-- simetrico ao ja existente app.aprovacao_via_function (202607190006) -
-- REJEITADA: set_config() para um GUC custom (namespace app.*) nao exige
-- nenhum privilegio especial no Postgres, entao qualquer role authenticated
-- podia setar a flag na propria sessao e em seguida rodar um UPDATE
-- direto em projetos.status, contornando completamente a RPC validada -
-- a mesma fragilidade ja existia (nao introduzida aqui) no guard de
-- ENTRADA em 'aprovado' desde 202607190006. Substituida por current_user:
-- dentro de uma function SECURITY DEFINER, current_user vira o DONO da
-- function (postgres, confirmado via pg_get_userbyid para
-- aprovar_projeto_com_simulacao_v5/aprovar_projeto_com_simulacao/
-- congelar_custos_projeto_interno) durante toda a execucao, inclusive em
-- triggers disparadas por comandos que ela executa - authenticated/anon
-- nao tem (nem deve ter) permissao para SET ROLE postgres, entao nao ha
-- nenhum sinal que o cliente possa forjar. current_user=postgres NAO
-- prova sozinho "passou pela RPC" (uma operacao administrativa rodada
-- diretamente como postgres tambem passaria) - a garantia real e a
-- inversa: um cliente comum (authenticated/anon) NUNCA consegue assumir
-- esse papel por conta propria.
begin;

-- =========================================================
-- 1) descongelar_custos_projeto: MANTIDA (uso futuro pela acao formal
--    de revisao/reabertura, ainda nao implementada) - so fecha os
--    privilegios. Antes desta migration era executavel por
--    public/anon/authenticated e NAO era SECURITY DEFINER: qualquer
--    usuario autenticado podia rodar
--    `select descongelar_custos_projeto(qualquer_projeto_id)` direto
--    (sujeito so a RLS de projeto_itens, que hoje permite update do
--    proprio tenant) e descongelar o custo de um orcamento aprovado de
--    proposito. A partir desta migration, sem grant para nenhuma role
--    de API - so postgres/service_role (ou uma function SECURITY
--    DEFINER futura, dona = postgres) conseguem chama-la.
-- =========================================================
comment on function public.descongelar_custos_projeto(uuid) is
  'Reverte custo_congelado/custo_congelado_em/custo_editado_manualmente para null/false. Sem chamador automatico desde esta migration (trg_projetos_congelar_custos parou de invoca-la - saida de aprovado agora e sempre bloqueada por trg_projetos_bloquear_aprovacao_direta). Existe para a futura RPC formal de revisao/reabertura de orcamento aprovado. NUNCA deve virar RPC publica: quando essa RPC for construida, deve seguir o padrao de congelar_custos_projeto_interno (wrapper SECURITY DEFINER publico, dono postgres, com validacao explicita de empresa_id/permissao/auditoria) - esta function continua sem grant para public/anon/authenticated.';

revoke execute on function public.descongelar_custos_projeto(uuid) from public;
revoke execute on function public.descongelar_custos_projeto(uuid) from anon;
revoke execute on function public.descongelar_custos_projeto(uuid) from authenticated;

-- =========================================================
-- 2) Gatilho de congelamento: so ao ENTRAR em 'aprovado'. Sair de
--    'aprovado' NAO descongela mais automaticamente - trg_projetos_
--    bloquear_aprovacao_direta (secao 4) impede a transicao no banco
--    antes mesmo deste trigger AFTER rodar. congelar_custos_projeto (a
--    antiga, sem sufixo _interno) ja nao existe desde 202607310001;
--    esta function ja chamava a correta (congelar_custos_projeto_interno)
--    - so a CONDICAO muda aqui.
-- =========================================================
create or replace function public.trg_projetos_congelar_custos()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'aprovado' and old.status is distinct from 'aprovado' then
    perform public.congelar_custos_projeto_interno(new.id, new.empresa_id);
  end if;

  return new;
end;
$function$;

comment on function public.trg_projetos_congelar_custos() is
  'Congela projeto_itens.custo_congelado SOMENTE ao entrar em status=aprovado (mudou nesta migration - antes congelava ao sair de rascunho para qualquer status, causa raiz do congelamento prematuro do orcamento 260007, que nunca chegou a ser aprovado). Sair de aprovado NAO descongela mais automaticamente - trg_projetos_bloquear_aprovacao_direta bloqueia essa transicao no banco, sem excecao, ate existir uma RPC formal de revisao.';

-- Normalizado explicitamente apos o CREATE OR REPLACE (nao so herdado
-- de uma migration anterior): CREATE OR REPLACE preserva ACL quando a
-- assinatura nao muda, mas re-declarar aqui torna esta migration
-- auto-suficiente para provar o estado de privilegio correto, em vez
-- de depender de uma migration anterior ter feito isso certo.
revoke execute on function public.trg_projetos_congelar_custos() from public;
revoke execute on function public.trg_projetos_congelar_custos() from anon;
revoke execute on function public.trg_projetos_congelar_custos() from authenticated;

-- =========================================================
-- 3) Item novo inserido: so nasce congelado se o projeto ja estiver
--    'aprovado' (antes: qualquer status <> rascunho - nao tinha sido
--    tocada em 202607310001 e ainda dependia do wrapper publico
--    calcular_custo_bom/empresa_atual_id()/sessao). Migrada agora para
--    o mesmo padrao SECURITY DEFINER + empresa_id explicito +
--    calcular_custo_bom_interno ja usado por congelar_custos_projeto_interno,
--    necessario porque insercao pode vir de um caminho service_role
--    (sem sessao/JWT de usuario) - mesma classe de bug ja corrigida do
--    lado do UPDATE em 202607310001.
-- =========================================================
create or replace function public.trg_projeto_itens_congelar_ao_inserir()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status text;
  v_tipo_projeto text;
  v_bom_id uuid;
  v_custo_unitario numeric;
begin
  select status, tipo_projeto into v_status, v_tipo_projeto
  from public.projetos
  where id = new.projeto_id
    and empresa_id = new.empresa_id;

  if v_status = 'aprovado' then
    select id into v_bom_id
    from public.boms
    where produto_id = new.produto_id
      and empresa_id = new.empresa_id
      and deleted_at is null
    order by (status = 'ativo') desc, created_at desc
    limit 1;

    v_custo_unitario := 0;

    if v_bom_id is not null then
      select t.valor into v_custo_unitario
      from public.calcular_custo_bom_interno(v_bom_id, new.empresa_id, 0, (v_tipo_projeto = 'industrializacao')) t
      where t.categoria = 'total';
    end if;

    new.custo_congelado := coalesce(v_custo_unitario, 0);
    new.custo_congelado_em := now();
  end if;

  return new;
end;
$function$;

comment on function public.trg_projeto_itens_congelar_ao_inserir() is
  'Item novo so nasce congelado se o projeto ja estiver aprovado (mudou nesta migration - antes bastava projeto fora de rascunho). SECURITY DEFINER com empresa_id explicito de NEW.empresa_id - nunca resolvido por sessao, mesma razao de congelar_custos_projeto_interno (202607310001): insercao pode vir de service_role, sem auth.uid().';

-- Normalizado explicitamente apos o CREATE OR REPLACE (higiene
-- defensiva - Postgres ja recusa chamar function de trigger fora de
-- contexto de trigger, mesmo com grant - mas esta migration fica
-- auto-suficiente, sem depender do estado herdado de outra migration).
revoke execute on function public.trg_projeto_itens_congelar_ao_inserir() from public;
revoke execute on function public.trg_projeto_itens_congelar_ao_inserir() from anon;
revoke execute on function public.trg_projeto_itens_congelar_ao_inserir() from authenticated;

-- =========================================================
-- 4) Bloqueia UPDATE direto de projetos.status ENTRANDO e SAINDO de
--    'aprovado' (extensao da guarda que ja existia so para entrada,
--    202607190006). Sem depender de nenhuma flag de sessao setavel
--    pelo cliente - ver historico no topo do arquivo.
-- =========================================================
create or replace function public.trg_projetos_bloquear_aprovacao_direta()
returns trigger
language plpgsql
as $function$
begin
  if new.status = 'aprovado' and old.status is distinct from 'aprovado' then
    if current_user <> 'postgres' then
      raise exception 'Transicao de status para aprovado so pode ser feita via aprovar_projeto_com_simulacao().';
    end if;
  end if;

  if old.status = 'aprovado' and new.status is distinct from 'aprovado' then
    raise exception 'Projeto aprovado nao pode ter o status alterado. A reabertura de um orcamento aprovado exige uma RPC formal de revisao, ainda nao implementada neste sistema.';
  end if;

  return new;
end;
$function$;

comment on function public.trg_projetos_bloquear_aprovacao_direta() is
  'Bloqueia UPDATE direto de projetos.status: (1) para aprovado, exceto quando current_user=postgres - so acontece dentro de uma function SECURITY DEFINER de dono postgres, como aprovar_projeto_com_simulacao()/_v5(). current_user=postgres NAO prova sozinho "passou pela RPC" (uma operacao administrativa rodada diretamente como postgres tambem passaria essa checagem) - a garantia real e a inversa: um cliente comum (authenticated/anon) nunca consegue assumir esse papel por conta propria, ao contrario da flag de sessao app.aprovacao_via_function usada antes desta migration, que qualquer role podia setar sozinha via set_config(). (2) saindo de aprovado, SEMPRE bloqueado, sem excecao - nao existe hoje nenhuma RPC formal de revisao/reabertura. Quando essa RPC for criada, esta function precisara de nova migration para abrir uma excecao - current_user=postgres sozinho nao bastaria ali, porque qualquer outra function SECURITY DEFINER de dono postgres tambem passaria; a RPC de revisao devera ter um criterio proprio e explicito nesse momento (auditoria, permissao, validacao de empresa).';

-- Normalizado explicitamente apos o CREATE OR REPLACE (higiene
-- defensiva - Postgres ja recusa chamar function de trigger fora de
-- contexto de trigger, mesmo com grant; corrige tambem um gap
-- pre-existente desde 202607190006, que revogava so de public/anon e
-- nunca de authenticated).
revoke execute on function public.trg_projetos_bloquear_aprovacao_direta() from public;
revoke execute on function public.trg_projetos_bloquear_aprovacao_direta() from anon;
revoke execute on function public.trg_projetos_bloquear_aprovacao_direta() from authenticated;

-- =========================================================
-- 5) Backup reversivel dos valores de custo_congelado limpos pelo
--    backfill (secao 6). Sem schema privado neste projeto (so os
--    schemas padrao do Supabase existem) - fica em public, mas:
--      - RLS habilitada (sem nenhuma policy = deny-all por padrao,
--        inclusive para o dono da tabela em comandos via API);
--      - REVOKE ALL de public/anon/authenticated (alem do deny-all da
--        RLS - defesa em profundidade, cobre tambem um eventual acesso
--        via role com BYPASSRLS que nao seja o esperado);
--      - numero_projeto tipada IDENTICA ao schema real
--        (projetos.numero_projeto e text, confirmado via
--        information_schema.columns contra o banco vinculado em
--        2026-08-22 - nao varchar/numeric);
--      - SEM "if not exists": se a tabela ja existir inesperadamente,
--        a migration deve falhar de forma clara, nunca mascarar drift.
-- =========================================================
create table public._backfill_202608220001_custo_congelado_backup (
  projeto_itens_id uuid primary key,
  projeto_id uuid not null,
  numero_projeto text not null,
  custo_congelado numeric,
  custo_congelado_em timestamptz,
  criado_em timestamptz not null default now()
);

comment on table public._backfill_202608220001_custo_congelado_backup is
  'Backup dos valores de custo_congelado/custo_congelado_em limpos pelo backfill desta migration (projetos nao-aprovados congelados prematuramente pela regra antiga - trg_projetos_congelar_custos congelava ao sair de rascunho, nao so ao entrar em aprovado). RLS habilitada sem nenhuma policy (deny-all) + REVOKE ALL de public/anon/authenticated - so postgres/service_role consultam. Remover esta tabela em migration futura, so depois de validar Orcamento/Proposta/Cenarios em producao para os projetos afetados (260007 e eventuais outros identificados na auditoria pre-migration).';

alter table public._backfill_202608220001_custo_congelado_backup enable row level security;

revoke all on public._backfill_202608220001_custo_congelado_backup from public;
revoke all on public._backfill_202608220001_custo_congelado_backup from anon;
revoke all on public._backfill_202608220001_custo_congelado_backup from authenticated;

-- =========================================================
-- 6) Backfill como function reutilizavel - fonte UNICA de verdade,
--    chamada tanto pela migration (dados reais, uma vez, abaixo) quanto
--    por supabase/tests/congelar_custos_ao_aprovar_teste.sql (fixtures
--    de teste) - nunca duas copias do mesmo SQL que possam divergir em
--    silencio. So limpa projetos NAO aprovados e itens SEM edicao
--    manual (custo_editado_manualmente=false) - projetos ja aprovados e
--    qualquer custo editado a mao permanecem intocados. Idempotente:
--    o INSERT do backup ignora linhas ja copiadas, o UPDATE so afeta
--    linhas que ainda tem custo_congelado not null.
-- =========================================================
create or replace function public._backfill_202608220001_limpar_congelamento_prematuro()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public._backfill_202608220001_custo_congelado_backup
    (projeto_itens_id, projeto_id, numero_projeto, custo_congelado, custo_congelado_em)
  select pi.id, pi.projeto_id, p.numero_projeto, pi.custo_congelado, pi.custo_congelado_em
  from public.projeto_itens pi
  join public.projetos p on p.id = pi.projeto_id
  where p.status <> 'aprovado'
    and pi.custo_congelado is not null
    and pi.custo_editado_manualmente = false
    and p.deleted_at is null
    and pi.deleted_at is null
    and pi.id not in (select projeto_itens_id from public._backfill_202608220001_custo_congelado_backup);

  update public.projeto_itens pi
  set custo_congelado = null,
      custo_congelado_em = null
  from public.projetos p
  where pi.projeto_id = p.id
    and p.status <> 'aprovado'
    and pi.custo_congelado is not null
    and pi.custo_editado_manualmente = false
    and p.deleted_at is null
    and pi.deleted_at is null;
end;
$function$;

comment on function public._backfill_202608220001_limpar_congelamento_prematuro() is
  'Backfill de 202608220001: fonte UNICA do backup+limpeza de congelamento prematuro (projetos nao-aprovados). Chamada tanto pela migration (uma vez, dados reais) quanto pelo teste reversivel (fixtures) - nunca duplicar esta logica em outro arquivo. Idempotente. Remover junto da tabela de backup na migration de limpeza futura.';

revoke execute on function public._backfill_202608220001_limpar_congelamento_prematuro() from public;
revoke execute on function public._backfill_202608220001_limpar_congelamento_prematuro() from anon;
revoke execute on function public._backfill_202608220001_limpar_congelamento_prematuro() from authenticated;

select public._backfill_202608220001_limpar_congelamento_prematuro();

commit;
