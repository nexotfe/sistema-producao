-- Adiciona 'mm' e 'cm' como unidades de consumo validas em bom_itens
-- (necessario para o Roteiro poder registrar consumo de materia-prima em
-- milimetro/centimetro quando a materia-prima e precificada por metro).
alter table bom_itens drop constraint bom_itens_unidade_chk;

alter table bom_itens add constraint bom_itens_unidade_chk
  check (unidade = any (array[
    'kg', 'metro', 'barra', 'chapa', 'peca', 'conjunto', 'unidade',
    'litro', 'pacote', 'mm', 'cm'
  ]));
