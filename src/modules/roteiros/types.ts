export type BomStatus = "ativo" | "inativo" | "rascunho";

export type Bom = {
  id: string;
  produtoId: string;
  versao: string;
  descricao: string | null;
  status: BomStatus;
  dataValidade: string | null;
};

// --- Materias-primas (bom_itens componente_tipo='materia_prima') ---

export type BomItemMateriaPrima = {
  id: string;
  materiaPrimaId: string;
  descricao: string;
  custoReferencia: number | null;
  quantidade: number;
  unidade: string;
  dimensoes: string | null;
  ordem: number;
  observacoes: string | null;
};

export type NovoBomItemInput = {
  materiaPrimaId: string;
  quantidade: number;
  unidade: string;
  dimensoes: string;
  observacoes: string;
};

// --- Estrutura / Subconjunto (bom_itens componente_tipo='subconjunto') ---

export type BomItemSubconjunto = {
  id: string;
  componenteProdutoId: string;
  codigo: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  ordem: number;
  observacoes: string | null;
};

export type NovoSubconjuntoInput = {
  componenteProdutoId: string;
  quantidade: number;
  unidade: string;
  observacoes: string;
};

// --- Engenharia / Operacoes (bom_operacoes) ---
// Classificacao Engenharia vs Operacoes vem do proprio campo bo.tipo
// (tipo='engenharia' -> bloco Engenharia; tipo='producao' -> Operacoes) -
// escolhido pelo usuario ao criar a OP, independente do recurso vinculado.

export type BomOperacao = {
  id: string;
  ordem: number;
  descricao: string;
  recursoProdutivoId: string | null;
  recursoNome: string;
  tipo: "engenharia" | "producao";
  tempoEstimadoMinutos: number;
  observacoes: string | null;
};

export type NovaOperacaoInput = {
  ordem: number;
  descricao: string;
  recursoProdutivoId: string;
  tipo: "engenharia" | "producao";
  tempoEstimadoMinutos: number;
  observacoes: string;
};

// --- Servicos de Terceiros (bom_servicos_terceiros) ---

export type BomServicoTerceiro = {
  id: string;
  ordem: number;
  descricao: string;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  custoEstimado: number | null;
  prazoEstimadoDias: number | null;
  observacoes: string | null;
};

export type NovoServicoTerceiroInput = {
  descricao: string;
  fornecedorId: string | null;
  custoEstimado: number | null;
  prazoEstimadoDias: number | null;
  observacoes: string;
};

// --- Transportes (bom_transportes) ---

export type BomTransporte = {
  id: string;
  ordem: number;
  descricao: string;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  custoEstimado: number | null;
  observacoes: string | null;
};

export type NovoTransporteInput = {
  descricao: string;
  fornecedorId: string | null;
  custoEstimado: number | null;
  observacoes: string;
};

// --- Custo (calcular_custo_bom) ---

export type CustoBom = {
  materiaPrima: number;
  subconjunto: number;
  engenharia: number;
  maoDeObra: number;
  terceiros: number;
  logistica: number;
  total: number;
};

// --- Compartilhado ---

export type OpcaoSelect = {
  id: string;
  label: string;
};

export type ResultadoOperacaoRoteiro =
  | { status: "ok" }
  | { status: "erro"; mensagem: string };

// Valores exatos do CHECK bom_itens_unidade_chk no remoto real (ja
// expandido para incluir as unidades do catalogo de Produto).
export const unidadesBomItem: { value: string; label: string }[] = [
  { value: "kg", label: "Kg" },
  { value: "metro", label: "Metro" },
  { value: "barra", label: "Barra" },
  { value: "chapa", label: "Chapa" },
  { value: "peca", label: "Peça" },
  { value: "conjunto", label: "Conjunto" },
  { value: "unidade", label: "Unidade" },
  { value: "litro", label: "Litro" },
  { value: "pacote", label: "Pacote" },
];
