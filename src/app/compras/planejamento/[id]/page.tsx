"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";
import { PurchasePlanningDecision } from "./PurchasePlanningDecision";

type PurchasePlanningDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const planningOrigins = [
  {
    of: "260125-0001",
    project: "260125",
    dimension: '4" x 100mm',
    pieces: "2",
    needed: "200 mm",
    status: "Incluida",
  },
  {
    of: "260126-0002",
    project: "260126",
    dimension: '4" x 500mm',
    pieces: "5",
    needed: "2.500 mm",
    status: "Incluida",
  },
  {
    of: "260127-0001",
    project: "260127",
    dimension: '4" x 1000mm',
    pieces: "1",
    needed: "1.000 mm",
    status: "Incluida",
  },
];

const statusStyles = {
  Incluida: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Excluida: "bg-slate-50 text-slate-600 ring-slate-200",
} as const;

export default function PurchasePlanningDetailPage({
  params,
}: PurchasePlanningDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [busca, setBusca] = useState("");

  return (
    <main className="min-h-screen bg-app-bg text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <header className="rounded-t-lg border-x border-t border-slate-200 bg-[#0B1B2B] px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/5 text-xs font-bold text-slate-300">
                LOGO
              </div>

              <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
                Planejamento de Compras
              </h1>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label htmlFor="busca-clientes" className="sr-only">
                Buscar clientes
              </label>
              <input
                id="busca-clientes"
                type="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar por cliente, CNPJ, cidade ou contato"
                className="h-10 w-full rounded-md border border-white/[0.15] bg-white/[0.08] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/40 lg:w-[min(42vw,520px)]"
              />

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
              </div>
            </div>
          </div>
        </header>
      </div>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-app-card p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Material
            </p>
            <p className="mt-2 text-sm font-bold text-slate-950">
              SAE 1045 redondo 4
            </p>
          </div>

          <div className="rounded-md border border-slate-200 bg-app-card p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Soma total
            </p>
            <p className="mt-2 text-sm font-bold text-slate-950">
              3.700 mm
            </p>
          </div>

        </section>

        <PurchasePlanningDecision planningNumber={id} />

        <section className="rounded-md border border-slate-200 bg-app-card">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-bold">OFs do planejamento</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Origens somadas ou separadas pelo comprador.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Projeto</th>
                  <th className="px-4 py-2 font-semibold">OF</th>
                  <th className="px-4 py-2 font-semibold">Dimensao</th>
                  <th className="px-4 py-2 font-semibold">Pecas</th>
                  <th className="px-4 py-2 font-semibold">Necessidade</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {planningOrigins.map((origin) => (
                  <tr key={origin.of} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-blue-700">
                      <EntityLink type="projeto" id={origin.project}>
                        {origin.project}
                      </EntityLink>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      <EntityLink
                        type="of"
                        id={origin.of}
                        className="font-semibold text-slate-950 transition hover:text-slate-700"
                      >
                        {origin.of}
                      </EntityLink>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {origin.dimension}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {origin.pieces}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {origin.needed}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${
                          statusStyles[
                            origin.status as keyof typeof statusStyles
                          ]
                        }`}
                      >
                        {origin.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
