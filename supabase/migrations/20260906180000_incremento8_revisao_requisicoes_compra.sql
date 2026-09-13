-- NEXOTFE - Incremento 8/9 - Governanca de Requisicao e Decisao Comercial
--
-- Escopo final, fechado apos investigacao estatica extensa (schema real,
-- RPCs reais, precedentes reais de imutabilidade/auditoria/concorrencia do
-- proprio projeto - nada presumido sem confirmacao direta):
--
-- 1) requisicao_compra_itens ganha status_aprovacao (pendente/aprovada/
--    reprovada, terminal em aprovada/reprovada). Nao ha mais ajuste de
--    quantidade nesta migration - quantidade_necessaria e o deficit
--    externo (necessidade tecnica menos CI reservado, ja calculado por
--    decidir_ci_ce_de_of) e permanece imutavel apos o nascimento.
-- 2) planejamentos_compra ganha decisao comercial com concorrencia
--    otimista (versao_otimista, mesmo padrao literal do Incremento 7 -
--    ordens_fabricacao.versao_otimista), revisao permitida antes do
--    Pedido, e uma RPC formal de cancelamento (lacuna real encontrada:
--    nao existia nenhuma via de cancelamento alem de UPDATE direto).
-- 3) Ambas as tabelas fecham ACL de escrita direta para authenticated -
--    as funcoes que escrevem viram SECURITY DEFINER com validacao
--    interna completa (auth.uid, empresa, papel, estado), nunca
--    confiando em RLS como unica defesa.
-- 4) Dois historicos append-only (requisicao e planejamento), mesmo
--    padrao estrutural de ordens_fabricacao_historico_estados - 3
--    triggers incondicionais cada, nao so RLS.
-- 5) Precondicao transacional de ausencia de legado no inicio do
--    arquivo - aborta se qualquer uma das 5 tabelas do pipeline tiver
--    linha, antes de qualquer ALTER/CREATE/DROP/REVOKE.
--
-- Fora de escopo, deliberadamente: inclusao manual de necessidade
-- complementar da OF e requisicao geral da empresa (sem projeto/OF) -
-- ambas exigem decisoes de catalogo/papel/centro de custo ainda nao
-- tomadas. Esta migration e agnostica a necessidade_id/projeto_id/OF -
-- nenhuma constraint nova exige esses vinculos, entao as duas ficam
-- prontas para uso assim que forem desenhadas em incremento proprio.
--
-- Arquivo inteiro e uma transacao.
begin;

-- =====================================================================
-- 0. Precondicao transacional de ausencia de legado
-- =====================================================================
-- Trava as 5 tabelas do pipeline em ordem fixa ANTES de contar - impede
-- que um INSERT/UPDATE/DELETE concorrente mude o resultado entre a trava
-- e a contagem. SHARE ROW EXCLUSIVE bloqueia outros escritores (INSERT/
-- UPDATE/DELETE) mas nao bloqueia leitura simples.
--
-- Ordem (requisicao_compra_itens, planejamentos_compra,
-- planejamento_compra_origens, pedidos_compra, pedido_compra_itens) e
-- deliberadamente a mesma ordem em que TODA funcao viva hoje toca essas
-- tabelas dentro de uma unica transacao - nenhuma delas jamais toca uma
-- tabela "depois" desta lista antes de uma "antes":
--   criar_planejamento_compra_a_partir_de_requisicoes: trava
--     requisicao_compra_itens, depois insere em planejamentos_compra e
--     planejamento_compra_origens (ordem 1->2->3, sem inversao).
--   decidir_compra_planejamento / gerar_pedido_compra_rascunho: so
--     tocam planejamentos_compra (ordem 2, recurso unico - contencao
--     nunca vira ciclo com um unico recurso compartilhado).
--   trg_planejamentos_compra_cancelar_origens: dispara de um UPDATE em
--     planejamentos_compra (ja travada pela instrucao externa) e so
--     entao trava planejamento_compra_origens (ordem 2->3, sem
--     inversao).
--   gerar_pedido_compra_rascunho: trava planejamentos_compra, depois
--     insere em pedidos_compra e pedido_compra_itens (ordem 2->4->5,
--     sem inversao).
-- Como nenhuma funcao viva jamais adquire um recurso "anterior" desta
-- lista depois de ja segurar um "posterior", a trava fixa desta
-- precondicao nunca pode fazer parte de um ciclo de espera - no pior
-- caso, uma transacao concorrente simplesmente espera a precondicao
-- liberar (ao fim desta migration), nunca ha espera circular.
do $$
declare
  v_qtd_requisicao_itens bigint;
  v_qtd_planejamentos bigint;
  v_qtd_origens bigint;
  v_qtd_pedidos bigint;
  v_qtd_pedido_itens bigint;
begin
  lock table public.requisicao_compra_itens in share row exclusive mode;
  lock table public.planejamentos_compra in share row exclusive mode;
  lock table public.planejamento_compra_origens in share row exclusive mode;
  lock table public.pedidos_compra in share row exclusive mode;
  lock table public.pedido_compra_itens in share row exclusive mode;

  select count(*) into v_qtd_requisicao_itens from public.requisicao_compra_itens;
  select count(*) into v_qtd_planejamentos from public.planejamentos_compra;
  select count(*) into v_qtd_origens from public.planejamento_compra_origens;
  select count(*) into v_qtd_pedidos from public.pedidos_compra;
  select count(*) into v_qtd_pedido_itens from public.pedido_compra_itens;

  if v_qtd_requisicao_itens > 0 or v_qtd_planejamentos > 0 or v_qtd_origens > 0
     or v_qtd_pedidos > 0 or v_qtd_pedido_itens > 0 then
    raise exception 'Incremento 8: precondicao de ausencia de legado falhou - requisicao_compra_itens=%, planejamentos_compra=%, planejamento_compra_origens=%, pedidos_compra=%, pedido_compra_itens=% - decisao explicita de legado e necessaria antes de reaplicar esta migration. Nenhum evento historico foi fabricado, nenhum registro foi classificado.',
      v_qtd_requisicao_itens, v_qtd_planejamentos, v_qtd_origens, v_qtd_pedidos, v_qtd_pedido_itens;
  end if;
end;
$$;

-- =====================================================================
-- 0a. materia_prima_unidade_conversoes - escala do multiplo minimo
-- =====================================================================
-- Precondicao de legado (secao 0) nao cobre esta tabela - confirmado
-- vazia por leitura agregada isolada, somente leitura, contra o banco
-- vinculado (0 linhas, nenhuma fora de escala de 4 casas). Sem legado a
-- reconciliar antes desta constraint.
alter table public.materia_prima_unidade_conversoes
  add constraint mp_unidade_conv_multiplo_escala_chk
  check (multiplo_minimo_compra = round(multiplo_minimo_compra, 4));

comment on constraint mp_unidade_conv_multiplo_escala_chk on public.materia_prima_unidade_conversoes is
  'Incremento 8/9: multiplo_minimo_compra nunca pode ter mais de 4 casas decimais. Um multiplo inteiro de um numero com ate 4 casas nunca produz mais de 4 casas (propriedade aritmetica) - garante que o arredondamento comercial final de decidir_compra_planejamento (CEIL(x*10000)/10000) nunca quebra a propriedade de multiplo exato validada em planejamentos_compra/planejamentos_compra_historico (secoes 3 e 4).';

-- =====================================================================
-- 0b. CREATE OR REPLACE - cadastrar_conversao_compra_material
-- =====================================================================
-- Alteracao minima e auditavel sobre 20260825200000_funcoes_decisao_compra.sql
-- (linhas 576-610), corpo original copiado verbatim - unica mudanca
-- declarada: validacao de ate 4 casas decimais em p_multiplo_minimo_compra
-- ANTES do INSERT (mesma regra agora estrutural na secao 0a), com
-- mensagem de erro clara para o frontend. Assinatura, tipo de retorno,
-- SECURITY INVOKER (sem clausula - mesmo comportamento original), owner
-- (nao alterado - CREATE OR REPLACE preserva o dono existente, nenhum
-- ALTER FUNCTION OWNER TO adicionado), search_path (sem clausula
-- explicita - original nunca teve; nao adicionado agora para nao alterar
-- comportamento), isolamento por empresa (via empresa_atual_id()) e
-- demais validacoes/comportamento preservados sem nenhuma outra
-- alteracao.
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

  -- Incremento 8/9: mesma regra da constraint estrutural (secao 0a) -
  -- validada aqui tambem para devolver um erro claro ao frontend antes
  -- de tentar o INSERT (a constraint sozinha devolveria so a mensagem
  -- generica de violacao de check).
  if p_multiplo_minimo_compra <> round(p_multiplo_minimo_compra, 4) then
    raise exception 'multiplo_minimo_compra (%) nao pode ter mais de 4 casas decimais.', p_multiplo_minimo_compra;
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

-- =====================================================================
-- 0c. ACL - cadastrar_conversao_compra_material
-- =====================================================================
-- Contrato real inalterado: original ja concedia EXECUTE a authenticated
-- sem restricao de papel (RLS ja restringe o INSERT de fato a
-- usuario_e_admin() via mp_unidade_conv_insert_tenant - a funcao sendo
-- SECURITY INVOKER, quem nao for admin tem o INSERT rejeitado pela
-- propria RLS, nao pela funcao). Aqui so o REVOKE fica explicito para
-- anon/service_role tambem, mesmo padrao ja aplicado as demais funcoes
-- desta migration - GRANT nao amplia nada alem do que ja existia.
revoke execute on function public.cadastrar_conversao_compra_material(uuid, uuid, uuid, numeric, numeric, boolean) from public, anon, authenticated, service_role;
grant execute on function public.cadastrar_conversao_compra_material(uuid, uuid, uuid, numeric, numeric, boolean) to authenticated;

-- =====================================================================
-- 1. requisicao_compra_itens - status_aprovacao
-- =====================================================================
alter table public.requisicao_compra_itens
  add column status_aprovacao text not null default 'pendente';

alter table public.requisicao_compra_itens
  add constraint requisicao_compra_itens_status_aprovacao_chk
  check (status_aprovacao in ('pendente', 'aprovada', 'reprovada'));

comment on column public.requisicao_compra_itens.status_aprovacao is
  'Incremento 8/9: pendente (default - tabela confirmada vazia em producao no momento desta migration, sem legado a classificar) / aprovada (terminal, imutavel) / reprovada (terminal, sem RPC de reabertura neste incremento).';

-- =====================================================================
-- 2. requisicoes_compra_historico
-- =====================================================================
create table public.requisicoes_compra_historico (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  requisicao_compra_item_id uuid not null,
  acao text not null,
  quantidade_necessaria numeric,
  motivo text,
  modificado_por_id uuid not null references auth.users(id),
  modificado_por_nome text not null,
  modificado_em timestamptz not null default now(),
  origem text not null
);

