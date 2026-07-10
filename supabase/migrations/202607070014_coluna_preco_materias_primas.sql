-- Adiciona a coluna "preco" (custo_referencia) na configuracao ja
-- persistida de /estoque/materias-primas para cada empresa que ja tenha
-- essa chave configurada (seed original nao incluia essa coluna).
-- Idempotente: só adiciona quando "preco" ainda nao existe no array.
update configuracoes_empresa
set valor = valor || jsonb_build_array(
  jsonb_build_object(
    'field', 'preco',
    'label', 'Preço',
    'visible', true,
    'order', (
      select coalesce(max((elem->>'order')::int), 0) + 1
      from jsonb_array_elements(valor) as elem
    )
  )
)
where chave = 'colunas_materias_primas'
  and not exists (
    select 1
    from jsonb_array_elements(valor) as elem
    where elem->>'field' = 'preco'
  );
