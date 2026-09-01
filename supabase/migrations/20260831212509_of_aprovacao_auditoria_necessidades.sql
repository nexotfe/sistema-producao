-- Incremento 4D0, segunda fatia — Incremento 5/9: aprovação/reprovação/
-- resubmissão de OF pelo PCP, com geração automática e atômica de
-- necessidades de matéria-prima a partir da expansão recursiva do BOM.
--
-- Decisões desta migration (usuário, não inferidas — consolidadas ao longo
-- de 5 revisões de investigação, todas sem escrita, antes desta migration):
--
--   1. reprovar_of exige observação obrigatória, não nula e não vazia
--      depois de trim — reprovação sem motivo não é permitida.
--   2. Subconjuntos são explodidos recursivamente DENTRO da mesma OF até
--      as matérias-primas folha. of_pai_id/of_raiz_id (hierarquia já
--      aplicada no 4D0-A) permanece reservado exclusivamente à divisão de
--      LOTE da mesma peça (confirmado lendo validar_hierarquia_of: compara
--      soma(quantidade_planejada das filhas) contra a quantidade_planejada
--      da mãe — é conservação de quantidade do MESMO produto, não
--      decomposição de estrutura) — nunca à estrutura de produto.
--   3. aprovar_of é idempotente SOMENTE para o par (aprovada, planejada):
--      retorna 'ja_aprovada', não faz UPDATE, não gera necessidade de novo,
--      não incrementa capacidade. Qualquer estado fora de
--      (aguardando_auditoria, planejada) é erro de transição — sem
--      exceção para NULL em nenhuma das duas colunas (ver nota null-safe
--      abaixo).
--   4. Não existe nesta fatia o fluxo "aprovada → reprovada → reaprovação".
--      Uma OF inicialmente reprovada pode ser resubmetida e então aprovada
--      pela primeira vez. Ao aprovar uma OF pendente, qualquer necessidade
--      'bom_expansao' já existente para ela é violação de invariante —
--      erro explícito, nunca ignorada nem versionada por cima em silêncio.
--   5. Escrita direta em necessidades_of_material é fechada nesta migration.
--      Auditoria completa (leitura, antes desta migration) confirmou: só 4
--      triggers tocam a tabela (avancar_versao_necessidade,
--      forcar_created_by_necessidade, impedir_alteracao_necessidade_imutavel,
--      validar_cadeia_versao_necessidade — nenhum grava fora dela, nenhum
--      referencia empresa_capacidade_versoes); nenhuma RPC nem função legada
--      escreve nela hoje; único dependente real é
--      requisicao_compra_itens.necessidade_id (FK nullable, leitor futuro,
--      não escritor). REVOKE ALL para public/anon/authenticated/
--      service_role, GRANT SELECT só para authenticated — toda escrita
--      futura passa a exigir gerar_necessidades_de_of.
--
-- Achado real que fecha a questão de unidade em subconjunto (investigação,
-- leitura contra o banco vinculado, 2026-08-31): os 5 bom_itens.
-- componente_tipo='subconjunto' reais em produção têm bom_itens.unidade=
-- 'peca' em TODOS os casos, contra unidade do item filho = 'unidade' (4
-- casos) ou 'metro' (1 caso) — 5 de 5 incompatíveis, e
-- converter_para_unidade_base não tem par peca↔unidade nem peca↔metro.
-- calcular_custo_bom_interno (já em produção) nunca converte nesse nível,
-- só multiplica quantidade × custo do filho. Conclusão: bom_itens.
-- quantidade em linha de subconjunto é contador de instâncias/peças
-- incorporadas à mãe, não uma grandeza física a converter — a expansão
-- recursiva desta migration NUNCA chama converter_para_unidade_base no
-- nível de subconjunto, só multiplica. A conversão permanece obrigatória
-- exclusivamente nas folhas de matéria-prima.
--
-- Null-safety (achado real, revisão do usuário): estado_aprovacao e
-- estado_execucao são colunas NULLABLE. Comparação com "=" e "AND" em
-- PL/pgSQL produz NULL quando qualquer lado é NULL, e "IF NULL" nunca
-- entra no bloco — uma checagem escrita com "=" deixaria um estado NULL
-- escapar de qualquer validação. Toda comparação de estado nesta migration
-- usa IS DISTINCT FROM (para decidir erro) ou IS NOT DISTINCT FROM (para
-- decidir idempotência) — nunca "=" puro. O gate de papel usa
-- coalesce(usuario_e_admin(), false) OR coalesce(usuario_tem_papel_
-- funcional('pcp'), false) pelo mesmo motivo (as duas funções podem, em
-- tese, devolver NULL).
--
-- Isolamento entre empresas sem vazamento temporal pelo advisory lock
-- (achado real, revisão do usuário): advisory lock é GLOBAL ao banco, não
-- respeita RLS nem tenant. Adquirir a chave 'of-transicao:'||of_id ANTES
-- de confirmar que a OF pertence à empresa do chamador vazaria, por
-- timing, que "alguém está mexendo nesse id agora" a quem nem deveria
-- saber que ele existe. Ordem obrigatória em aprovar_of/reprovar_of/
-- resubmeter_of_para_auditoria: (1) valida sessão/empresa/papel; (2)
-- busca a OF filtrando id+empresa_id, SEM lock ainda — não encontrada é
-- erro genérico "OF não encontrada" (nunca revela "existe em outra
-- empresa"); (3) só então adquire o advisory lock; (4) relê a OF sob o
-- lock, mesmo filtro id+empresa_id — a decisão de transição usa SEMPRE
-- esta segunda leitura, nunca a primeira (que só serviu para
-- existência/posse antes do lock).
--
-- Lock canônico do grafo de BOM ('subconjunto-grafo:'||empresa_id, mesma
-- chave de 202608040001_bom_subconjunto_protecao_ciclo.sql e do
-- Incremento 4) é adquirido tanto em aprovar_of (antes do UPDATE) quanto,
-- de novo, dentro de gerar_necessidades_de_of — reentrante para o mesmo
-- backend/transação, defesa própria da função interna para o caso de uma
-- futura chamada que não passe por aprovar_of.
--
-- UPDATE das 3 transições sempre inclui o estado esperado no próprio
-- WHERE (nunca só "SELECT antes, UPDATE depois" como única proteção) e
-- valida ROW_COUNT=1 via GET DIAGNOSTICS, mesmo já estando sob o advisory
-- lock — defesa contra qualquer escrita direta privilegiada que bypasse a
-- RPC (ex.: conexão administrativa futura tocando a linha sem passar pelo
-- lock).
--
-- Fora de escopo, confirmado por leitura do código legado: nenhuma RPC
-- desta migration chama processar_necessidade_material, registrar_
-- consumo_interno ou registrar_requisicao_compra_material — decisão CI/CE,
-- reserva/consumo de estoque e requisição de compra continuam
-- inteiramente fora desta fatia.
--
-- Arquivo inteiro é uma transação.

begin;

-- 1. Fecha a escrita direta em necessidades_of_material. Auditoria (leitura,
--    antes desta migration) confirmou ausência de consumidor legítimo além
--    dos 4 triggers já existentes na própria tabela — nenhuma RPC, função
--    legada ou view escreve nela hoje.
revoke all on public.necessidades_of_material from public, anon, authenticated, service_role;
grant select on public.necessidades_of_material to authenticated;

-- CORREÇÃO (achado real, revisão do usuário): REVOKE ALL ON TABLE não
-- remove privilégio concedido diretamente por COLUNA. Auditoria (leitura,
-- antes desta migration) encontrou pg_attribute.attacl não-nulo em 3
-- colunas (ativo, deleted_at, deleted_by) — authenticated tinha UPDATE
-- explícito nelas, herdado de outra migration/padrão de soft-delete,
-- nunca revogado. Loop dinâmico cobre TODAS as colunas atuais da tabela,
-- não só as 3 encontradas hoje — nenhum privilégio de coluna sobrevive
-- ao REVOKE, para nenhum dos 4 papéis, em nenhuma coluna presente ou
-- futura desta migration em diante.
do $$
declare
  v_col record;
begin
  for v_col in
    select attname from pg_attribute
    where attrelid = 'public.necessidades_of_material'::regclass
      and attnum > 0 and not attisdropped
  loop
    execute format(
      'revoke all (%I) on public.necessidades_of_material from public, anon, authenticated, service_role',
      v_col.attname
    );
  end loop;
end $$;

comment on table public.necessidades_of_material is
  '4D0, Incremento 5: escrita direta fechada — REVOKE ALL de public/anon/authenticated/service_role (tabela E colunas, achado real: 3 colunas tinham ACL direto que REVOKE ALL ON TABLE não alcança), GRANT SELECT só para authenticated. Toda escrita passa a exigir gerar_necessidades_de_of (interna, chamada só por aprovar_of).';

-- 2. expandir_bom_recursivo — função auxiliar interna. Percorre o BOM em
--    profundidade, devolvendo uma linha por ocorrência de matéria-prima
--    folha em toda a árvore (pode repetir materia_prima_id se o mesmo
--    material aparecer em ramos diferentes — a agregação por SQL fica a
--    cargo de gerar_necessidades_de_of, via GROUP BY). Nunca reescreve a
--    query inline divergente que calcular_custo_bom_interno ainda usa
--    (dívida registrada à parte, não tocada aqui) — resolve todo BOM filho
--    exclusivamente via resolver_bom_ativo_produto.
create or replace function public.expandir_bom_recursivo(
  p_bom_id uuid,
  p_empresa_id uuid,
  p_quantidade_pai numeric,
  p_profundidade integer
)
returns table(materia_prima_id uuid, quantidade numeric)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_item record;
  v_bom_filho uuid;
begin
  if p_profundidade > 20 then
    raise exception 'expandir_bom_recursivo: profundidade maxima de estrutura (BOM) excedida no bom % - possivel referencia circular.', p_bom_id;
  end if;

  -- Nunca confia que p_bom_id pertence a p_empresa_id por construcao —
  -- checagem explicita, mesmo sendo funcao interna.
  if not exists (
    select 1 from public.boms
    where id = p_bom_id and empresa_id = p_empresa_id and deleted_at is null
  ) then
    raise exception 'expandir_bom_recursivo: bom % nao encontrado para a empresa %.', p_bom_id, p_empresa_id;
  end if;

  -- Defesa sobre o valor PROPAGADO (nao sobre bom_itens.quantidade, que ja
  -- tem CHECK > 0 no schema) — protege contra degeneracao da multiplicacao
  -- em cadeia ao longo da recursao.
  if p_quantidade_pai is null or p_quantidade_pai <= 0 then
    raise exception 'expandir_bom_recursivo: quantidade propagada invalida (%) para o bom %.', p_quantidade_pai, p_bom_id;
  end if;

  -- Folhas de materia-prima: conversao de unidade OBRIGATORIA aqui —
  -- unico nivel onde bom_itens.unidade representa uma grandeza fisica
  -- real a converter contra a unidade da propria materia-prima.
  for v_item in
    select bi.materia_prima_id, bi.quantidade, bi.unidade,
           mp.unidade as unidade_materia_prima
    from public.bom_itens bi
    join public.materias_primas mp
      on mp.id = bi.materia_prima_id and mp.empresa_id = bi.empresa_id
    where bi.bom_id = p_bom_id
      and bi.empresa_id = p_empresa_id
      and bi.componente_tipo = 'materia_prima'
      and bi.ativo = true
      and bi.deleted_at is null
  loop
    if v_item.quantidade is null or v_item.quantidade <= 0 then
      raise exception 'expandir_bom_recursivo: quantidade de materia-prima invalida no bom %.', p_bom_id;
    end if;

    materia_prima_id := v_item.materia_prima_id;
    quantidade := p_quantidade_pai * public.converter_para_unidade_base(
      v_item.quantidade, v_item.unidade, v_item.unidade_materia_prima
    );
    return next;
  end loop;

  -- Subconjuntos: SEM conversao de unidade (achado real documentado no
  -- cabecalho desta migration) — bom_itens.quantidade e contador de
  -- instancias/pecas incorporadas a mae, multiplicacao direta.
  for v_item in
    select bi.componente_produto_id, bi.quantidade
    from public.bom_itens bi
    where bi.bom_id = p_bom_id
      and bi.empresa_id = p_empresa_id
      and bi.componente_tipo = 'subconjunto'
      and bi.ativo = true
      and bi.deleted_at is null
  loop
    if v_item.quantidade is null or v_item.quantidade <= 0 then
      raise exception 'expandir_bom_recursivo: quantidade de subconjunto invalida no bom %.', p_bom_id;
    end if;

    v_bom_filho := public.resolver_bom_ativo_produto(p_empresa_id, v_item.componente_produto_id);
    if v_bom_filho is null then
      raise exception 'expandir_bom_recursivo: subconjunto % sem BOM ativo resolvido.', v_item.componente_produto_id;
    end if;

    return query
      select * from public.expandir_bom_recursivo(
        v_bom_filho, p_empresa_id, p_quantidade_pai * v_item.quantidade, p_profundidade + 1
      );
  end loop;
end;
$$;

comment on function public.expandir_bom_recursivo(uuid, uuid, numeric, integer) is
  '4D0, Incremento 5: expande recursivamente um BOM ate as materias-primas folha, devolvendo uma linha por ocorrencia (agregacao por SQL fica a cargo do chamador). Converte unidade via converter_para_unidade_base SOMENTE nas folhas de materia-prima; subconjuntos nunca convertem (quantidade e contador de instancias, achado real documentado na migration). Guarda de profundidade maxima 20 contra ciclo. INTERNA: sem EXECUTE para nenhum papel de cliente.';

revoke all on function public.expandir_bom_recursivo(uuid, uuid, numeric, integer)
  from public, anon, authenticated, service_role;

-- 3. gerar_necessidades_de_of — cria as necessidades de materia-prima da
--    OF, agregadas por materia-prima, a partir da expansao recursiva do
--    seu BOM. INTERNA: sem EXECUTE para nenhum papel de cliente. Falha
--    (RAISE EXCEPTION, sem handler) desfaz a aprovacao inteira via
--    propagacao natural ate abortar a transacao — chamada so por
--    aprovar_of, depois do UPDATE que aprova a OF.
create or replace function public.gerar_necessidades_de_of(p_of_id uuid, p_empresa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid uuid;
  v_aprovador uuid;
  v_of_produto uuid;
  v_of_qtd numeric;
  v_of_bom uuid;
  v_of_estado_aprovacao text;
  v_of_estado_execucao text;
  v_qtd_inserida integer;
begin
  -- auth.uid() nao atravessa fronteira de chamada entre funcoes PL/pgSQL —
  -- precisa ser lido de novo aqui, nao reaproveitado de aprovar_of.
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'gerar_necessidades_de_of: sessao invalida (auth.uid() nulo).';
  end if;

  select produto_id, quantidade_planejada, bom_id,
         estado_aprovacao, estado_execucao, estado_aprovacao_por
    into v_of_produto, v_of_qtd, v_of_bom,
         v_of_estado_aprovacao, v_of_estado_execucao, v_aprovador
  from public.ordens_fabricacao
  where id = p_of_id and empresa_id = p_empresa_id;

  if not found then
    raise exception 'gerar_necessidades_de_of: OF % nao encontrada na empresa %.', p_of_id, p_empresa_id;
  end if;

  -- Exige aprovada+planejada — null-safe. Esta funcao so faz sentido
  -- chamada logo apos o UPDATE de aprovar_of.
  if v_of_estado_aprovacao is distinct from 'aprovada'
     or v_of_estado_execucao is distinct from 'planejada' then
    raise exception 'gerar_necessidades_de_of: OF % nao esta aprovada+planejada (veio %/%).', p_of_id, v_of_estado_aprovacao, v_of_estado_execucao;
  end if;

  if v_of_qtd is null or v_of_qtd <= 0 then
    raise exception 'gerar_necessidades_de_of: quantidade_planejada invalida (%) na OF %.', v_of_qtd, p_of_id;
  end if;

  -- A identidade que gera a necessidade deve ser a MESMA que acabou de
  -- aprovar a OF (aprovar_of ja gravou estado_aprovacao_por=v_uid antes de
  -- chamar esta funcao).
  if v_aprovador is distinct from v_uid then
    raise exception 'gerar_necessidades_de_of: auth.uid() (%) diverge de estado_aprovacao_por (%) da OF %.', v_uid, v_aprovador, p_of_id;
  end if;

  if v_of_bom is null then
    raise exception 'gerar_necessidades_de_of: OF % nao tem BOM resolvido.', p_of_id;
  end if;

  -- BOM raiz pertence a mesma empresa E ao mesmo produto_id da OF — nao
  -- confia que ordens_fabricacao.bom_id ja esta correto por construcao.
  if not exists (
    select 1 from public.boms
    where id = v_of_bom and empresa_id = p_empresa_id and produto_id = v_of_produto and deleted_at is null
  ) then
    raise exception 'gerar_necessidades_de_of: BOM % nao pertence ao produto % da empresa % (OF %).', v_of_bom, v_of_produto, p_empresa_id, p_of_id;
  end if;

  -- Trava CANONICA do grafo de BOM — reentrante para o mesmo
  -- backend/transacao (aprovar_of ja a adquire antes do UPDATE); defesa
  -- propria desta funcao para uma eventual chamada futura que nao passe
  -- por aprovar_of.
  perform pg_advisory_xact_lock(hashtextextended('subconjunto-grafo:' || p_empresa_id::text, 0));

  -- Invariante: nao pode existir NENHUMA necessidade bom_expansao previa
  -- para esta OF — nao ha fluxo de reaprovacao nesta fatia (decisao 4).
  if exists (
    select 1 from public.necessidades_of_material
    where of_id = p_of_id and empresa_id = p_empresa_id and origem_logica = 'bom_expansao'
  ) then
    raise exception 'gerar_necessidades_de_of: invariante violada - ja existe necessidade bom_expansao para a OF %.', p_of_id;
  end if;

  -- Aliases explicitos em todo o SELECT — evita ambiguidade com as
  -- colunas de saida de expandir_bom_recursivo (materia_prima_id,
  -- quantidade tambem sao nomes de coluna la).
  insert into public.necessidades_of_material (
    empresa_id, of_id, materia_prima_id, origem_logica, versao,
    versao_anterior_id, quantidade_necessaria, created_by
  )
  select
    p_empresa_id                 as empresa_id,
    p_of_id                      as of_id,
    expandido.materia_prima_id   as materia_prima_id,
    'bom_expansao'                as origem_logica,
    1                              as versao,
    null::uuid                    as versao_anterior_id,
    sum(expandido.quantidade)     as quantidade_necessaria,
    v_uid                         as created_by
  from public.expandir_bom_recursivo(v_of_bom, p_empresa_id, v_of_qtd, 0) as expandido
  group by expandido.materia_prima_id;

  get diagnostics v_qtd_inserida = row_count;
  if v_qtd_inserida = 0 then
    raise exception 'gerar_necessidades_de_of: OF % nao gerou nenhuma necessidade de materia-prima - arvore de BOM vazia ou so subconjuntos sem folha.', p_of_id;
  end if;

  return jsonb_build_object('necessidades_criadas', v_qtd_inserida);
end;
$$;

comment on function public.gerar_necessidades_de_of(uuid, uuid) is
  '4D0, Incremento 5: gera as necessidades de materia-prima da OF (origem_logica=bom_expansao, versao 1), agregadas por materia-prima a partir da expansao recursiva do BOM. Exige OF aprovada+planejada, quantidade_planejada>0, identidade=estado_aprovacao_por, BOM pertencente ao mesmo produto/empresa, ausencia de necessidade bom_expansao previa (invariante — nao ha reaprovacao nesta fatia) e pelo menos 1 materia-prima folha. INTERNA: sem EXECUTE para nenhum papel de cliente, chamada so por aprovar_of. Nao decide CI/CE, nao reserva/consome estoque, nao cria requisicao de compra.';

revoke all on function public.gerar_necessidades_de_of(uuid, uuid)
  from public, anon, authenticated, service_role;

-- 4. aprovar_of — chamavel pelo cliente (PCP/admin). Idempotente somente
--    para (aprovada, planejada). Ordem null-safe e sem vazamento temporal
--    pelo advisory lock cross-tenant (ver cabecalho da migration).
create or replace function public.aprovar_of(p_of_id uuid, p_observacao text default null)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid uuid;
  v_empresa_id uuid;
  v_of record;
  v_rows integer;
  v_necessidades jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'aprovar_of: sessao invalida.';
  end if;

  v_empresa_id := public.empresa_atual_id();
  if v_empresa_id is null then
    raise exception 'aprovar_of: empresa atual nao encontrada.';
  end if;

  if not (coalesce(public.usuario_e_admin(), false) or coalesce(public.usuario_tem_papel_funcional('pcp'), false)) then
    raise exception 'aprovar_of: usuario sem permissao para aprovar OF.';
  end if;

  -- Busca filtrada por id+empresa_id, SEM lock ainda — nunca associa o
  -- advisory lock a um of_id antes de confirmar que ele pertence a este
  -- tenant (evita vazamento temporal pelo lock, que e global ao banco).
  perform 1 from public.ordens_fabricacao where id = p_of_id and empresa_id = v_empresa_id;
  if not found then
    raise exception 'aprovar_of: OF nao encontrada.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_id::text, 0));

  -- Rele a OF sob o lock — a decisao de transicao usa SEMPRE esta
  -- segunda leitura, nunca a primeira.
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

  v_necessidades := public.gerar_necessidades_de_of(p_of_id, v_empresa_id);

  return jsonb_build_object(
    'resultado', 'aprovada', 'of_id', p_of_id, 'numero_of', v_of.numero_of,
    'necessidades', v_necessidades
  );
end;
$$;

comment on function public.aprovar_of(uuid, text) is
  '4D0, Incremento 5: aprova uma OF em aguardando_auditoria+planejada (gate PCP/admin), gera necessidades de materia-prima atomicamente (gerar_necessidades_de_of, mesma transacao, sem handler). Idempotente SOMENTE para aprovada+planejada (retorna ja_aprovada, sem efeito colateral). Qualquer outro estado e erro de transicao. Comparacoes de estado null-safe (IS DISTINCT FROM). Advisory lock of-transicao:<id> compartilhado com reprovar_of/resubmeter_of_para_auditoria; lock subconjunto-grafo:<empresa> antes do UPDATE. UPDATE inclui o estado esperado no WHERE e valida ROW_COUNT=1.';

revoke all on function public.aprovar_of(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.aprovar_of(uuid, text) to authenticated;

-- 5. reprovar_of — chamavel pelo cliente. Sem caminho idempotente (decisao
--    4: nao ha fluxo de reaprovacao nesta fatia).
create or replace function public.reprovar_of(p_of_id uuid, p_observacao text)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid uuid;
  v_empresa_id uuid;
  v_of record;
  v_rows integer;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'reprovar_of: sessao invalida.';
  end if;

  v_empresa_id := public.empresa_atual_id();
  if v_empresa_id is null then
    raise exception 'reprovar_of: empresa atual nao encontrada.';
  end if;

  if not (coalesce(public.usuario_e_admin(), false) or coalesce(public.usuario_tem_papel_funcional('pcp'), false)) then
    raise exception 'reprovar_of: usuario sem permissao para reprovar OF.';
  end if;

  if p_observacao is null or length(trim(p_observacao)) = 0 then
    raise exception 'reprovar_of: observacao obrigatoria para reprovar uma OF.';
  end if;

  perform 1 from public.ordens_fabricacao where id = p_of_id and empresa_id = v_empresa_id;
  if not found then
    raise exception 'reprovar_of: OF nao encontrada.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_id::text, 0));

  select * into v_of from public.ordens_fabricacao where id = p_of_id and empresa_id = v_empresa_id;
  if not found then
    raise exception 'reprovar_of: OF nao encontrada.';
  end if;

  if v_of.estado_aprovacao is distinct from 'aguardando_auditoria'
     or v_of.estado_execucao is distinct from 'planejada' then
    raise exception 'reprovar_of: transicao invalida - OF % em %/%.', v_of.numero_of, v_of.estado_aprovacao, v_of.estado_execucao;
  end if;

  update public.ordens_fabricacao
    set estado_aprovacao = 'reprovada',
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
    raise exception 'reprovar_of: falha ao reprovar OF % - estado mudou durante a operacao.', p_of_id;
  end if;

  return jsonb_build_object('resultado', 'reprovada', 'of_id', p_of_id, 'numero_of', v_of.numero_of);
end;
$$;

comment on function public.reprovar_of(uuid, text) is
  '4D0, Incremento 5: reprova uma OF em aguardando_auditoria+planejada (gate PCP/admin), exige observacao obrigatoria e nao vazia. Sem caminho idempotente. Comparacoes de estado null-safe. Advisory lock of-transicao:<id> compartilhado com aprovar_of/resubmeter_of_para_auditoria. UPDATE inclui o estado esperado no WHERE e valida ROW_COUNT=1.';

revoke all on function public.reprovar_of(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reprovar_of(uuid, text) to authenticated;

-- 6. resubmeter_of_para_auditoria — chamavel pelo cliente. Sem caminho
--    idempotente.
create or replace function public.resubmeter_of_para_auditoria(p_of_id uuid, p_observacao text default null)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid uuid;
  v_empresa_id uuid;
  v_of record;
  v_rows integer;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'resubmeter_of_para_auditoria: sessao invalida.';
  end if;

  v_empresa_id := public.empresa_atual_id();
  if v_empresa_id is null then
    raise exception 'resubmeter_of_para_auditoria: empresa atual nao encontrada.';
  end if;

  if not (coalesce(public.usuario_e_admin(), false) or coalesce(public.usuario_tem_papel_funcional('pcp'), false)) then
    raise exception 'resubmeter_of_para_auditoria: usuario sem permissao.';
  end if;

  perform 1 from public.ordens_fabricacao where id = p_of_id and empresa_id = v_empresa_id;
  if not found then
    raise exception 'resubmeter_of_para_auditoria: OF nao encontrada.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_id::text, 0));

  select * into v_of from public.ordens_fabricacao where id = p_of_id and empresa_id = v_empresa_id;
  if not found then
    raise exception 'resubmeter_of_para_auditoria: OF nao encontrada.';
  end if;

  if v_of.estado_aprovacao is distinct from 'reprovada'
     or v_of.estado_execucao is distinct from 'planejada' then
    raise exception 'resubmeter_of_para_auditoria: transicao invalida - OF % em %/%.', v_of.numero_of, v_of.estado_aprovacao, v_of.estado_execucao;
  end if;

  update public.ordens_fabricacao
    set estado_aprovacao = 'aguardando_auditoria',
        estado_execucao = 'planejada',
        estado_aprovacao_em = now(),
        estado_aprovacao_por = v_uid,
        estado_aprovacao_observacao = p_observacao
    where id = p_of_id
      and empresa_id = v_empresa_id
      and estado_aprovacao = 'reprovada'
      and estado_execucao = 'planejada';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'resubmeter_of_para_auditoria: falha ao resubmeter OF % - estado mudou durante a operacao.', p_of_id;
  end if;

  return jsonb_build_object('resultado', 'aguardando_auditoria', 'of_id', p_of_id, 'numero_of', v_of.numero_of);
end;
$$;

comment on function public.resubmeter_of_para_auditoria(uuid, text) is
  '4D0, Incremento 5: resubmete uma OF reprovada+planejada para aguardando_auditoria+planejada (gate PCP/admin). Sem caminho idempotente. Comparacoes de estado null-safe. Advisory lock of-transicao:<id> compartilhado com aprovar_of/reprovar_of. UPDATE inclui o estado esperado no WHERE e valida ROW_COUNT=1.';

revoke all on function public.resubmeter_of_para_auditoria(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resubmeter_of_para_auditoria(uuid, text) to authenticated;

commit;
