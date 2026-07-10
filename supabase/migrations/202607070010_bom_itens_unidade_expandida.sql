-- PASSO 3 (Fase B Roteiro) - expande bom_itens_unidade_chk para a uniao
-- com itens_industriais_unidade_check. bom_itens pode referenciar um
-- subconjunto (componente_produto_id -> itens_industriais) cuja unidade
-- seja qualquer uma do catalogo de Produto ('conjunto','unidade','litro',
-- 'pacote'), nao so as de materia-prima ('kg','metro','barra','chapa',
-- 'peca').

alter table public.bom_itens
  drop constraint bom_itens_unidade_chk;

alter table public.bom_itens
  add constraint bom_itens_unidade_chk
    check (unidade = any (array[
      'kg', 'metro', 'barra', 'chapa', 'peca',
      'conjunto', 'unidade', 'litro', 'pacote'
    ]));
