"use client";

import { useRouter } from "next/navigation";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { useNovoRecurso } from "@/modules/recursos/hooks/useNovoRecurso";

export default function NovoRecursoPage() {
  const router = useRouter();
  const {
    codigo,
    setCodigo,
    nome,
    setNome,
    grupoRecursoId,
    setGrupoRecursoId,
    fabricante,
    setFabricante,
    modelo,
    setModelo,
    setor,
    setSetor,
    capacidade,
    setCapacidade,
    grupos,
    loading,
    loadingGrupos,
    erro,
    salvarRecurso,
  } = useNovoRecurso();

  async function handleSalvar() {
    const sucesso = await salvarRecurso();

    if (sucesso) {
      router.push("/recursos");
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <ModuleBackLink href="/recursos" label="Recurso" />

          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Recurso Produtivo
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Cadastro de recurso utilizado pela operacao industrial.
            </p>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <Card titulo="Informacoes do recurso">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field label="Codigo" value={codigo} onChange={setCodigo} />
              <Field label="Nome do recurso" value={nome} onChange={setNome} />
              <SelectField
                label="Grupo / Centro de trabalho"
                value={grupoRecursoId}
                onChange={setGrupoRecursoId}
                disabled={loadingGrupos}
                options={grupos.map((grupo) => ({
                  value: grupo.id,
                  label: [grupo.codigo, grupo.nome].filter(Boolean).join(" - "),
                }))}
              />
              <Field label="Setor" value={setor} onChange={setSetor} />
            </div>
          </Card>

          <Card titulo="Caracteristicas">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field
                label="Fabricante"
                value={fabricante}
                onChange={setFabricante}
              />
              <Field label="Modelo" value={modelo} onChange={setModelo} />
              <Field
                label="Capacidade"
                value={capacidade}
                onChange={setCapacidade}
              />
            </div>
          </Card>

          {erro && <p className="text-sm font-medium text-red-600">{erro}</p>}

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={handleSalvar}
              disabled={loading}
              className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function Card({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-5">
        <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
      </div>

      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  disabled,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
