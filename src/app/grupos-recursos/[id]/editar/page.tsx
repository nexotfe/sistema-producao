"use client";

import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { use } from "react";
import { useEditarGrupoRecurso } from "@/modules/grupos-recursos/hooks/useEditarGrupoRecurso";
import { useRouter } from "next/navigation";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default function EditarGrupoRecursoPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const {
    codigo,
    setCodigo,
    nome,
    setNome,
    setor,
    setSetor,
    descricao,
    setDescricao,
    unidadeCapacidade,
    setUnidadeCapacidade,
    produtividadePadrao,
    setProdutividadePadrao,
    loading,
    salvando,
    erro,
    salvarGrupo,
  } = useEditarGrupoRecurso(id);

  async function handleSalvar() {
    const sucesso = await salvarGrupo();

    if (sucesso) {
      router.push(`/grupos-recursos/${id}`);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <p className="text-sm text-text-secondary">Carregando grupo...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <ModuleBackLink href="/grupos-recursos" label="Grupo de Recursos" />

          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
              Editar grupo de recursos
            </h1>

            <p className="mt-2 text-sm text-text-secondary">
              Atualizacao da familia produtiva.
            </p>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <Card titulo="Informacoes do grupo">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field label="Codigo" value={codigo} onChange={setCodigo} />
              <Field label="Nome do grupo" value={nome} onChange={setNome} />
              <Field label="Setor" value={setor} onChange={setSetor} />
              <Field
                label="Unidade de capacidade"
                value={unidadeCapacidade}
                onChange={setUnidadeCapacidade}
              />
              <Field
                label="Produtividade Padrão (%)"
                value={produtividadePadrao}
                onChange={setProdutividadePadrao}
              />
            </div>
          </Card>

          <Card titulo="Descricao / Observacoes">
            <div className="px-6 py-6">
              <textarea
                rows={5}
                value={descricao}
                onChange={(event) => setDescricao(event.target.value)}
                className="w-full rounded-lg border border-border px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
              />
            </div>
          </Card>

          {erro && <p className="text-sm font-medium text-status-danger-text">{erro}</p>}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push(`/grupos-recursos/${id}`)}
              className="rounded-lg border border-border bg-surface px-5 py-3 text-sm font-medium text-text-secondary transition hover:bg-border-subtle"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSalvar}
              disabled={salvando}
              className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Salvar"}
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
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border-subtle px-6 py-5">
        <h2 className="text-base font-semibold text-text-primary">{titulo}</h2>
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
      <label className="mb-2 block text-sm font-medium text-text-primary">
        {label}
      </label>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-border px-4 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
      />
    </div>
  );
}
