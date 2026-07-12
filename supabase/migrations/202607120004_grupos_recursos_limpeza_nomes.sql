-- Limpeza cosmetica leve nos nomes de grupos_recursos: remove espacos em
-- branco a direita introduzidos em edicoes manuais e corrige o typo
-- "Convencinal" -> "Convencional". Baixo risco: nome nao tem constraint
-- de unicidade, so index nao-unico.
update public.grupos_recursos
set nome = trim(nome)
where deleted_at is null
  and nome <> trim(nome);

update public.grupos_recursos
set nome = 'Convencional'
where deleted_at is null
  and nome = 'Convencinal';
