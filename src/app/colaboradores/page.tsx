"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { ColaboradoresTable } from "@/modules/colaboradores/components/ColaboradoresTable";
import { useColaboradores } from "@/modules/colaboradores/hooks/useColaboradores";
import type {
  ColunasColaboradores,
  SituacaoColaborador,
} from "@/modules/colaboradores/types";

export default function ColaboradoresPage() {
  const router = useRouter();
  const {
    colaboradores,
    busca,
    setBusca,
    situacao,
    setSituacao,
    totais,
    loading,
    erro,
    alternarAtivoColaborador,
    excluirColaborador,
  } = useColaboradores();
  const [colunasVisiveis] = useState<ColunasColaboradores>({
    codigo: true,
    nome: true,
    setor: true,
    funcao: true,
    cargaProdutiva: true,
    status: true,
  });

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-lg border border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                LOGO
              </div>

              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                  Colaboradores
                </h1>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label htmlFor="busca-colaboradores" className="sr-only">
                Buscar colaboradores
              </label>
              <input
                id="busca-colaboradores"
                type="search"
                autoComplete="off"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar por colaborador, codigo, setor ou funcao"
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 lg:w-[min(42vw,520px)]"
              />

              <span className="whitespace-nowrap text-sm font-medium text-slate-500">
                Nome do Usuário
              </span>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Voltar
                </button>
                <Link
                  href="/central"
                  className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Início
                </Link>
              </div>
            </div>
          </div>
        </header>

        <div className="inline-flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
          <SituacaoButton
            label="Todos"
            quantidade={totais.todos}
            ativo={situacao === "todos"}
            onClick={() => setSituacao("todos")}
          />
          <SituacaoButton
            label="Ativos"
            quantidade={totais.ativos}
            ativo={situacao === "ativos"}
            onClick={() => setSituacao("ativos")}
          />
          <SituacaoButton
            label="Inativos"
            quantidade={totais.inativos}
            ativo={situacao === "inativos"}
            onClick={() => setSituacao("inativos")}
          />
        </div>

        <ColaboradoresTable
          colaboradores={colaboradores}
          loading={loading}
          erro={erro}
          busca={busca}
          colunasVisiveis={colunasVisiveis}
          alternarAtivoColaborador={alternarAtivoColaborador}
          excluirColaborador={excluirColaborador}
        />
      </div>
    </main>
  );
}

function SituacaoButton({
  label,
  quantidade,
  ativo,
  onClick,
}: {
  label: string;
  quantidade: number;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        ativo
          ? "inline-flex h-9 items-center justify-center rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-900 transition"
          : "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
      }
    >
      {label} ({quantidade})
    </button>
  );
}
