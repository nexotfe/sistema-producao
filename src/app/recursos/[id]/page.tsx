"use client";

import Link from "next/link";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useRecurso } from "@/modules/recursos/hooks/useRecurso";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default function RecursoPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { recurso, loading, erro, processando, inativarRecurso, excluirRecurso } =
    useRecurso(id);
  const [bloqueioExclusao, setBloqueioExclusao] = useState<
    "vinculado" | "sem_permissao" | null
  >(null);

  async function handleInativar() {
    const sucesso = await inativarRecurso();

    if (sucesso) {
      router.push("/recursos");
    }
  }

  async function handleExcluir() {
    const confirmado = window.confirm(
      "Deseja excluir permanentemente este recurso? Essa ação não pode ser desfeita.",
    );

    if (!confirmado) {
      return;
    }

    setBloqueioExclusao(null);
    const resultado = await excluirRecurso();

    if (resultado.status === "excluido") {
      router.push("/recursos");
      return;
    }

    if (resultado.status === "vinculado" || resultado.status === "sem_permissao") {
      setBloqueioExclusao(resultado.status);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-app-bg px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <p className="text-sm text-slate-500">Carregando recurso...</p>
        </div>
      </main>
    );
  }

  if (erro || !recurso) {
    return (
      <main className="min-h-screen bg-app-bg px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <p className="text-sm text-slate-500">
            {erro || "Recurso nao encontrado."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-app-bg px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <ModuleBackLink href="/recursos" label="Recurso" />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                  {recurso.nome || "Recurso sem nome"}
                </h1>

                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {recurso.ativo ? "Ativo" : "Inativo"}
                </span>
              </div>

              <p className="mt-2 text-sm text-slate-500">
                Codigo {recurso.codigo || "nao informado"}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleExcluir}
                disabled={processando}
                className="inline-flex h-11 w-fit items-center justify-center rounded-lg border border-slate-200 bg-app-card px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Excluir recurso
              </button>
              <Link
                href={`/recursos/${id}/editar`}
                className="inline-flex h-11 w-fit items-center justify-center rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Editar recurso
              </Link>
            </div>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <Card titulo="Informacoes do recurso">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
              <Info label="Codigo" value={recurso.codigo} />
              <Info label="Nome" value={recurso.nome} />
              <Info label="Grupo" value={recurso.grupo?.nome} />
              <Info label="Valor Hora" value={formatValorHora(recurso.valor_hora)} />
              <Info label="Setor / Centro de trabalho" value={recurso.setor} />
            </div>
          </Card>

          <Card titulo="Caracteristicas">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
              <Info label="Fabricante" value={recurso.fabricante} />
              <Info label="Modelo" value={recurso.modelo} />
              <Info
                label="Capacidade Diária"
                value={
                  recurso.capacidade_horas_dia !== null &&
                  recurso.capacidade_horas_dia !== undefined
                    ? `${formatNumero(recurso.capacidade_horas_dia)} h/dia`
                    : null
                }
              />
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
    <div className="rounded-lg border border-slate-200 bg-app-card">
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
  value: string | number | null | undefined;
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

function formatNumero(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return value.toLocaleString("pt-BR");
}

function formatValorHora(value: number | null | undefined) {
  const valor = value ?? 0;

  return `${valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })}/h`;
}
