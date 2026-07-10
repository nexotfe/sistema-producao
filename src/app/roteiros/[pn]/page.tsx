"use client";

import Link from "next/link";
import { use } from "react";
import { useRoteiro } from "@/modules/roteiros/hooks/useRoteiro";
import { RoteiroForm } from "@/modules/roteiros/components/RoteiroForm";
import { ModuleBackTrigger } from "@/modules/shared/navigation/ModuleBackTrigger";

type RoutePageProps = {
  params: Promise<{
    pn: string;
  }>;
};

export default function ManufacturingRoutePage({ params }: RoutePageProps) {
  const { pn } = use(params);
  const {
    bom,
    loading,
    processando,
    erro,
    criarPrimeiroRoteiro,
    materiais,
    materiasPrimasDisponiveis,
    adicionarMaterial,
    removerMaterial,
    subconjuntos,
    produtosDisponiveis,
    adicionarSubconjunto,
    removerSubconjunto,
    operacoesEngenharia,
    operacoesProducao,
    tecnologiasDisponiveis,
    adicionarOperacao,
    removerOperacao,
    proximaOrdemOperacoes,
    servicosTerceiros,
    fornecedoresDisponiveis,
    adicionarServicoTerceiro,
    removerServicoTerceiro,
    transportes,
    adicionarTransporte,
    removerTransporte,
    custo,
  } = useRoteiro(decodeURIComponent(pn));

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="bg-slate-50 px-4 pt-4 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-lg border border-slate-200 bg-white px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                  LOGO
                </div>

                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                    Roteiro de Fabricação
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">PN {pn}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <span className="whitespace-nowrap text-sm font-medium text-slate-500">
                  Nome do usuário
                </span>

                <div className="flex flex-wrap gap-2">
                  <ModuleBackTrigger
                    fallbackHref="/produtos"
                    className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Voltar
                  </ModuleBackTrigger>
                  <Link
                    href="/central"
                    className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Início
                  </Link>
                  <button
                    type="button"
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Excluir
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800"
                  >
                    Salvar
                  </button>
                </div>

                <button className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                  Anexar PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {loading ? (
        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <p className="text-sm text-slate-500">Carregando roteiro...</p>
        </section>
      ) : erro ? (
        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <p className="text-sm font-medium text-red-600">{erro}</p>
        </section>
      ) : !bom ? (
        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="rounded-md border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">
              Este produto ainda não tem nenhum roteiro cadastrado.
            </p>
            <button
              type="button"
              onClick={() => criarPrimeiroRoteiro()}
              disabled={processando}
              className="mt-4 h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {processando ? "Criando..." : "Criar Roteiro (versão A, rascunho)"}
            </button>
          </div>
        </section>
      ) : (
        <RoteiroForm
          bom={bom}
          materiais={materiais}
          materiasPrimasDisponiveis={materiasPrimasDisponiveis}
          onAdicionarMaterial={adicionarMaterial}
          onRemoverMaterial={removerMaterial}
          subconjuntos={subconjuntos}
          produtosDisponiveis={produtosDisponiveis}
          onAdicionarSubconjunto={adicionarSubconjunto}
          onRemoverSubconjunto={removerSubconjunto}
          operacoesEngenharia={operacoesEngenharia}
          operacoesProducao={operacoesProducao}
          tecnologiasDisponiveis={tecnologiasDisponiveis}
          onAdicionarOperacao={adicionarOperacao}
          onRemoverOperacao={removerOperacao}
          proximaOrdemOperacoes={proximaOrdemOperacoes}
          servicosTerceiros={servicosTerceiros}
          fornecedoresDisponiveis={fornecedoresDisponiveis}
          onAdicionarServicoTerceiro={adicionarServicoTerceiro}
          onRemoverServicoTerceiro={removerServicoTerceiro}
          transportes={transportes}
          onAdicionarTransporte={adicionarTransporte}
          onRemoverTransporte={removerTransporte}
          custo={custo}
        />
      )}
    </main>
  );
}
