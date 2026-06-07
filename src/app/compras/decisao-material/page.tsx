import Link from "next/link";

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
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="grid gap-3 lg:grid-cols-[180px_1fr_180px] lg:items-center">
            <p className="text-sm font-semibold">Flavio Evangelista</p>

            <label htmlFor="decision-search" className="sr-only">
              Buscar decisao material
            </label>
            <input
              id="decision-search"
              type="search"
              placeholder="Buscar projeto, OF ou materia-prima"
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />

            <Link
              href="/estoque/materias-primas"
              className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Estoque
            </Link>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700">Compras</p>
              <h1 className="mt-1 text-2xl font-bold">Decisao material</h1>
            </div>

            <nav aria-label="Atalhos de compras" className="flex flex-wrap gap-2">
              <Link
                href="/compras"
                className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
              >
                Compras
              </Link>
              <Link
                href="/dashboard"
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Comercial
              </Link>
              <Link
                href="/roteiros/1243-01"
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Roteiro Fabricacao
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <section className="rounded-md border border-slate-200 bg-white">
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
                      <Link href={`/projetos/${decision.project}`}>
                        {decision.project}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {decision.of}
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
