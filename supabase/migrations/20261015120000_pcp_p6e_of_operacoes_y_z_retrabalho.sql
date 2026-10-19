-- PCP-P6E - Migration PROPOSTA (nao aplicada) para OF+OP+Y+Z+Retrabalho.
-- Transforma o modelo conceitual fechado em PCP-P6A..P6D.3 em schema real.
-- Investigacao previa (nao presumida, confirmada contra o banco linked):
--   - resolver_bom_ativo_produto(empresa_id, produto_id) ja existe e ja
--     resolve exatamente 1 BOM vigente (boms.status='ativo', mais
--     recente, LANGUAGE sql, sem side effect) - reaproveitado aqui, nunca
--     reescrito.
--   - bom_operacoes tem id/empresa_id/bom_id/ordem(smallint)/descricao/
--     tempo_estimado_minutos(numeric)/recurso_produtivo_id(uuid NULLABLE).
--     recurso_produtivo_id nullable na fonte -> ordens_fabricacao_operacoes
--     .recurso_vigente_id tambem nasce nullable, por fidelidade a fonte
--     real (nunca inventar NOT NULL que a fonte nao garante).
--   - ordens_fabricacao ja tem UNIQUE(id,empresa_id) e UNIQUE(empresa_id,
--     numero_of) (migration 20260826184412) - permite FK composta direta
--     para as tabelas novas, sem pre-requisito adicional.
--   - CORRECAO (revisao do usuario): bom_operacoes e recursos_produtivos
--     JA TEM UNIQUE(id,empresa_id) hoje (bom_operacoes_id_empresa_uniq,
--     recursos_produtivos_id_empresa_uniq) - a suposicao anterior de que
--     nao tinham estava errada (nunca foram checadas especificamente).
--     Confirmado tambem: recursos_produtivos.empresa_id e nullable na
--     coluna, mas 0 das 48 linhas reais tem NULL hoje. CORRECAO (2a
--     checagem do usuario, Parte 2): 0 NULL hoje nao e garantia contra
--     uma linha NULL futura quebrar silenciosamente a FK composta -
--     documentar o risco sem fechar a porta seria inconsistente com o
--     fail-closed ja praticado no resto do projeto. Como a migration e
--     aditiva/segura (nenhuma linha real seria afetada), esta versao
--     ENDURECE a coluna para NOT NULL (secao 0.1, abaixo) em vez de so
--     documentar - fecha o risco de vez, nao so registra. Only
--     funcionarios realmente carecia de
--     UNIQUE(id,empresa_id) (so tinha PK(id)) - empresa_id la e NOT
--     NULL, confirmado - constraint adicionada abaixo, aditiva, sem
--     impacto em dado existente (id ja e globalmente unico via PK).
--   - funcionarios (nao "colaboradores") NAO tem vinculo com auth.users -
--     intencionalmente: colaborador de chao de fabrica aponta pelo
--     `funcionarios.codigo` (integer), nunca precisa de login no ERP
--     (PCP-P6D.1, Parte 4/10). of_apontamentos.funcionario_id referencia
--     funcionarios(id); created_by (quando existir) referencia
--     auth.users(id) - nunca a mesma coluna, nunca confundidos.
--   - empresas NAO tem coluna de timezone hoje (so pais_codigo/uf_codigo/
--     municipio_codigo) - PCP-P6D.1 Parte O/21 fechou timezone IANA
--     explicito por empresa, nunca UF->fuso. Criada aqui, aditiva,
--     default 'America/Sao_Paulo' (empresas existentes continuam
--     operando sem quebra).
--   - Padrao real de escrita controlada confirmado em ordens_fabricacao
--     (20260830134415): REVOKE ALL de authenticated/anon/service_role,
--     SELECT via policy restrita a tenant, toda escrita por RPC
--     SECURITY DEFINER search_path='public'. Replicado aqui desde o
--     nascimento de cada tabela nova (nunca precisou de 3 gates de
--     correcao, como aconteceu com cenarios_comerciais_aprovados nesta
--     mesma sessao).
--   - Padrao real de advisory lock confirmado (hashtextextended('<dominio
--     >:'||id::text,0)) - reaproveitado, chave por dominio nunca
--     congelada como requisito de negocio (so como implementacao).
--
-- Regras de negocio fechadas que este arquivo implementa (PCP-P6A..
-- P6D.3, nao redecidido aqui, so traduzido para schema):
--   OF produtiva valida so nasce com Roteiro resolvivel + >=1 OP, na
--   mesma transacao (rollback se falhar) - mas falha de 1 item NUNCA
--   aborta os demais itens do mesmo Projeto (atomicidade por item).
--   OP nao tem quantidade propria (pertence so a OF). Y vigente vive na
--   propria OP; auditoria de Y e separada, append-only, sem hardcode de
--   papel (PCP/Lider vem so de Grupo de Acesso). Z e eventos puros
--   (iniciar/pausar/retomar/finalizar), sessao e sempre derivada, nunca
--   materializada. Correcao/regularizacao de Z e tabela separada, nunca
--   edita o evento original. Maximo 4 pausas/colaborador/dia (dia local
--   da empresa, nunca UTC), maximo 3 OPs simultaneas/colaborador (sessao
--   pausada NAO conta como simultanea ativa). OF encerrada e imutavel
--   (Y/Z/dependencias/auditoria congelados, nada novo entra). Retrabalho
--   e nova OF com vinculo explicito a origem, nunca reaproveitando
--   tipo/of_pai_id/of_raiz_id (semanticas diferentes, ja provadas nesta
--   sessao). Dependencia e so planejamento/orientacao, nunca trava cega
--   de execucao, nunca cross-OF, nunca ciclo.
--
-- ESTE ARQUIVO E SOMENTE PROPOSTA PARA REVISAO (PCP-P6E). NAO aplicado
-- nesta rodada - exige checkpoint humano explicito antes de qualquer
-- `supabase db push`/SQL Editor, mesmo em sandbox, por Regra 9 do
-- CLAUDE.md.

begin;

-- =====================================================================
-- 0.1 Endurecimento pre-requisito (checagem final do usuario, Parte 2):
--     recursos_produtivos.empresa_id era nullable na coluna, embora
--     0 das 48 linhas reais tivesse NULL hoje (confirmado por query
--     direta). FK composta futura (secao 3) ficaria silenciosamente
--     vulneravel a uma linha nova com empresa_id NULL. Seguro aplicar
--     agora (nenhuma linha real violaria) - fecha o risco, nao so
--     documenta.
-- =====================================================================
alter table public.recursos_produtivos
  alter column empresa_id set not null;

-- =====================================================================
-- 1. Pre-condicao: timezone por empresa (aditiva, sem quebra).
-- =====================================================================
alter table public.empresas
  add column timezone text not null default 'America/Sao_Paulo';

comment on column public.empresas.timezone is
  'Fuso horario IANA (ex.: America/Sao_Paulo) usado para determinar o "dia operacional local" da empresa - nunca UTC puro (PCP-P6D.1, Parte 21). Usado hoje só pela regra de maximo 4 pausas/colaborador/dia (registrar_apontamento). Default seguro para empresas existentes (todas as empresas reais do NEXOTFE operam no Brasil, fuso America/Sao_Paulo, sem horario de verao desde 2019) - nenhuma empresa existente muda de comportamento ao ganhar esta coluna.';

create or replace function public.validar_timezone_empresa()
returns trigger
language plpgsql
as $function$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'timezone invalido: % - precisa ser um nome IANA valido (ver pg_timezone_names).', new.timezone;
  end if;
  return new;
end;
$function$;

comment on function public.validar_timezone_empresa() is
  'Valida empresas.timezone contra pg_timezone_names - CHECK declarativo nao alcança uma view/catalogo (so trigger consegue). Nunca aceita silenciosamente um fuso inexistente.';

create trigger empresas_validar_timezone
  before insert or update of timezone on public.empresas
  for each row
  execute function public.validar_timezone_empresa();

-- =====================================================================
-- 2. Vinculo de retrabalho (aditivo em ordens_fabricacao). Nunca reusa
--    tipo/of_pai_id/of_raiz_id (PCP-P6B.2/P6C.3 - semanticas diferentes:
--    tipo e legado sem funcao vigente; of_pai_id/of_raiz_id sao divisao
--    de lote).
-- =====================================================================
alter table public.ordens_fabricacao
  add column of_origem_retrabalho_id uuid null;

alter table public.ordens_fabricacao
  add constraint ordens_fabricacao_of_origem_retrabalho_fkey
    foreign key (of_origem_retrabalho_id, empresa_id)
    references public.ordens_fabricacao (id, empresa_id),
  add constraint ordens_fabricacao_of_origem_retrabalho_nao_e_propria_chk
    check (of_origem_retrabalho_id is distinct from id);

comment on column public.ordens_fabricacao.of_origem_retrabalho_id is
  'NULL = OF original. Preenchido = esta OF e retrabalho da OF referenciada (PCP-P6B.2/P6C). Uma OF original pode ter 0..N retrabalhos (coluna nao e UNIQUE). Cadeia de retrabalho (retrabalho de retrabalho) e navegada por CTE recursiva na leitura, sem campo de raiz denormalizado - cadeias curtas nao justificam a redundancia.';

-- ACHADO REAL (sandbox, T17 - so descoberto testando de verdade, nunca
-- presumido): o indice parcial pre-existente
-- ordens_fabricacao_projeto_item_raiz_uniq (UNIQUE(projeto_item_id)
-- WHERE of_pai_id IS NULL) foi desenhado para a hierarquia de DIVISAO
-- DE LOTE (migration 20260826184412) - "so pode existir uma OF-raiz
-- por item". Retrabalho compartilha o MESMO projeto_item_id da OF
-- original e tambem nasce com of_pai_id NULL (nunca usa essa
-- hierarquia, PCP-P6B.2) - colide de verdade com esse indice
-- (reproduzido: "duplicate key value violates unique constraint" ao
-- chamar criar_of_retrabalho). Correcao: o indice precisa excluir
-- explicitamente OFs de retrabalho do seu escopo de unicidade - seu
-- proposito ("1 OF-raiz original por item") nunca pretendeu, e nunca
-- deveria, impedir retrabalhos.
drop index public.ordens_fabricacao_projeto_item_raiz_uniq;

create unique index ordens_fabricacao_projeto_item_raiz_uniq
  on public.ordens_fabricacao (projeto_item_id)
  where projeto_item_id is not null and of_pai_id is null and of_origem_retrabalho_id is null;

comment on index public.ordens_fabricacao_projeto_item_raiz_uniq is
  'Recriado (PCP-P6E, achado real T17): adiciona "and of_origem_retrabalho_id is null" a condicao original (divisao de lote, 20260826184412) - sem isso, toda tentativa de criar_of_retrabalho colidia com a OF original do mesmo projeto_item_id. O proposito do indice ("1 OF-raiz original por item, fora da hierarquia de lote") continua intacto; retrabalho e uma terceira categoria de OF que nunca deveria competir por essa unicidade.';

-- =====================================================================
-- 3. OPs da OF - identidade estavel + Y vigente nas mesmas colunas
--    (PCP-P6C, Parte F: Y vigente na propria OP, auditoria separada).
--    CORRECAO (revisao do usuario): bom_operacao_id/recurso_vigente_id
--    agora sao FK COMPOSTA (confirmado que bom_operacoes/
--    recursos_produtivos ja tem UNIQUE(id,empresa_id) - ver secao 0).
--    CORRECAO: origem IN ('roteiro','y'), nunca 'pcp' - origem descreve
--    ONDE a OP nasceu (do Roteiro vs. dentro do Y/operacionalmente),
--    nunca QUEM a criou (isso e autoria/auditoria, separado - hoje so
--    PCP tem essa permissao, mas e Grupo de Acesso que decide, pode
--    mudar sem a OP deixar de ser "originada no Y").
-- =====================================================================
create table public.ordens_fabricacao_operacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  of_id uuid not null,
  origem text not null,
  bom_operacao_id uuid null,
  codigo_operacional text not null,
  descricao text not null,
  recurso_vigente_id uuid null,
  tempo_vigente_minutos numeric null,
  sequencia_vigente smallint not null,
  nao_aplicavel boolean not null default false,
  motivo_nao_aplicavel text null,
  observacao text null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),

  constraint ordens_fabricacao_operacoes_id_empresa_uniq unique (id, empresa_id),
  constraint ordens_fabricacao_operacoes_of_fkey
    foreign key (of_id, empresa_id) references public.ordens_fabricacao (id, empresa_id),
  constraint ordens_fabricacao_operacoes_bom_operacao_fkey
    foreign key (bom_operacao_id, empresa_id) references public.bom_operacoes (id, empresa_id),
  constraint ordens_fabricacao_operacoes_recurso_vigente_fkey
    foreign key (recurso_vigente_id, empresa_id) references public.recursos_produtivos (id, empresa_id),
  constraint ordens_fabricacao_operacoes_codigo_uniq unique (of_id, codigo_operacional),
  constraint ordens_fabricacao_operacoes_origem_chk
    check (origem in ('roteiro', 'y')),
  constraint ordens_fabricacao_operacoes_origem_bom_chk
    check (
      (origem = 'roteiro' and bom_operacao_id is not null)
      or (origem = 'y' and bom_operacao_id is null)
    ),
  constraint ordens_fabricacao_operacoes_tempo_chk
    check (tempo_vigente_minutos is null or tempo_vigente_minutos >= 0),
  constraint ordens_fabricacao_operacoes_nao_aplicavel_par_chk
    check (nao_aplicavel = (motivo_nao_aplicavel is not null))
);

