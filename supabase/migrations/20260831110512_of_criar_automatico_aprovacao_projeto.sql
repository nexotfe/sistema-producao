-- Incremento 4D0, segunda fatia — Incremento 4/9: criação automática de
-- OFs quando um projeto é aprovado, via TRIGGER reagindo à transição real
-- de status='aprovado' em public.projetos — não embutida dentro de
-- aprovar_projeto_com_simulacao_v5. Mesmo padrão estrutural já em
-- produção em trg_projetos_congelar_custos (202608220001): a criação de
-- OF passa a valer para QUALQUER caminho futuro que aprove um projeto,
-- sem depender de qual dos 4 RETURN da v5 foi alcançado — os 3 RETURNs
-- antecipados (idempotência otimista/sob trava/corrida de INSERT) nunca
-- tocam projetos.status, logo nunca disparam o trigger; só o RETURN
-- final (inserção nova de verdade) alcança o UPDATE que dispara.
--
-- Investigação prévia (2026-08-31, leitura real contra o banco
-- vinculado e src/): aprovar_cenario_comercial_v2 e aprovar_cenario_
-- comercial (v1) NUNCA tocam projetos.status — são um evento comercial
-- distinto, gravado só em cenarios_comerciais_aprovados. Só
-- aprovar_projeto_com_simulacao_v5 aprova o projeto de fato.
--
-- Decisões desta migration (usuário, não inferidas):
--   1. Nenhum backfill dos 5 projetos já aprovados hoje. Os 4 marcados
--      "(excluir)" não devem ganhar OF real; o projeto 260006 fica para
--      uma execução administrativa controlada e separada, decidida
--      depois. Esta migration cria só a estrutura (função + trigger),
--      sem tocar nenhuma linha existente de ordens_fabricacao/projetos.
--   2. created_by da OF vem do aprovador real do snapshot vigente em
--      simulacoes_comerciais.aprovado_por — nunca de auth.uid() (nulo
--      no contexto do trigger) nem de qualquer outro valor implícito.
--      Se não existir exatamente 1 snapshot vigente com aprovador
--      válido da mesma empresa, a criação FALHA e desfaz a aprovação
--      inteira (nenhum handler de exceção nesta function nem no
--      trigger — a falha se propaga naturalmente até abortar toda a
--      transação, incluindo o UPDATE de projetos.status e o INSERT em
--      simulacoes_comerciais que a originaram).
--   3. Divergência real de BOM corrigida: congelar_custos_projeto_
--      interno tinha sua PRÓPRIA query de "BOM ativo" (sem filtrar
--      ativo=true, sem desempate por id) — diferente da canônica
--      resolver_bom_ativo_produto. Corrigido aqui para usar
--      exclusivamente a canônica, preservando todo o resto da lógica
--      de congelamento (mesmo tipo_projeto/exclusão de matéria-prima,
--      mesmo cálculo via calcular_custo_bom_interno).
--   4. criar_ofs_de_projeto_aprovado fica INTERNA: nenhum EXECUTE para
--      public/anon/authenticated/service_role. Só o trigger a chama
--      (SECURITY DEFINER, dono postgres). Um eventual backfill futuro
--      do 260006 é uma operação administrativa pontual (via conexão
--      privilegiada), não uma porta permanente para nenhum papel de
--      cliente.
--   5. Concorrência: advisory lock próprio por projeto
--      ('criar_ofs_de_projeto_aprovado:'||projeto_id) serializa
--      reprocessamentos do mesmo projeto (aprovação vs. eventual
--      backfill administrativo futuro chamando a mesma function) +
--      advisory lock CANÔNICO do grafo de BOM ('subconjunto-grafo:'||
--      empresa_id, mesma chave de 202608040001_bom_subconjunto_
--      protecao_ciclo.sql) adquirido em AMBAS as functions que resolvem
--      BOM nesta transação — congelar_custos_projeto_interno (antes da
--      primeira resolução) e criar_ofs_de_projeto_aprovado — para que,
--      independente da ordem alfabética real de disparo dos 2 triggers
--      AFTER UPDATE OF status (congelar_custos antes de
--      criar_ofs_aprovado), custo congelado e OF observem sempre o
--      mesmo estado protegido do grafo. Reentrante para o mesmo
--      backend/transação, sem risco de autobloqueio. O índice parcial
--      ordens_fabricacao_projeto_item_raiz_uniq (já existente)
--      permanece como defesa estrutural final contra duplicidade de
--      OF-raiz.
--
--      PENDÊNCIA OBRIGATÓRIA ANTES DE QUALQUER EXECUÇÃO REAL (banco
--      vinculado): harness de 2 conexões concorrentes aprovando o MESMO
--      projeto ao mesmo tempo, provando que não duplica OF nem avança o
--      contador de numeração duas vezes — os advisory locks acima nunca
--      foram exercitados sob concorrência real de processos nesta
--      sessão (só a lógica sequencial, num preflight de conexão única).
--      Sem esse harness rodado e aprovado, a aplicação real deste
--      incremento não está autorizada.
--   6. Sem efeito antecipado nenhum: a criação não gera necessidade,
--      não decide CI/CE, não reserva/consome estoque, não cria
--      requisição de compra. Só INSERT em ordens_fabricacao com
--      estado_aprovacao='aguardando_auditoria' e
--      estado_execucao='planejada' (par válido da matriz de 15
--      combinações), um por item elegível (ativo + produto ativo +
--      tipo_item in ('produto acabado','semiacabado') + BOM
--      resolvido), sempre OF-raiz (of_pai_id nunca fornecido).
--
-- Fora de escopo, registrado à parte: aprovar_cenario_comercial (v1)
-- continua com EXECUTE aberto para authenticated e zero chamador real
-- em src/ — vira pendência de segurança separada, não tratada aqui.
--
-- Arquivo inteiro é uma transação.

