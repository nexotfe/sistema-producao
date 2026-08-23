type ExclusaoBloqueadaBannerProps = {
  status: "vinculado" | "sem_permissao";
  onDesativar: () => void;
};

/**
 * Mensagem exibida quando um DELETE real e recusado - mesmo texto/padrao
 * ja usado nas paginas de detalhe (Colaborador, Recurso, Grupo de Recursos).
 */
export function ExclusaoBloqueadaBanner({
  status,
  onDesativar,
}: ExclusaoBloqueadaBannerProps) {
  if (status === "sem_permissao") {
    return (
      <p className="px-5 py-3 text-sm font-medium text-status-danger-text">
        Apenas administradores podem excluir registros.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-status-warning-bg px-5 py-3 text-sm text-status-warning-text">
      <span>Não é possível excluir - há vínculos com produção/histórico.</span>
      <button
        type="button"
        onClick={onDesativar}
        className="h-9 shrink-0 rounded-md border border-status-warning-border bg-surface-elevated px-3 text-sm font-semibold text-status-warning-text transition hover:bg-status-warning-bg"
      >
        Desativar em vez disso
      </button>
    </div>
  );
}
