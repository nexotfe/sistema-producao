import type { RecursoProdutivo } from "../types";

type ElegibilidadeBadgeProps = {
  recurso: Pick<
    RecursoProdutivo,
    "tecnologia_aplicada_id" | "capacidade_horas_dia" | "grupo_id" | "ativo"
  >;
};

export function ElegibilidadeBadge({ recurso }: ElegibilidadeBadgeProps) {
  const faltando: string[] = [];

  if (!recurso.tecnologia_aplicada_id) {
    faltando.push("tecnologia");
  }

  if (recurso.capacidade_horas_dia === null || recurso.capacidade_horas_dia === undefined) {
    faltando.push("capacidade");
  }

  if (!recurso.grupo_id) {
    faltando.push("grupo");
  }

  if (recurso.ativo !== true) {
    faltando.push("ativo");
  }

  if (faltando.length === 0) {
    return (
      <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
        Pronto para Simulação
      </span>
    );
  }

  return (
    <span
      title={`Falta: ${faltando.join(", ")}`}
      className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700"
    >
      Incompleto
    </span>
  );
}
