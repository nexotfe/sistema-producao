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
      <p className="px-5 py-3 text-sm font-medium text-red-600">
        Apenas administradores podem excluir registros.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-50 px-5 py-3 text-sm text-amber-800">
      <span>Não é possível excluir - há vínculos com produção/histórico.</span>
      <button
        type="button"
        onClick={onDesativar}
        className="h-9 shrink-0 rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
      >
        Desativar em vez disso
      </button>
    </div>
  );
}
