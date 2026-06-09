"use client";

export default function NovoClientePage() {
  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
              Cadastro
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Novo Cliente
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Cadastro de clientes e relacionamento comercial.
            </p>
          </div>

          <button className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
            Voltar
          </button>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-base font-semibold text-slate-900">
              Informações do cliente
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Dados principais para relacionamento comercial.
            </p>
          </div>

          <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
            <Field label="Razão Social" />
            <Field label="Nome Fantasia" />
            <Field label="Telefone" />
            <Field label="E-mail" />
            <Field label="Cidade" />
            <Field label="CNPJ" />
          </div>

          <div className="px-6 pb-6">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Observações
            </label>

            <textarea
              rows={5}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-5">
            <button className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              Cancelar
            </button>

            <button className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
              Salvar Cliente
            </button>
          </div>
        </section>
      </div>
    </main>
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