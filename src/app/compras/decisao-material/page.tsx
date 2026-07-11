"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";

const materialDecisions = [
  {
    project: "260125",
    of: "260125-0001",
    materialCode: "MP-001",
    material: "SAE 1045 redondo",
    unit: "metro",
    internalConsumption: "40",
    externalPurchase: "60",
    total: "100",
    cost: "R$ 1.840,00",
    needDate: "18/06",
    status: "CI parcial + compra",
  },
  {
    project: "260125",
    of: "260125-0002",
    materialCode: "MP-002",
    material: "Chapa aco carbono 12mm",
    unit: "chapa",
    internalConsumption: "8",
    externalPurchase: "0",
    total: "8",
    cost: "R$ 2.320,00",
    needDate: "19/06",
    status: "CI total",
  },
  {
    project: "260126",
    of: "260126-0001",
    materialCode: "MP-003",
    material: "Aluminio 7075 bloco",
    unit: "peca",
    internalConsumption: "0",
    externalPurchase: "6",
    total: "6",
    cost: "R$ 0,00",
    needDate: "21/06",
    status: "Compra total",
  },
];

const statusStyles = {
  "CI total": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "CI parcial + compra": "bg-amber-50 text-amber-700 ring-amber-200",
  "Compra total": "bg-red-50 text-red-700 ring-red-200",
} as const;

export default function MaterialDecisionPage() {
  const router = useRouter();
  const [busca, setBusca] = useState("");

  return (
    <main className="min-h-screen bg-app-bg text-slate-950">
      <header className="bg-app-bg">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6">
          <header className="rounded-t-lg border-x border-t border-slate-200 bg-[#0B1B2B] px-5 py-4 -mb-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/5 text-xs font-bold text-slate-300">
                  LOGO
                </div>

                <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
                  Decisão de Material
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
      </header>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <section className="rounded-md border border-slate-200 bg-app-card">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold">OF x material</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Consumo interno e compra externa por necessidade.
              </p>
            </div>

            <span className="text-xs font-semibold text-slate-500">
              {materialDecisions.length} decisoes
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] table-fixed text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="w-[9%] px-4 py-2 font-semibold">Projeto</th>
                  <th className="w-[12%] px-4 py-2 font-semibold">OF</th>
                  <th className="w-[9%] px-4 py-2 font-semibold">Codigo</th>
                  <th className="w-[22%] px-4 py-2 font-semibold">Material</th>
                  <th className="w-[8%] px-4 py-2 font-semibold">Unid</th>
                  <th className="w-[9%] px-4 py-2 font-semibold">CI</th>
                  <th className="w-[10%] px-4 py-2 font-semibold">Compra</th>
                  <th className="w-[8%] px-4 py-2 font-semibold">Total</th>
                  <th className="w-[11%] px-4 py-2 font-semibold">Custo CI</th>
                  <th className="w-[9%] px-4 py-2 font-semibold">Necess.</th>
                  <th className="w-[14%] px-4 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {materialDecisions.map((decision) => (
                  <tr
                    key={`${decision.of}-${decision.materialCode}`}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-bold text-blue-700">
                      <EntityLink type="projeto" id={decision.project}>
                        {decision.project}
                      </EntityLink>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      <EntityLink
                        type="of"
                        id={decision.of}
                        className="font-semibold text-slate-950 transition hover:text-slate-700"
                      >
                        {decision.of}
                      </EntityLink>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {decision.materialCode}
                    </td>
                    <td className="truncate px-4 py-3 text-slate-700">
                      {decision.material}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {decision.unit}
                    </td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">
                      {decision.internalConsumption}
                    </td>
                    <td className="px-4 py-3 font-semibold text-amber-700">
                      {decision.externalPurchase}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {decision.total}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {decision.cost}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {decision.needDate}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${
                          statusStyles[
                            decision.status as keyof typeof statusStyles
                          ]
                        }`}
                      >
                        {decision.status}
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
