"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const purchasePlans = [
  {
    number: "PC-260001",
    material: "SAE 1045 redondo 4",
    mode: "Somar todas",
    totalSum: "2.700 mm",
    status: "Em planejamento",
  },
  {
    number: "PC-260002",
    material: "SAE 1020 chapa 3/4",
    mode: "Agrupamento parcial",
    totalSum: "0,33 m2",
    status: "Em planejamento",
  },
  {
    number: "PC-260003",
    material: "Aluminio 7075 bloco",
    mode: "Por OF",
    totalSum: "6 peca",
    status: "Pronto pedido",
  },
];

const statusStyles = {
  "Em planejamento": "bg-amber-50 text-amber-700 ring-amber-200",
  "Pronto pedido": "bg-emerald-50 text-emerald-700 ring-emerald-200",
} as const;

export default function PurchasePlanningPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="px-4 py-6 sm:px-6">
        <div className="mx-auto w-full max-w-7xl">
          <div className="rounded-lg border border-slate-200 bg-white px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                  LOGO
                </div>

                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                    Planejamento de compras
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">Compras</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <span className="whitespace-nowrap text-sm font-medium text-slate-500">
                  Nome do usuário
                </span>

                <label htmlFor="planning-search" className="sr-only">
                  Buscar planejamento
                </label>
                <input
                  id="planning-search"
                  type="search"
                  placeholder="Buscar planejamento ou material"
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 lg:w-72"
                />

                <nav
                  aria-label="Ações do planejamento"
                  className="flex flex-wrap gap-2"
                >
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
                  <Link
                    href="/fornecedores"
                    className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Fornecedores
                  </Link>
                  <Link
                    href="/estoque/materias-primas"
                    className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Estoque
                  </Link>
                </nav>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <section className="rounded-md border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold">Planejamentos ativos</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Escolha o modo e abra o PC para decidir a compra.
              </p>
            </div>

            <span className="text-xs font-semibold text-slate-500">
              {purchasePlans.length} planejamentos
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="w-[14%] px-4 py-2 font-semibold">Planej.</th>
                  <th className="w-[32%] px-4 py-2 font-semibold">Material</th>
                  <th className="w-[18%] px-4 py-2 font-semibold">Modo</th>
                  <th className="w-[14%] px-4 py-2 font-semibold">Soma total</th>
                  <th className="w-[14%] px-4 py-2 font-semibold">Status</th>
                  <th className="w-[8%] px-4 py-2 font-semibold">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchasePlans.map((plan) => (
                  <tr key={plan.number} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-blue-700">
                      <Link href={`/compras/planejamento/${plan.number}`}>
                        {plan.number}
                      </Link>
                    </td>
                    <td className="truncate px-4 py-3 text-slate-700">
                      {plan.material}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {plan.mode}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{plan.totalSum}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${
                          statusStyles[
                            plan.status as keyof typeof statusStyles
                          ]
                        }`}
                      >
                        {plan.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/compras/planejamento/${plan.number}`}
                        className="text-xs font-semibold text-blue-700 hover:underline"
                      >
                        Abrir
                      </Link>
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
