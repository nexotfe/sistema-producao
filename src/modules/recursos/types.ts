export type SituacaoRecurso = "todos" | "ativos" | "inativos";

export type GrupoRecurso = {
  id: string;
  codigo: string | null;
  nome: string | null;
  setor: string | null;
};

export type RecursoProdutivo = {
  id: string;
  grupo_recurso_id: string | null;
  codigo: string | null;
  nome: string | null;
  fabricante: string | null;
  modelo: string | null;
  setor: string | null;
  capacidade: number | null;
  ativo: boolean | null;
  created_at: string | null;
  grupo?: GrupoRecurso | null;
};

export type ColunasRecursos = {
  codigo: boolean;
  nome: boolean;
  grupo: boolean;
  setor: boolean;
  capacidade: boolean;
  status: boolean;
};