comment on table public.ordens_fabricacao_operacoes is
  'OP real da OF (PCP-P6A..P6C) - identidade estavel + Y vigente (recurso/tempo/sequencia/nao_aplicavel ja sao o planejamento operacional atual, nunca X nem Produto/Roteiro Mestre). origem="roteiro": instanciada no nascimento da OF a partir do Roteiro (BOM) vigente naquele momento (bom_operacao_id, FK composta, aponta exatamente para a linha fonte - PCP-P6D.3: Roteiro e vivo, a OF so captura a versao vigente no instante da criacao, alteracoes futuras do Roteiro nunca retroagem). origem="y": OP nascida operacionalmente dentro do Y (OP nova criada depois, ou parte de uma OF de retrabalho) - nunca recebe bom_operacao_id (nao existia no Roteiro no momento, PCP-P6C Parte 13/24). "origem" descreve a PROVENIENCIA do objeto, nunca o papel de quem agiu - autoria fica em created_by/of_operacao_auditoria, autorizacao fica em Grupo de Acesso (correcao do usuario: hoje so PCP cria OP em Y, mas outro Perfil pode ganhar essa permissao sem a OP deixar de ser origem=y). Quantidade NAO existe aqui de proposito - pertence exclusivamente a ordens_fabricacao.quantidade_planejada (PCP-P6D.1, Parte 1/2) - carga planejada = tempo_vigente_minutos x quantidade_planejada da OF, sempre calculada, nunca duplicada numa coluna propria.';
comment on column public.ordens_fabricacao_operacoes.codigo_operacional is
  'Rotulo (ex.: "OP10") - nunca renumerado automaticamente por reordenacao de sequencia (PCP-P6C, Parte 8). Unico dentro da mesma OF.';
comment on column public.ordens_fabricacao_operacoes.descricao is
  'Herdada do Roteiro no momento da criacao - imutavel depois (classificacao A, PCP-P6C Parte B) - descreve a operacao tecnicamente, nunca a decisao operacional (isso e recurso/tempo/sequencia).';

create index ordens_fabricacao_operacoes_of_idx
  on public.ordens_fabricacao_operacoes (of_id);

comment on index public.ordens_fabricacao_operacoes_of_idx is
  'Suporta a consulta mais frequente: listar/validar todas as OPs de uma OF (criacao, encerramento, exibicao).';

-- =====================================================================
-- 4. Dependencias entre OPs - N:N, so planejamento/orientacao, nunca
--    trava cega de execucao (PCP-P6C/P6D). Restrita a mesma OF (sem
--    evidencia de negocio para cross-OF - PCP-P6C.3, Parte 19).
-- =====================================================================
create table public.of_operacao_dependencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  op_origem_id uuid not null,
  op_dependente_id uuid not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),

  constraint of_operacao_dependencias_op_origem_fkey
    foreign key (op_origem_id, empresa_id) references public.ordens_fabricacao_operacoes (id, empresa_id),
  constraint of_operacao_dependencias_op_dependente_fkey
    foreign key (op_dependente_id, empresa_id) references public.ordens_fabricacao_operacoes (id, empresa_id),
  constraint of_operacao_dependencias_sem_autorreferencia_chk
    check (op_origem_id <> op_dependente_id),
  constraint of_operacao_dependencias_sem_duplicidade_uniq
    unique (op_origem_id, op_dependente_id)
);

comment on table public.of_operacao_dependencias is
  'Grafo de precedencia entre OPs da MESMA OF (nunca cross-OF - PCP-P6C.3 Parte 19). Dependencia orienta planejamento, nunca bloqueia apontamento (PCP-P6B/P6C: falta de apontamento da OP anterior nao impede a seguinte). Ciclo e rejeitado na RPC (DFS de alcancabilidade antes do INSERT, nunca por CHECK - regra e cross-row), nunca aqui estruturalmente.';

create index of_operacao_dependencias_origem_idx on public.of_operacao_dependencias (op_origem_id);
create index of_operacao_dependencias_dependente_idx on public.of_operacao_dependencias (op_dependente_id);

comment on index public.of_operacao_dependencias_origem_idx is 'Suporta o DFS de deteccao de ciclo (navegar a partir de uma OP origem) e a exibicao do grafo.';
comment on index public.of_operacao_dependencias_dependente_idx is 'Suporta o DFS na direcao reversa (quem depende de quem) e a validacao antes do encerramento da OF.';

