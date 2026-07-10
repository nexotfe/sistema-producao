import type { ColumnConfigItem } from "@/hooks/useColumnConfig";

export const MATERIAS_PRIMAS_COLUNAS_CHAVE = "colunas_materias_primas";

export const materiasPrimasColunasPadrao: ColumnConfigItem[] = [
  { field: "codigo", label: "Código", visible: true, order: 1 },
  { field: "descricao", label: "Descrição", visible: true, order: 2 },
  { field: "bitola", label: "Bitola", visible: true, order: 3 },
  { field: "familia", label: "Família", visible: true, order: 4 },
  { field: "unidade", label: "Unidade", visible: true, order: 5 },
  { field: "quantidade", label: "Quantidade", visible: true, order: 6 },
  { field: "endereco", label: "Endereço", visible: true, order: 7 },
  { field: "status", label: "Status", visible: true, order: 8 },
  { field: "preco", label: "Preço", visible: true, order: 9 },
];

type GetColumn = (field: string) => ColumnConfigItem | undefined;

export function campoVisivel(getColumn: GetColumn, field: string): boolean {
  return getColumn(field)?.visible ?? true;
}

export function campoLabel(
  getColumn: GetColumn,
  field: string,
  padrao: string,
): string {
  return getColumn(field)?.label ?? padrao;
}