alter table public.requisicoes_compra_historico
  -- FK composta tenant-scoped - substitui a FK simples original. Impede
  -- estruturalmente gravar empresa A referenciando item da empresa B.
  -- requisicao_compra_itens_id_empresa_uniq ja existe desde 20260826184418.
  add constraint requisicoes_compra_historico_item_empresa_fkey
    foreign key (requisicao_compra_item_id, empresa_id)
    references public.requisicao_compra_itens (id, empresa_id),
  add constraint requisicoes_compra_historico_acao_chk
    check (acao in ('criada', 'aprovada', 'reprovada')),
  -- 'operacao_administrativa' removido do dominio: nenhum escritor formal
  -- existe neste incremento (decisao explicita - nao reservar porta sem
  -- contrato). Se um procedimento administrativo formal for desenhado
  -- depois, o dominio volta a incluir o valor nessa migration futura.
  add constraint requisicoes_compra_historico_origem_chk
    check (origem = 'rpc'),
  add constraint requisicoes_compra_historico_nome_chk
    check (btrim(modificado_por_nome) <> ''),
  -- quantidade_necessaria so existe (e so pode ser > 0) no nascimento;
  -- aprovada/reprovada nunca tocam quantidade.
  add constraint requisicoes_compra_historico_quantidade_chk check (
    (acao = 'criada' and quantidade_necessaria is not null and quantidade_necessaria > 0)
    or (acao <> 'criada' and quantidade_necessaria is null)
  ),
  -- motivo obrigatorio e nao vazio em reprovada; nulo em qualquer outro
  -- evento (nenhuma RPC preenche motivo fora de reprovar).
  add constraint requisicoes_compra_historico_motivo_chk check (
    (acao = 'reprovada' and motivo is not null and btrim(motivo) <> '')
    or (acao <> 'reprovada' and motivo is null)
  );

create index requisicoes_compra_historico_empresa_cronologia_idx
  on public.requisicoes_compra_historico (empresa_id, modificado_em desc, id desc);

create index requisicoes_compra_historico_item_cronologia_idx
  on public.requisicoes_compra_historico (empresa_id, requisicao_compra_item_id, modificado_em desc, id desc);

comment on table public.requisicoes_compra_historico is
  'Incremento 8/9: historico somente-acrescentavel de criada/aprovada/reprovada de requisicao_compra_itens. requisicao_compra_item_id sempre o item real (sem sucessao de linha nesta migration - toda escrita e sobre a mesma linha, do nascimento ate o estado terminal).';
comment on column public.requisicoes_compra_historico.quantidade_necessaria is
  'Snapshot do deficit externo no nascimento (acao=criada). Sempre nulo para aprovada/reprovada - nada altera quantidade depois da criacao.';
comment on column public.requisicoes_compra_historico.modificado_por_id is
  'auth.uid() capturado no momento do evento - identidade tecnica, mesmo padrao de 100% das colunas _por/_by do projeto.';
comment on column public.requisicoes_compra_historico.modificado_por_nome is
  'Fotografia do nome exibido no momento do evento, resolvida por resolver_nome_ator_tenant - uuid garante identidade, nome preserva a leitura humana historica.';

-- =====================================================================
-- 3. planejamentos_compra - versao_otimista
-- =====================================================================
-- Mesmo padrao literal do Incremento 7 (ordens_fabricacao.versao_otimista,
-- 20260903121418_of_ajustes_controlados.sql:92).
alter table public.planejamentos_compra
  add column versao_otimista bigint not null default 1;

-- Distingue o minimo calculado pelo sistema (rendimento/multiplo/regra)
-- da quantidade comercial final (quantidade_planejada_compra, que agora
-- pode ser o minimo OU uma escolha do comprador acima dele). Sem essa
-- coluna nao ha como reconstruir "o comprador escolheu comprar mais que
-- o necessario" depois do fato.
alter table public.planejamentos_compra
  add column quantidade_minima_calculada numeric;

comment on column public.planejamentos_compra.quantidade_minima_calculada is
  'Incremento 8/9: minimo tecnico calculado (necessidade/rendimento, arredondado para cima no multiplo) na unidade de compra. quantidade_planejada_compra e o valor final efetivamente decidido - igual a este minimo quando o comprador nao escolhe explicitamente, maior quando escolhe.';

-- Garantias fortes tambem na linha CORRENTE, nao so no historico - um
-- SELECT direto em planejamentos_compra precisa ver um estado
-- estruturalmente coerente, sem depender de consultar o historico.
--
-- Duas garantias deste bloco NAO sao criadas aqui, por ja existirem no
-- baseline (schema anterior a este incremento), com nome e expressao
-- literalmente identicos - achado real via auditoria estatica contra
-- dump schema-only fresco do vinculado (nenhuma delas e nova):
--   - "quantidade_planejada_compra IS NULL OR quantidade_planejada_compra > 0"
--     ja e garantida por planejamentos_compra_qtd_chk (existente desde
--     antes do Incremento 8, junto com quantidade_necessaria_total >= 0
--     e sobra_prevista >= 0 na mesma constraint) - reafirma-la aqui sob
--     outro nome (planejamentos_compra_quantidade_planejada_chk)
--     duplicaria a mesma regra sem nenhum ganho.
--   - preco_unitario_estimado >= 0 (quando preenchido) ja e garantida
--     por planejamentos_compra_preco_estimado_chk, que ja existe com
--     esse EXATO nome e essa EXATA expressao desde
--     20260825190000_pipeline_compras_estrutura.sql (PARTE 3) - tentar
--     recria-la aqui falha com "constraint ... already exists" (achado
--     real, confirmado por execucao real do preflight isolado contra
--     dump fresco do vinculado). Nao e tocada por este incremento -
--     permanece exatamente como esta, sem DROP/rename/recriacao.
alter table public.planejamentos_compra
  add constraint planejamentos_compra_quantidade_minima_chk
    check (quantidade_minima_calculada is null or quantidade_minima_calculada > 0),
  -- escolhida (quantidade_planejada_compra) nunca abaixo do minimo,
  -- quando ambas existirem - mesma unidade de compra dos dois lados.
  add constraint planejamentos_compra_escolhida_minima_chk check (
    quantidade_minima_calculada is null or quantidade_planejada_compra is null
    or quantidade_planejada_compra >= quantidade_minima_calculada
  ),
  add constraint planejamentos_compra_rendimento_aplicado_chk
    check (rendimento_aplicado is null or rendimento_aplicado > 0),
  add constraint planejamentos_compra_multiplo_aplicado_chk
    check (multiplo_aplicado is null or multiplo_aplicado > 0),
  add constraint planejamentos_compra_sobra_prevista_chk
    check (sobra_prevista is null or sobra_prevista >= 0),
  -- Cobertura suficiente na linha CORRENTE - mesma formula ja validada
  -- no historico (secao 4): cobertura (comercial x rendimento, unidade
  -- tecnica) nunca abaixo da necessidade. Multiplicacao nunca lanca
  -- excecao (nenhum divisor envolvido) - guarda IS NULL simples basta.
  add constraint planejamentos_compra_cobertura_chk check (
    quantidade_planejada_compra is null or rendimento_aplicado is null
    or quantidade_planejada_compra * rendimento_aplicado >= quantidade_necessaria_total
  ),
  -- Sobra coerente com cobertura menos necessidade, mesma formula da
  -- RPC (GREATEST(ROUND(cobertura - necessidade, 4), 0)).
  add constraint planejamentos_compra_sobra_coerente_chk check (
    sobra_prevista is null or quantidade_planejada_compra is null or rendimento_aplicado is null
    or sobra_prevista = greatest(round(quantidade_planejada_compra * rendimento_aplicado - quantidade_necessaria_total, 4), 0)
  ),
  -- Compatibilidade com multiplo_aplicado, na linha CORRENTE, para
  -- quantidade_minima_calculada e quantidade_planejada_compra (a
  -- escolhida/final). CASE, nao "OR" solto: em Postgres AND/OR nao
  -- garantem avaliacao com curto-circuito (a ordem dos operandos nao e
  -- uma garantia de linguagem) - CASE WHEN e a unica forma de garantir,
  -- por especificacao, que MOD() so e avaliado depois de multiplo_aplicado
  -- confirmado nao-nulo e nao-zero DENTRO da MESMA expressao, sem
  -- depender de nenhuma outra constraint ter rodado antes.
  -- automatico_sem_regra (multiplo=1 por definicao) fica isento por
  -- regra de negocio, nao so porque multiplo=1 tornaria o MOD trivial.
  add constraint planejamentos_compra_multiplo_minima_chk check (
    case
      when regra_arredondamento is null then true
      when regra_arredondamento = 'automatico_sem_regra' then true
      when multiplo_aplicado is null or multiplo_aplicado = 0 then true
      when quantidade_minima_calculada is null then true
      else mod(quantidade_minima_calculada, multiplo_aplicado) = 0
    end
  ),
  add constraint planejamentos_compra_multiplo_planejada_chk check (
    case
      when regra_arredondamento is null then true
      when regra_arredondamento = 'automatico_sem_regra' then true
      when multiplo_aplicado is null or multiplo_aplicado = 0 then true
      when quantidade_planejada_compra is null then true
      else mod(quantidade_planejada_compra, multiplo_aplicado) = 0
    end
  ),
  -- Coerencia estado x decisao comercial: pronto_pedido/convertido_pedido
  -- exigem decisao comercial completa (preco continua opcional, sempre
  -- foi); em_planejamento nunca pode ter decisao parcial nem completa -
  -- ainda nao foi decidido; cancelado pode vir de qualquer um dos dois
  -- estados anteriores, mas nunca com combinacao parcial (alguns campos
  -- preenchidos, outros nao) - mesma logica ja aplicada ao historico
  -- (secao 4), agora tambem na linha corrente.
  add constraint planejamentos_compra_estado_decisao_chk check (
    (
      status in ('pronto_pedido', 'convertido_pedido')
      and quantidade_minima_calculada is not null and quantidade_planejada_compra is not null
      and unidade_compra_id is not null and rendimento_aplicado is not null
      and multiplo_aplicado is not null and regra_arredondamento is not null
      and sobra_prevista is not null
    )
    or (
      status = 'em_planejamento'
      and quantidade_minima_calculada is null and quantidade_planejada_compra is null
      and unidade_compra_id is null and rendimento_aplicado is null
      and multiplo_aplicado is null and regra_arredondamento is null
      and sobra_prevista is null
    )
    or (
      status = 'cancelado'
      and (
        (
          quantidade_minima_calculada is null and quantidade_planejada_compra is null
          and unidade_compra_id is null and rendimento_aplicado is null
          and multiplo_aplicado is null and regra_arredondamento is null
          and sobra_prevista is null
        )
        or (
          quantidade_minima_calculada is not null and quantidade_planejada_compra is not null
          and unidade_compra_id is not null and rendimento_aplicado is not null
          and multiplo_aplicado is not null and regra_arredondamento is not null
          and sobra_prevista is not null
        )
      )
    )
  );

comment on constraint planejamentos_compra_estado_decisao_chk on public.planejamentos_compra is
  'Incremento 8/9: precondicao de legado (secao 0) garante tabela vazia - nenhum legado a reconciliar antes desta constraint. em_planejamento nunca tem decisao comercial; pronto_pedido/convertido_pedido sempre tem decisao completa (exceto preco, sempre opcional); cancelado reflete o que existia no momento do cancelamento (tudo nulo ou tudo preenchido, nunca parcial).';