begin;

-- 1. Amplia o dominio de ordens_fabricacao.unidade para a uniao dos
--    dois dominios de unidade do sistema, ANTES de qualquer criacao
--    automatica de OF nesta migration (passos 3-4 abaixo). Decisao de
--    negocio do usuario (nao inferida): quantidade_planejada de uma OF
--    representa a quantidade do ITEM FABRICADO — logo
--    ordens_fabricacao.unidade deve usar a unidade cadastral do
--    produto acabado/semiacabado (itens_industriais.unidade), nao uma
--    unidade de consumo de materia-prima.
--
--    A constraint original (kg, metro, barra, chapa, peca) foi escrita
--    (202606050033) pensando no dominio de criar_ordem_fabricacao_
--    operacional — funcao legada de criacao manual de OF, hoje sem
--    EXECUTE para nenhum papel de cliente (public/anon/authenticated/
--    service_role, confirmado por leitura) — cujo dominio nunca
--    incluiu os valores de catalogo de Produto (conjunto, unidade,
--    litro, pacote). Precedente real ja existente no proprio banco
--    para este mesmo tipo de ampliacao: bom_itens_unidade_chk
--    (202607070010) foi expandida para a uniao exatamente pelo mesmo
--    motivo estrutural (tabela que referencia itens_industriais de
--    tipo_item variado).
--
--    Achado real (investigacao 2026-08-31, leitura contra o banco
--    vinculado): 18/18 itens hoje elegiveis para criacao automatica de
--    OF usam unidade='unidade' — 100% dos casos reais falhariam contra
--    a constraint antiga (confirmado por uma execucao real do
--    preflight vinculado que abortou com ERRO 23514 exatamente nesta
--    constraint). Nao existe, nem existiu, nenhuma regra de conversao
--    unidade->peca em nenhum lugar do codigo ou do banco (confirmado
--    por leitura); a coincidencia de 'peca' aparecer nos dois dominios
--    nao e uma regra de negocio. barra/chapa permanecem aceitos para
--    preservar compatibilidade com o contrato legado de
--    criar_ordem_fabricacao_operacional, mesmo sem chamador ativo
--    hoje.
alter table public.ordens_fabricacao
  drop constraint ordens_fabricacao_unidade_chk;

alter table public.ordens_fabricacao
  add constraint ordens_fabricacao_unidade_chk
  check (unidade = any (array[
    'kg', 'metro', 'barra', 'chapa', 'peca',
    'conjunto', 'unidade', 'litro', 'pacote'
  ]));

