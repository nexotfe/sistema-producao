export type SituacaoGrupoRecurso = "todos" | "ativos" | "inativos";

export type GrupoRecursoProdutivo = {
  id: string;
  codigo: string | null;
  nome: string | null;
  descricao: string | null;
  setor: string | null;
  unidade_capacidade: string | null;
  ativo: boolean | null;
  created_at: string | null;
};

export type ColunasGruposRecursos = {
  codigo: boolean;
  nome: boolean;
  unidade: boolean;
  status: boolean;
};