-- Necessaria para a FK composta tenant-scoped de planejamentos_compra_historico
-- (secao 4) - planejamentos_compra nao tinha UNIQUE(id, empresa_id) ate agora.
-- Precondicao de legado (secao 0) ja garante tabela vazia - sem legado a
-- reconciliar antes de adicionar.
alter table public.planejamentos_compra
  add constraint planejamentos_compra_id_empresa_uniq unique (id, empresa_id);

comment on column public.planejamentos_compra.versao_otimista is
  'Incremento 8/9: token de concorrencia otimista, incrementado incondicionalmente (OLD+1) por trigger dedicado em toda UPDATE, independente do valor enviado pelo cliente. Mesmo padrao de ordens_fabricacao.versao_otimista (Incremento 7).';

-- =====================================================================
-- 4. planejamentos_compra_historico
-- =====================================================================
-- Nomenclatura: sufixo _nova/_novo concorda em genero com o substantivo
-- (quantidade, unidade, regra, sobra = femininos -> _nova; rendimento,
-- multiplo, status, preco = masculinos -> _novo).
create table public.planejamentos_compra_historico (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  planejamento_compra_id uuid not null,
  acao text not null,
  status_anterior text not null,
  status_novo text not null,
  versao_otimista_anterior bigint not null,
  versao_otimista_nova bigint not null,
  quantidade_necessaria_total numeric not null,
  quantidade_minima_calculada_anterior numeric,
  quantidade_minima_calculada_nova numeric,
  quantidade_comercial_anterior numeric,
  quantidade_comercial_nova numeric,
  unidade_compra_anterior_id uuid,
  unidade_compra_nova_id uuid,
  rendimento_anterior numeric,
  rendimento_novo numeric,
  multiplo_anterior numeric,
  multiplo_novo numeric,
  regra_arredondamento_anterior text,
  regra_arredondamento_nova text,
  sobra_anterior numeric,
  sobra_nova numeric,
  preco_unitario_estimado_anterior numeric,
  preco_unitario_estimado_novo numeric,
  motivo text,
  modificado_por_id uuid not null references auth.users(id),
  modificado_por_nome text not null,
  modificado_em timestamptz not null default now()
);

alter table public.planejamentos_compra_historico
  -- FK composta tenant-scoped - substitui a FK simples original.
  add constraint planejamentos_compra_historico_planejamento_empresa_fkey
    foreign key (planejamento_compra_id, empresa_id)
    references public.planejamentos_compra (id, empresa_id),
  add constraint planejamentos_compra_historico_acao_chk
    check (acao in ('decidida', 'revisada', 'cancelada')),
  add constraint planejamentos_compra_historico_nome_chk
    check (btrim(modificado_por_nome) <> ''),
  -- Token de versao: toda escrita desta tabela corresponde a exatamente
  -- 1 incremento real de versao_otimista (trigger incondicional OLD+1).
  add constraint planejamentos_compra_historico_versao_chk check (
    versao_otimista_anterior >= 1
    and versao_otimista_nova = versao_otimista_anterior + 1
  ),
  -- Dominios validos. quantidade_necessaria_total (unidade tecnica) e
  -- quantidade_minima_calculada/quantidade_comercial (unidade de
  -- compra) NUNCA sao comparadas diretamente entre si - a unica ponte
  -- valida entre as duas unidades e multiplicar pelo rendimento
  -- ("cobertura"), nunca comparacao direta de grandeza.
  add constraint planejamentos_compra_historico_dominios_chk check (
    quantidade_necessaria_total > 0
    and (quantidade_minima_calculada_anterior is null or quantidade_minima_calculada_anterior > 0)
    and (quantidade_minima_calculada_nova is null or quantidade_minima_calculada_nova > 0)
    and (quantidade_comercial_anterior is null or quantidade_comercial_anterior > 0)
    and (quantidade_comercial_nova is null or quantidade_comercial_nova > 0)
    and (rendimento_anterior is null or rendimento_anterior > 0)
    and (rendimento_novo is null or rendimento_novo > 0)
    and (multiplo_anterior is null or multiplo_anterior > 0)
    and (multiplo_novo is null or multiplo_novo > 0)
    and (sobra_anterior is null or sobra_anterior >= 0)
    and (sobra_nova is null or sobra_nova >= 0)
    and (preco_unitario_estimado_anterior is null or preco_unitario_estimado_anterior >= 0)
    and (preco_unitario_estimado_novo is null or preco_unitario_estimado_novo >= 0)
    -- quantidade escolhida nunca abaixo do minimo calculado - mesma
    -- unidade de compra dos dois lados, comparacao valida.
    and (
      quantidade_comercial_anterior is null or quantidade_minima_calculada_anterior is null
      or quantidade_comercial_anterior >= quantidade_minima_calculada_anterior
    )
    and (
      quantidade_comercial_nova is null or quantidade_minima_calculada_nova is null
      or quantidade_comercial_nova >= quantidade_minima_calculada_nova
    )
    -- cobertura (unidade tecnica = comercial x rendimento) nunca abaixo
    -- da necessidade - unica comparacao valida entre as 2 unidades.
    and (
      quantidade_comercial_anterior is null or rendimento_anterior is null
      or quantidade_comercial_anterior * rendimento_anterior >= quantidade_necessaria_total
    )
    and (
      quantidade_comercial_nova is null or rendimento_novo is null
      or quantidade_comercial_nova * rendimento_novo >= quantidade_necessaria_total
    )
    -- sobra coerente com cobertura menos necessidade (mesma formula da
    -- RPC: GREATEST(ROUND(cobertura - necessidade, 4), 0)).
    and (
      sobra_anterior is null or quantidade_comercial_anterior is null or rendimento_anterior is null
      or sobra_anterior = greatest(round(quantidade_comercial_anterior * rendimento_anterior - quantidade_necessaria_total, 4), 0)
    )
    and (
      sobra_nova is null or quantidade_comercial_nova is null or rendimento_novo is null
      or sobra_nova = greatest(round(quantidade_comercial_nova * rendimento_novo - quantidade_necessaria_total, 4), 0)
    )
  ),
  -- Compatibilidade com multiplo_anterior/multiplo_novo, pares
  -- minima/comercial x anterior/nova (4 constraints). Mesmo raciocinio
  -- de seguranca da secao 3 (planejamentos_compra_multiplo_*_chk):
  -- CASE WHEN, nunca "OR" solto, para garantir por especificacao que
  -- MOD() so roda depois do multiplo confirmado nao-nulo e nao-zero
  -- DENTRO da mesma expressao - Postgres nao garante curto-circuito em
  -- AND/OR soltos, e a garantia nao pode depender de outra constraint
  -- (dominios_chk, decidida_chk etc.) ter sido avaliada antes.
  -- automatico_sem_regra isento por regra de negocio (multiplo=1).
  add constraint planejamentos_compra_historico_multiplo_minima_anterior_chk check (
    case
      when regra_arredondamento_anterior is null then true
      when regra_arredondamento_anterior = 'automatico_sem_regra' then true
      when multiplo_anterior is null or multiplo_anterior = 0 then true
      when quantidade_minima_calculada_anterior is null then true
      else mod(quantidade_minima_calculada_anterior, multiplo_anterior) = 0
    end
  ),
  add constraint planejamentos_compra_historico_multiplo_minima_nova_chk check (
    case
      when regra_arredondamento_nova is null then true
      when regra_arredondamento_nova = 'automatico_sem_regra' then true
      when multiplo_novo is null or multiplo_novo = 0 then true
      when quantidade_minima_calculada_nova is null then true
      else mod(quantidade_minima_calculada_nova, multiplo_novo) = 0
    end
  ),
  add constraint planejamentos_compra_historico_multiplo_comercial_anterior_chk check (
    case
      when regra_arredondamento_anterior is null then true
      when regra_arredondamento_anterior = 'automatico_sem_regra' then true
      when multiplo_anterior is null or multiplo_anterior = 0 then true
      when quantidade_comercial_anterior is null then true
      else mod(quantidade_comercial_anterior, multiplo_anterior) = 0
    end
  ),
  add constraint planejamentos_compra_historico_multiplo_comercial_nova_chk check (
    case
      when regra_arredondamento_nova is null then true
      when regra_arredondamento_nova = 'automatico_sem_regra' then true
      when multiplo_novo is null or multiplo_novo = 0 then true
      when quantidade_comercial_nova is null then true
      else mod(quantidade_comercial_nova, multiplo_novo) = 0
    end
  ),
  -- decidida: nasce de em_planejamento, TODOS os campos comerciais
  -- anteriores (incluindo minimo calculado e preco) sao nulos por
  -- construcao - nenhuma decisao anterior existiu. Campos novos (exceto
  -- preco, sempre opcional) ficam preenchidos pela decisao que acabou
  -- de acontecer.
  add constraint planejamentos_compra_historico_decidida_chk check (
    acao <> 'decidida' or (
      status_anterior = 'em_planejamento' and status_novo = 'pronto_pedido'
      and quantidade_minima_calculada_anterior is null
      and quantidade_comercial_anterior is null and unidade_compra_anterior_id is null
      and rendimento_anterior is null and multiplo_anterior is null
      and regra_arredondamento_anterior is null and sobra_anterior is null
      and preco_unitario_estimado_anterior is null
      and quantidade_minima_calculada_nova is not null
      and quantidade_comercial_nova is not null and unidade_compra_nova_id is not null
      and rendimento_novo is not null and multiplo_novo is not null
      and regra_arredondamento_nova is not null and sobra_nova is not null
    )
  ),
  -- revisada: so acontece depois de ja existir uma decisao - todos os
  -- campos comerciais (exceto preco, que pode nunca ter sido informado)
  -- tem que ter anterior E novo.
  add constraint planejamentos_compra_historico_revisada_chk check (
    acao <> 'revisada' or (
      status_anterior = 'pronto_pedido' and status_novo = 'pronto_pedido'
      and quantidade_minima_calculada_anterior is not null
      and quantidade_comercial_anterior is not null and unidade_compra_anterior_id is not null
      and rendimento_anterior is not null and multiplo_anterior is not null
      and regra_arredondamento_anterior is not null and sobra_anterior is not null
      and quantidade_minima_calculada_nova is not null
      and quantidade_comercial_nova is not null and unidade_compra_nova_id is not null
      and rendimento_novo is not null and multiplo_novo is not null
      and regra_arredondamento_nova is not null and sobra_nova is not null
    )
  ),
  -- cancelada: 2 casos distintos por status_anterior. Vindo de
  -- em_planejamento (nunca houve decisao) - mesmo padrao "tudo nulo" de
  -- decidida. Vindo de pronto_pedido (ja decidido) - snapshot completo,
  -- e cancelar NUNCA muda valor comercial nenhum, entao anterior e novo
  -- tem que ser identicos campo a campo (IS NOT DISTINCT FROM, NULL-safe).
  add constraint planejamentos_compra_historico_cancelada_chk check (
    acao <> 'cancelada' or (
      status_novo = 'cancelado'
      and (
        (
          status_anterior = 'em_planejamento'
          and quantidade_minima_calculada_anterior is null
          and quantidade_comercial_anterior is null and unidade_compra_anterior_id is null
          and rendimento_anterior is null and multiplo_anterior is null
          and regra_arredondamento_anterior is null and sobra_anterior is null
          and preco_unitario_estimado_anterior is null
          and quantidade_minima_calculada_nova is null
          and quantidade_comercial_nova is null and unidade_compra_nova_id is null
          and rendimento_novo is null and multiplo_novo is null
          and regra_arredondamento_nova is null and sobra_nova is null
          and preco_unitario_estimado_novo is null
        )
        or (
          status_anterior = 'pronto_pedido'
          and quantidade_minima_calculada_anterior is not null
          and quantidade_comercial_anterior is not null and unidade_compra_anterior_id is not null
          and rendimento_anterior is not null and multiplo_anterior is not null
          and regra_arredondamento_anterior is not null and sobra_anterior is not null
          and quantidade_minima_calculada_anterior is not distinct from quantidade_minima_calculada_nova
          and quantidade_comercial_anterior is not distinct from quantidade_comercial_nova
          and unidade_compra_anterior_id is not distinct from unidade_compra_nova_id
          and rendimento_anterior is not distinct from rendimento_novo
          and multiplo_anterior is not distinct from multiplo_novo
          and regra_arredondamento_anterior is not distinct from regra_arredondamento_nova
          and sobra_anterior is not distinct from sobra_nova
          and preco_unitario_estimado_anterior is not distinct from preco_unitario_estimado_novo
        )
      )
    )
  ),
  -- Motivo obrigatorio por acao: 'cancelada' sempre; 'revisada' sempre
  -- (toda alteracao real feita por Compras sobre decisao ja existente
  -- fica justificada); 'decidida' so quando a quantidade escolhida
  -- supera o minimo calculado - comparacao SEMPRE na mesma unidade de
  -- compra (nunca contra quantidade_necessaria_total, que esta em
  -- unidade tecnica - essa era a comparacao dimensional incorreta da
  -- versao anterior). Como o segundo ramo so se aplica quando
  -- acao='decidida', 'revisada' e 'cancelada' caem sempre no primeiro
  -- ramo (motivo obrigatorio).
  add constraint planejamentos_compra_historico_motivo_chk check (
    (motivo is not null and btrim(motivo) <> '')
    or (
      acao = 'decidida'
      and (
        quantidade_comercial_nova is null
        or quantidade_minima_calculada_nova is null
        or quantidade_comercial_nova = quantidade_minima_calculada_nova
      )
    )
  );

