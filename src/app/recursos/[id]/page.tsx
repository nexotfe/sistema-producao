"use client";

import Link from "next/link";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { use } from "react";
import { useRecurso } from "@/modules/recursos/hooks/useRecurso";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default function RecursoPage({ params }: Props) {
  const { id } = use(params);
  const { recurso, loading, erro } = useRecurso(id);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <p className="text-sm text-slate-500">Carregando recurso...</p>
        </div>
      </main>
    );
  }

  if (erro || !recurso) {
    return (
      <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <p className="text-sm text-slate-500">
            {erro || "Recurso nao encontrado."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
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

            <Link
              href={`/recursos/${id}/editar`}
              className="inline-flex h-11 w-fit items-center justify-center rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Editar recurso
            </Link>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <Card titulo="Informacoes do recurso">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
              <Info label="Codigo" value={recurso.codigo} />
              <Info label="Nome" value={recurso.nome} />
              <Info label="Setor / Centro de trabalho" value={recurso.setor} />
            </div>
          </Card>

          <Card titulo="Caracteristicas">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
              <Info label="Fabricante" value={recurso.fabricante} />
              <Info label="Modelo" value={recurso.modelo} />
              <Info label="Capacidade" value={formatNumero(recurso.capacidade)} />
            </div>
          </Card>
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