comment on constraint ordens_fabricacao_unidade_chk on public.ordens_fabricacao is
  '4D0, Incremento 4: ampliada para a uniao do dominio de materia-prima (kg, metro, barra, chapa, peca) com o dominio de catalogo de Produto (conjunto, unidade, litro, pacote) -- ordens_fabricacao.unidade passa a refletir a unidade cadastral do item fabricado (itens_industriais.unidade), nao uma unidade de consumo de materia-prima. Decisao de negocio do usuario, nao inferida. Precedente: bom_itens_unidade_chk (202607070010) foi ampliada da mesma forma pelo mesmo motivo estrutural.';

-- 2. Corrige a divergência real de resolução de BOM — passa a usar
--    exclusivamente resolver_bom_ativo_produto (canônica), removendo a
--    query inline que não filtrava ativo=true nem desempatava por id.
--    CORREÇÃO (achado real, revisão do usuário): adquire aqui a MESMA
--    trava canônica do grafo de BOM que criar_ofs_de_projeto_aprovado
--    adquire mais abaixo — pela ordem alfabética real de disparo dos
--    triggers AFTER UPDATE OF status (congelar_custos antes de
--    criar_ofs_aprovado), sem essa trava aqui o congelamento resolveria
--    o BOM ANTES de qualquer proteção contra mutação concorrente do
--    grafo, podendo congelar custo com um BOM diferente do que a OF
--    (criada depois, sob a trava) acabaria usando. Advisory lock é
--    reentrante para o mesmo backend/transação — adquirir a mesma
--    chave duas vezes na mesma transação (aqui e depois em
--    criar_ofs_de_projeto_aprovado) não bloqueia nem falha.
create or replace function public.congelar_custos_projeto_interno(p_projeto_id uuid, p_empresa_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_tipo_projeto text;
  v_excluir_materia_prima boolean;
  v_item record;
  v_bom_id uuid;
  v_custo_unitario numeric;
begin
  select tipo_projeto into v_tipo_projeto
  from public.projetos
  where id = p_projeto_id
    and empresa_id = p_empresa_id;

  if not found then
    raise exception 'Projeto % nao encontrado para a empresa %.', p_projeto_id, p_empresa_id;
  end if;

  v_excluir_materia_prima := (v_tipo_projeto = 'industrializacao');

  -- Trava CANONICA do grafo de BOM — mesma chave de
  -- 202608040001_bom_subconjunto_protecao_ciclo.sql — adquirida antes
  -- da primeira resolução de BOM desta function, para que custo
  -- congelado e OF observem o mesmo estado protegido do grafo.
  perform pg_advisory_xact_lock(hashtextextended('subconjunto-grafo:' || p_empresa_id::text, 0));

  for v_item in
    select pi.id, pi.produto_id
    from public.projeto_itens pi
    where pi.projeto_id = p_projeto_id
      and pi.empresa_id = p_empresa_id
      and pi.ativo = true
      and pi.deleted_at is null
      and exists (
        select 1 from public.itens_industriais ii
        where ii.id = pi.produto_id
          and ii.empresa_id = p_empresa_id
      )
  loop
    v_bom_id := public.resolver_bom_ativo_produto(p_empresa_id, v_item.produto_id);

    v_custo_unitario := 0;

    if v_bom_id is not null then
      select t.valor into v_custo_unitario
      from public.calcular_custo_bom_interno(v_bom_id, p_empresa_id, 0, v_excluir_materia_prima) t
      where t.categoria = 'total';
    end if;

    update public.projeto_itens
    set custo_congelado = coalesce(v_custo_unitario, 0),
        custo_congelado_em = now(),
        custo_editado_manualmente = false
    where id = v_item.id
      and empresa_id = p_empresa_id;
  end loop;
end;
$$;

comment on function public.congelar_custos_projeto_interno(uuid, uuid) is
  '4D0, Incremento 4: corrigida para usar exclusivamente resolver_bom_ativo_produto (antes tinha query inline propria, sem filtrar ativo=true nem desempatar por id — podia escolher um BOM diferente do usado para criar a OF do mesmo produto). Resto da logica de congelamento inalterado.';

-- 3. criar_ofs_de_projeto_aprovado — cria uma OF-raiz por item elegivel
--    do projeto recem-aprovado. INTERNA: sem EXECUTE para nenhum papel
--    de cliente. Falha (RAISE EXCEPTION, sem handler) desfaz a
--    aprovacao inteira via propagacao natural ate abortar a transacao.
--    CORREÇÃO (achado real, revisão do usuário): defeito real de
--    produção, não só de fixture de teste — aprovar_projeto_com_
--    simulacao_v5 é SERVICE_ROLE-only (chamada sem sessão de usuário
--    real), logo auth.uid() já é NULL na aprovação real, não só no
--    preflight isolado. gerar_numero_of (via trigger
--    set_ordem_fabricacao_numero) depende de empresa_atual_id()/
--    auth.uid() para resolver a empresa — sem identidade, falharia
--    "Empresa atual nao encontrada" em produção. A correção não é no
--    caller nem em gerar_numero_of (que continua interno, coerente com
--    os demais caminhos já validados): esta function estabelece,
--    TEMPORARIAMENTE e com escopo transacional (set_config is_local=
--    true), a identidade do aprovador REAL já validado (nunca um valor
--    arbitrário), confirma que auth.uid()/empresa_atual_id() resolvem
--    exatamente o esperado, cria as OFs sob essa identidade (o que
--    também corrige a auditoria do Incremento 2: registrar_historico_
--    estado_of passa a gravar alterado_por=aprovador real e
--    origem='rpc', em vez de NULL+'operacao_administrativa'), e
--    restaura o valor anterior antes de retornar — nunca vaza a
--    identidade para nenhuma outra operação da mesma transação.
create or replace function public.criar_ofs_de_projeto_aprovado(p_projeto_id uuid, p_empresa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
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
  v_resultado jsonb := '[]'::jsonb;
begin
  -- Trava por projeto — serializa reprocessamentos concorrentes deste
  -- mesmo projeto (aprovacao vs. eventual backfill administrativo
  -- futuro chamando esta mesma function).
  perform pg_advisory_xact_lock(hashtextextended('criar_ofs_de_projeto_aprovado:' || p_projeto_id::text, 0));

  -- Trava CANONICA do grafo de BOM — mesma chave de
  -- 202608040001_bom_subconjunto_protecao_ciclo.sql — adquirida antes
  -- de resolver qualquer roteiro, para leitura consistente de
  -- resolver_bom_ativo_produto mesmo sob mutacao concorrente do grafo
  -- (troca de BOM ativo de um produto no meio da criacao das OFs).
  perform pg_advisory_xact_lock(hashtextextended('subconjunto-grafo:' || p_empresa_id::text, 0));

  select count(*) into v_qtd_vigentes
  from public.simulacoes_comerciais
  where projeto_id = p_projeto_id
    and empresa_id = p_empresa_id
    and vigente = true;

  if v_qtd_vigentes <> 1 then
    raise exception 'criar_ofs_de_projeto_aprovado: esperava exatamente 1 simulacao vigente para o projeto %, encontrado %.', p_projeto_id, v_qtd_vigentes;
  end if;

  select sc.id, sc.aprovado_por into v_snapshot_id, v_aprovado_por
  from public.simulacoes_comerciais sc
  where sc.projeto_id = p_projeto_id
    and sc.empresa_id = p_empresa_id
    and sc.vigente = true;

  select empresa_id into v_aprovador_empresa_id
  from public.usuarios
  where id = v_aprovado_por;

  if v_aprovador_empresa_id is null or v_aprovador_empresa_id is distinct from p_empresa_id then
    raise exception 'criar_ofs_de_projeto_aprovado: aprovador % do snapshot vigente % nao e um usuario valido da empresa %.', v_aprovado_por, v_snapshot_id, p_empresa_id;
  end if;

  -- Estabelece TEMPORARIAMENTE (escopo transacional, is_local=true) a
  -- identidade do aprovador ja validado acima pelo snapshot vigente —
  -- nunca um valor recebido de fora sem essa validacao. Guarda o valor
  -- anterior (tipicamente NULL, ja que aprovar_projeto_com_simulacao_v5
  -- e SERVICE_ROLE-only) para restaurar antes de retornar.
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
      v_resultado := v_resultado || jsonb_build_object(
        'projeto_item_id', v_item.projeto_item_id, 'resultado', 'ignorada', 'motivo', 'bom_nao_resolvido'
      );
      continue;
    end if;

    select id, numero_of into v_of_existente_id, v_of_existente_numero
    from public.ordens_fabricacao
    where projeto_item_id = v_item.projeto_item_id
      and of_pai_id is null;

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

    v_resultado := v_resultado || jsonb_build_object(
      'projeto_item_id', v_item.projeto_item_id, 'resultado', 'criada',
      'of_id', v_novo_of_id, 'numero_of', v_novo_numero
    );
  end loop;

  -- Restaura o valor anterior ANTES de retornar — nunca deixa a
  -- identidade impersonada vazar para nenhuma outra operacao da mesma
  -- transacao apos esta function retornar. Falha em qualquer ponto
  -- anterior (sem handler) desfaz esta atribuicao junto com tudo o
  -- resto, via rollback natural da transacao/subtransacao — nao
  -- precisa de restauracao explicita no caminho de erro.
  perform set_config('request.jwt.claim.sub', v_sub_anterior, true);

  return v_resultado;
end;
$$;

comment on function public.criar_ofs_de_projeto_aprovado(uuid, uuid) is
  '4D0, Incremento 4: cria uma OF-raiz (aguardando_auditoria+planejada) por item elegivel (ativo, produto ativo, tipo_item produto acabado/semiacabado, BOM resolvido via resolver_bom_ativo_produto) do projeto recem-aprovado. created_by = simulacoes_comerciais.aprovado_por do snapshot vigente. Estabelece essa identidade temporariamente (request.jwt.claim.sub, escopo transacional) antes de criar as OFs — necessario porque aprovar_projeto_com_simulacao_v5 e SERVICE_ROLE-only e auth.uid() e NULL nesse contexto, o que faria gerar_numero_of falhar; tambem corrige a auditoria do Incremento 2 (alterado_por=aprovador real, origem=rpc). Restaura o valor anterior antes de retornar. Exige exatamente 1 simulacao vigente com aprovador valido da empresa, senao falha e desfaz a aprovacao inteira. INTERNA: sem EXECUTE para nenhum papel de cliente, chamada so pelo trigger projetos_criar_ofs_aprovado. Nao gera necessidade, nao decide CI/CE, nao reserva/consome estoque, nao cria requisicao de compra.';

revoke all on function public.criar_ofs_de_projeto_aprovado(uuid, uuid)
  from public, anon, authenticated, service_role;

-- 4. Trigger que reage a transicao REAL de status para 'aprovado' —
--    mesmo padrao estrutural de trg_projetos_congelar_custos. Nome
--    ordena depois de "congelar_custos" alfabeticamente: dispara
--    depois do congelamento, na mesma transacao, sem dependencia
--    funcional entre os dois (cada um so precisa que o projeto exista
--    e tenha status='aprovado', nao do resultado do outro).
--    CORREÇÃO (achado real, revisão do usuário): criar_ofs_de_projeto_
--    aprovado RETURNS jsonb não pode ser usada diretamente como
--    executor de CREATE TRIGGER (Postgres exige RETURNS trigger) — por
--    isso esta function intermediária existe, só chama a interna via
--    perform e devolve NEW. Mesmo rigor de ACL da function interna:
--    search_path fixo e sem EXECUTE para nenhum papel de cliente
--    (REVOKE explícito abaixo), mesmo que não seja chamável via SELECT
--    direto por ser RETURNS trigger — consistência com o resto desta
--    migration, não deixar nenhuma privilégio implícito sem revogar.
create or replace function public.trg_projetos_criar_ofs_aprovado()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.status = 'aprovado' and old.status is distinct from 'aprovado' then
    perform public.criar_ofs_de_projeto_aprovado(new.id, new.empresa_id);
  end if;

  return new;
end;
$$;

revoke all on function public.trg_projetos_criar_ofs_aprovado()
  from public, anon, authenticated, service_role;

create trigger projetos_criar_ofs_aprovado
  after update of status on public.projetos
  for each row
  when (old.status is distinct from new.status)
  execute function trg_projetos_criar_ofs_aprovado();

comment on function public.trg_projetos_criar_ofs_aprovado() is
  '4D0, Incremento 4: dispara criar_ofs_de_projeto_aprovado quando projetos.status transiciona para aprovado (old distinto de aprovado, new=aprovado) — independe de qual RPC ou caminho futuro causou a transicao, e dos 3 RETURN antecipados de aprovar_projeto_com_simulacao_v5 que nunca alcancam este UPDATE.';

commit;
