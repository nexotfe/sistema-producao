"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ProjectStructureItemsTable,
  type ProjectStructureItem,
} from "@/modules/projetos/components/ProjectStructureItemsTable";
import { ProdutoSearchModal } from "@/modules/projetos/components/ProdutoSearchModal";
import { useOrcamento } from "@/modules/projetos/hooks/useOrcamento";
import { PROJECT_TYPE_LABELS } from "@/modules/projetos/constants";

type ProjectDetailsPageContentProps = {
  projectId?: string | null;
};

function formatarData(iso: string | null) {
  if (!iso) {
    return "—";
  }

  return new Date(iso).toLocaleDateString("pt-BR");
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ProjectDetailsPageContent({
  projectId = null,
}: ProjectDetailsPageContentProps) {
  const router = useRouter();

  const {
    projetoId,
    numeroProjeto,
    nomeProjeto,
    tipoProjeto,
    dataObjetivo,
    criadoEm,
    responsavelNome,
    cliente,
    margemLucroPercent,
    setMargemLucroPercent,
    cargaTributariaPercent,
    setCargaTributariaPercent,
    cargaTributariaEfetiva,
    itens,
    resumoOrcamento,
    erro,
    mensagem,
    formulaErro,
    salvando,
    salvar,
    adicionarItem,
  } = useOrcamento(projectId);

  const [modalProdutoAberto, setModalProdutoAberto] = useState(false);

  // Inputs de texto (nao type="number"): evita o bug conhecido de inputs
  // numericos controlados no React, onde um digito residual ("0" deixado
  // ao limpar o campo) nao e corrigido pelo DOM e vira "020" ao digitar
  // "20" em seguida. Aqui o texto exibido e o que o usuario digitou; o
  // valor numerico limpo (sem zero a esquerda) vai para o hook a cada
  // mudanca, e o texto se resincroniza com o numero quando ele muda por
  // outra via (ex: carregamento inicial).
  const [margemTexto, setMargemTexto] = useState(String(margemLucroPercent));
  const [cargaTexto, setCargaTexto] = useState(
    String(cargaTributariaPercent ?? cargaTributariaEfetiva),
  );

  useEffect(() => {
    setMargemTexto(String(margemLucroPercent));
  }, [margemLucroPercent]);

  useEffect(() => {
    setCargaTexto(String(cargaTributariaPercent ?? cargaTributariaEfetiva));
  }, [cargaTributariaPercent, cargaTributariaEfetiva]);

  if (!projectId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-app-bg px-4 text-slate-950">
        <div className="max-w-md rounded-lg border border-slate-200 bg-app-card p-6 text-center">
          <h1 className="text-lg font-bold">Nenhum projeto selecionado</h1>
          <p className="mt-2 text-sm text-slate-500">
            Um orçamento sempre parte de um projeto existente. Abra um projeto
            e clique em &quot;Orçamento&quot; para montar o orçamento dele.
          </p>
          <Link
            href="/projeto"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
          >
            Ir para Projeto
          </Link>
        </div>
      </main>
    );
  }

  const itensParaTabela: ProjectStructureItem[] = itens.map((item) => ({
    description: item.descricao,
    pn: item.pn,
    revision: item.revisao ?? undefined,
    quantity: item.quantidade,
    structureSlug: item.temEstrutura
      ? `${item.pn.toLowerCase()}-estrutura`
      : undefined,
    cost: formatarMoeda(item.custo),
    taxes: formatarMoeda(item.impostos),
    profit: formatarMoeda(item.lucro),
    total: formatarMoeda(item.total),
  }));

  async function handleSalvar() {
    await salvar();
  }

  function handleDuplicar() {
    if (projetoId) {
      router.push(`/projeto?duplicar=${projetoId}`);
    }
  }

  function handleNovoProjeto() {
    const confirmado = window.confirm(
      "Iniciar novo projeto? Alterações não salvas nesta tela serão perdidas.",
    );

    if (!confirmado) {
      return;
    }

    router.push("/projeto");
  }

  return (
    <main className="min-h-screen bg-app-bg text-slate-950">
      <header className="bg-app-bg pt-4">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="rounded-t-lg border-x border-t border-slate-200 bg-[#0B1B2B] px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/5 text-xs font-bold text-slate-300">
                  LOGO
                </div>

                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
                    Orçamento
                  </h1>
                  <p className="mt-1 text-sm text-slate-300">
                    {numeroProjeto ? `Projeto ${numeroProjeto}` : "Novo orçamento"}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <span className="whitespace-nowrap text-sm font-medium text-slate-300">
                  Nome do usuário
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
                  <button
                    type="button"
                    onClick={handleNovoProjeto}
                    className="h-10 rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
                  >
                    Novo Projeto
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={handleDuplicar}
                    className="h-10 rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-md border border-red-500/40 bg-red-500/10 px-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
                  >
                    Excluir
                  </button>
                  <button
                    type="button"
                    onClick={handleSalvar}
                    disabled={salvando}
                    className="h-10 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {salvando ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        {(erro || mensagem) && (
          <p className={`text-sm ${erro ? "text-rose-600" : "text-emerald-600"}`}>
            {erro ?? mensagem}
          </p>
        )}

        <section className="rounded-md border border-slate-200 bg-app-card p-4">
          <div className="mb-4">
            <h2 className="text-sm font-bold">Resumo do Projeto</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Informações herdadas do projeto.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Projeto
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                {numeroProjeto ?? "—"}
              </div>
            </div>

            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Descrição do Projeto
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                {nomeProjeto || "—"}
              </div>
            </div>

            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Cliente
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                {cliente?.nome ?? "—"}
              </div>
            </div>

            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Natureza
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                {PROJECT_TYPE_LABELS[tipoProjeto]}
              </div>
            </div>

            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Responsável pelo Projeto
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                {responsavelNome || "—"}
              </div>
            </div>

            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Data de Inclusão
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                {formatarData(criadoEm)}
              </div>
            </div>

            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Data de Necessidade
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                {formatarData(dataObjetivo)}
              </div>
            </div>
          </div>
        </section>

        <ProjectStructureItemsTable
          title="Itens do projeto"
          subtitle="Abra o roteiro para definir matéria-prima, operações e horas."
          items={itensParaTabela}
          basePath={`/projetos/${projectId}/estrutura`}
          onAdicionarItem={() => setModalProdutoAberto(true)}
        />

        <ProdutoSearchModal
          open={modalProdutoAberto}
          onClose={() => setModalProdutoAberto(false)}
          onAdd={({ produtoId, quantidade }) =>
            adicionarItem(produtoId, quantidade)
          }
        />

        {formulaErro && (
          <p className="text-sm font-medium text-rose-600">{formulaErro}</p>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <section className="rounded-md border border-slate-200 bg-app-card p-3">
            <div className="mb-2">
              <h2 className="text-sm font-bold">Margem de Lucro %</h2>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-60 shrink-0">
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Margem de lucro %
                </label>
                <div className="flex">
                  <input
                    inputMode="decimal"
                    value={margemTexto}
                    onChange={(event) => {
                      const texto = event.target.value;
                      setMargemTexto(texto);

                      const numero = Number(texto.replace(",", "."));

                      if (Number.isFinite(numero)) {
                        setMargemLucroPercent(numero);
                      }
                    }}
                    onBlur={() => setMargemTexto(String(margemLucroPercent))}
                    className="h-10 w-full rounded-l-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                  <span className="inline-flex h-10 items-center rounded-r-md border border-l-0 border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-600">
                    %
                  </span>
                </div>
              </div>

              <p className="text-xs leading-5 text-slate-500">
                Valor inicial configurável nas configurações do sistema. O
                orçamentista poderá alterar este percentual conforme a necessidade.
              </p>
            </div>
          </section>

          <section className="rounded-md border border-slate-200 bg-app-card p-4">
            <h2 className="text-sm font-bold">Resumo do Orçamento</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  Custo Total
                </span>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                  {formatarMoeda(resumoOrcamento.custoTotal)}
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  Impostos Totais
                </span>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                  {formatarMoeda(resumoOrcamento.impostosTotal)}
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  Lucro Total
                </span>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                  {formatarMoeda(resumoOrcamento.lucroTotal)}
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  Valor Total do Orçamento
                </span>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                  {formatarMoeda(resumoOrcamento.valorTotal)}
                </div>
              </div>
            </div>
          </section>
        </div>
        <section className="rounded-md border border-slate-200 bg-app-card">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold">Carga Tributária</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Percentual tributário sugerido pela natureza do projeto.
              </p>
            </div>
          </div>

          <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Natureza
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                {PROJECT_TYPE_LABELS[tipoProjeto]}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Carga Tributária do Orçamento
              </label>
              <input
                inputMode="decimal"
                value={cargaTexto}
                onChange={(event) => {
                  const texto = event.target.value;
                  setCargaTexto(texto);

                  const numero = Number(texto.replace(",", "."));

                  if (Number.isFinite(numero)) {
                    setCargaTributariaPercent(numero);
                  }
                }}
                onBlur={() =>
                  setCargaTexto(
                    String(cargaTributariaPercent ?? cargaTributariaEfetiva),
                  )
                }
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <p className="px-4 pb-1 text-xs leading-5 text-slate-500">
            A Natureza do Projeto determina automaticamente a Carga Tributária
            Sugerida. O percentual sugerido é definido nas Configurações do
            Sistema. O orçamentista poderá alterar a Carga Tributária do
            Orçamento sempre que necessário.
          </p>
        </section>

        <div className="flex justify-end">
          <Link
            href={
              projetoId
                ? `/proposta-comercial?projeto=${projetoId}`
                : "/proposta-comercial"
            }
            className="inline-flex h-10 items-center justify-center rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
          >
            Gerar Proposta Comercial
          </Link>
        </div>
      </section>
    </main>
  );
}
