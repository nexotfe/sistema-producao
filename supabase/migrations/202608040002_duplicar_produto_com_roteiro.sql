begin;

-- Duplicar produto com roteiro: cria um produto novo e uma copia
-- independente do roteiro (BOM) resolvido do produto de origem -
-- materiais, operacoes, vinculos com subconjuntos, servicos de
-- terceiros e transportes. Produto e roteiro originais nunca sao
-- alterados. Produtos usados como subconjunto NUNCA sao duplicados
-- recursivamente - o novo roteiro aponta para os MESMOS produtos-
-- subconjunto ja existentes (apenas as linhas/vinculos sao copiadas).
--
-- Decisoes de negocio aprovadas (auditoria previa desta mesma sessao):
--   1. Campos do produto copiados: descricao, unidade, tipo_item,
--      codigo_ncm, familia, classificacao, recomendacao_fiscal,
--      observacoes. NAO copiados: codigo_ean_gtin, pn/tipo (legado),
--      pdf_tecnico_path/pdf_tecnico_nome, referencia_arquivo_externo,
--      caminho_engenharia, revisao_desenho, valor_referencia -
--      documentos/identificadores/valores pertencem especificamente
--      ao produto novo.
--   2. Codigo novo: digitado manualmente, obrigatorio (validado pelo
--      cliente/tela; aqui so garantimos que nao seja vazio) - a
--      unicidade real e' o indice UNIQUE(empresa_id, codigo), nao uma
--      consulta previa (duas chamadas concorrentes passariam pela
--      consulta simultaneamente).
--   3. Duplo clique: sem estrutura de idempotencia nova - botao
--      desabilitado durante a chamada (camada de tela) + indice unico
--      como protecao definitiva + unique_violation tratada aqui com
--      mensagem clara.
--   4. Produto sem roteiro (resolver_bom_ativo_produto retorna null):
--      bloqueia a duplicacao inteira - "Novo produto" ja cobre o caso
--      de cadastro vazio.
--   5. Materia-prima excluida (deleted_at not null) referenciada por
--      uma linha de bom_itens nao excluida: bloqueia toda a
--      duplicacao e informa quais materiais. EXTENSAO adotada (mesma
--      logica, nao pedida explicitamente mas do mesmo principio):
--      produto-subconjunto excluido tambem bloqueia e informa quais -
--      o gatilho trg_bom_itens_validar_ciclo so verifica se o
--      subconjunto TEM BOM resolvivel, nao se o PRODUTO em si foi
--      excluido (sao propriedades independentes no schema atual).
--   6. Novo BOM sempre nasce status='rascunho', ativo=true, versao='A'
--      - nunca herda o status do original sem revisao humana.
--   7. revisoes_itens, produto_saldos, produto_movimentacoes,
--      ordens_fabricacao, projeto_itens ficam inteiramente fora -
--      nunca lidos nem escritos por esta function.
--
-- Complementos do contrato: copia bom_transportes; copia somente
-- linhas com deleted_at is null; preserva o valor de ativo das linhas
-- copiadas (a tela hoje ja exibe linhas ativo=false sem filtrar);
-- preserva vinculos a materias-primas/recursos/fornecedores/produtos-
-- subconjunto (nunca duplicados); gera ids e auditoria (created_by/
-- created_at/updated_at) novos; empresa sempre derivada da sessao via
-- empresa_atual_id() - nunca recebida como parametro do cliente.
--
-- SECURITY INVOKER (padrao, nao definer) - mesmo padrao de
-- registrar_revisao_item: roda com as RLS policies do usuario que
-- chama, sem privilegio elevado. Uma unica function = uma unica
-- transacao do ponto de vista do chamador - qualquer erro desfaz tudo
-- (produto + roteiro), nunca cria so uma parte.
--
-- Rollback (referencia, nao executado por este arquivo):
--   drop function if exists public.duplicar_produto_com_roteiro(uuid, text);

