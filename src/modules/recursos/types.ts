export type SituacaoRecurso = "todos" | "ativos" | "inativos";

export type RecursoProdutivo = {
  id: string;
  codigo: string | null;
  nome: string | null;
  fabricante: string | null;
  modelo: string | null;
  setor: string | null;
  capacidade: number | null;
  ativo: boolean | null;
  created_at: string | null;
};

export type ColunasRecursos = {
  codigo: boolean;
  nome: boolean;
  setor: boolean;
  capacidade: boolean;
  status: boolean;
};
