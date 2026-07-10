export type Product = {
  id: string;
  code: string;
  description: string;
  type: string;
  unit: string;
  active: boolean;
  quantity: number;
  valor: number | null;
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

export type ProductRevisionStatus = "vigente" | "anterior";

export type ProductRevision = {
  id: string;
  codigoRevisao: string;
  situacao: ProductRevisionStatus;
  roteiroVinculado: string;
  custoCalculado: number;
  anexoDesenho: string | null;
};

// Entrada do modal "Adicionar Revisão". aprovarVigente = true dispara a
// regra de negocio (fecha a vigente anterior do item e aprova esta como
// vigente); false grava como rascunho/anterior (aprovada_em fica null).
export type NovaRevisaoInput = {
  codigoRevisao: string;
  aprovarVigente: boolean;
  anexoNomeArquivo: string | null;
};

export type ResultadoAdicionarRevisao =
  | { status: "ok" }
  | { status: "erro"; mensagem: string };

export type ProductFormValues = {
  code: string;
  description: string;
  tipoItem: string;
  ncm: string;
  unit: string;
  active: boolean;
  notes: string;
  revisions: ProductRevision[];
  roteiroVigente: string;
};

// Valores exatos dos CHECK constraints reais de itens_industriais
// (itens_industriais_tipo_item_check / itens_industriais_unidade_check).
export const emptyProductFormValues: ProductFormValues = {
  code: "",
  description: "",
  tipoItem: "produto acabado",
  ncm: "",
  unit: "unidade",
  active: true,
  notes: "",
  revisions: [],
  roteiroVigente: "",
};
