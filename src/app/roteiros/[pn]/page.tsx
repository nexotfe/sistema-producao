"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { useRoteiro } from "@/modules/roteiros/hooks/useRoteiro";
import { RoteiroForm } from "@/modules/roteiros/components/RoteiroForm";
import { ExcluirRoteiroModal } from "@/modules/roteiros/components/ExcluirRoteiroModal";
import { DuplicarProdutoModal } from "@/modules/produtos/components/DuplicarProdutoModal";
import { ModuleBackTrigger } from "@/modules/shared/navigation/ModuleBackTrigger";
import { getEntityHref } from "@/modules/shared/navigation/entityRoutes";
import { Button } from "@/modules/shared/ui/Button";

type RoutePageProps = {
  params: Promise<{
    pn: string;
  }>;
};

export default function ManufacturingRoutePage({ params }: RoutePageProps) {
  const { pn } = use(params);
  const codigoProduto = decodeURIComponent(pn);
  const router = useRouter();
  const [duplicarAberto, setDuplicarAberto] = useState(false);
  const [excluirAberto, setExcluirAberto] = useState(false);
  const {
    produtoId,
    bom,
    loading,
    processando,
    erro,
    produtoDescricao,
    criarPrimeiroRoteiro,
    excluirRoteiro,
    materiais,
    adicionarMaterial,
    editarMaterial,
    removerMaterial,
    subconjuntos,
    adicionarSubconjunto,
    removerSubconjunto,
    trocarVinculoSubconjunto,
    operacoesEngenharia,
    operacoesProducao,
    recursosDisponiveis,
    adicionarOperacao,
    editarOperacao,
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
  } = useRoteiro(codigoProduto);

  return (
    <main className="min-h-screen bg-background text-text-primary">
      <header className="bg-background px-4 pt-4 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-t-lg border-x border-t border-border bg-[#0B1B2B] px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/5 text-xs font-bold text-slate-300">
                  LOGO
                </div>

                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
                    Roteiro de Fabricação
                  </h1>
                  <p className="mt-1 text-sm text-slate-300">
                    Código {pn}
                    {produtoDescricao ? ` — ${produtoDescricao}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <span className="whitespace-nowrap text-sm font-medium text-slate-300">
                  Nome do usuário
                </span>

                <div className="flex flex-wrap gap-2">
                  <ModuleBackTrigger
                    fallbackHref="/produtos"
                    className="inline-flex h-10 items-center rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
                  >
                    Voltar
                  </ModuleBackTrigger>
                  <Link
                    href="/central"
                    className="inline-flex h-10 items-center rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
                  >
                    Início
                  </Link>
                  <button
                    type="button"
                    className="h-10 rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicarAberto(true)}
                    disabled={!produtoId}
                    className="h-10 rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => setExcluirAberto(true)}
                    disabled={!bom}
                    className="h-10 rounded-md border border-red-500/40 bg-red-500/10 px-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Excluir roteiro
                  </button>
                  <Button>Salvar</Button>
                </div>

                <button className="h-10 rounded-md border border-white/20 bg-white/[0.08] px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]">
                  Anexar PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {loading ? (
        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <p className="text-sm text-text-secondary">Carregando roteiro...</p>
        </section>
      ) : erro ? (
        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <p className="text-sm font-medium text-status-danger-text">{erro}</p>
        </section>
      ) : !bom ? (
        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="rounded-md border border-border bg-surface p-8 text-center">
            <p className="text-sm text-text-secondary">
              Este produto ainda não tem nenhum roteiro cadastrado.
            </p>
            <Button
              className="mt-4"
              onClick={() => criarPrimeiroRoteiro()}
              disabled={processando}
            >
              {processando ? "Criando..." : "Criar Roteiro (versão A, rascunho)"}
            </Button>
          </div>
        </section>
      ) : (
        <RoteiroForm
          bom={bom}
          processando={processando}
          materiais={materiais}
          onAdicionarMaterial={adicionarMaterial}
          onEditarMaterial={editarMaterial}
          onRemoverMaterial={removerMaterial}
          subconjuntos={subconjuntos}
          onAdicionarSubconjunto={adicionarSubconjunto}
          onRemoverSubconjunto={removerSubconjunto}
          onTrocarVinculoSubconjunto={trocarVinculoSubconjunto}
          operacoesEngenharia={operacoesEngenharia}
          operacoesProducao={operacoesProducao}
          recursosDisponiveis={recursosDisponiveis}
          onAdicionarOperacao={adicionarOperacao}
          onEditarOperacao={editarOperacao}
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

      {produtoId ? (
        <DuplicarProdutoModal
          open={duplicarAberto}
          onClose={() => setDuplicarAberto(false)}
          produtoOrigemId={produtoId}
          produtoOrigemCodigo={codigoProduto}
        />
      ) : null}

      {bom ? (
        <ExcluirRoteiroModal
          open={excluirAberto}
          onClose={() => setExcluirAberto(false)}
          codigoProduto={codigoProduto}
          versaoRoteiro={bom.versao}
          onConfirmar={excluirRoteiro}
          onSucesso={() => {
            router.push(getEntityHref("item", encodeURIComponent(codigoProduto)));
          }}
        />
      ) : null}
    </main>
  );
}
