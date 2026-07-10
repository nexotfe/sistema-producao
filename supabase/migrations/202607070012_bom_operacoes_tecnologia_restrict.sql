-- Troca bom_operacoes.tecnologia_aplicada_id de ON DELETE SET NULL para
-- ON DELETE RESTRICT. A coluna virou NOT NULL na migration 009 - SET NULL
-- nao faz mais sentido (nunca conseguiria de fato nular, so gerava um
-- erro cru de violacao de NOT NULL ao tentar excluir uma tecnologia em
-- uso). RESTRICT da o mesmo resultado pratico (nao deixa excluir), com
-- mensagem de erro limpa e tratavel no frontend.

alter table public.bom_operacoes
  drop constraint bom_operacoes_tecnologia_fkey;

alter table public.bom_operacoes
  add constraint bom_operacoes_tecnologia_fkey
    foreign key (tecnologia_aplicada_id)
    references public.tecnologias_aplicadas(id)
    on delete restrict;
