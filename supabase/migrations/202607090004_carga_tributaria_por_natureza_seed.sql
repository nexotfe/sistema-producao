-- Fase B do modulo Orcamento - Passo 2.
-- Seed da chave 'carga_tributaria_por_natureza' em configuracoes_empresa,
-- para cada empresa ativa que ja tenha ao menos um usuario (mesmo
-- criterio de created_by usado em 202607070002).
--
-- Valores de exemplo/placeholder (nao sao aliquotas reais negociadas):
-- fabricacao e desenvolvimento repetem 14,33% (valor ja usado como mock
-- na tela); industrializacao e servico usam estimativas provisorias
-- (8,5% e 16%) - ajustar quando o usuario confirmar numeros reais.
do $$
declare
  v_empresa record;
  v_created_by uuid;
  v_valor jsonb := '{
    "fabricacao": 14.33,
    "desenvolvimento": 14.33,
    "industrializacao": 8.5,
    "servico": 16.0
  }'::jsonb;
begin
  for v_empresa in select id from public.empresas where ativo = true loop
    select id
      into v_created_by
      from public.usuarios
     where empresa_id = v_empresa.id
     order by data_criacao asc
     limit 1;

    if v_created_by is null then
      continue;
    end if;

    insert into public.configuracoes_empresa (empresa_id, chave, valor, descricao, created_by)
    values (
      v_empresa.id,
      'carga_tributaria_por_natureza',
      v_valor,
      'Carga tributaria % sugerida por Natureza do projeto (placeholder - ajustar com valores reais).',
      v_created_by
    )
    on conflict (empresa_id, chave) do nothing;
  end loop;
end
$$;
