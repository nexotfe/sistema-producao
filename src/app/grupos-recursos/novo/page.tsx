"use client";

import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { useNovoGrupoRecurso } from "@/modules/grupos-recursos/hooks/useNovoGrupoRecurso";
import { useRouter } from "next/navigation";

export default function NovoGrupoRecursoPage() {
  const router = useRouter();
  const {
    codigo,
    setCodigo,
    nome,
    setNome,
    descricao,
    setDescricao,
    unidadeCapacidade,
    setUnidadeCapacidade,
    loading,
    erro,
    salvarGrupo,
  } = useNovoGrupoRecurso();

  async function handleSalvar() {
    const sucesso = await salvarGrupo();

    if (sucesso) {
      router.push("/grupos-recursos");
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <ModuleBackLink href="/grupos-recursos" label="Grupo de Recursos" />

          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Grupo de Recursos
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Cadastro de familia produtiva para recursos industriais.
            </p>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <Card titulo="Informacoes do grupo">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field label="Codigo" value={codigo} onChange={setCodigo} />
              <Field label="Nome do grupo" value={nome} onChange={setNome} />
              <Field
                label="Unidade de capacidade"
                value={unidadeCapacidade}
                onChange={setUnidadeCapacidade}
              />
            </div>
          </Card>

          <Card titulo="Descricao / Observacoes">
            <div className="px-6 py-6">
              <textarea
                rows={5}
                value={descricao}
                onChange={(event) => setDescricao(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
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
