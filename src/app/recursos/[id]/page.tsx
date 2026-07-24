"use client";

import Link from "next/link";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useRecurso } from "@/modules/recursos/hooks/useRecurso";
import { ModuleHeader } from "@/modules/shared/ui/ModuleHeader";
import { ThemeToggle } from "@/modules/shared/ui/ThemeToggle";
import { Card } from "@/modules/shared/ui/Card";

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
      <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <p className="text-sm text-text-secondary">Carregando recurso...</p>
        </div>
      </main>
    );
  }

  if (erro || !recurso) {
    return (
      <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <p className="text-sm text-text-secondary">
            {erro || "Recurso nao encontrado."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <ModuleHeader
          backButton={<ModuleBackLink href="/recursos" label="Recurso" />}
          themeToggle={<ThemeToggle />}
          title={
            <>
              <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
                {recurso.nome || "Recurso sem nome"}
              </h1>

              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {recurso.ativo ? "Ativo" : "Inativo"}
              </span>
            </>
          }
          subtitle={`Codigo ${recurso.codigo || "nao informado"}`}
          actions={
            <>
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
            </>
          }
        />

        <section className="flex flex-col gap-5">
          <Card title="Informacoes do recurso">
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              <Info label="Codigo" value={recurso.codigo} />
              <Info label="Nome" value={recurso.nome} />
              <Info label="Grupo" value={recurso.grupo?.nome} />
              <Info label="Valor Hora" value={formatValorHora(recurso.valor_hora)} />
              <Info label="Setor / Centro de trabalho" value={recurso.setor} />
            </div>
          </Card>

          <Card title="Caracteristicas">
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-status-warning-border bg-status-warning-bg px-4 py-3 text-sm text-status-warning-text">
              <span>
                Não é possível excluir - há vínculos com produção/histórico.
              </span>
              <button
                type="button"
                onClick={handleInativar}
                className="h-9 shrink-0 rounded-md border border-status-warning-border bg-surface-elevated px-3 text-sm font-semibold text-status-warning-text transition hover:bg-status-warning-bg"
              >
                Desativar em vez disso
              </button>
            </div>
          ) : null}

          {bloqueioExclusao === "sem_permissao" ? (
            <p className="text-sm font-medium text-status-danger-text">
              Apenas administradores podem excluir registros.
            </p>
          ) : null}
        </section>
      </div>
    </main>
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
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-disabled">
        {label}
      </p>

      <p className="mt-2 text-sm font-medium leading-6 text-text-primary">
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
