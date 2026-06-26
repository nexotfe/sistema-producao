export type SituacaoColaborador = "todos" | "ativos" | "inativos";

export type Colaborador = {
  id: string;
  codigo: number | null;
  nome: string | null;
  apelido: string | null;
  setor: string | null;
  funcao: string | null;
  habilidades: string | null;
  carga_horaria: number | null;
  disponibilidade_atual: number | null;
  telefone: string | null;
  email: string | null;
  data_admissao: string | null;
  observacoes: string | null;
  ativo: boolean | null;
  created_at: string | null;
  tecnologia_aplicada_id?: string | null;
};

export type ColunasColaboradores = {
  codigo: boolean;
  nome: boolean;
  setor: boolean;
  funcao: boolean;
  disponibilidade: boolean;
  status: boolean;
};
