import type { ProjectStatus } from "./types";

type StatusColor = {
  bg: string;
  text: string;
  border: string;
};

const STATUS_COLORS: Record<ProjectStatus, StatusColor> = {
  em_analise: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  em_elaboracao: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  aprovado: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  perdido: {
    bg: "bg-slate-50",
    text: "text-slate-700",
    border: "border-slate-200",
  },
  cancelado: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
  },
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  em_analise: "Em análise",
  em_elaboracao: "Em elaboração",
  aprovado: "Aprovado",
  perdido: "Perdido",
  cancelado: "Cancelado",
};

interface StatusBadgeProps {
  status: ProjectStatus;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const colors = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${colors.bg} ${colors.border} ${colors.text} ${className}`}
    >
      {label}
    </span>
  );
}