-- =====================================================================
-- 5. Auditoria de Y - append-only, sem hardcode de papel (PCP-P6D.1,
--    Parte 18/L: autorizacao vem so de Grupo de Acesso/Permissoes).
-- =====================================================================
create table public.of_operacao_auditoria (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  op_id uuid not null,
  campo_alterado text not null,
  valor_anterior text,
  valor_novo text,
  alterado_por uuid not null references auth.users (id),
  alterado_em timestamptz not null default now(),
  motivo text,

  constraint of_operacao_auditoria_op_fkey
    foreign key (op_id, empresa_id) references public.ordens_fabricacao_operacoes (id, empresa_id)
);

comment on table public.of_operacao_auditoria is
  'Trilha append-only de alteracoes de Y, por campo (PCP-P6C Parte H). Nenhum dominio fechado de "origem"/papel (PCP-P6D.1 corrigiu isso explicitamente - autorizacao e de Grupo de Acesso, nunca hardcoded aqui). motivo e nullable - obrigatorio so quando a RPC classificar a alteracao como relevante, nunca por CHECK.';

create index of_operacao_auditoria_op_idx on public.of_operacao_auditoria (op_id, alterado_em desc);

comment on index public.of_operacao_auditoria_op_idx is 'Suporta a leitura cronologica da trilha de uma OP especifica (tela de historico).';

-- =====================================================================
-- 5.1 Pre-requisito para FK composta: funcionarios so tinha PK(id),
--     nunca UNIQUE(id,empresa_id) (confirmado - diferente de
--     bom_operacoes/recursos_produtivos, que ja tinham). empresa_id e
--     NOT NULL (confirmado) - aditiva, sem impacto em dado existente
--     (id ja e globalmente unico via PK; isto so cria a chave candidata
--     composta necessaria para integridade multiempresa das tabelas
--     novas abaixo).
-- =====================================================================
alter table public.funcionarios
  add constraint funcionarios_id_empresa_uniq unique (id, empresa_id);

-- =====================================================================
-- 6. Apontamentos - eventos puros de Z (PCP-P6C.3/P6D.1). Sessao e
--    sempre derivada, nunca materializada.
-- =====================================================================
create table public.of_apontamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  of_id uuid not null,
  op_id uuid not null,
  funcionario_id uuid not null,
  recurso_real_id uuid null,
  tipo_evento text not null,
  ocorrido_em timestamptz not null,
  created_at timestamptz not null default now(),

  constraint of_apontamentos_of_fkey
    foreign key (of_id, empresa_id) references public.ordens_fabricacao (id, empresa_id),
  constraint of_apontamentos_op_fkey
    foreign key (op_id, empresa_id) references public.ordens_fabricacao_operacoes (id, empresa_id),
  constraint of_apontamentos_funcionario_fkey
    foreign key (funcionario_id, empresa_id) references public.funcionarios (id, empresa_id),
  constraint of_apontamentos_recurso_real_fkey
    foreign key (recurso_real_id, empresa_id) references public.recursos_produtivos (id, empresa_id),
  constraint of_apontamentos_tipo_evento_chk
    check (tipo_evento in ('iniciar', 'pausar', 'retomar', 'finalizar')),
  constraint of_apontamentos_id_empresa_uniq unique (id, empresa_id)
);

comment on table public.of_apontamentos is
  'Fato real de execucao (Z) - eventos puros, nunca sessao materializada (PCP-P6C.3 Parte I: volume esperado - decenas de eventos por OP - torna a consulta derivada suficiente, e manter so uma fonte de verdade elimina divergencia). funcionario_id referencia funcionarios(id), NUNCA auth.users - colaborador de chao de fabrica aponta pelo codigo/numero do cadastro, sem precisar de login no ERP (PCP-P6D.1 Parte 4/10). Sem coluna de quantidade (PCP-P6D.1 Parte 7/8/12 - rejeitada, nao obrigatoria na v1, nao mantida "por precaucao"). Sem created_by obrigatorio ligado a auth.users (PCP-P6D.1 Parte 5/10/22 - identidade de quem gravou no sistema, se existir, e campo separado, nao inventado aqui sem necessidade confirmada).';

create index of_apontamentos_op_idx on public.of_apontamentos (op_id, ocorrido_em);
create index of_apontamentos_funcionario_dia_idx on public.of_apontamentos (funcionario_id, ocorrido_em);

comment on index public.of_apontamentos_op_idx is 'Suporta derivar a sessao de uma OP (agrupar eventos por op_id em ordem cronologica) e o criterio de conclusao da OP.';
comment on index public.of_apontamentos_funcionario_dia_idx is 'Suporta a contagem de pausas/dia e sessoes simultaneas por colaborador (PCP-P6D.1 Parte 14/15) - consulta mais frequente de validacao em registrar_apontamento.';

-- =====================================================================
-- 7. Correcoes/regularizacoes de Z - tabela separada, nunca edita o
--    evento original (PCP-P6C.3 Parte J: modelo A, evento original +
--    evento corretivo).
-- =====================================================================
create table public.of_apontamento_correcoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  apontamento_id uuid null,
  op_id uuid not null,
  funcionario_id uuid not null,
  valor_anterior jsonb,
  valor_novo jsonb not null,
  data_execucao_real timestamptz not null,
  retroativo boolean not null,
  corrigido_por uuid not null references auth.users (id),
  corrigido_em timestamptz not null default now(),
  motivo text not null,

  constraint of_apontamento_correcoes_op_fkey
    foreign key (op_id, empresa_id) references public.ordens_fabricacao_operacoes (id, empresa_id),
  constraint of_apontamento_correcoes_funcionario_fkey
    foreign key (funcionario_id, empresa_id) references public.funcionarios (id, empresa_id),
  constraint of_apontamento_correcoes_apontamento_fkey
    foreign key (apontamento_id, empresa_id) references public.of_apontamentos (id, empresa_id),
  constraint of_apontamento_correcoes_motivo_nao_vazio_chk
    check (length(btrim(motivo)) > 0)
);

comment on table public.of_apontamento_correcoes is
  'Regularizacao/correcao de Z (PCP-P6B.2/P6C.3/P6D.1) - apontamento_id nullable (regularizacao pura, sem evento previo, quando o colaborador simplesmente esqueceu de apontar). funcionario_id = quem realmente executou o trabalho; corrigido_por = usuario do ERP que fez a regularizacao (PCP-P6D.1 Parte 6/23 - identidades sempre distintas, nunca a mesma coluna). motivo sempre obrigatorio, sem excecao. Nunca sobrescreve of_apontamentos original - a leitura de "Z efetivo" considera correcao mais recente por apontamento_id quando existir, nunca conta os dois como fatos independentes.';

create index of_apontamento_correcoes_op_idx on public.of_apontamento_correcoes (op_id);
create index of_apontamento_correcoes_apontamento_idx on public.of_apontamento_correcoes (apontamento_id);

comment on index public.of_apontamento_correcoes_op_idx is 'Suporta of_apontamentos_efetivos/op_esta_resolvida (buscar todas as correcoes de uma OP para montar o Z efetivo).';
comment on index public.of_apontamento_correcoes_apontamento_idx is 'Suporta a leitura de "Z efetivo" (join apontamento->correcao mais recente).';

-- =====================================================================
-- 8. Imutabilidade pos-encerramento (PCP-P6C Parte Q/N, PCP-P6D.1 Parte
--    20) - trigger dedicado por tabela (estilo explicito do projeto,
--    nunca generico via introspeccao dinamica).
-- =====================================================================
create or replace function public.impedir_escrita_operacao_of_encerrada()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_of_id uuid := coalesce(new.of_id, old.of_id);
  v_estado_execucao text;
begin
  select estado_execucao into v_estado_execucao
  from public.ordens_fabricacao
  where id = v_of_id;

  if v_estado_execucao = 'concluida' then
    raise exception 'OF % esta encerrada - nenhuma OP pode ser criada/alterada (PCP-P6C: OF encerrada nunca reabre).', v_of_id;
  end if;

  return coalesce(new, old);
end;
$function$;

create trigger ordens_fabricacao_operacoes_impedir_apos_encerramento
  before insert or update or delete on public.ordens_fabricacao_operacoes
  for each row
  execute function public.impedir_escrita_operacao_of_encerrada();

create or replace function public.impedir_escrita_apontamento_of_encerrada()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_of_id uuid := coalesce(new.of_id, old.of_id);
  v_estado_execucao text;
begin
  select estado_execucao into v_estado_execucao
  from public.ordens_fabricacao
  where id = v_of_id;

  if v_estado_execucao = 'concluida' then
    raise exception 'OF % esta encerrada - nenhum apontamento pode ser criado (PCP-P6C: Z congela no encerramento).', v_of_id;
  end if;

  return coalesce(new, old);
end;
$function$;

create trigger of_apontamentos_impedir_apos_encerramento
  before insert on public.of_apontamentos
  for each row
  execute function public.impedir_escrita_apontamento_of_encerrada();

create or replace function public.impedir_escrita_via_op_of_encerrada()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_op_id uuid := coalesce(new.op_id, old.op_id);
  v_estado_execucao text;
