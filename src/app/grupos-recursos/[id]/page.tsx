"use client";

import Link from "next/link";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useGrupoRecurso } from "@/modules/grupos-recursos/hooks/useGrupoRecurso";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default function GrupoRecursoPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { grupo, loading, erro, processando, inativarGrupo, excluirGrupo } =
    useGrupoRecurso(id);
  const [bloqueioExclusao, setBloqueioExclusao] = useState<
    "vinculado" | "sem_permissao" | null
  >(null);

  async function handleInativar() {
    const sucesso = await inativarGrupo();

    if (sucesso) {
      router.push("/grupos-recursos");
    }
  }

  async function handleExcluir() {
    const confirmado = window.confirm(
      "Deseja excluir permanentemente este grupo de recursos? Essa ação não pode ser desfeita.",
    );

    if (!confirmado) {
      return;
    }

    setBloqueioExclusao(null);
    const resultado = await excluirGrupo();

    if (resultado.status === "excluido") {
      router.push("/grupos-recursos");
      return;
    }

    if (resultado.status === "vinculado" || resultado.status === "sem_permissao") {
      setBloqueioExclusao(resultado.status);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <p className="text-sm text-slate-500">Carregando grupo...</p>
        </div>
      </main>
    );
  }

  if (erro || !grupo) {
    return (
      <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <p className="text-sm text-slate-500">
            {erro || "Grupo nao encontrado."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <ModuleBackLink href="/grupos-recursos" label="Grupo de Recursos" />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                  {grupo.nome || "Grupo sem nome"}
                </h1>

                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {grupo.ativo ? "Ativo" : "Inativo"}
                </span>
              </div>

              <p className="mt-2 text-sm text-slate-500">
                Codigo {grupo.codigo || "nao informado"}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleExcluir}
                disabled={processando}
                className="inline-flex h-11 w-fit items-center justify-center rounded-lg border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Excluir grupo
              </button>
              <Link
                href={`/grupos-recursos/${id}/editar`}
                className="inline-flex h-11 w-fit items-center justify-center rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Editar grupo
              </Link>
            </div>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <Card titulo="Informacoes do grupo">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
              <Info label="Codigo" value={grupo.codigo} />
              <Info label="Nome" value={grupo.nome} />
              <Info
                label="Unidade de capacidade"
                value={grupo.unidade_capacidade}
              />
            </div>
          </Card>

          <Card titulo="Descricao / Observacoes">
            <div className="px-6 py-6">
              <p className="text-sm font-medium leading-6 text-slate-900">
                {grupo.descricao || "Nao informado"}
              </p>
            </div>
          </Card>

          {bloqueioExclusao === "vinculado" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span>
                Não é possível excluir - há vínculos com produção/histórico.
              </span>
              <button
                type="button"
                onClick={handleInativar}
                className="h-9 shrink-0 rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
              >
                Desativar em vez disso
              </button>
            </div>
          ) : null}

          {bloqueioExclusao === "sem_permissao" ? (
            <p className="text-sm font-medium text-red-600">
              Apenas administradores podem excluir registros.
            </p>
          ) : null}
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

function Info({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-sm font-medium leading-6 text-slate-900">
        {value || "Nao informado"}
      </p>
    </div>
  );
}