create index planejamentos_compra_historico_empresa_cronologia_idx
  on public.planejamentos_compra_historico (empresa_id, modificado_em desc, id desc);

create index planejamentos_compra_historico_planejamento_cronologia_idx
  on public.planejamentos_compra_historico (empresa_id, planejamento_compra_id, modificado_em desc, id desc);

comment on table public.planejamentos_compra_historico is
  'Incremento 8/9: historico somente-acrescentavel de decisao/revisao/cancelamento comercial de planejamentos_compra. quantidade_necessaria_total e snapshot unico (coluna comprovadamente imutavel apos o INSERT original - nenhuma funcao a atualiza) - todos os demais campos comerciais tem par anterior/novo.';

-- =====================================================================
-- 4a. Helper de identidade - resolver_nome_ator_tenant
-- =====================================================================
-- Movido para antes de qualquer trigger/RPC que o invoque (ordem causal
-- auditavel) - PL/pgSQL adiaria a resolucao ate a primeira execucao de
-- qualquer forma, mas a migration fica mais facil de auditar assim.
-- Interno, nunca chamado diretamente por nenhum papel de cliente - so
-- pelas RPCs/triggers SECURITY DEFINER desta migration, que ja
-- resolveram sua propria empresa_atual_id() e passam explicitamente.
-- Nunca aceita um UUID de ator arbitrario - sempre le auth.uid()
-- internamente.
create or replace function public.resolver_nome_ator_tenant(p_empresa_id uuid)
returns text
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_uid uuid;
  v_nome_profiles text;
  v_nome_usuarios text;
  v_nome text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'resolver_nome_ator_tenant: operacao requer sessao autenticada.';
  end if;

  select nome into v_nome_profiles
    from public.profiles
   where id = v_uid and empresa_id = p_empresa_id and ativo = true;

  select nome into v_nome_usuarios
    from public.usuarios
   where id = v_uid and empresa_id = p_empresa_id;

  if v_nome_profiles is not null and v_nome_usuarios is not null then
    if v_nome_profiles is distinct from v_nome_usuarios then
      raise exception 'resolver_nome_ator_tenant: nome divergente entre profiles e usuarios para o mesmo usuario/empresa - inconsistencia de dado, resolucao manual necessaria.';
    end if;
    v_nome := v_nome_profiles;
  elsif v_nome_profiles is not null then
    v_nome := v_nome_profiles;
  elsif v_nome_usuarios is not null then
    v_nome := v_nome_usuarios;
  else
    raise exception 'resolver_nome_ator_tenant: nenhum registro de identidade encontrado para o usuario na empresa informada.';
  end if;

  if btrim(v_nome) = '' then
    raise exception 'resolver_nome_ator_tenant: nome resolvido esta vazio.';
  end if;

  return v_nome;
end;
$function$;

comment on function public.resolver_nome_ator_tenant(uuid) is
  'Incremento 8/9: resolve o nome do usuario autenticado (auth.uid() interno, nunca parametro) dentro do tenant informado. profiles e fonte canonica primaria; usuarios so confirma/preenche quando profiles nao tem linha. Aborta (nunca retorna desconhecido) se: sem sessao, nenhuma fonte encontrada, nome vazio, ou as duas fontes existirem com nomes divergentes.';

revoke execute on function public.resolver_nome_ator_tenant(uuid)
  from public, anon, authenticated, service_role;

-- =====================================================================
-- 5. Triggers - requisicao_compra_itens
-- =====================================================================

-- 5a. Imutabilidade de conteudo apos decisao terminal + bloqueio de
-- alteracao direta fora das RPCs SECURITY DEFINER desta migration.
create or replace function public.bloquear_alteracao_direta_requisicao_compra_item()
returns trigger
language plpgsql
as $function$
begin
  if old.status_aprovacao in ('aprovada', 'reprovada') then
    raise exception 'requisicao_compra_itens: linha % com status_aprovacao=% e terminal e imutavel - nenhuma alteracao e permitida, mesmo por RPC ou service_role.', old.id, old.status_aprovacao;
  end if;

  if current_user <> 'postgres' then
    raise exception 'requisicao_compra_itens: alteracao direta nao e permitida - use aprovar_requisicao_compra_material/reprovar_requisicao_compra_material.';
  end if;

  return new;
end;
$function$;

comment on function public.bloquear_alteracao_direta_requisicao_compra_item() is
  'Incremento 8/9: defesa estrutural, nao prova isolada. current_user=postgres prova so "veio de alguma function SECURITY DEFINER dona postgres" - a garantia completa vem da combinacao com ACL de tabela fechada (Incremento 6) + validacao interna (auth.uid/empresa/papel/estado) de cada RPC.';

revoke execute on function public.bloquear_alteracao_direta_requisicao_compra_item()
  from public, anon, authenticated, service_role;

create trigger requisicao_compra_itens_bloquear_alteracao_direta
  before update on public.requisicao_compra_itens
  for each row
  execute function public.bloquear_alteracao_direta_requisicao_compra_item();

-- 5b. Bloqueio fisico de DELETE, incondicional, qualquer estado -
-- estrutural, nao depende so de RLS (que ja bloqueia authenticated via
-- requisicao_compra_itens_delete_blocked, mas nunca alcanca service_role
-- ou dono).
create or replace function public.bloquear_delete_fisico_requisicao_compra_item()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'requisicao_compra_itens: exclusao fisica nao e permitida em nenhum estado, mesmo por service_role ou proprietario - use soft-delete/reprovacao conforme aplicavel.';
  return null;
end;
$function$;

revoke execute on function public.bloquear_delete_fisico_requisicao_compra_item()
  from public, anon, authenticated, service_role;

create trigger requisicao_compra_itens_bloquear_delete_fisico
  before delete on public.requisicao_compra_itens
  for each row
  execute function public.bloquear_delete_fisico_requisicao_compra_item();

-- 5c. Evento 'criada' - trigger generico, cobre qualquer escritor
-- presente ou futuro sem exigir que cada um grave auditoria por conta
-- propria. Investigacao confirmou: unico escritor vivo hoje e
-- decidir_ci_ce_de_of (INSERT, via aprovar_of), que ja exige
-- auth.uid() nao nulo internamente - nao ha caminho de nascimento
-- legitimo sem sessao real hoje. Operacoes administrativas/backfills
-- futuros terao procedimento formal proprio - nao sao disfarcados como
-- criacao de usuario aqui (por isso NAO ha fallback para NEW.created_by
-- quando auth.uid() e nulo).
create or replace function public.registrar_criacao_requisicao_compra_item()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_uid uuid;
  v_nome text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'registrar_criacao_requisicao_compra_item: nascimento de requisicao_compra_itens sem sessao autenticada nao e permitido - operacoes administrativas exigem procedimento formal proprio.';
  end if;

  if new.created_by is distinct from v_uid then
    raise exception 'registrar_criacao_requisicao_compra_item: created_by (%) diverge de auth.uid() (%) - identidade inconsistente no nascimento do item %.', new.created_by, v_uid, new.id;
  end if;

  v_nome := public.resolver_nome_ator_tenant(new.empresa_id);

  insert into public.requisicoes_compra_historico (
    empresa_id, requisicao_compra_item_id, acao, quantidade_necessaria,
    modificado_por_id, modificado_por_nome, origem
  ) values (
    new.empresa_id, new.id, 'criada', new.quantidade_necessaria,
    v_uid, v_nome, 'rpc'
  );

  return new;
end;
$function$;

comment on function public.registrar_criacao_requisicao_compra_item() is
  'Incremento 8/9: grava evento criada para todo INSERT em requisicao_compra_itens - generico, cobre qualquer escritor presente ou futuro. Exige auth.uid() nao nulo e created_by=auth.uid() - nenhum fallback silencioso, nenhuma identidade generica.';

revoke execute on function public.registrar_criacao_requisicao_compra_item()
  from public, anon, authenticated, service_role;

create trigger requisicao_compra_itens_registrar_criacao
  after insert on public.requisicao_compra_itens
  for each row
  execute function public.registrar_criacao_requisicao_compra_item();

-- =====================================================================
-- 6. Triggers - planejamentos_compra
-- =====================================================================

-- 6a. Imutabilidade de conteudo apos estado terminal (convertido_pedido/
-- cancelado) + bloqueio de alteracao direta fora das RPCs.
create or replace function public.bloquear_alteracao_direta_planejamento_compra()
returns trigger
language plpgsql
as $function$
begin
  if old.status in ('convertido_pedido', 'cancelado') then
    raise exception 'planejamentos_compra: linha % com status=% e terminal e imutavel - nenhuma alteracao e permitida, mesmo por RPC ou service_role.', old.id, old.status;
  end if;

  if current_user <> 'postgres' then
    raise exception 'planejamentos_compra: alteracao direta nao e permitida - use decidir_compra_planejamento/cancelar_planejamento_compra/gerar_pedido_compra_rascunho.';
  end if;

  return new;
end;
$function$;

revoke execute on function public.bloquear_alteracao_direta_planejamento_compra()
  from public, anon, authenticated, service_role;

create trigger planejamentos_compra_bloquear_alteracao_direta
  before update on public.planejamentos_compra
  for each row
  execute function public.bloquear_alteracao_direta_planejamento_compra();

