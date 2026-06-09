type EmptyStateProps = {
  titulo: string;
  descricao: string;
};

export function EmptyState({
  titulo,
 descricao,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-[320px] items-center justify-center px-6 py-12">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 h-10 w-10 rounded-full border border-slate-200 bg-slate-50" />

        <h3 className="text-base font-semibold text-slate-900">
          {titulo}
        </h3>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          {descricao}
        </p>
      </div>
    </div>
  );
}