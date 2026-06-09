"use client";

import { useNovoCliente } from "@/modules/clientes/hooks/useNovoCliente";

export default function NovoClientePage() {
  const {
    nome,
    setNome,
    empresa,
    setEmpresa,
    telefone,
    setTelefone,
    email,
    setEmail,
    cidade,
    setCidade,
    cnpj,
    setCnpj,
    observacoes,
    setObservacoes,
    loading,
    erro,
    salvarCliente,
  } = useNovoCliente();

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
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-base font-semibold text-slate-900">
              Informações do cliente
            </h2>
          </div>

          <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
            <Field label="Razão Social" value={nome} onChange={setNome} />
            <Field label="Nome Fantasia" value={empresa} onChange={setEmpresa} />
            <Field label="Telefone" value={telefone} onChange={setTelefone} />
            <Field label="E-mail" value={email} onChange={setEmail} />
            <Field label="Cidade" value={cidade} onChange={setCidade} />
            <Field label="CNPJ" value={cnpj} onChange={setCnpj} />
          </div>

          <div className="px-6 pb-6">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Observações
            </label>

            <textarea
              rows={5}
              value={observacoes}
              onChange={(event) => setObservacoes(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
            />
          </div>

          {erro && (
            <p className="px-6 pb-4 text-sm font-medium text-red-600">
              {erro}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-5">
            <button className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              Cancelar
            </button>

            <button
              type="button"
              onClick={salvarCliente}
              disabled={loading}
              className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Salvando..." : "Salvar Cliente"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function Field({ label, value, onChange }: FieldProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
      />
    </div>
  );
}