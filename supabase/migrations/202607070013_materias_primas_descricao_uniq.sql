alter table materias_primas
  add constraint materias_primas_descricao_empresa_uniq unique (empresa_id, descricao);
