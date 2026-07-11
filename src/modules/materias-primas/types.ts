export type MateriaPrima = {
  id: string;
  empresa_id: string;
  codigo: string | null;
  descricao: string;
  familia: string | null;
  unidade: string;
  bitola: string | null;
  dimensao: string | null;
  ncm: string | null;
  endereco: string | null;
  fabricante: string | null;
  marca: string | null;
  material_especificacao: string | null;
  norma: string | null;
  peso_especifico: string | null;
  observacoes_tecnicas: string | null;
  observacoes: string | null;
  custo_referencia: number | null;
  custo_origem: "manual" | "nf";
  custo_justificativa: string | null;
  estoque_minimo: number | null;
  estoque_ideal: number | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

export type MateriaPrimaForm = {
  codigo: string;
  descricao: string;
  familia: string;
  unidade: string;
  bitola: string;
  dimensao: string;
  ncm: string;
  endereco: string;
  fabricante: string;
  marca: string;
  material_especificacao: string;
  norma: string;
  peso_especifico: string;
  observacoes_tecnicas: string;
  observacoes: string;
  custoReferencia: string;
  custoOrigem: "manual" | "nf";
  custoJustificativa: string;
  estoqueMinimo: string;
  estoqueIdeal: string;
  ativo: boolean;
};

// Origem "nf" fica preparada para quando o modulo de Compras/Recebimento
// existir - hoje so "manual" pode ser selecionado de fato.
export const origensCusto: {
  value: "manual" | "nf";
  label: string;
  disabled?: boolean;
}[] = [
  { value: "manual", label: "Manual" },
  { value: "nf", label: "NF (indisponível até o módulo de Compras)", disabled: true },
];

export type MateriaPrimaLista = MateriaPrima & {
  quantidade: number;
};

export type FornecedorMateriaPrima = {
  id: string;
  fornecedor_id: string;
  nome: string | null;
  nome_fantasia: string | null;
  cnpj: string | null;
  codigo_fornecedor: string | null;
  moeda: string;
  preferencial: boolean;
};

export type FornecedorSelecao = {
  id: string;
  nome: string | null;
  nome_fantasia: string | null;
  cnpj: string | null;
};

export type EstoqueInfo = {
  saldoDisponivel: number;
  saldoReservado: number;
  saldoLivre: number;
  ultimaMovimentacao: {
    tipoMovimento: string;
    criadaEm: string;
  } | null;
};

export type ResultadoAjusteEstoque =
  | { status: "ok" }
  | { status: "erro"; mensagem: string };

export const materiaPrimaInitialForm: MateriaPrimaForm = {
  codigo: "",
  descricao: "",
  familia: "",
  unidade: "",
  bitola: "",
  dimensao: "",
  ncm: "",
  endereco: "",
  fabricante: "",
  marca: "",
  material_especificacao: "",
  norma: "",
  peso_especifico: "",
  observacoes_tecnicas: "",
  observacoes: "",
  custoReferencia: "",
  custoOrigem: "manual",
  custoJustificativa: "",
  estoqueMinimo: "",
  estoqueIdeal: "",
  ativo: true,
};