-- 6b. Bloqueio fisico de DELETE, incondicional, qualquer estado.
create or replace function public.bloquear_delete_fisico_planejamento_compra()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'planejamentos_compra: exclusao fisica nao e permitida em nenhum estado, mesmo por service_role ou proprietario - use cancelar_planejamento_compra.';
  return null;
end;
$function$;

revoke execute on function public.bloquear_delete_fisico_planejamento_compra()
  from public, anon, authenticated, service_role;

create trigger planejamentos_compra_bloquear_delete_fisico
  before delete on public.planejamentos_compra
  for each row
  execute function public.bloquear_delete_fisico_planejamento_compra();

-- 6c. versao_otimista - incremento incondicional, mesmo padrao literal
-- do Incremento 7.
create or replace function public.set_planejamentos_compra_versao_otimista()
returns trigger
language plpgsql
as $function$
begin
  new.versao_otimista := old.versao_otimista + 1;
  return new;
end;
$function$;

revoke execute on function public.set_planejamentos_compra_versao_otimista()
  from public, anon, authenticated, service_role;

create trigger set_planejamentos_compra_versao_otimista
  before update on public.planejamentos_compra
  for each row
  execute function public.set_planejamentos_compra_versao_otimista();

-- =====================================================================
-- 7. Triggers - protecao dos 2 historicos (append-only, incondicional,
--    mesmo padrao estrutural de ordens_fabricacao_historico_estados)
-- =====================================================================
create or replace function public.bloquear_alteracao_historico_requisicao_compra()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'requisicoes_compra_historico: historico e somente-acrescentavel - UPDATE/DELETE nao sao permitidos, mesmo por service_role ou proprietario.';
  return null;
end;
$function$;

revoke execute on function public.bloquear_alteracao_historico_requisicao_compra()
  from public, anon, authenticated, service_role;

create trigger requisicoes_compra_historico_bloquear_update
  before update on public.requisicoes_compra_historico
  for each row
  execute function public.bloquear_alteracao_historico_requisicao_compra();

create trigger requisicoes_compra_historico_bloquear_delete
  before delete on public.requisicoes_compra_historico
  for each row
  execute function public.bloquear_alteracao_historico_requisicao_compra();

create or replace function public.bloquear_truncate_historico_requisicao_compra()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'requisicoes_compra_historico: TRUNCATE nao e permitido - historico e somente-acrescentavel, mesmo por service_role ou proprietario.';
  return null;
end;
$function$;

revoke execute on function public.bloquear_truncate_historico_requisicao_compra()
  from public, anon, authenticated, service_role;

create trigger requisicoes_compra_historico_bloquear_truncate
  before truncate on public.requisicoes_compra_historico
  for each statement
  execute function public.bloquear_truncate_historico_requisicao_compra();

create or replace function public.bloquear_alteracao_historico_planejamento_compra()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'planejamentos_compra_historico: historico e somente-acrescentavel - UPDATE/DELETE nao sao permitidos, mesmo por service_role ou proprietario.';
  return null;
end;
$function$;

revoke execute on function public.bloquear_alteracao_historico_planejamento_compra()
  from public, anon, authenticated, service_role;

create trigger planejamentos_compra_historico_bloquear_update
  before update on public.planejamentos_compra_historico
  for each row
  execute function public.bloquear_alteracao_historico_planejamento_compra();

create trigger planejamentos_compra_historico_bloquear_delete
  before delete on public.planejamentos_compra_historico
  for each row
  execute function public.bloquear_alteracao_historico_planejamento_compra();

create or replace function public.bloquear_truncate_historico_planejamento_compra()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'planejamentos_compra_historico: TRUNCATE nao e permitido - historico e somente-acrescentavel, mesmo por service_role ou proprietario.';
  return null;
end;
$function$;

revoke execute on function public.bloquear_truncate_historico_planejamento_compra()
  from public, anon, authenticated, service_role;

create trigger planejamentos_compra_historico_bloquear_truncate
  before truncate on public.planejamentos_compra_historico
  for each statement
  execute function public.bloquear_truncate_historico_planejamento_compra();

