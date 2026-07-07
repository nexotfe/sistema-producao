"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ProjectStructureItemsTable,
  type ProjectStructureItem,
} from "@/modules/projetos/components/ProjectStructureItemsTable";

const quoteItems: ProjectStructureItem[] = [
  {
    description:
      "Base soldada estrutural para suporte de conjunto mecânico industrial",
    pn: "1243-01",
    revision: "Rev.A",
    quantity: 1,
    routeStatus: "Em edição",
    hours: "Depende do roteiro",
    destination: "Após aprovação",
    structureSlug: "conjunto-da-serra",
    componentCount: 12,
    situation: "Estrutura criada",
    cost: "R$ 531,00",
    taxes: "R$ 76,09",
    profit: "R$ 106,20",
    total: "R$ 713,29",
  },
  {
    description: "Eixo usinado",
    pn: "1244-01",
    revision: "Rev.B",
    quantity: 2,
    routeStatus: "Completo",
    hours: "5,5h",
    destination: "Após aprovação",
    situation: "Roteiro concluído",
    cost: "R$ 420,00",
    taxes: "R$ 60,19",
    profit: "R$ 84,00",
    total: "R$ 564,19",
  },
  {
    description: "Suporte",
    pn: "1245-01",
    revision: "Rev.A",
    quantity: 4,
    routeStatus: "Pendente",
    hours: "Depende do roteiro",
    destination: "Após aprovação",
    situation: "Produto cadastrado",
    cost: "—",
    taxes: "—",
    profit: "—",
    total: "—",
  },
];

type ProjectDetailsPageContentProps = {
  projectId?: string;
};

export function ProjectDetailsPageContent({
  projectId = "260123",
}: ProjectDetailsPageContentProps) {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="bg-slate-50 pt-4">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="rounded-lg border border-slate-200 bg-white px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                  LOGO
                </div>

                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                    Orçamento
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Novo orçamento
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <span className="whitespace-nowrap text-sm font-medium text-slate-500">
                  Nome do usuário
                </span>

                <div className="flex flex-wrap gap-2">
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
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <section className="rounded-md border border-slate-200 bg-white p-4">
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
                260123
              </div>
            </div>

            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Descrição do Projeto
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                Desenvolvimento de conjunto mecânico
              </div>
            </div>

            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Cliente
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                EMBRAER
              </div>
            </div>

            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Natureza
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                Desenvolvimento
              </div>
            </div>

            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Responsável pelo Projeto
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                Flávio Evangelista
              </div>
            </div>

            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Data de Inclusão
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                02/07/2026
              </div>
            </div>

            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Data de Necessidade
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                30/08/2026
              </div>
            </div>

          </div>
        </section>


        <ProjectStructureItemsTable
          title="Itens do projeto"
          subtitle="Abra o roteiro para definir matéria-prima, operações e horas."
          items={quoteItems}
          basePath={`/projetos/${projectId}/estrutura`}
        />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <section className="rounded-md border border-slate-200 bg-white p-3">
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
                    type="number"
                    defaultValue="20.00"
                    step="0.01"
                    min="0"
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

          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold">Resumo do Orçamento</h2>
            {/*
              TODO: calcular automaticamente a partir da tabela de itens:
              Custo Total = soma da coluna "Custo".
              Impostos Totais = soma da coluna "Impostos".
              Lucro Total = soma da coluna "Lucro".
              Valor Total do Orçamento = soma da coluna "Total".
            */}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  Custo Total
                </span>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                  R$ 951,00
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  Impostos Totais
                </span>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                  R$ 136,28
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  Lucro Total
                </span>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                  R$ 190,20
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  Valor Total do Orçamento
                </span>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                  R$ 1.277,48
                </div>
              </div>
            </div>
          </section>
        </div>
        <section className="rounded-md border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold">Carga Tributária</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Percentual tributário sugerido pela natureza do projeto.
              </p>
            </div>
          </div>

          <div className="grid gap-3 px-4 py-4 sm:grid-cols-3">
            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Natureza
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                Desenvolvimento
              </div>
            </div>

            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Carga Tributária Sugerida
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                14,33%
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Carga Tributária do Orçamento
              </label>
              <input
                defaultValue="14,33%"
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {/*
            TODO: integrar a Carga Tributária Sugerida com:
            Configurações > Comercial > Naturezas > Carga Tributária Padrão.
          */}
          <p className="px-4 pb-1 text-xs leading-5 text-slate-500">
            A Natureza do Projeto determina automaticamente a Carga Tributária
            Sugerida. O percentual sugerido é definido nas Configurações do
            Sistema. O orçamentista poderá alterar a Carga Tributária do
            Orçamento sempre que necessário.
          </p>
        </section>

        <div className="flex justify-end">
          {/*
            TODO: herdar dados do orçamento na Proposta Comercial:
            Projeto, Orçamento, Cliente, Itens, Quantidades, Custos, Impostos,
            Lucro, Valor Total, informações de entrega e resumo do orçamento.
          */}
          <Link
            href="/proposta-comercial"
            className="h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
          >
            Gerar Proposta Comercial
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function NewProjectPage() {
  return <ProjectDetailsPageContent />;
}
