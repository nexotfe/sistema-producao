-- NEXOTFE-PCP-ETAPA 65C: cadastro de 3 permissoes de Operacoes de
-- Producao da OF (Adicionar/Editar/Remover OP) no catalogo GLOBAL
-- public.permissoes. So isso - nenhuma linha em grupo_permissoes
-- (nenhum grupo comum recebe nada automaticamente; o Grupo ADM
-- reconhece estas 3 chaves via usuario_tem_permissao() sem precisar de
-- nenhuma linha aqui, por design - autoridade derivada, nunca
-- materializada - ver PCP-P8I-B2, confirmado contra producao na
-- Etapa 65B: o usuario administrador de testes ja pertence ao Grupo
-- ADM hoje).
--
-- *** MIGRATION CANDIDATA — ARTEFATO DE DESENVOLVIMENTO ***
-- Preparada na Etapa 65C. NAO aplicada contra o banco remoto/produção
-- até autorização expressa e separada, por escrita específica
-- (CLAUDE.md Regra 9). Nenhuma linha deste arquivo foi aplicada a
-- nenhum ambiente real até o momento em que este comentário foi
-- escrito - validado em sandbox PostgreSQL local descartável (Etapa
-- 65C), nunca contra o linked/produção.
--
-- Categoria 'sensivel' (pedido explícito da Etapa 65C) - verificação
-- de efeitos adicionais feita ANTES de escrever este arquivo (leitura
-- real de produção, Etapa 65C):
--   - comment on type public.permissao_categoria confirma: 'sensivel'
--     é "concedida ao Grupo ADM por definição, delegável a outros
--     grupos por decisão do ADM" - ou seja, NÃO muda nada para o ADM
--     em relação a 'comum' (usuario_tem_permissao já concede qualquer
--     chave válida ao ADM, independente de categoria - step 4 da
--     função, confirmado por leitura direta do corpo). A diferença
--     real de categoria só importa se um dia uma chave for delegada a
--     um grupo comum via grupo_permissoes - o que esta migration
--     explicitamente NÃO faz.
--   - permissao_categoria_grafo_violacao()/permissao_dependencia_alcancavel()
--     verificam um grafo de DEPENDÊNCIA ENTRE PERMISSÕES (uma chave
--     exigindo outra) - mecanismo totalmente inerte aqui, pois esta
--     migration não cria nenhuma linha de dependência entre
--     permissões, só as 3 linhas do catálogo em si.
--   - trg_grupo_permissoes_validar_atribuicao só rejeita a categoria
--     'reservada' sendo atribuída a um grupo comum - 'sensivel' nunca
--     é rejeitada por esse trigger (e, de novo, esta migration não
--     toca grupo_permissoes de qualquer forma).
--   - Nenhuma RLS, policy ou outra função lê permissoes.categoria além
--     das já citadas (confirmado por busca textual no dump completo
--     do schema de produção, Etapa 65C).
--
-- Inclusão idempotente via ON CONFLICT (chave) - permissoes.chave tem
-- UNIQUE real confirmada em produção (mesmo padrão já usado em
-- 20261021120000_pcp_p8i_b3_catalogo_permissoes.sql) - nunca sobrescreve
-- uma linha existente, mesmo que o nome/descrição mudem aqui no futuro.

insert into public.permissoes (chave, recurso, acao, categoria, nome, descricao) values
  ('pcp.criar_operacao_of', 'pcp', 'criar_operacao_of', 'sensivel',
   'Criar operação de produção (Y)',
   'Permite acrescentar uma nova operação (OP) à cópia operacional Y de uma Ordem de Fabricação, sem alterar o roteiro original (X).'),
  ('pcp.editar_operacao_of', 'pcp', 'editar_operacao_of', 'sensivel',
   'Editar operação de produção (Y)',
   'Permite alterar recurso, tempo planejado e sequência do planejamento Y de uma operação - bloqueado pela própria RPC quando a operação já tem apontamento real registrado.'),
  ('pcp.remover_operacao_of', 'pcp', 'remover_operacao_of', 'sensivel',
   'Remover operação de produção (Y)',
   'Permite marcar uma operação como não aplicável (nunca exclusão física) - bloqueado pela própria RPC quando há dependências relacionadas pendentes ou apontamento real registrado.')
on conflict (chave) do nothing;
