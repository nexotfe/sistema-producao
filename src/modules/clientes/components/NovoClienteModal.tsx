type NovoClienteModalProps = {
  open: boolean;
  onClose: () => void;
};

export function NovoClienteModal({
  open,
  onClose,
}: NovoClienteModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
              Comercial
            </p>

            <h2 className="mt-1 text-2xl font-semibold text-slate-950">
              Novo Cliente
            </h2>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="grid gap-5">
            <Field label="Nome" />
            <Field label="Empresa" />
            <Field label="Telefone" />
            <Field label="E-mail" />
            <Field label="Cidade" />
            <Field label="CNPJ" />

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Observações
              </label>

              <textarea
                rows={5}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-5">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancelar
          </button>

          <button className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
            Salvar Cliente
          </button>
        </div>
      </div>
    </div>
  );
}

type FieldProps = {
  label: string;
};

function Field({ label }: FieldProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>

      <input
        className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
      />
    </div>
  );
}