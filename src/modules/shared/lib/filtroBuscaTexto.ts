// Construção segura de filtro .or() para busca textual parcial
// (ilike) via PostgREST/supabase-js, reutilizável por qualquer
// autocomplete deste projeto (Matéria-prima hoje; Produto/Subconjunto
// no futuro). Existe porque o código anterior (MateriaPrimaSearchInput,
// ClienteSearchInput, ProdutoSearchModal) só escapava a aspas dupla
// (delimitador do valor no filtro), sem escapar os curingas do próprio
// ILIKE (% e _) nem a barra invertida (caractere de escape do ILIKE) -
// um usuário digitando "%" ou "_" literalmente (comum em código de
// material, ex. "AC_1020") tinha o caractere interpretado como curinga
// em vez de texto literal.
//
// Verificado por leitura direta do banco remoto (sem extensão
// instalada - só pg_stat_statements/pgcrypto/plpgsql/supabase_vault/
// uuid-ossp em pg_extension): ILIKE aqui é case-insensitive mas
// SENSÍVEL A ACENTO (sem unaccent). "aço" não é igual a "aco" para
// fins de busca - ver testes.

/**
 * Escapa um termo de busca para uso seguro dentro de um valor
 * `coluna.ilike."%termo%"` do filtro `.or()` do PostgREST.
 *
 * Ordem importa: barra invertida primeiro (é o caractere de escape do
 * próprio ILIKE - precisa virar literal antes de qualquer outro escape
 * usar barra invertida), depois os curingas do ILIKE (% e _, para virar
 * texto literal em vez de curinga), depois a aspas dupla (delimitador
 * do valor no filtro .or() do PostgREST).
 */
export function escaparParaIlike(termo: string): string {
  return termo
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/"/g, '\\"');
}

/**
 * Monta o valor de `.or(...)` do supabase-js para busca parcial
 * (case-insensitive) em várias colunas ao mesmo tempo - equivalente a
 * "coluna1 ILIKE '%termo%' OR coluna2 ILIKE '%termo%' OR ...", com o
 * termo devidamente escapado (ver escaparParaIlike).
 */
export function construirFiltroOrIlike(colunas: string[], termoBruto: string): string {
  const termo = escaparParaIlike(termoBruto);
  return colunas.map((coluna) => `${coluna}.ilike."%${termo}%"`).join(",");
}
