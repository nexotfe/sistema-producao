-- Colunas configuráveis por empresa — piloto em Matérias-Primas.
-- Reaproveita a tabela public.configuracoes_empresa (criada na migration
-- 202607070001, nesta mesma sessão) para semear, em cada empresa ativa
-- que já tenha ao menos um usuário, uma linha com a chave
-- 'colunas_materias_primas' documentando explicitamente o estado atual
-- das colunas (label, visível, ordem) da tela /estoque/materias-primas.
--
-- Correção: a versão anterior deste arquivo assumia colunas de
-- public.usuarios que não existem no remoto real (auth_user_id, ativo,
-- created_at). A estrutura real confirmada via psql é:
-- id, nome, email, cargo, nivel_acesso, data_criacao, atualizado_em,
-- empresa_id — e usuarios.id já é a FK direta para auth.users(id).
--
-- Empresas sem nenhum usuário são puladas (não há created_by válido);
-- o hook useColumnConfig cai no fallback em código nesse caso.

do $$
declare
  v_empresa record;
  v_created_by uuid;
  v_valor jsonb := '[
    {"field": "codigo", "label": "Código", "visible": true, "order": 1},
    {"field": "descricao", "label": "Descrição", "visible": true, "order": 2},
    {"field": "bitola", "label": "Bitola", "visible": true, "order": 3},
    {"field": "familia", "label": "Família", "visible": true, "order": 4},
    {"field": "unidade", "label": "Unidade", "visible": true, "order": 5},
    {"field": "quantidade", "label": "Quantidade", "visible": true, "order": 6},
    {"field": "endereco", "label": "Endereço", "visible": true, "order": 7},
    {"field": "status", "label": "Status", "visible": true, "order": 8}
  ]'::jsonb;
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
      'colunas_materias_primas',
      v_valor,
      'Colunas (label, visibilidade e ordem) da tela de Matérias-Primas.',
      v_created_by
    )
    on conflict (empresa_id, chave) do nothing;
  end loop;
end
$$;
