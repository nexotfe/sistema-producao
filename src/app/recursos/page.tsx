"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RecursosTable } from "@/modules/recursos/components/RecursosTable";
import { useRecursos } from "@/modules/recursos/hooks/useRecursos";
import { ModuleHeader } from "@/modules/shared/ui/ModuleHeader";
import { ThemeToggle } from "@/modules/shared/ui/ThemeToggle";

const colunasVisiveis = {
  codigo: true,
  nome: true,
  grupo: true,
  valorHora: true,
  setor: false,
  capacidade: true,
  status: true,
};

export default function RecursosPage() {
  const router = useRouter();
  const {
    recursos,
    busca,
    setBusca,
    situacao,
    setSituacao,
    totais,
    loading,
    erro,
    alternarAtivoRecurso,
    excluirRecurso,
  } = useRecursos();

  return (
    <main className="min-h-screen bg-app-bg px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <ModuleHeader
          variant="brand"
          title="Recursos"
          themeToggle={<ThemeToggle />}
          actions={
            <>
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
            </>
          }
        />

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

        <RecursosTable
          recursos={recursos}
          loading={loading}
          erro={erro}
          busca={busca}
          colunasVisiveis={colunasVisiveis}
          alternarAtivoRecurso={alternarAtivoRecurso}
          excluirRecurso={excluirRecurso}
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
