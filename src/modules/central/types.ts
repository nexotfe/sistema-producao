export type IconName =
  | "briefcase"
  | "package"
  | "bar-chart"
  | "cog"
  | "shield-check"
  | "sliders"
  | "user"
  | "users"
  | "folder"
  | "file-text"
  | "cart"
  | "truck"
  | "layers"
  | "calendar"
  | "clipboard-check"
  | "box"
  | "gauge";

export type Acao = {
  label: string;
  tipo: "criar" | "consultar";
  href?: string;
  futuro?: boolean;
};

export type Modulo = {
  id: string;
  titulo: string;
  icon: IconName;
  futuro?: boolean;
  acoes: Acao[];
  nota?: string;
};

export type Area = {
  id: string;
  titulo: string;
  descricao: string;
  icon: IconName;
  futuro?: boolean;
  modulos: Modulo[];
  notaFinal?: string;
};