begin
  select ofab.estado_execucao into v_estado_execucao
  from public.ordens_fabricacao_operacoes op
  join public.ordens_fabricacao ofab on ofab.id = op.of_id
  where op.id = v_op_id;

  if v_estado_execucao = 'concluida' then
    raise exception 'A OF da OP % esta encerrada - nenhum registro novo e permitido (PCP-P6C: auditoria/correcao congelam no encerramento).', v_op_id;
  end if;

  return coalesce(new, old);
end;
$function$;

comment on function public.impedir_escrita_via_op_of_encerrada() is
  'Reaproveitada por of_operacao_auditoria e of_apontamento_correcoes - chegam ao estado da OF so via op_id (nunca tem of_id direto). of_operacao_dependencias usa op_origem_id, nao op_id - tem funcao dedicada propria (impedir_dependencia_of_encerrada, abaixo).';

create trigger of_operacao_auditoria_impedir_apos_encerramento
  before insert on public.of_operacao_auditoria
  for each row
  execute function public.impedir_escrita_via_op_of_encerrada();

create trigger of_apontamento_correcoes_impedir_apos_encerramento
  before insert on public.of_apontamento_correcoes
  for each row
  execute function public.impedir_escrita_via_op_of_encerrada();

-- =====================================================================
-- 8.1 Append-only INCONDICIONAL (correcao do usuario): RLS+REVOKE so
--     protege contra `authenticated` - nunca provaria append-only
--     contra uma RPC SECURITY DEFINER mal escrita (que roda como
--     postgres, dono da tabela, imune a RLS/GRANT). Estes 3 triggers
--     bloqueiam UPDATE/DELETE incondicionalmente, SEMPRE, independente
--     de quem/o que esta chamando - a OF estar aberta ou encerrada e
--     irrelevante aqui (isso e so sobre INSERT, acima). Nenhuma funcao
--     desta migration (nem futura) pode contornar isto sem um novo
--     DROP TRIGGER explicito, auditavel em qualquer revisao de schema.
-- =====================================================================
create or replace function public.impedir_update_delete_historico()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'Tabela % e append-only - UPDATE/DELETE nunca e permitido, nem por RPC/SECURITY DEFINER (PCP-P6E, correcao do usuario sobre T13).', tg_table_name;
end;
$function$;

comment on function public.impedir_update_delete_historico() is
  'Guarda incondicional - nao verifica estado da OF nem quem chama. Diferente de impedir_escrita_*_of_encerrada (que so bloqueia apos encerramento e so no INSERT): aqui UPDATE/DELETE sao sempre proibidos, em qualquer momento, por qualquer caller, inclusive postgres via SECURITY DEFINER.';

create trigger of_apontamentos_append_only
  before update or delete on public.of_apontamentos
  for each row
  execute function public.impedir_update_delete_historico();

create trigger of_operacao_auditoria_append_only
  before update or delete on public.of_operacao_auditoria
  for each row
  execute function public.impedir_update_delete_historico();

create trigger of_apontamento_correcoes_append_only
  before update or delete on public.of_apontamento_correcoes
  for each row
  execute function public.impedir_update_delete_historico();

-- of_operacao_dependencias usa op_origem_id (nao op_id) - trigger dedicado.
create or replace function public.impedir_dependencia_of_encerrada()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_op_origem_id uuid := coalesce(new.op_origem_id, old.op_origem_id);
  v_estado_execucao text;
begin
  select ofab.estado_execucao into v_estado_execucao
  from public.ordens_fabricacao_operacoes op
  join public.ordens_fabricacao ofab on ofab.id = op.of_id
  where op.id = v_op_origem_id;

  if v_estado_execucao = 'concluida' then
    raise exception 'A OF da dependencia esta encerrada - nenhuma dependencia pode ser criada/alterada.';
  end if;

  return coalesce(new, old);
end;
$function$;

create trigger of_operacao_dependencias_impedir_apos_encerramento
  before insert or update or delete on public.of_operacao_dependencias
  for each row
  execute function public.impedir_dependencia_of_encerrada();

-- =====================================================================
-- 9. Funcoes auxiliares - deteccao de ciclo e criterio de conclusao.
-- =====================================================================
create or replace function public.existe_caminho_dependencia(p_de_op_id uuid, p_para_op_id uuid)
returns boolean
language sql
stable
as $function$
  with recursive alcancaveis(op_id) as (
    select op_dependente_id from public.of_operacao_dependencias where op_origem_id = p_de_op_id
    union
    select d.op_dependente_id
    from public.of_operacao_dependencias d
    join alcancaveis a on a.op_id = d.op_origem_id
  )
  select exists (select 1 from alcancaveis where op_id = p_para_op_id);
$function$;

comment on function public.existe_caminho_dependencia(uuid, uuid) is
  'DFS de alcancabilidade via CTE recursiva (PCP-P6C.3 Parte 17/G - escolhido sobre ordenacao topologica completa: O(V+E) por chamada, suficiente para o volume esperado de OPs por OF). Usado ANTES de inserir op_origem_id->op_dependente_id: se existe_caminho_dependencia(op_dependente_id, op_origem_id) for true, a nova aresta criaria ciclo.';

