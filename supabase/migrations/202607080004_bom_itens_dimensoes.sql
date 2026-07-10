-- Campo de referencia/documentacao (ex: "1000x1000mm") no material do
-- roteiro - NAO participa de nenhum calculo de custo (quantidade/unidade
-- continuam sendo os campos usados por calcular_custo_bom). Serve so
-- para registrar a medida de origem que o orcamentista usou para chegar
-- na quantidade/peso digitados.
alter table bom_itens add column dimensoes text;

alter table bom_itens add constraint bom_itens_dimensoes_chk
  check (dimensoes is null or btrim(dimensoes) <> '');