-- =====================================================================
-- 9. RPC - aprovar_requisicao_compra_material
-- =====================================================================
create or replace function public.aprovar_requisicao_compra_material(
  p_requisicao_compra_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_empresa_id uuid;
  v_item public.requisicao_compra_itens%rowtype;
  v_nome text;
  v_linhas_afetadas int;
begin
  if auth.uid() is null then
    raise exception 'aprovar_requisicao_compra_material: operacao requer sessao autenticada.';
  end if;

  v_empresa_id := public.empresa_atual_id();
  if v_empresa_id is null then
    raise exception 'aprovar_requisicao_compra_material: usuario sem empresa associada.';
  end if;

  if not (public.usuario_tem_papel_funcional('aprovador_compras') or public.usuario_e_admin()) then
    raise exception 'aprovar_requisicao_compra_material: exige papel funcional aprovador_compras ou administrador.';
  end if;

  select * into v_item
    from public.requisicao_compra_itens
   where id = p_requisicao_compra_item_id
     and empresa_id = v_empresa_id
     and ativo = true
   for update;

  if not found then
    raise exception 'aprovar_requisicao_compra_material: item % nao encontrado, inativo, ou de outra empresa.', p_requisicao_compra_item_id;
  end if;

  if v_item.status_aprovacao <> 'pendente' then
    raise exception 'aprovar_requisicao_compra_material: item % tem status_aprovacao=% - so itens pendentes podem ser aprovados.', p_requisicao_compra_item_id, v_item.status_aprovacao;
  end if;

  -- WHERE defensivo (id + empresa + estado esperado) - nao depende so
  -- do lock adquirido no SELECT anterior.
  update public.requisicao_compra_itens
     set status_aprovacao = 'aprovada'
   where id = p_requisicao_compra_item_id
     and empresa_id = v_empresa_id
     and status_aprovacao = 'pendente';

  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 1 then
    raise exception 'aprovar_requisicao_compra_material: UPDATE afetou % linha(s), esperado exatamente 1 - abortando.', v_linhas_afetadas;
  end if;

  v_nome := public.resolver_nome_ator_tenant(v_empresa_id);

  insert into public.requisicoes_compra_historico (
    empresa_id, requisicao_compra_item_id, acao, modificado_por_id, modificado_por_nome, origem
  ) values (
    v_item.empresa_id, p_requisicao_compra_item_id, 'aprovada', auth.uid(), v_nome, 'rpc'
  );

  return p_requisicao_compra_item_id;
end;
$function$;

comment on function public.aprovar_requisicao_compra_material(uuid) is
  'Incremento 8/9: pendente -> aprovada. Terminal e absolutamente imutavel depois (trigger de imutabilidade). Exige papel aprovador_compras ou administrador.';

-- =====================================================================
-- 10. RPC - reprovar_requisicao_compra_material
-- =====================================================================
create or replace function public.reprovar_requisicao_compra_material(
  p_requisicao_compra_item_id uuid,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_empresa_id uuid;
  v_item public.requisicao_compra_itens%rowtype;
  v_nome text;
  v_linhas_afetadas int;
begin
  if auth.uid() is null then
    raise exception 'reprovar_requisicao_compra_material: operacao requer sessao autenticada.';
  end if;

  v_empresa_id := public.empresa_atual_id();
  if v_empresa_id is null then
    raise exception 'reprovar_requisicao_compra_material: usuario sem empresa associada.';
  end if;

  if not (public.usuario_tem_papel_funcional('aprovador_compras') or public.usuario_e_admin()) then
    raise exception 'reprovar_requisicao_compra_material: exige papel funcional aprovador_compras ou administrador.';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'reprovar_requisicao_compra_material: motivo e obrigatorio.';
  end if;

  select * into v_item
    from public.requisicao_compra_itens
   where id = p_requisicao_compra_item_id
     and empresa_id = v_empresa_id
     and ativo = true
   for update;

  if not found then
    raise exception 'reprovar_requisicao_compra_material: item % nao encontrado, inativo, ou de outra empresa.', p_requisicao_compra_item_id;
  end if;

  if v_item.status_aprovacao <> 'pendente' then
    raise exception 'reprovar_requisicao_compra_material: item % tem status_aprovacao=% - so itens pendentes podem ser reprovados.', p_requisicao_compra_item_id, v_item.status_aprovacao;
  end if;

  -- WHERE defensivo (id + empresa + estado esperado) - nao depende so
  -- do lock adquirido no SELECT anterior.
  update public.requisicao_compra_itens
     set status_aprovacao = 'reprovada'
   where id = p_requisicao_compra_item_id
     and empresa_id = v_empresa_id
     and status_aprovacao = 'pendente';

  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 1 then
    raise exception 'reprovar_requisicao_compra_material: UPDATE afetou % linha(s), esperado exatamente 1 - abortando.', v_linhas_afetadas;
  end if;

  v_nome := public.resolver_nome_ator_tenant(v_empresa_id);

  insert into public.requisicoes_compra_historico (
    empresa_id, requisicao_compra_item_id, acao, motivo, modificado_por_id, modificado_por_nome, origem
  ) values (
    v_item.empresa_id, p_requisicao_compra_item_id, 'reprovada', p_motivo, auth.uid(), v_nome, 'rpc'
  );

  return p_requisicao_compra_item_id;
end;
$function$;

comment on function public.reprovar_requisicao_compra_material(uuid, text) is
  'Incremento 8/9: pendente -> reprovada. Terminal, sem RPC de reabertura neste incremento. Exige papel aprovador_compras ou administrador e motivo nao vazio.';

-- =====================================================================
-- 11. Substituicao segura de decidir_compra_planejamento
--     (assinatura muda - CREATE OR REPLACE NAO substitui, cria overload)
-- =====================================================================

-- 11a. Fecha a assinatura antiga primeiro - authenticated deixa de
-- conseguir chamar mesmo antes do DROP.
revoke all on function public.decidir_compra_planejamento(uuid, uuid, numeric)
  from public, anon, authenticated, service_role;

-- 11b. Remove a assinatura antiga. Sem CASCADE - se algo depender dela,
-- a migration falha alto e claro aqui, nunca silenciosamente. Nenhuma
-- dependencia foi encontrada na investigacao estatica (nenhuma outra
-- function/view chama esta assinatura).
drop function public.decidir_compra_planejamento(uuid, uuid, numeric);

-- 11c. Nova assinatura - versao_otimista obrigatoria (sem default, por
-- isso posicionada antes dos parametros opcionais), papel restrito,
-- motivo condicional, no-op explicito, historico completo, e um novo
-- parametro opcional (p_quantidade_comercial_escolhida) que separa o
-- minimo tecnico calculado da quantidade que o comprador efetivamente
-- decide comprar (pode ser maior, por lote/embalagem/preco/frete/
-- negociacao - nunca menor).
--
-- Formula de calculo do minimo (rendimento/multiplo/regra/CEIL/sobra)
-- preservada byte a byte do original (20260825200000_funcoes_decisao_
-- compra.sql:392-465, ate a linha do CEIL final) - dali em diante o
-- corpo e novo: validacao da quantidade escolhida (se informada),
-- guarda de papel, guarda de estado ampliada (aceita pronto_pedido para
-- revisao), conflito otimista, comparacao de no-op, e a gravacao de
-- historico com anterior/novo completos, incluindo o minimo calculado.
create or replace function public.decidir_compra_planejamento(
  p_planejamento_compra_id uuid,
  p_unidade_compra_id uuid,
  p_versao_otimista_esperada bigint,
  p_preco_unitario_estimado numeric default null,
  p_motivo text default null,
  p_quantidade_comercial_escolhida numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_empresa_id uuid;
  v_planejamento record;
  v_conversao record;
  v_rendimento numeric;
  v_multiplo numeric;
  v_admite_fracao boolean;
  v_regra text;
  v_quantidade_base numeric;
  v_quantidade_minima_calculada numeric;
  v_quantidade_final numeric;
  v_sobra numeric;
  v_acao text;
  v_nome text;
  v_versao_nova bigint;
  v_linhas_afetadas int;
begin
  if auth.uid() is null then
    raise exception 'decidir_compra_planejamento: operacao requer sessao autenticada.';
  end if;

  v_empresa_id := public.empresa_atual_id();
  if v_empresa_id is null then
    raise exception 'decidir_compra_planejamento: usuario sem empresa associada.';
  end if;

  if not (public.usuario_tem_papel_funcional('comprador') or public.usuario_e_admin()) then
    raise exception 'decidir_compra_planejamento: exige papel funcional comprador ou administrador.';
  end if;

  if p_versao_otimista_esperada is null then
    raise exception 'decidir_compra_planejamento: p_versao_otimista_esperada obrigatoria - leia o planejamento antes de decidir e informe a versao lida.';
  end if;

  if p_preco_unitario_estimado is not null and p_preco_unitario_estimado < 0 then
    raise exception 'decidir_compra_planejamento: preco unitario estimado nao pode ser negativo.';
  end if;

  select * into v_planejamento
  from public.planejamentos_compra
  where id = p_planejamento_compra_id
    and empresa_id = v_empresa_id
    and ativo = true
    and deleted_at is null
  for update;

  if not found then
    raise exception 'decidir_compra_planejamento: planejamento de compras nao encontrado.';
  end if;

  if v_planejamento.versao_otimista is distinct from p_versao_otimista_esperada then
    raise exception 'decidir_compra_planejamento: conflito de edicao - o planejamento % foi alterado por outra operacao (versao esperada=%, atual=%). Recarregue e tente novamente.', p_planejamento_compra_id, p_versao_otimista_esperada, v_planejamento.versao_otimista;
  end if;

  if v_planejamento.status = 'em_planejamento' then
    v_acao := 'decidida';
  elsif v_planejamento.status = 'pronto_pedido' then
    v_acao := 'revisada';
  else
    raise exception 'decidir_compra_planejamento: planejamento com status "%" nao pode receber decisao/revisao comercial - apenas em_planejamento ou pronto_pedido.', v_planejamento.status;
  end if;

  -- Conversao ativa e exata para empresa + materia-prima + unidade
  -- tecnica + unidade de compra informada (4A). Preservado do original.
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
  -- Compatibilidade do multiplo cadastrado com a precisao comercial de 4
  -- casas decimais (achado real, confirmado por leitura direta de
  -- 20260825180000_materia_prima_unidade_conversoes.sql:88-93):
  -- mp_unidade_conv_fracao_chk so exige multiplo_minimo_compra inteiro
  -- quando admite_fracao=false - com admite_fracao=true, o cadastro
  -- aceita qualquer valor positivo, inclusive com mais de 4 casas
  -- decimais (ex.: 0.00003). Um inteiro k multiplicado por um multiplo
  -- com ate 4 casas NUNCA produz mais de 4 casas (propriedade
  -- matematica, nao escolha arbitraria) - exigir isso aqui garante, por
  -- construcao, que o arredondamento final (CEIL(x*10000)/10000, poucas
  -- linhas abaixo) nunca quebra a propriedade de multiplo exato: quando
  -- o multiplo ja tem <=4 casas, aquele arredondamento vira um no-op
  -- sobre um valor que ja e multiplo exato. Sem esta validacao, o
  -- caminho automatico podia aceitar um multiplo que a validacao
  -- explicita da escolha comercial (mais abaixo) rejeitaria - agora as
  -- duas usam a mesma v_multiplo, ja validada, e aceitam/rejeitam
  -- exatamente os mesmos valores.
  if v_multiplo <> round(v_multiplo, 4) then
    raise exception 'decidir_compra_planejamento: multiplo cadastrado (%) tem mais de 4 casas decimais - incompativel com a precisao comercial do sistema. Corrija o cadastro de conversao antes de decidir esta compra.', v_multiplo;
  end if;

  v_quantidade_base := v_planejamento.quantidade_necessaria_total / v_rendimento;

  if v_admite_fracao then
    if v_multiplo = 1 then
      v_quantidade_minima_calculada := v_quantidade_base;
      v_regra := 'automatico_sem_regra';
    else
      v_quantidade_minima_calculada := ceil(v_quantidade_base / v_multiplo) * v_multiplo;
      v_regra := 'multiplo_fracionavel';
    end if;
  else
    v_quantidade_minima_calculada := ceil(v_quantidade_base / v_multiplo) * v_multiplo;
    v_regra := 'multiplo_inteiro';
  end if;

  v_quantidade_minima_calculada := ceil(v_quantidade_minima_calculada * 10000) / 10000;

  -- Assert interno: o minimo calculado (ja arredondado) tem que cobrir
  -- a necessidade - se isto disparar, e um erro de logica desta funcao,
  -- nao uma condicao de negocio esperada.
  if v_quantidade_minima_calculada * v_rendimento < v_planejamento.quantidade_necessaria_total then
    raise exception 'Erro interno: minimo calculado (%) x rendimento (%) = % e menor que a necessidade (%) - arredondamento nao pode permitir compra insuficiente.',
      v_quantidade_minima_calculada, v_rendimento, v_quantidade_minima_calculada * v_rendimento, v_planejamento.quantidade_necessaria_total;
  end if;

  -- Assert interno de compatibilidade com multiplo no caminho
  -- automatico - dado que v_multiplo ja foi validado com ate 4 casas
  -- decimais acima, isto nunca deveria disparar; existe como defesa
  -- adicional, mesmo padrao de assert ja usado nesta funcao.
  if v_regra <> 'automatico_sem_regra' and mod(v_quantidade_minima_calculada, v_multiplo) <> 0 then
    raise exception 'Erro interno: minimo calculado (%) nao e multiplo exato de % (regra %).', v_quantidade_minima_calculada, v_multiplo, v_regra;
  end if;

  -- Quantidade comercial: null usa o minimo calculado (comportamento
  -- automatico, igual ao original); informada precisa ser validada
  -- contra o mesmo minimo e contra o multiplo/regra de fracionamento -
  -- NUNCA comparada contra quantidade_necessaria_total diretamente
  -- (unidades diferentes: minimo/escolhida estao em unidade de compra,
  -- necessidade esta em unidade tecnica - a unica ponte valida entre as
  -- duas e multiplicar pelo rendimento, nunca comparacao direta).
  if p_quantidade_comercial_escolhida is null then
    v_quantidade_final := v_quantidade_minima_calculada;
  else
    if p_quantidade_comercial_escolhida <= 0 then
      raise exception 'decidir_compra_planejamento: quantidade comercial escolhida deve ser maior que zero.';
    end if;

    if p_quantidade_comercial_escolhida <> round(p_quantidade_comercial_escolhida, 4) then
      raise exception 'decidir_compra_planejamento: quantidade comercial escolhida (%) tem mais de 4 casas decimais - mesma precisao do calculo automatico.', p_quantidade_comercial_escolhida;
    end if;

    if p_quantidade_comercial_escolhida < v_quantidade_minima_calculada then
      raise exception 'decidir_compra_planejamento: quantidade comercial escolhida (%) nao pode ser menor que o minimo calculado (%).', p_quantidade_comercial_escolhida, v_quantidade_minima_calculada;
    end if;

    -- Compatibilidade com multiplo: em todo regime exceto
    -- automatico_sem_regra (multiplo=1, sem restricao de embalagem), a
    -- quantidade comprada e sempre um multiplo exato de v_multiplo -
    -- MOD com operandos numeric e aritmetica decimal exata (sem ponto
    -- flutuante), entao "= 0" e uma comparacao inequivoca.
    if v_regra <> 'automatico_sem_regra' and mod(p_quantidade_comercial_escolhida, v_multiplo) <> 0 then
      raise exception 'decidir_compra_planejamento: quantidade comercial escolhida (%) nao e multiplo exato de % (regra %) - ajuste para um multiplo valido.', p_quantidade_comercial_escolhida, v_multiplo, v_regra;
    end if;

    v_quantidade_final := p_quantidade_comercial_escolhida;
  end if;

  -- Assert interno: a cobertura final (unidade tecnica) nunca pode
  -- ficar abaixo da necessidade - garantido por construcao (minimo ja
  -- cobre; escolhida nunca fica abaixo do minimo), checado aqui como
  -- defesa adicional, nao uma condicao de negocio esperada.
  if v_quantidade_final * v_rendimento < v_planejamento.quantidade_necessaria_total then
    raise exception 'Erro interno: quantidade final (%) x rendimento (%) = % e menor que a necessidade (%).',
      v_quantidade_final, v_rendimento, v_quantidade_final * v_rendimento, v_planejamento.quantidade_necessaria_total;
  end if;

  v_sobra := greatest(round(v_quantidade_final * v_rendimento - v_planejamento.quantidade_necessaria_total, 4), 0);

  -- No-op ANTES de qualquer exigencia de motivo: se todo o estado
  -- comercial resultante for identico ao atual, retorna sem escrita,
  -- sem incrementar versao, sem historico e SEM exigir motivo - uma
  -- chamada repetida que nao muda nada nunca deveria ser tratada como
  -- nova decisao. Motivo nunca entra nesta comparacao.
  if v_planejamento.unidade_compra_id is not distinct from p_unidade_compra_id
     and v_planejamento.quantidade_minima_calculada is not distinct from v_quantidade_minima_calculada
     and v_planejamento.quantidade_planejada_compra is not distinct from v_quantidade_final
     and v_planejamento.rendimento_aplicado is not distinct from v_rendimento
     and v_planejamento.multiplo_aplicado is not distinct from v_multiplo
     and v_planejamento.regra_arredondamento is not distinct from v_regra
     and v_planejamento.sobra_prevista is not distinct from v_sobra
     and v_planejamento.preco_unitario_estimado is not distinct from p_preco_unitario_estimado then
    return jsonb_build_object(
      'planejamento_id', p_planejamento_compra_id,
      'status', 'sem_alteracao',
      'versao_otimista', v_planejamento.versao_otimista
    );
  end if;

  -- Chegou aqui: e uma alteracao comercial real. Justificativa exigida
  -- de forma diferente por acao: em 'decidida' (primeira decisao), so
  -- quando a quantidade escolhida supera o minimo calculado (excedente
  -- automatico do proprio calculo ja se explica pelos campos de
  -- rendimento/multiplo/regra); em 'revisada', SEMPRE - toda alteracao
  -- real feita por Compras sobre uma decisao ja existente precisa ficar
  -- justificada, mesmo que so o preco ou a unidade tenham mudado.
  if v_acao = 'decidida' then
    if v_quantidade_final > v_quantidade_minima_calculada
       and (p_motivo is null or btrim(p_motivo) = '') then
      raise exception 'decidir_compra_planejamento: motivo e obrigatorio quando a quantidade comercial escolhida (%) supera o minimo calculado (%).', v_quantidade_final, v_quantidade_minima_calculada;
    end if;
  elsif v_acao = 'revisada' then
    if p_motivo is null or btrim(p_motivo) = '' then
      raise exception 'decidir_compra_planejamento: motivo e obrigatorio em toda revisao com alteracao comercial real.';
    end if;
  end if;

  -- WHERE defensivo (id + empresa + versao esperada) - nao depende so
  -- do lock adquirido no SELECT anterior.
  update public.planejamentos_compra
  set unidade_compra_id = p_unidade_compra_id,
      rendimento_aplicado = v_rendimento,
      multiplo_aplicado = v_multiplo,
      regra_arredondamento = v_regra,
      quantidade_minima_calculada = v_quantidade_minima_calculada,
      quantidade_planejada_compra = v_quantidade_final,
      sobra_prevista = v_sobra,
      preco_unitario_estimado = p_preco_unitario_estimado,
      status = 'pronto_pedido'
  where id = p_planejamento_compra_id
    and empresa_id = v_empresa_id
    and versao_otimista = p_versao_otimista_esperada
  returning versao_otimista into v_versao_nova;

  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 1 then
    raise exception 'decidir_compra_planejamento: UPDATE afetou % linha(s), esperado exatamente 1 - abortando.', v_linhas_afetadas;
  end if;

  v_nome := public.resolver_nome_ator_tenant(v_empresa_id);

  insert into public.planejamentos_compra_historico (
    empresa_id, planejamento_compra_id, acao,
    status_anterior, status_novo,
    versao_otimista_anterior, versao_otimista_nova,
    quantidade_necessaria_total,
    quantidade_minima_calculada_anterior, quantidade_minima_calculada_nova,
    quantidade_comercial_anterior, quantidade_comercial_nova,
    unidade_compra_anterior_id, unidade_compra_nova_id,
    rendimento_anterior, rendimento_novo,
    multiplo_anterior, multiplo_novo,
    regra_arredondamento_anterior, regra_arredondamento_nova,
    sobra_anterior, sobra_nova,
    preco_unitario_estimado_anterior, preco_unitario_estimado_novo,
    motivo, modificado_por_id, modificado_por_nome
  ) values (
    v_empresa_id, p_planejamento_compra_id, v_acao,
    v_planejamento.status, 'pronto_pedido',
    v_planejamento.versao_otimista, v_versao_nova,
    v_planejamento.quantidade_necessaria_total,
    v_planejamento.quantidade_minima_calculada, v_quantidade_minima_calculada,
    v_planejamento.quantidade_planejada_compra, v_quantidade_final,
    v_planejamento.unidade_compra_id, p_unidade_compra_id,
    v_planejamento.rendimento_aplicado, v_rendimento,
    v_planejamento.multiplo_aplicado, v_multiplo,
    v_planejamento.regra_arredondamento, v_regra,
    v_planejamento.sobra_prevista, v_sobra,
    v_planejamento.preco_unitario_estimado, p_preco_unitario_estimado,
    p_motivo, auth.uid(), v_nome
  );

  return jsonb_build_object(
    'planejamento_id', p_planejamento_compra_id,
    'status', v_acao,
    'rendimento_aplicado', v_rendimento,
    'multiplo_aplicado', v_multiplo,
    'regra_arredondamento', v_regra,
    'quantidade_minima_calculada', v_quantidade_minima_calculada,
    'quantidade_planejada_compra', v_quantidade_final,
    'sobra_prevista', v_sobra,
    'versao_otimista', v_versao_nova
  );
end;
$function$;

comment on function public.decidir_compra_planejamento(uuid, uuid, bigint, numeric, text, numeric) is
  'Incremento 8/9: substitui decidir_compra_planejamento(uuid,uuid,numeric) - assinatura antiga revogada e removida nesta mesma migration (secao 11a/11b). Decide (em_planejamento) ou revisa (pronto_pedido) a quantidade comercial. Concorrencia otimista obrigatoria, no-op sem escrita quando nada muda, motivo obrigatorio em divergencia, historico completo anterior/novo.';

revoke all on function public.decidir_compra_planejamento(uuid, uuid, bigint, numeric, text, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.decidir_compra_planejamento(uuid, uuid, bigint, numeric, text, numeric)
  to authenticated;

-- 11d. Prova, dentro da propria migration: a assinatura antiga nao
-- existe mais, e existe exatamente 1 funcao chamada
-- decidir_compra_planejamento no catalogo.
do $$
declare
  v_count_overloads int;
begin
  if to_regprocedure('public.decidir_compra_planejamento(uuid,uuid,numeric)') is not null then
    raise exception 'Incremento 8: prova de remocao falhou - decidir_compra_planejamento(uuid,uuid,numeric) ainda existe no catalogo.';
  end if;

  select count(*) into v_count_overloads
  from pg_proc
  where proname = 'decidir_compra_planejamento'
    and pronamespace = 'public'::regnamespace;

  if v_count_overloads <> 1 then
    raise exception 'Incremento 8: prova de overload unico falhou - % funcoes chamadas decidir_compra_planejamento encontradas no schema public (esperado exatamente 1).', v_count_overloads;
  end if;
end;
$$;

-- =====================================================================
-- 12. CREATE OR REPLACE - criar_planejamento_compra_a_partir_de_requisicoes
--     (mesma assinatura - substitui de verdade)
-- =====================================================================
-- Corpo baseado no original (20260825200000_funcoes_decisao_compra.sql:
-- 155-329), com mudancas declaradas (nenhuma linha fora destas foi
-- tocada): (1) guarda de auth.uid(); (2) guarda de papel comprador/
-- admin; (3) as 3 validacoes dentro do loop FOR UPDATE (status_
-- aprovacao/status_versao/empresa_id); (4) filtro explicito
-- "and empresa_id = v_empresa_id" adicionado em toda consulta que a
-- funcao faz sobre tabela com essa coluna (2 loops de
-- requisicao_compra_itens, 2 leituras de planejamento_compra_origens,
-- 1 leitura de materias_primas) - necessario porque SECURITY DEFINER
-- ignora RLS; sem o filtro, uma consulta por UUID informado pelo
-- chamador poderia ler/travar uma linha de outra empresa antes de
-- qualquer rejeicao posterior.
create or replace function public.criar_planejamento_compra_a_partir_de_requisicoes(
  p_requisicao_compra_item_ids uuid[],
  p_chave_idempotencia text,
  p_modo_planejamento text default 'manual',
  p_descricao_compra text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
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
  if auth.uid() is null then
    raise exception 'criar_planejamento_compra_a_partir_de_requisicoes: operacao requer sessao autenticada.';
  end if;

  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  if not (public.usuario_tem_papel_funcional('comprador') or public.usuario_e_admin()) then
    raise exception 'criar_planejamento_compra_a_partir_de_requisicoes: exige papel funcional comprador ou administrador.';
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
      and empresa_id = v_empresa_id
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
      and empresa_id = v_empresa_id
    order by id
    for update
  loop
    v_count_encontrado := v_count_encontrado + 1;

    -- Endurecimento (Incremento 8/9): nenhum papel, nem PCP nem
    -- administrador, pode agrupar num planejamento um item ainda
    -- pendente. Checado AQUI, dentro do loop que ja trava a linha via
    -- FOR UPDATE - nunca por leitura anterior, nunca so por RLS.
    if v_item.status_aprovacao <> 'aprovada' then
      raise exception 'Item de requisicao % tem status_aprovacao=% - so itens aprovados podem ser agrupados num planejamento de compra.', v_item.id, v_item.status_aprovacao;
    end if;

    if v_item.status_versao <> 'ativa' then
      raise exception 'Item de requisicao % tem status_versao=% - so a versao ativa de um item pode ser agrupada num planejamento de compra.', v_item.id, v_item.status_versao;
    end if;

    if v_item.empresa_id <> v_empresa_id then
      raise exception 'Item de requisicao % nao pertence a empresa atual.', v_item.id;
    end if;

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

  select descricao into v_descricao_mp from public.materias_primas where id = v_materia_prima_id and empresa_id = v_empresa_id;
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
      select * from public.requisicao_compra_itens
      where id = any(p_requisicao_compra_item_ids)
        and empresa_id = v_empresa_id
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
        and empresa_id = v_empresa_id
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

comment on function public.criar_planejamento_compra_a_partir_de_requisicoes(uuid[], text, text, text) is
  'Incremento 4C, endurecida no Incremento 8/9: exige papel comprador/admin, auth.uid() nao nulo, item aprovado+ativo+tenant correto. Assinatura preservada. SECURITY INVOKER -> DEFINER (ACL de planejamentos_compra fechada nesta migration).';

revoke all on function public.criar_planejamento_compra_a_partir_de_requisicoes(uuid[], text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.criar_planejamento_compra_a_partir_de_requisicoes(uuid[], text, text, text)
  to authenticated;

-- =====================================================================
-- 13. CREATE OR REPLACE - gerar_pedido_compra_rascunho
--     (mesma assinatura - substitui de verdade)
-- =====================================================================
-- Corpo baseado no original (20260825200000_funcoes_decisao_compra.sql:
-- 499-564), com mudancas declaradas (nenhuma linha fora destas foi
-- tocada): (1) guarda de auth.uid(); (2) guarda de papel comprador/
-- admin; (3) filtro explicito "and empresa_id = v_empresa_id" na
-- leitura de unidades_medida - necessario porque SECURITY DEFINER
-- ignora RLS; (4) WHERE defensivo (empresa+estado) e GET DIAGNOSTICS
-- ROW_COUNT no UPDATE final que converte o planejamento em pedido.
create or replace function public.gerar_pedido_compra_rascunho(
  p_planejamento_compra_id uuid,
  p_fornecedor_nome text default null
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_planejamento record;
  v_unidade_compra_codigo text;
  v_pedido_id uuid;
  v_linhas_afetadas int;
begin
  if auth.uid() is null then
    raise exception 'gerar_pedido_compra_rascunho: operacao requer sessao autenticada.';
  end if;

  if not (public.usuario_tem_papel_funcional('comprador') or public.usuario_e_admin()) then
    raise exception 'gerar_pedido_compra_rascunho: exige papel funcional comprador ou administrador.';
  end if;

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
  where id = v_planejamento.unidade_compra_id
    and empresa_id = v_empresa_id;

  -- INSERT ... VALUES (linha unica literal) e estruturalmente garantido
  -- pela propria sintaxe SQL a inserir exatamente 1 linha ou falhar -
  -- GET DIAGNOSTICS ROW_COUNT seria sempre 1 aqui, uma checagem que
  -- nunca poderia disparar. Nao aplicavel aos 2 INSERTs abaixo pelo
  -- mesmo motivo.
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

  -- WHERE defensivo (id + empresa + estado esperado) - nao depende so
  -- do lock adquirido no SELECT anterior.
  update public.planejamentos_compra
  set status = 'convertido_pedido'
  where id = p_planejamento_compra_id
    and empresa_id = v_empresa_id
    and status = 'pronto_pedido';

  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 1 then
    raise exception 'gerar_pedido_compra_rascunho: UPDATE final afetou % linha(s), esperado exatamente 1 - abortando.', v_linhas_afetadas;
  end if;

  return v_pedido_id;
end;
$$;

comment on function public.gerar_pedido_compra_rascunho(uuid, text) is
  'Incremento 4C, endurecida no Incremento 8/9: exige papel comprador/admin e auth.uid() nao nulo. Assinatura preservada. SECURITY INVOKER -> DEFINER. Conteudo comercial fica congelado no Pedido (snapshot, trigger de imutabilidade ja existente) e o planejamento vira terminal (convertido_pedido).';

revoke all on function public.gerar_pedido_compra_rascunho(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.gerar_pedido_compra_rascunho(uuid, text)
  to authenticated;

-- =====================================================================
-- 14. RPC nova - cancelar_planejamento_compra
-- =====================================================================
create or replace function public.cancelar_planejamento_compra(
  p_planejamento_compra_id uuid,
  p_versao_otimista_esperada bigint,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_empresa_id uuid;
  v_planejamento record;
  v_nome text;
  v_versao_nova bigint;
  v_linhas_afetadas int;
begin
  if auth.uid() is null then
    raise exception 'cancelar_planejamento_compra: operacao requer sessao autenticada.';
  end if;

  v_empresa_id := public.empresa_atual_id();
  if v_empresa_id is null then
    raise exception 'cancelar_planejamento_compra: usuario sem empresa associada.';
  end if;

  if not (public.usuario_tem_papel_funcional('comprador') or public.usuario_e_admin()) then
    raise exception 'cancelar_planejamento_compra: exige papel funcional comprador ou administrador.';
  end if;

  if p_versao_otimista_esperada is null then
    raise exception 'cancelar_planejamento_compra: p_versao_otimista_esperada obrigatoria - leia o planejamento antes de cancelar e informe a versao lida.';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'cancelar_planejamento_compra: motivo e obrigatorio.';
  end if;

  select * into v_planejamento
  from public.planejamentos_compra
  where id = p_planejamento_compra_id
    and empresa_id = v_empresa_id
    and ativo = true
    and deleted_at is null
  for update;

  if not found then
    raise exception 'cancelar_planejamento_compra: planejamento de compras nao encontrado.';
  end if;

  if v_planejamento.versao_otimista is distinct from p_versao_otimista_esperada then
    raise exception 'cancelar_planejamento_compra: conflito de edicao - o planejamento % foi alterado por outra operacao (versao esperada=%, atual=%). Recarregue e tente novamente.', p_planejamento_compra_id, p_versao_otimista_esperada, v_planejamento.versao_otimista;
  end if;

  if v_planejamento.status not in ('em_planejamento', 'pronto_pedido') then
    raise exception 'cancelar_planejamento_compra: planejamento com status "%" nao pode ser cancelado - apenas em_planejamento ou pronto_pedido (convertido_pedido e cancelado sao terminais).', v_planejamento.status;
  end if;

  -- WHERE defensivo (id + empresa + versao esperada) - nao depende so
  -- do lock adquirido no SELECT anterior.
  update public.planejamentos_compra
  set status = 'cancelado'
  where id = p_planejamento_compra_id
    and empresa_id = v_empresa_id
    and versao_otimista = p_versao_otimista_esperada
  returning versao_otimista into v_versao_nova;

  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 1 then
    raise exception 'cancelar_planejamento_compra: UPDATE afetou % linha(s), esperado exatamente 1 - abortando.', v_linhas_afetadas;
  end if;

  v_nome := public.resolver_nome_ator_tenant(v_empresa_id);

  -- trg_planejamentos_compra_cancelar_origens (ja existente, 4B) dispara
  -- automaticamente a partir do UPDATE acima e inativa as origens - nao
  -- e tocado nem duplicado aqui.
  insert into public.planejamentos_compra_historico (
    empresa_id, planejamento_compra_id, acao,
    status_anterior, status_novo,
    versao_otimista_anterior, versao_otimista_nova,
    quantidade_necessaria_total,
    quantidade_minima_calculada_anterior, quantidade_minima_calculada_nova,
    quantidade_comercial_anterior, quantidade_comercial_nova,
    unidade_compra_anterior_id, unidade_compra_nova_id,
    rendimento_anterior, rendimento_novo,
    multiplo_anterior, multiplo_novo,
    regra_arredondamento_anterior, regra_arredondamento_nova,
    sobra_anterior, sobra_nova,
    preco_unitario_estimado_anterior, preco_unitario_estimado_novo,
    motivo, modificado_por_id, modificado_por_nome
  ) values (
    v_empresa_id, p_planejamento_compra_id, 'cancelada',
    v_planejamento.status, 'cancelado',
    v_planejamento.versao_otimista, v_versao_nova,
    v_planejamento.quantidade_necessaria_total,
    v_planejamento.quantidade_minima_calculada, v_planejamento.quantidade_minima_calculada,
    v_planejamento.quantidade_planejada_compra, v_planejamento.quantidade_planejada_compra,
    v_planejamento.unidade_compra_id, v_planejamento.unidade_compra_id,
    v_planejamento.rendimento_aplicado, v_planejamento.rendimento_aplicado,
    v_planejamento.multiplo_aplicado, v_planejamento.multiplo_aplicado,
    v_planejamento.regra_arredondamento, v_planejamento.regra_arredondamento,
    v_planejamento.sobra_prevista, v_planejamento.sobra_prevista,
    v_planejamento.preco_unitario_estimado, v_planejamento.preco_unitario_estimado,
    p_motivo, auth.uid(), v_nome
  );

  return jsonb_build_object(
    'planejamento_id', p_planejamento_compra_id,
    'status', 'cancelado',
    'versao_otimista', v_versao_nova
  );
end;
$function$;

comment on function public.cancelar_planejamento_compra(uuid, bigint, text) is
  'Incremento 8/9: cancela um planejamento em em_planejamento ou pronto_pedido - terminal, sem reabertura. Preserva o trigger existente que inativa planejamento_compra_origens. Exige papel comprador/admin, versao otimista e motivo.';

revoke all on function public.cancelar_planejamento_compra(uuid, bigint, text)
  from public, anon, authenticated, service_role;
grant execute on function public.cancelar_planejamento_compra(uuid, bigint, text)
  to authenticated;

-- =====================================================================
-- 15. RLS
-- =====================================================================
drop policy if exists requisicao_compra_itens_select_tenant on public.requisicao_compra_itens;

create policy requisicao_compra_itens_select_papel
  on public.requisicao_compra_itens
  for select
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and ativo = true
    and (
      public.usuario_tem_papel_funcional('pcp')
      or public.usuario_e_admin()
      or public.usuario_tem_papel_funcional('aprovador_compras')
      or (status_aprovacao = 'aprovada' and public.usuario_tem_papel_funcional('comprador'))
    )
  );

comment on policy requisicao_compra_itens_select_papel on public.requisicao_compra_itens is
  'Incremento 8/9: PCP, administrador e aprovador_compras veem tudo da propria empresa; Comprador so ve itens com status_aprovacao=aprovada. Uma unica policy com logica composta.';

alter table public.requisicoes_compra_historico enable row level security;

create policy requisicoes_compra_historico_select_papel
  on public.requisicoes_compra_historico
  for select
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and (
      public.usuario_e_admin()
      or public.usuario_tem_papel_funcional('pcp')
      or public.usuario_tem_papel_funcional('aprovador_compras')
      or exists (
        select 1 from public.requisicao_compra_itens rci
        where rci.id = requisicoes_compra_historico.requisicao_compra_item_id
          and rci.empresa_id = requisicoes_compra_historico.empresa_id
          and rci.empresa_id = public.empresa_atual_id()
          and rci.status_aprovacao = 'aprovada'
          and public.usuario_tem_papel_funcional('comprador')
      )
    )
  );

-- Alinha a policy de SELECT de planejamentos_compra a matriz ja aprovada
-- ("comprador ou administrador: criar planejamento, decidir/revisar
-- comercialmente, cancelar, gerar Pedido" - PCP nao consta como podendo
-- ver/agir sobre planejamento em nenhum ponto da matriz). A policy
-- original (planejamentos_compra_select_tenant, 202606050010) era
-- tenant-wide sem checar papel - divergia da matriz. Escolha registrada
-- explicitamente aqui, nao decidida em silencio.
drop policy if exists planejamentos_compra_select_tenant on public.planejamentos_compra;

create policy planejamentos_compra_select_papel
  on public.planejamentos_compra
  for select
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and (
      public.usuario_e_admin()
      or public.usuario_tem_papel_funcional('comprador')
    )
  );

comment on policy planejamentos_compra_select_papel on public.planejamentos_compra is
  'Incremento 8/9: substitui a policy tenant-wide original - alinha a leitura de planejamentos_compra a matriz aprovada (so comprador/administrador). Divergencia identificada e corrigida nesta migration, nao presente no desenho original.';

alter table public.planejamentos_compra_historico enable row level security;

create policy planejamentos_compra_historico_select_papel
  on public.planejamentos_compra_historico
  for select
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and (
      public.usuario_e_admin()
      or public.usuario_tem_papel_funcional('comprador')
    )
  );

comment on policy planejamentos_compra_historico_select_papel on public.planejamentos_compra_historico is
  'Incremento 8/9: decisao comercial e assunto de Compras - so comprador e administrador leem o historico comercial.';

-- =====================================================================
-- 16. ACL - fechamento de planejamentos_compra
-- =====================================================================
-- REVOKE ALL (nao so INSERT/UPDATE/DELETE) - evita deixar TRUNCATE,
-- REFERENCES ou TRIGGER concedidos por acidente via privilegio padrao.
revoke all on public.planejamentos_compra
  from public, anon, authenticated, service_role;
grant select on public.planejamentos_compra to authenticated;

revoke all on public.requisicoes_compra_historico
  from public, anon, authenticated, service_role;
revoke insert, update, delete, truncate on public.requisicoes_compra_historico
  from public, anon, authenticated, service_role;
grant select on public.requisicoes_compra_historico to authenticated;

revoke all on public.planejamentos_compra_historico
  from public, anon, authenticated, service_role;
revoke insert, update, delete, truncate on public.planejamentos_compra_historico
  from public, anon, authenticated, service_role;
grant select on public.planejamentos_compra_historico to authenticated;

-- =====================================================================
-- 17. ACL - RPCs de requisicao
-- =====================================================================
revoke execute on function public.aprovar_requisicao_compra_material(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.aprovar_requisicao_compra_material(uuid)
  to authenticated;

revoke execute on function public.reprovar_requisicao_compra_material(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reprovar_requisicao_compra_material(uuid, text)
  to authenticated;

-- =====================================================================
-- 18. Comentarios adicionais
-- =====================================================================
comment on column public.requisicao_compra_itens.status_aprovacao is
  'Incremento 8/9: pendente (default) / aprovada (terminal, imutavel) / reprovada (terminal, sem RPC de reabertura). Eixo ortogonal a status_versao. Governanca agnostica a necessidade_id/projeto_id/OF - pronta para requisicoes complementares e gerais quando forem desenhadas em incremento proprio, sem exigir mudanca aqui.';

commit;
