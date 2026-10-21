-- PCP-P8I-B3: cadastro das 6 primeiras permissoes administrativas do PCP
-- no catalogo GLOBAL public.permissoes. So isso - nenhuma linha em
-- grupo_permissoes (nenhum grupo comum recebe nada automaticamente; o
-- Grupo ADM reconhece estas 6 chaves via usuario_tem_permissao() sem
-- precisar de nenhuma linha aqui, por design - autoridade derivada,
-- nunca materializada - ver PCP-P8I-B2).
--
-- Categoria segue a semantica real de delegabilidade (ver comment on
-- type public.permissao_categoria, GA-4A): 'comum' = ADM atribui
-- livremente; 'sensivel' = ADM detem por padrao, pode delegar. Decisao
-- de categoria por chave e de negocio, aprovada pelo proprietario em
-- PCP-P8I-B3 (regra geral de GA: permissao por acao, nunca por nome de
-- grupo/departamento - uma empresa pode conceder pcp.alterar_prioridade
-- ao grupo Comercial e negar ao grupo PCP, se assim decidir).
--
-- Inclusao idempotente via ON CONFLICT (chave) - permissoes.chave tem
-- UNIQUE real confirmada em producao.

insert into public.permissoes (chave, recurso, acao, categoria, nome, descricao) values
  ('pcp.visualizar_programacao', 'pcp', 'visualizar_programacao', 'comum',
   'Visualizar programação do PCP',
   'Permite consultar a programação vigente e o histórico de versões anteriores do PCP, sem alterar nada.'),
  ('pcp.alterar_prioridade', 'pcp', 'alterar_prioridade', 'comum',
   'Alterar prioridade na fila do PCP',
   'Permite reordenar a posição de projetos na fila de prioridades do PCP.'),
  ('pcp.solicitar_calculo', 'pcp', 'solicitar_calculo', 'comum',
   'Solicitar cálculo de programação',
   'Permite pedir ao Motor do PCP que calcule uma programação a partir da fila e da capacidade atuais, sem gravar nada até a aprovação.'),
  ('pcp.aprovar_programacao', 'pcp', 'aprovar_programacao', 'sensivel',
   'Aprovar e gravar programação calculada',
   'Permite aprovar o resultado calculado pelo Motor e torná-lo a programação vigente do PCP, preservando o histórico.'),
  ('pcp.liberar_of', 'pcp', 'liberar_of', 'sensivel',
   'Liberar Ordem de Fabricação',
   'Permite liberar uma OF planejada para início de produção.'),
  ('pcp.cancelar_of', 'pcp', 'cancelar_of', 'sensivel',
   'Cancelar Ordem de Fabricação',
   'Permite cancelar uma OF aprovada, de forma terminal, exigindo motivo.')
on conflict (chave) do nothing;
