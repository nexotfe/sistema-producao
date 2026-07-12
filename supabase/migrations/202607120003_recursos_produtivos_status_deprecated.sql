-- A coluna "status" (text, default 'disponivel') nunca foi lida nem
-- escrita pela aplicacao - a tela /recursos usa exclusivamente a coluna
-- "ativo" (boolean) como sinal de situacao. Isso gerou um valor
-- divergente sem efeito pratico (ex.: CNC-001 com status='inativo' e
-- ativo=true).
--
-- Nao foi removida porque a view "recursos_produtivos_ativos" depende
-- dela (SELECT * implicito) - dropar a coluna exigiria recriar a view.
-- Em vez disso, a coluna fica formalmente marcada como obsoleta: "ativo"
-- passa a ser o unico sinal de situacao daqui em diante.
comment on column public.recursos_produtivos.status is
  'DEPRECATED: nao usado pela aplicacao. Situacao real do recurso e definida por "ativo". Mantido apenas porque a view recursos_produtivos_ativos ainda referencia a coluna.';
