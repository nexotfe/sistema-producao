import type { ProjectStatus } from "./types";

type StatusColor = {
  bg: string;
  text: string;
  border: string;
};

const STATUS_COLORS: Record<ProjectStatus, StatusColor> = {
  rascunho: {
    bg: "bg-status-info-bg",
    text: "text-status-info-text",
    border: "border-status-info-border",
  },
  em_analise: {
    bg: "bg-status-warning-bg",
    text: "text-status-warning-text",
    border: "border-status-warning-border",
  },
  reprovado: {
    bg: "bg-status-danger-bg",
    text: "text-status-danger-text",
    border: "border-status-danger-border",
  },
  aprovado: {
    bg: "bg-status-success-bg",
    text: "text-status-success-text",
    border: "border-status-success-border",
  },
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  rascunho: "Em elaboracao",
  em_analise: "Em analise",
  reprovado: "Reprovado",
  aprovado: "Aprovado",
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