create or replace function public.of_apontamentos_efetivos(p_op_id uuid)
returns table (funcionario_id uuid, ocorrido_em timestamptz, tipo_evento text)
language sql
stable
as $function$
  -- Z efetivo (correcao do usuario): nao existe estado "correcao
  -- pendente" na v1 - toda correcao/regularizacao confirmada pela RPC
  -- (pessoa autorizada + motivo obrigatorio, ja garantidos em
  -- regularizar_apontamento) passa a ser IMEDIATAMENTE efetiva. Um
  -- evento original e substituido pelo valor_novo da sua correcao mais
  -- recente, quando existir; uma regularizacao pura (apontamento_id
  -- NULL) e, ela mesma, um evento efetivo adicional.
  select a.funcionario_id, a.ocorrido_em, a.tipo_evento
  from public.of_apontamentos a
  where a.op_id = p_op_id
    and not exists (select 1 from public.of_apontamento_correcoes c where c.apontamento_id = a.id)
  union all
  select
    c.funcionario_id,
    coalesce((c.valor_novo ->> 'ocorrido_em')::timestamptz, c.data_execucao_real),
    coalesce(c.valor_novo ->> 'tipo_evento', 'finalizar')
  from public.of_apontamento_correcoes c
  where c.op_id = p_op_id
    and c.id = (
      -- correcao mais recente por apontamento_id (ou por id, quando
      -- apontamento_id e NULL - regularizacao pura nunca e "corrigida
      -- de novo" nesta v1, so existe uma linha por fato regularizado).
      -- Tiebreaker por id (checagem do usuario, Parte 1): corrigido_em
      -- default now() retorna o INICIO da transacao, nao o momento do
      -- INSERT - duas correcoes da MESMA apontamento_id na MESMA
      -- transacao teriam corrigido_em identico, e ORDER BY sem segundo
      -- criterio nao garante escolha estavel/repetivel entre execucoes.
      -- id (uuid aleatorio) nao tem significado de negocio, mas garante
      -- determinismo puro - unica funcao do tiebreaker.
      select c2.id from public.of_apontamento_correcoes c2
      where coalesce(c2.apontamento_id, c2.id) = coalesce(c.apontamento_id, c.id)
        and c2.op_id = p_op_id
      order by c2.corrigido_em desc, c2.id desc
      limit 1
    );
$function$;

comment on function public.of_apontamentos_efetivos(uuid) is
  'Z efetivo de uma OP (correcao do usuario sobre a proposta anterior): substitui todo evento original que tenha correcao pelo valor_novo da correcao mais recente; inclui regularizacoes puras (sem apontamento_id) como eventos proprios. Nenhum conceito de "correcao pendente" - confirmada pela RPC = imediatamente efetiva. Usado por op_esta_resolvida e por qualquer leitura futura de sessao/tempo real que precise considerar correcoes.';

create or replace function public.op_esta_resolvida(p_op_id uuid)
returns boolean
language sql
stable
as $function$
  select
    coalesce((select nao_aplicavel from public.ordens_fabricacao_operacoes where id = p_op_id), false)
    or (
      not exists (
        -- sessao aberta = ultimo evento EFETIVO do funcionario nesta OP
        -- nao e 'finalizar'
        select 1
        from public.of_apontamentos_efetivos(p_op_id) e
        where e.ocorrido_em = (
          select max(e2.ocorrido_em) from public.of_apontamentos_efetivos(p_op_id) e2
          where e2.funcionario_id = e.funcionario_id
        )
        and e.tipo_evento <> 'finalizar'
      )
      and exists (
        select 1 from public.of_apontamentos_efetivos(p_op_id) where tipo_evento = 'finalizar'
      )
    );
$function$;

comment on function public.op_esta_resolvida(uuid) is
  'Criterio de conclusao da OP (PCP-P6D.1 Parte 14, corrigindo "soma de quantidade" - rejeitada): nao_aplicavel=true OU (nenhuma sessao aberta de nenhum funcionario E existe pelo menos 1 finalizar), avaliado sobre o Z EFETIVO (of_apontamentos_efetivos), nunca sobre os eventos originais brutos quando houver correcao. Sem quantidade - criterio e temporal/de estado (PCP-P6D.1 Parte 14). Removido o conceito de "correcao pendente" (correcao do usuario) - nao existe na v1, toda correcao confirmada e imediatamente efetiva.';

create or replace function public.of_pode_encerrar(p_of_id uuid)
returns boolean
language sql
stable
as $function$
  select not exists (
    select 1 from public.ordens_fabricacao_operacoes op
    where op.of_id = p_of_id
      and not public.op_esta_resolvida(op.id)
  );
$function$;

comment on function public.of_pode_encerrar(uuid) is
  'Verifica que TODAS as OPs da OF estao resolvidas (PCP-P6C Parte 15/F). Chamada por encerrar_of antes de gravar estado_execucao=concluida.';

-- =====================================================================
-- 10. Alteracao de criar_ofs_de_projeto_aprovado - atomicidade por
--     item (PCP-P6D.2/P6D.3): cada item cria OF+OPs numa SAVEPOINT
--     propria; falha de 1 item nunca aborta os demais. Corpo real (lido
--     integralmente contra o banco linked nesta sessao) preservado ao
--     maximo - so o loop de insercao da OF por item ganha OPs
--     instanciadas do Roteiro vigente, e o "ignorar sem BOM" (motivo=
--     'bom_nao_resolvido') passa a significar literalmente "nao cria OF
--     para este item", nunca mais criando uma OF vazia.
-- =====================================================================
create or replace function public.criar_ofs_de_projeto_aprovado(p_projeto_id uuid, p_empresa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_snapshot_id uuid;
  v_aprovado_por uuid;
  v_aprovador_empresa_id uuid;
  v_qtd_vigentes integer;
  v_sub_anterior text;
  v_item record;
  v_bom_id uuid;
  v_of_existente_id uuid;
  v_of_existente_numero text;
  v_novo_of_id uuid;
  v_novo_numero text;
  v_bom_op record;
  v_seq smallint;
  v_resultado jsonb := '[]'::jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('criar_ofs_de_projeto_aprovado:' || p_projeto_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('subconjunto-grafo:' || p_empresa_id::text, 0));

  select count(*) into v_qtd_vigentes
  from public.simulacoes_comerciais
  where projeto_id = p_projeto_id and empresa_id = p_empresa_id and vigente = true;

  if v_qtd_vigentes <> 1 then
    raise exception 'criar_ofs_de_projeto_aprovado: esperava exatamente 1 simulacao vigente para o projeto %, encontrado %.', p_projeto_id, v_qtd_vigentes;
  end if;

  select sc.id, sc.aprovado_por into v_snapshot_id, v_aprovado_por
  from public.simulacoes_comerciais sc
  where sc.projeto_id = p_projeto_id and sc.empresa_id = p_empresa_id and sc.vigente = true;

  select empresa_id into v_aprovador_empresa_id from public.usuarios where id = v_aprovado_por;

  if v_aprovador_empresa_id is null or v_aprovador_empresa_id is distinct from p_empresa_id then
    raise exception 'criar_ofs_de_projeto_aprovado: aprovador % do snapshot vigente % nao e um usuario valido da empresa %.', v_aprovado_por, v_snapshot_id, p_empresa_id;
  end if;

  v_sub_anterior := current_setting('request.jwt.claim.sub', true);
  perform set_config('request.jwt.claim.sub', v_aprovado_por::text, true);

  if auth.uid() is distinct from v_aprovado_por then
    raise exception 'criar_ofs_de_projeto_aprovado: falha ao estabelecer a autoria da aprovacao para criacao das OFs.';
  end if;

  if public.empresa_atual_id() is distinct from p_empresa_id then
    raise exception 'criar_ofs_de_projeto_aprovado: a autoria da aprovacao nao pertence a empresa do projeto.';
  end if;

  for v_item in
    select pi.id as projeto_item_id, pi.produto_id, pi.quantidade,
           ii.ativo as produto_ativo, ii.tipo_item, ii.unidade
    from public.projeto_itens pi
    join public.itens_industriais ii
      on ii.id = pi.produto_id and ii.empresa_id = p_empresa_id
    where pi.projeto_id = p_projeto_id
      and pi.empresa_id = p_empresa_id
      and pi.ativo = true
      and pi.deleted_at is null
    order by pi.id
  loop
    -- Savepoint por item (PCP-P6D.2 Parte 5/27): qualquer exceção
    -- dentro deste bloco desfaz SO este item, nunca os demais.
    begin
      if not v_item.produto_ativo then
        v_resultado := v_resultado || jsonb_build_object(
          'projeto_item_id', v_item.projeto_item_id, 'resultado', 'ignorada', 'motivo', 'produto_inativo'
        );
        continue;
      end if;

      if v_item.tipo_item not in ('produto acabado', 'semiacabado') then
        v_resultado := v_resultado || jsonb_build_object(
          'projeto_item_id', v_item.projeto_item_id, 'resultado', 'ignorada', 'motivo', 'tipo_item_invalido'
        );
        continue;
      end if;

      v_bom_id := public.resolver_bom_ativo_produto(p_empresa_id, v_item.produto_id);

      if v_bom_id is null then
        -- PCP-P6D.2: Produto sem Roteiro valido NUNCA gera OF deste item
        -- (antes: "ignorada", mas o antigo comportamento ja nao criava
        -- OF - so o rotulo do resultado muda para refletir a regra
        -- explicita "sem Roteiro -> sem OF -> pendente").
        v_resultado := v_resultado || jsonb_build_object(
          'projeto_item_id', v_item.projeto_item_id, 'resultado', 'pendente', 'motivo', 'sem_roteiro_valido'
        );
        continue;
      end if;

      select id, numero_of into v_of_existente_id, v_of_existente_numero
      from public.ordens_fabricacao
      where projeto_item_id = v_item.projeto_item_id and of_pai_id is null;

      if v_of_existente_id is not null then
        v_resultado := v_resultado || jsonb_build_object(
          'projeto_item_id', v_item.projeto_item_id, 'resultado', 'ja_existente',
          'of_id', v_of_existente_id, 'numero_of', v_of_existente_numero
        );
        continue;
      end if;

      insert into public.ordens_fabricacao (
        empresa_id, projeto_id, projeto_item_id, produto_id, bom_id,
        quantidade_planejada, unidade, created_by,
        estado_aprovacao, estado_execucao
      ) values (
        p_empresa_id, p_projeto_id, v_item.projeto_item_id, v_item.produto_id, v_bom_id,
        v_item.quantidade, v_item.unidade, v_aprovado_por,
        'aguardando_auditoria', 'planejada'
      )
      returning id, numero_of into v_novo_of_id, v_novo_numero;

      -- PCP-P6D.3: OPs instanciadas do Roteiro (BOM) vigente resolvido
      -- acima, no MESMO instante/transacao da criacao da OF - nunca
      -- recalculado depois. PCP-P6D.2: pelo menos 1 OP e obrigatoria -
      -- se bom_operacoes nao tiver nenhuma linha ativa, a exception
      -- abaixo desfaz SO este item (savepoint), nunca cria OF sem OP.
      v_seq := 0;
      for v_bom_op in
        select id, ordem, descricao, tempo_estimado_minutos, recurso_produtivo_id
        from public.bom_operacoes
        where bom_id = v_bom_id and empresa_id = p_empresa_id
          and ativo = true and deleted_at is null
        order by ordem
      loop
        v_seq := v_seq + 1;
        insert into public.ordens_fabricacao_operacoes (
          empresa_id, of_id, origem, bom_operacao_id,
          codigo_operacional, descricao, recurso_vigente_id, tempo_vigente_minutos,
          sequencia_vigente, created_by
        ) values (
          p_empresa_id, v_novo_of_id, 'roteiro', v_bom_op.id,
          'OP' || v_bom_op.ordem::text, v_bom_op.descricao, v_bom_op.recurso_produtivo_id, v_bom_op.tempo_estimado_minutos,
          v_seq, v_aprovado_por
        );
      end loop;

      if v_seq = 0 then
        raise exception 'Roteiro % nao possui nenhuma operacao ativa - OF nao pode nascer sem OP (PCP-P6D.2).', v_bom_id;
      end if;

      v_resultado := v_resultado || jsonb_build_object(
        'projeto_item_id', v_item.projeto_item_id, 'resultado', 'criada',
        'of_id', v_novo_of_id, 'numero_of', v_novo_numero, 'ops_criadas', v_seq
      );
    exception when others then
      -- PCP-P6D.2 Parte 5/27: falha deste item NUNCA aborta os demais.
      v_resultado := v_resultado || jsonb_build_object(
        'projeto_item_id', v_item.projeto_item_id, 'resultado', 'erro', 'motivo', sqlerrm
      );
    end;
  end loop;

  perform set_config('request.jwt.claim.sub', v_sub_anterior, true);

  return v_resultado;
end;
$function$;

comment on function public.criar_ofs_de_projeto_aprovado(uuid, uuid) is
  'PCP-P6E - estende o comportamento ja real (confirmado contra producao, PCP-P5A/P6D) para exigir Roteiro + >=1 OP por item, atomicamente, sem abortar os demais itens do Projeto (bloco BEGIN/EXCEPTION por item = savepoint implicito do plpgsql). "pendente"/motivo=sem_roteiro_valido substitui silenciosamente o antigo "ignorada"/bom_nao_resolvido - MESMO comportamento de nao criar OF, rotulo mais honesto sobre a regra de negocio (PCP-P6D.2: Roteiro obrigatorio, nunca OP avulsa para contornar). "erro" e um resultado NOVO - antes, uma falha inesperada dentro do loop quebraria a function inteira (todas as OFs ja criadas no loop ficariam em savepoint implicito do PL/pgSQL de qualquer forma, mas sem relato explicito); agora cada item e isolado e relatado individualmente.';

-- =====================================================================
-- 11. RPCs autoritativas de OP/Y/Z/retrabalho - unicos pontos de
--     escrita (PCP-P6E Parte S/31). Owner postgres, SECURITY DEFINER,
--     search_path fixo, mesmo padrao de toda a familia aprovar_* desta
--     sessao.
-- =====================================================================

-- 11.1 alterar_y_operacao - unica RPC para PCP e Lider (autorizacao via
-- Grupo de Acesso, nunca hardcoded aqui - PCP-P6D.1 Parte L).
create or replace function public.alterar_y_operacao(
  p_op_id uuid,
  p_alterado_por uuid,
  p_recurso_vigente_id uuid default null,
  p_tempo_vigente_minutos numeric default null,
  p_sequencia_vigente smallint default null,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_recurso_anterior uuid;
  v_tempo_anterior numeric;
  v_sequencia_anterior smallint;
begin
  if p_alterado_por is null then
    raise exception 'p_alterado_por e obrigatorio.';
  end if;

  select empresa_id, recurso_vigente_id, tempo_vigente_minutos, sequencia_vigente
    into v_empresa_id, v_recurso_anterior, v_tempo_anterior, v_sequencia_anterior
  from public.ordens_fabricacao_operacoes
  where id = p_op_id;

  if v_empresa_id is null then
    raise exception 'OP % nao encontrada.', p_op_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ordens_fabricacao_operacoes:' || p_op_id::text, 0));

  if p_recurso_vigente_id is not null and p_recurso_vigente_id is distinct from v_recurso_anterior then
    update public.ordens_fabricacao_operacoes set recurso_vigente_id = p_recurso_vigente_id where id = p_op_id;
    insert into public.of_operacao_auditoria (empresa_id, op_id, campo_alterado, valor_anterior, valor_novo, alterado_por, motivo)
      values (v_empresa_id, p_op_id, 'recurso_vigente_id', v_recurso_anterior::text, p_recurso_vigente_id::text, p_alterado_por, p_motivo);
  end if;

  if p_tempo_vigente_minutos is not null and p_tempo_vigente_minutos is distinct from v_tempo_anterior then
    update public.ordens_fabricacao_operacoes set tempo_vigente_minutos = p_tempo_vigente_minutos where id = p_op_id;
    insert into public.of_operacao_auditoria (empresa_id, op_id, campo_alterado, valor_anterior, valor_novo, alterado_por, motivo)
      values (v_empresa_id, p_op_id, 'tempo_vigente_minutos', v_tempo_anterior::text, p_tempo_vigente_minutos::text, p_alterado_por, p_motivo);
  end if;

  if p_sequencia_vigente is not null and p_sequencia_vigente is distinct from v_sequencia_anterior then
    update public.ordens_fabricacao_operacoes set sequencia_vigente = p_sequencia_vigente where id = p_op_id;
    insert into public.of_operacao_auditoria (empresa_id, op_id, campo_alterado, valor_anterior, valor_novo, alterado_por, motivo)
      values (v_empresa_id, p_op_id, 'sequencia_vigente', v_sequencia_anterior::text, p_sequencia_vigente::text, p_alterado_por, p_motivo);
  end if;
end;
$function$;

comment on function public.alterar_y_operacao(uuid, uuid, uuid, numeric, smallint, text) is
  'Unica RPC para PCP OU Lider alterarem Y (recurso/tempo/sequencia) - distincao de quem pode chamar fica inteiramente no Grupo de Acesso/Permissoes (PCP-P6D.1 Parte 18/L, corrigido: nunca domain CHECK de papel no banco). Cada campo alterado grava 1 linha de auditoria, so se o valor realmente mudou. p_alterado_por resolvido pelo chamador (Server Action), nunca inferido de auth.uid() sem JWT real.';

-- 11.2 criar_op_no_y - OP nova, so PCP (autorizacao no Grupo de Acesso).
create or replace function public.criar_op_no_y(
  p_of_id uuid,
  p_criado_por uuid,
  p_codigo_operacional text,
  p_descricao text,
  p_sequencia_vigente smallint,
  p_recurso_vigente_id uuid default null,
  p_tempo_vigente_minutos numeric default null,
  p_motivo text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_novo_op_id uuid;
begin
  select empresa_id into v_empresa_id from public.ordens_fabricacao where id = p_of_id;
  if v_empresa_id is null then
    raise exception 'OF % nao encontrada.', p_of_id;
  end if;

  insert into public.ordens_fabricacao_operacoes (
    empresa_id, of_id, origem, codigo_operacional, descricao,
    recurso_vigente_id, tempo_vigente_minutos, sequencia_vigente, created_by
  ) values (
    v_empresa_id, p_of_id, 'y', p_codigo_operacional, p_descricao,
    p_recurso_vigente_id, p_tempo_vigente_minutos, p_sequencia_vigente, p_criado_por
  )
  returning id into v_novo_op_id;

  insert into public.of_operacao_auditoria (empresa_id, op_id, campo_alterado, valor_anterior, valor_novo, alterado_por, motivo)
    values (v_empresa_id, v_novo_op_id, 'criacao', null, 'OP criada operacionalmente (origem=y)', p_criado_por, p_motivo);

  return v_novo_op_id;
end;
$function$;

comment on function public.criar_op_no_y(uuid, uuid, text, text, smallint, uuid, numeric, text) is
  'OP nova no Y (PCP-P6C Parte 13/24) - nunca recebe bom_operacao_id (origem=y, nao existia no Roteiro no momento da OF). "y" descreve a proveniencia (nasceu operacionalmente, nao do Roteiro), nunca o papel de quem criou - quem pode chamar esta RPC e decisao de Grupo de Acesso/Permissoes, nunca hardcoded aqui (correcao do usuario: hoje so PCP tem a permissao, mas outro Perfil pode ganha-la sem a OP deixar de ser origem=y). Mesmo mecanismo serve para OPs ad-hoc numa OF normal e para OPs de uma OF de retrabalho.';

-- 11.3 marcar_op_nao_aplicavel - so PCP.
create or replace function public.marcar_op_nao_aplicavel(
  p_op_id uuid,
  p_marcado_por uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'motivo e obrigatorio para marcar OP como nao aplicavel.';
  end if;

  select empresa_id into v_empresa_id from public.ordens_fabricacao_operacoes where id = p_op_id;
  if v_empresa_id is null then
    raise exception 'OP % nao encontrada.', p_op_id;
  end if;

  update public.ordens_fabricacao_operacoes
  set nao_aplicavel = true, motivo_nao_aplicavel = p_motivo
  where id = p_op_id;

  insert into public.of_operacao_auditoria (empresa_id, op_id, campo_alterado, valor_anterior, valor_novo, alterado_por, motivo)
    values (v_empresa_id, p_op_id, 'nao_aplicavel', 'false', 'true', p_marcado_por, p_motivo);
end;
$function$;

-- 11.4 alterar_dependencia_operacao - criar/remover, so PCP, valida ciclo.
create or replace function public.alterar_dependencia_operacao(
  p_op_origem_id uuid,
  p_op_dependente_id uuid,
  p_acao text,
  p_alterado_por uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_empresa_dependente uuid;
  v_of_origem uuid;
  v_of_dependente uuid;
begin
  if p_acao not in ('criar', 'remover') then
    raise exception 'p_acao invalida: % (esperado criar ou remover).', p_acao;
  end if;

  select empresa_id, of_id into v_empresa_id, v_of_origem from public.ordens_fabricacao_operacoes where id = p_op_origem_id;
  select empresa_id, of_id into v_empresa_dependente, v_of_dependente from public.ordens_fabricacao_operacoes where id = p_op_dependente_id;

  if v_empresa_id is null or v_empresa_dependente is null then
    raise exception 'OP origem ou dependente nao encontrada.';
  end if;
  if v_empresa_id is distinct from v_empresa_dependente then
    raise exception 'OPs pertencem a empresas diferentes.';
  end if;
  if v_of_origem is distinct from v_of_dependente then
    raise exception 'Dependencia so e permitida entre OPs da MESMA OF (PCP-P6C.3 Parte 19).';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of_dependencias:' || v_of_origem::text, 0));

  if p_acao = 'criar' then
    if public.existe_caminho_dependencia(p_op_dependente_id, p_op_origem_id) then
      raise exception 'Dependencia rejeitada: criaria ciclo (ja existe caminho de % para %).', p_op_dependente_id, p_op_origem_id;
    end if;

    insert into public.of_operacao_dependencias (empresa_id, op_origem_id, op_dependente_id, created_by)
    values (v_empresa_id, p_op_origem_id, p_op_dependente_id, p_alterado_por)
    on conflict (op_origem_id, op_dependente_id) do nothing;
  else
    delete from public.of_operacao_dependencias
    where op_origem_id = p_op_origem_id and op_dependente_id = p_op_dependente_id;
  end if;
end;
$function$;

comment on function public.alterar_dependencia_operacao(uuid, uuid, text, uuid) is
  'Cria/remove dependencia, so PCP (Grupo de Acesso), serializada por OF (lock evita ciclo formado por duas edicoes concorrentes em OPs diferentes da mesma OF - PCP-P6D Parte M). DFS de alcancabilidade ANTES do insert (PCP-P6C.3 Parte 17/18).';

-- 11.5 registrar_apontamento - unico ponto para iniciar/pausar/retomar/
-- finalizar (PCP-P6E Parte S/6). Valida 4 pausas/dia e 3 OPs simultaneas.
create or replace function public.registrar_apontamento(
  p_op_id uuid,
  p_funcionario_id uuid,
  p_tipo_evento text,
  p_ocorrido_em timestamptz,
  p_recurso_real_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_of_id uuid;
  v_timezone text;
  v_dia_local date;
  v_pausas_hoje integer;
  v_sessoes_ativas integer;
  v_novo_id uuid;
begin
  if p_tipo_evento not in ('iniciar', 'pausar', 'retomar', 'finalizar') then
    raise exception 'tipo_evento invalido: %.', p_tipo_evento;
  end if;

  select op.empresa_id, op.of_id into v_empresa_id, v_of_id
  from public.ordens_fabricacao_operacoes op
  where op.id = p_op_id;

  if v_empresa_id is null then
    raise exception 'OP % nao encontrada.', p_op_id;
  end if;

  select timezone into v_timezone from public.empresas where id = v_empresa_id;
  v_dia_local := (p_ocorrido_em at time zone v_timezone)::date;

  -- Serializa por funcionario (PCP-P6D.1 Parte F/28 - evita ultrapassar
  -- os limites sob concorrencia real).
  perform pg_advisory_xact_lock(hashtextextended('funcionario_apontamento:' || p_funcionario_id::text, 0));

  if p_tipo_evento = 'pausar' then
    select count(*) into v_pausas_hoje
    from public.of_apontamentos
    where funcionario_id = p_funcionario_id
      and tipo_evento = 'pausar'
      and (ocorrido_em at time zone v_timezone)::date = v_dia_local;

    if v_pausas_hoje >= 4 then
      raise exception 'Funcionario % ja realizou 4 pausas hoje (dia local %) - limite diario atingido (PCP-P6C.4).', p_funcionario_id, v_dia_local;
    end if;
  end if;

  if p_tipo_evento = 'iniciar' then
    -- Sessao ativa = ultimo evento do funcionario (em qualquer OP) e
    -- 'iniciar' ou 'retomar' (pausada NAO conta - PCP-P6D.1 Parte 17/P).
    select count(*) into v_sessoes_ativas
    from (
      select distinct a.op_id
      from public.of_apontamentos a
      where a.funcionario_id = p_funcionario_id
        and a.ocorrido_em = (
          select max(a2.ocorrido_em) from public.of_apontamentos a2
          where a2.funcionario_id = p_funcionario_id and a2.op_id = a.op_id
        )
        and a.tipo_evento in ('iniciar', 'retomar')
    ) ativas;

    if v_sessoes_ativas >= 3 then
      raise exception 'Funcionario % ja possui 3 OPs simultaneamente ativas - limite atingido (PCP-P6C.4).', p_funcionario_id;
    end if;
  end if;

  insert into public.of_apontamentos (
    empresa_id, of_id, op_id, funcionario_id, recurso_real_id, tipo_evento, ocorrido_em
  ) values (
    v_empresa_id, v_of_id, p_op_id, p_funcionario_id, p_recurso_real_id, p_tipo_evento, p_ocorrido_em
  )
  returning id into v_novo_id;

  return v_novo_id;
end;
$function$;

comment on function public.registrar_apontamento(uuid, uuid, text, timestamptz, uuid) is
  'Unico ponto de escrita de Z normal (PCP-P6E Parte S.6). Dia local calculado via empresas.timezone (PCP-P6D.1 Parte O/21 - nunca UTC puro). 4a pausa permitida, 5a bloqueada (PCP-P6C.4 Parte A). 3 OPs simultaneas permitidas, 4a bloqueada - sessao pausada (ultimo evento=pausar) NAO ocupa vaga de simultaneidade (PCP-P6D.1 Parte 17/P). Nao exige auth.users do funcionario - so funcionario_id (PCP-P6D.1 Parte 4/9/10).';

-- 11.6 regularizar_apontamento - correcao/regularizacao retroativa.
create or replace function public.regularizar_apontamento(
  p_op_id uuid,
  p_funcionario_id uuid,
  p_apontamento_id uuid,
  p_valor_novo jsonb,
  p_data_execucao_real timestamptz,
  p_retroativo boolean,
  p_corrigido_por uuid,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_of_id uuid;
  v_estado_execucao text;
  v_valor_anterior jsonb;
  v_novo_id uuid;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'motivo e obrigatorio para toda regularizacao/correcao (PCP-P6B.2).';
  end if;

  select op.empresa_id, op.of_id into v_empresa_id, v_of_id
  from public.ordens_fabricacao_operacoes op
  where op.id = p_op_id;

  if v_empresa_id is null then
    raise exception 'OP % nao encontrada.', p_op_id;
  end if;

  select estado_execucao into v_estado_execucao from public.ordens_fabricacao where id = v_of_id;
  if v_estado_execucao = 'concluida' then
    raise exception 'OF % esta encerrada - regularizacao so e permitida com a OF aberta (PCP-P6B.2).', v_of_id;
  end if;

  if p_apontamento_id is not null then
    select to_jsonb(a) into v_valor_anterior from public.of_apontamentos a where a.id = p_apontamento_id;
  end if;

  insert into public.of_apontamento_correcoes (
    empresa_id, apontamento_id, op_id, funcionario_id, valor_anterior, valor_novo,
    data_execucao_real, retroativo, corrigido_por, motivo
  ) values (
    v_empresa_id, p_apontamento_id, p_op_id, p_funcionario_id, v_valor_anterior, p_valor_novo,
    p_data_execucao_real, p_retroativo, p_corrigido_por, p_motivo
  )
  returning id into v_novo_id;

  return v_novo_id;
end;
$function$;

comment on function public.regularizar_apontamento(uuid, uuid, uuid, jsonb, timestamptz, boolean, uuid, text) is
  'Correcao/regularizacao retroativa de Z - nunca edita of_apontamentos original (PCP-P6C.3 Parte J, modelo A). funcionario_id = quem executou; corrigido_por = usuario ERP que regularizou (PCP-P6D.1 Parte 6/23). Motivo sempre obrigatorio. So com OF aberta.';

-- 11.7 criar_of_retrabalho.
create or replace function public.criar_of_retrabalho(
  p_of_origem_id uuid,
  p_quantidade_afetada numeric,
  p_criado_por uuid,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_projeto_id uuid;
  v_projeto_item_id uuid;
  v_produto_id uuid;
  v_bom_id uuid;
  v_unidade text;
  v_novo_numero text;
  v_novo_of_id uuid;
  v_sub_anterior text;
  v_criado_por_empresa_id uuid;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'motivo e obrigatorio para criar OF de retrabalho.';
  end if;

  select empresa_id, projeto_id, projeto_item_id, produto_id, bom_id, unidade
    into v_empresa_id, v_projeto_id, v_projeto_item_id, v_produto_id, v_bom_id, v_unidade
  from public.ordens_fabricacao
  where id = p_of_origem_id;

  if v_empresa_id is null then
    raise exception 'OF de origem % nao encontrada.', p_of_origem_id;
  end if;

  -- AUDITORIA DE SEGURANCA (gate final pos-sandbox): p_criado_por e
  -- parametro livre do caller - antes de propaga-lo para set_config
  -- (que faz auth.uid()/empresa_atual_id() responderem como ele),
  -- precisa ser uma identidade ja validada, nunca um UUID aceito sem
  -- checagem. Mesma validacao que criar_ofs_de_projeto_aprovado ja
  -- faz para v_aprovado_por (usuarios.id + empresa_id == empresa da
  -- OF/projeto envolvido) - aqui a identidade vem por parametro (quem
  -- decidiu criar o retrabalho), nao de uma coluna ja gravada, mas a
  -- regra de validacao e a mesma: so aceitar se pertencer a mesma
  -- empresa da OF de origem. Sem isso, qualquer chamador desta RPC
  -- poderia fabricar created_by/historico (via o trigger
  -- registrar_historico_estado_of, que grava auth.uid() como
  -- alterado_por com origem='rpc') em nome de um usuario arbitrario,
  -- de outra empresa inclusive.
  select empresa_id into v_criado_por_empresa_id
  from public.usuarios
  where id = p_criado_por;

  if v_criado_por_empresa_id is null or v_criado_por_empresa_id is distinct from v_empresa_id then
    raise exception 'criar_of_retrabalho: criado_por % nao e um usuario valido da empresa % da OF de origem %.', p_criado_por, v_empresa_id, p_of_origem_id;
  end if;

  -- ACHADO REAL (sandbox, T17 - erro real reproduzido: "Empresa atual
  -- nao encontrada" dentro do trigger de numero_of): esta RPC roda sob
  -- service_role (sem JWT), igual aprovar_cenario_comercial_v3/
  -- criar_ofs_de_projeto_aprovado ja tratam - gerar_numero_of() depende
  -- de empresa_atual_id(), que depende de auth.uid()/request.jwt.claim.
  -- sub. Faltava aqui, nao tinha sido presumido certo - corrigido so
  -- depois da falha real.
  v_sub_anterior := current_setting('request.jwt.claim.sub', true);
  perform set_config('request.jwt.claim.sub', p_criado_por::text, true);

  if auth.uid() is distinct from p_criado_por then
    raise exception 'criar_of_retrabalho: falha ao estabelecer a autoria da criacao do retrabalho.';
  end if;

  if public.empresa_atual_id() is distinct from v_empresa_id then
    raise exception 'criar_of_retrabalho: a autoria informada nao pertence a empresa da OF de origem.';
  end if;

  insert into public.ordens_fabricacao (
    empresa_id, projeto_id, projeto_item_id, produto_id, bom_id,
    quantidade_planejada, unidade, created_by,
    estado_aprovacao, estado_execucao, of_origem_retrabalho_id
  ) values (
    v_empresa_id, v_projeto_id, v_projeto_item_id, v_produto_id, v_bom_id,
    p_quantidade_afetada, v_unidade, p_criado_por,
    'aguardando_auditoria', 'planejada', p_of_origem_id
  )
  returning id, numero_of into v_novo_of_id, v_novo_numero;

  perform set_config('request.jwt.claim.sub', v_sub_anterior, true);

  -- PCP-P6B.2/P6C.3: NAO herda automaticamente o Y final da origem.
  -- Quem for autorizado cria as OPs do retrabalho explicitamente depois,
  -- via criar_op_no_y (origem='y') - esta RPC so cria o documento-OF.
  return v_novo_of_id;
end;
$function$;

comment on function public.criar_of_retrabalho(uuid, numeric, uuid, text) is
  'Nova OF (PCP-P6B/P6C.3) - vinculo explicito via of_origem_retrabalho_id, nunca tipo/of_pai_id/of_raiz_id. Quantidade afetada e propria desta OF, nunca altera a OF/quantidade vendida original. Y proprio: NAO cria nenhuma OP aqui - quem for autorizado monta explicitamente via criar_op_no_y (origem=y), combinando referencia a OF original/Roteiro Mestre como quiser (PCP-P6C.3 Parte 21-24), nunca copia automatica.';

-- 11.8 encerrar_of.
create or replace function public.encerrar_of(p_of_id uuid, p_encerrado_por uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empresa_id uuid;
  v_estado_execucao text;
begin
  select empresa_id, estado_execucao into v_empresa_id, v_estado_execucao
  from public.ordens_fabricacao where id = p_of_id;

  if v_empresa_id is null then
    raise exception 'OF % nao encontrada.', p_of_id;
  end if;

  if v_estado_execucao = 'concluida' then
    raise exception 'OF % ja esta encerrada.', p_of_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ordens_fabricacao:' || p_of_id::text, 0));

  if not public.of_pode_encerrar(p_of_id) then
    raise exception 'OF % nao pode ser encerrada - existem OPs nao resolvidas: %.',
      p_of_id,
      (
        select string_agg(codigo_operacional, ', ')
        from public.ordens_fabricacao_operacoes op
        where op.of_id = p_of_id and not public.op_esta_resolvida(op.id)
      );
  end if;

  update public.ordens_fabricacao
  set estado_execucao = 'concluida'
  where id = p_of_id;
end;
$function$;

comment on function public.encerrar_of(uuid, uuid) is
  'Operacao autoritativa de encerramento (PCP-P6C Parte 15/21/P) - verifica atomicamente que TODAS as OPs aplicaveis estao resolvidas antes de gravar estado_execucao=concluida. Falha lista exatamente quais OPs faltam (nunca erro generico).';

-- =====================================================================
-- 12. RLS/ACL - mesmo padrao real de ordens_fabricacao (20260830134415):
--     SELECT restrito a tenant, zero DML direto para
--     authenticated/anon/service_role, escrita so pelas RPCs acima
--     (SECURITY DEFINER, owner postgres).
-- =====================================================================
alter table public.ordens_fabricacao_operacoes enable row level security;
alter table public.of_operacao_dependencias enable row level security;
alter table public.of_operacao_auditoria enable row level security;
alter table public.of_apontamentos enable row level security;
alter table public.of_apontamento_correcoes enable row level security;

create policy ordens_fabricacao_operacoes_select_tenant on public.ordens_fabricacao_operacoes
  for select to authenticated using (empresa_id = public.empresa_atual_id());
create policy of_operacao_dependencias_select_tenant on public.of_operacao_dependencias
  for select to authenticated using (empresa_id = public.empresa_atual_id());
create policy of_operacao_auditoria_select_tenant on public.of_operacao_auditoria
  for select to authenticated using (empresa_id = public.empresa_atual_id());
create policy of_apontamentos_select_tenant on public.of_apontamentos
  for select to authenticated using (empresa_id = public.empresa_atual_id());
create policy of_apontamento_correcoes_select_tenant on public.of_apontamento_correcoes
  for select to authenticated using (empresa_id = public.empresa_atual_id());

revoke all privileges on table public.ordens_fabricacao_operacoes from public, anon, authenticated, service_role;
revoke all privileges on table public.of_operacao_dependencias from public, anon, authenticated, service_role;
revoke all privileges on table public.of_operacao_auditoria from public, anon, authenticated, service_role;
revoke all privileges on table public.of_apontamentos from public, anon, authenticated, service_role;
revoke all privileges on table public.of_apontamento_correcoes from public, anon, authenticated, service_role;

grant select on table public.ordens_fabricacao_operacoes to authenticated;
grant select on table public.of_operacao_dependencias to authenticated;
grant select on table public.of_operacao_auditoria to authenticated;
grant select on table public.of_apontamentos to authenticated;
grant select on table public.of_apontamento_correcoes to authenticated;

revoke all on function public.alterar_y_operacao(uuid, uuid, uuid, numeric, smallint, text) from public, anon;
revoke all on function public.criar_op_no_y(uuid, uuid, text, text, smallint, uuid, numeric, text) from public, anon;
revoke all on function public.marcar_op_nao_aplicavel(uuid, uuid, text) from public, anon;
revoke all on function public.alterar_dependencia_operacao(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.registrar_apontamento(uuid, uuid, text, timestamptz, uuid) from public, anon;
revoke all on function public.regularizar_apontamento(uuid, uuid, uuid, jsonb, timestamptz, boolean, uuid, text) from public, anon;
revoke all on function public.criar_of_retrabalho(uuid, numeric, uuid, text) from public, anon;
revoke all on function public.encerrar_of(uuid, uuid) from public, anon;

-- Autorizacao real (PCP/Lider vs. acoes administrativas) e de Grupo de
-- Acesso/Permissoes, verificada DENTRO de cada Server Action antes de
-- chamar a RPC com o client privilegiado - mesmo padrao ja usado por
-- toda a familia aprovar_cenario_comercial_v3/confirmar_venda futura
-- nesta sessao. Por isso EXECUTE vai so para service_role, nunca
-- authenticated direto (fail-closed por papel, nao so por chamada).
grant execute on function public.alterar_y_operacao(uuid, uuid, uuid, numeric, smallint, text) to service_role;
grant execute on function public.criar_op_no_y(uuid, uuid, text, text, smallint, uuid, numeric, text) to service_role;
grant execute on function public.marcar_op_nao_aplicavel(uuid, uuid, text) to service_role;
grant execute on function public.alterar_dependencia_operacao(uuid, uuid, text, uuid) to service_role;
grant execute on function public.registrar_apontamento(uuid, uuid, text, timestamptz, uuid) to service_role;
grant execute on function public.regularizar_apontamento(uuid, uuid, uuid, jsonb, timestamptz, boolean, uuid, text) to service_role;
grant execute on function public.criar_of_retrabalho(uuid, numeric, uuid, text) to service_role;
grant execute on function public.encerrar_of(uuid, uuid) to service_role;

commit;
