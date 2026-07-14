-- Operacao (bom_operacoes) passa a vincular Recurso Produtivo em vez de
-- Tecnologia Aplicada - decisao do usuario: e o recurso especifico que a
-- Simulacao de Capacidade vai usar no calculo, nao a tecnologia/categoria.
--
-- Aditiva e reversivel: tecnologia_aplicada_id NAO e removida, fica sem
-- uso pelo codigo novo ate confirmarmos que nada mais depende dela
-- (verificado: hoje so calcular_custo_bom() depende, nenhuma view/FK).
--
-- recursos_produtivos nao tem um campo "tipo" (Engenharia vs
-- Producao/Mao-de-obra) e a maioria dos recursos (31/31 da Enifer) nao
-- tem tecnologia vinculada para derivar isso - por isso "tipo" vira um
-- campo proprio de bom_operacoes, escolhido pelo usuario ao criar a OP,
-- independente do recurso.
alter table public.bom_operacoes
  add column recurso_produtivo_id uuid references public.recursos_produtivos(id),
  add column tipo text check (tipo in ('engenharia', 'producao'));

-- tecnologia_aplicada_id era NOT NULL; o codigo novo nao envia mais esse
-- campo em nenhum INSERT, entao precisa deixar de ser obrigatoria (sem
-- remover a coluna). Linhas existentes continuam com o valor que ja tinham.
alter table public.bom_operacoes
  alter column tecnologia_aplicada_id drop not null;

comment on column public.bom_operacoes.recurso_produtivo_id is 'Recurso Produtivo especifico que executa a operacao. Substitui tecnologia_aplicada_id (mantida sem uso, ver comentario da coluna).';
comment on column public.bom_operacoes.tecnologia_aplicada_id is 'Obsoleta - substituida por recurso_produtivo_id. Mantida sem uso ate confirmar que nada mais depende dela.';

-- Backfill de "tipo": sem ambiguidade, copia direta de
-- tecnologias_aplicadas.tipo (ja conhecido para as 6 linhas existentes).
update public.bom_operacoes bo
   set tipo = case when ta.tipo = 'engenharia' then 'engenharia' else 'producao' end
  from public.tecnologias_aplicadas ta
 where ta.id = bo.tecnologia_aplicada_id
   and bo.tipo is null;

-- Backfill de "recurso_produtivo_id": so o caso nao-ambiguo (Fresa
-- Convencional -> unico recurso vinculado a essa tecnologia, F001).
-- Os outros 5 casos (Torno CNC com 2 candidatos; e as 4 operacoes de
-- mao de obra sem nenhum recurso vinculado a tecnologia) ficam NULL -
-- decisao do usuario: revincular manualmente pela tela do Roteiro
-- assim que o campo "Recurso aplicado" estiver funcionando.
update public.bom_operacoes
   set recurso_produtivo_id = '445856a8-cf83-4ecf-a620-f5d2c51d2c32'
 where id = 'fff74cd8-c17e-4109-a3e7-69a5e6f5bad3';
