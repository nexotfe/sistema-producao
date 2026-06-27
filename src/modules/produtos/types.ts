export type ProductStatus = "Ativo" | "Inativo";

export type Product = {
  code: string;
  description: string;
  customer: string;
  type: string;
  unit: string;
  active: boolean;
  notes: string;
  quantity: number;
};

export type ProductFormValues = {
  code: string;
  description: string;
  customer: string;
  type: string;
  unit: string;
  active: boolean;
  notes: string;
  quantity: number;
};
