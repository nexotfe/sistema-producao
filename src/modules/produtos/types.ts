export type Product = {
  code: string;
  description: string;
  type: string;
  unit: string;
  active: boolean;
  notes: string;
  quantity: number;
};

export type ProductRevisionStatus = "vigente" | "anterior";

export type ProductRevision = {
  id: string;
  codigoRevisao: string;
  situacao: ProductRevisionStatus;
  roteiroVinculado: string;
  custoCalculado: number;
  anexoDesenho: string | null;
};

export type ProductFormValues = {
  code: string;
  description: string;
  ncm: string;
  unit: string;
  active: boolean;
  notes: string;
  revisions: ProductRevision[];
  roteiroVigente: string;
};
