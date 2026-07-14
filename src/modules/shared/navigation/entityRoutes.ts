export type EntityType =
  | "projeto"
  | "of"
  | "req"
  | "item"
  | "cliente"
  | "fornecedor"
  | "colaborador"
  | "recurso"
  | "grupoRecurso";

type EntityRouteBuilder = (id: string) => string;

export const entityRoutes: Record<EntityType, EntityRouteBuilder> = {
  projeto: (id) => `/projetos/${id}`,
  of: (id) => `/ordens/${id}`,
  req: (id) => `/compras/requisicoes/${id}`,
  item: (id) => `/produtos/${id}`,
  cliente: (id) => `/clientes/${id}`,
  fornecedor: (id) => `/fornecedores/${id}`,
  colaborador: (id) => `/colaboradores/${id}`,
  recurso: (id) => `/recursos/${id}`,
  grupoRecurso: (id) => `/grupos-recursos/${id}`,
};

export const entityLabels: Record<EntityType, string> = {
  projeto: "Projeto",
  of: "OF",
  req: "REQ",
  item: "Código",
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  colaborador: "Colaborador",
  recurso: "Recurso",
  grupoRecurso: "Grupo de Recursos",
};

export function getEntityHref(type: EntityType, id: string) {
  return entityRoutes[type](id);
}
