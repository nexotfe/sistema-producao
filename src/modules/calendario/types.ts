export type CalendarioOperacionalEmpresa = {
  id: string;
  empresa_id: string;
  segunda: boolean;
  terca: boolean;
  quarta: boolean;
  quinta: boolean;
  sexta: boolean;
  sabado: boolean;
  domingo: boolean;
};

export type TipoEventoCalendario =
  | "recesso_coletivo"
  | "inventario"
  | "paralisacao"
  | "dia_trabalhado_excepcional"
  | "feriado_local_temporario";

export const TIPO_EVENTO_LABELS: Record<TipoEventoCalendario, string> = {
  recesso_coletivo: "Recesso Coletivo",
  inventario: "Inventário",
  paralisacao: "Paralisação",
  dia_trabalhado_excepcional: "Dia Trabalhado Excepcional",
  feriado_local_temporario: "Feriado Local Temporário",
};

export type CalendarioEmpresaEvento = {
  id: string;
  empresa_id: string;
  data: string;
  tipo: TipoEventoCalendario;
  descricao: string | null;
  ativo: boolean;
};
