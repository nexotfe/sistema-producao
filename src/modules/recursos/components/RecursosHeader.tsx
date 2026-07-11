"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SituacaoRecurso } from "../types";

type RecursosHeaderProps = {
  usuario: string;
  busca: string;
  setBusca: (value: string) => void;
  situacao: SituacaoRecurso;
  setSituacao: (value: SituacaoRecurso) => void;
  totais: {
    todos: number;
    ativos: number;
    inativos: number;
  };
};

export function RecursosHeader({
  usuario,
  busca,
  setBusca,
  situacao,
  setSituacao,
  totais,
}: RecursosHeaderProps) {
  const router = useRouter();

  return (
    <>
      <header className="rounded-t-lg border-x border-t border-slate-200 bg-[#0B1B2B] px-5 py-4 -mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/5 text-xs font-bold text-slate-300">
              LOGO
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
              Recursos
            </h1>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label htmlFor="busca-recursos" className="sr-only">
              Buscar recursos
            </label>
            <input
              id="busca-recursos"
              type="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar por recurso, codigo, grupo ou setor"
              className="h-10 w-full rounded-md border border-white/[0.15] bg-white/[0.08] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/40 lg:w-[min(42vw,520px)]"
            />

            <span className="whitespace-nowrap text-sm font-medium text-slate-300">
              Nome do Usuário
            </span>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="h-10 rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
              >
                Voltar
              </button>
              <Link
                href="/central"
                className="inline-flex h-10 items-center rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
              >
                Início
              </Link>
            </div>
          </div>
        </div>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex w-full flex-wrap items-center justify-start gap-2">
            <div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-slate-200 bg-app-card p-1">
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
          </div>
        </div>
      </section>
    </>
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
