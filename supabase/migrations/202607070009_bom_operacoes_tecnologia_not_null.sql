-- PASSO 2 (Fase B Roteiro) - tecnologia_aplicada_id obrigatorio em
-- bom_operacoes. Confirmado antes de aplicar: 0 linhas na tabela (nenhuma
-- teria a coluna nula, migration segura).
--
-- Motivo: e o unico jeito hoje de classificar uma operacao como
-- Engenharia ou Producao (via tecnologias_aplicadas.tipo), e tambem o
-- que permite calcular o custo de mao de obra (tempo x valor_hora da
-- tecnologia) - sem tecnologia vinculada a operacao nao tem como ser
-- classificada nem custeada.

alter table public.bom_operacoes
  alter column tecnologia_aplicada_id set not null;
