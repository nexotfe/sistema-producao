type StatusBadgeProps = {
  ativo: boolean;
};

export function StatusBadge({ ativo }: StatusBadgeProps) {
  return (
    <span
      className={
        ativo
          ? "inline-flex rounded-md border border-status-success-border bg-status-success-bg px-2 py-1 text-xs font-medium text-status-success-text"
          : "inline-flex rounded-md border border-border bg-border-subtle px-2 py-1 text-xs font-medium text-text-secondary"
      }
    >
      {ativo ? "Ativo" : "Inativo"}
    </span>
  );
}
