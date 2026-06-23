export type EntityType =
  | "projeto"
  | "of"
  | "req"
  | "item"
  | "cliente"
  | "fornecedor";

type EntityRouteBuilder = (id: string) => string;

export const entityRoutes: Record<EntityType, EntityRouteBuilder> = {
  projeto: (id) => `/projetos/${id}`,
  of: (id) => `/ordens/${id}`,
  req: (id) => `/compras/requisicoes/${id}`,
  item: (id) => `/produtos/${id}`,
  cliente: (id) => `/clientes/${id}`,
  fornecedor: (id) => `/fornecedores/${id}`,
};

export const entityLabels: Record<EntityType, string> = {
  projeto: "Projeto",
  of: "OF",
  req: "REQ",
  item: "PN",
  cliente: "Cliente",
  fornecedor: "Fornecedor",
};

export function getEntityHref(type: EntityType, id: string) {
  return entityRoutes[type](id);
}