create or replace function public.duplicar_produto_com_roteiro(
  p_produto_origem_id uuid,
  p_novo_codigo text
) returns uuid
language plpgsql
as $function$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_produto_origem_existe boolean;
  v_bom_origem_id uuid;
  v_produto_novo_id uuid;
  v_bom_novo_id uuid;
  v_materiais_invalidos text;
  v_subconjuntos_invalidos text;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual não encontrada.';
  end if;

  if p_novo_codigo is null or btrim(p_novo_codigo) = '' then
    raise exception 'Código do novo produto é obrigatório.';
  end if;

  select exists(
    select 1 from public.itens_industriais
    where id = p_produto_origem_id
      and empresa_id = v_empresa_id
      and deleted_at is null
  ) into v_produto_origem_existe;

  if not v_produto_origem_existe then
    raise exception 'Produto de origem não encontrado.';
  end if;

  v_bom_origem_id := public.resolver_bom_ativo_produto(v_empresa_id, p_produto_origem_id);

  if v_bom_origem_id is null then
    raise exception 'Este produto não possui roteiro para duplicação. Use "Novo produto" para criar somente o cadastro.';
  end if;

  select string_agg(distinct mp.codigo, ', ' order by mp.codigo) into v_materiais_invalidos
    from public.bom_itens bi
    join public.materias_primas mp on mp.id = bi.materia_prima_id
    where bi.bom_id = v_bom_origem_id
      and bi.componente_tipo = 'materia_prima'
      and bi.deleted_at is null
      and mp.deleted_at is not null;

  if v_materiais_invalidos is not null then
    raise exception 'Não é possível duplicar: as seguintes matérias-primas do roteiro foram excluídas: %.', v_materiais_invalidos;
  end if;

  select string_agg(distinct ii.codigo, ', ' order by ii.codigo) into v_subconjuntos_invalidos
    from public.bom_itens bi
    join public.itens_industriais ii on ii.id = bi.componente_produto_id
    where bi.bom_id = v_bom_origem_id
      and bi.componente_tipo = 'subconjunto'
      and bi.deleted_at is null
      and ii.deleted_at is not null;

  if v_subconjuntos_invalidos is not null then
    raise exception 'Não é possível duplicar: os seguintes produtos-subconjunto do roteiro foram excluídos: %.', v_subconjuntos_invalidos;
  end if;

  insert into public.itens_industriais (
    empresa_id, codigo, descricao, tipo_item, unidade, codigo_ncm,
    familia, classificacao, recomendacao_fiscal, observacoes,
    ativo, created_by
  )
  select
    v_empresa_id,
    btrim(p_novo_codigo),
    descricao, tipo_item, unidade, codigo_ncm,
    familia, classificacao, recomendacao_fiscal, observacoes,
    true, auth.uid()
  from public.itens_industriais
  where id = p_produto_origem_id
  returning id into v_produto_novo_id;

  insert into public.boms (empresa_id, produto_id, versao, status, ativo, created_by)
  values (v_empresa_id, v_produto_novo_id, 'A', 'rascunho', true, auth.uid())
  returning id into v_bom_novo_id;

  insert into public.bom_itens (
    bom_id, empresa_id, materia_prima_id, componente_produto_id, componente_tipo,
    quantidade, unidade, nivel, ordem, observacoes, dimensoes, ativo, created_by
  )
  select
    v_bom_novo_id, v_empresa_id, materia_prima_id, componente_produto_id, componente_tipo,
    quantidade, unidade, nivel, ordem, observacoes, dimensoes, ativo, auth.uid()
  from public.bom_itens
  where bom_id = v_bom_origem_id
    and deleted_at is null;

  insert into public.bom_operacoes (
    empresa_id, bom_id, ordem, descricao, tecnologia_aplicada_id,
    tempo_estimado_minutos, observacoes, ativo, recurso_produtivo_id, tipo, created_by
  )
  select
    v_empresa_id, v_bom_novo_id, ordem, descricao, tecnologia_aplicada_id,
    tempo_estimado_minutos, observacoes, ativo, recurso_produtivo_id, tipo, auth.uid()
  from public.bom_operacoes
  where bom_id = v_bom_origem_id
    and deleted_at is null;

  insert into public.bom_servicos_terceiros (
    empresa_id, bom_id, ordem, descricao, fornecedor_id, custo_estimado,
    prazo_estimado_dias, observacoes, ativo, created_by
  )
  select
    v_empresa_id, v_bom_novo_id, ordem, descricao, fornecedor_id, custo_estimado,
    prazo_estimado_dias, observacoes, ativo, auth.uid()
  from public.bom_servicos_terceiros
  where bom_id = v_bom_origem_id
    and deleted_at is null;

  insert into public.bom_transportes (
    empresa_id, bom_id, ordem, descricao, fornecedor_id, custo_estimado,
    observacoes, ativo, created_by
  )
  select
    v_empresa_id, v_bom_novo_id, ordem, descricao, fornecedor_id, custo_estimado,
    observacoes, ativo, auth.uid()
  from public.bom_transportes
  where bom_id = v_bom_origem_id
    and deleted_at is null;

  return v_produto_novo_id;
exception
  when unique_violation then
    raise exception 'Já existe um produto com o código "%". Escolha outro código.', btrim(p_novo_codigo);
end;
$function$;

comment on function public.duplicar_produto_com_roteiro is
  'Duplica um produto e o roteiro (BOM) resolvido da origem - materiais, operações, vínculos com subconjuntos (não duplicados recursivamente), serviços de terceiros e transportes. Tudo ou nada: qualquer erro desfaz a duplicação inteira.';

revoke execute on function public.duplicar_produto_com_roteiro(uuid, text) from public, anon;
grant execute on function public.duplicar_produto_com_roteiro(uuid, text) to authenticated;

commit;
