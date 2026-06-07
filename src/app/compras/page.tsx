import Link from "next/link";

const decisionSummary = [
  { label: "CI total", value: "8", tone: "text-emerald-700" },
  { label: "CI parcial", value: "3", tone: "text-amber-700" },
  { label: "Compra total", value: "5", tone: "text-red-700" },
  { label: "Requisicoes abertas", value: "11", tone: "text-blue-700" },
];

const openRequisitions = [
  {
    project: "260125",
    of: "260125-0001",
    material: "SAE 1045 redondo",
    quantity: "60 metro",
    needDate: "18/06",
    status: "Aberta",
  },
  {
    project: "260126",
    of: "260126-0001",
    material: "Aluminio 7075 bloco",
    quantity: "6 peca",
    needDate: "21/06",
    status: "Aberta",
  },
  {
    project: "260127",
    of: "260127-0002",
    material: "Barra inox 304",
    quantity: "4 barra",
    needDate: "24/06",
    status: "Em compra",
  },
];

const recentInternalConsumptions = [
  {
    project: "260125",
    of: "260125-0001",
    material: "SAE 1045 redondo",
    quantity: "40 metro",
    cost: "R$ 1.840,00",
    date: "05/06",
  },
  {
    project: "260125",
    of: "260125-0002",
    material: "Chapa aco carbono 12mm",
    quantity: "8 chapa",
    cost: "R$ 2.320,00",
    date: "05/06",
  },
  {
    project: "260124",
    of: "260124-0003",
    material: "SAE 1020 redondo",
    quantity: "12 metro",
    cost: "R$ 540,00",
    date: "04/06",
  },
];

const alerts = [
  {
    title: "OF com compra total",
    detail: "260126-0001 aguardando material sem saldo livre.",
    tone: "border-red-200 bg-red-50 text-red-800",
  },
  {
    title: "Saldo parcial aproveitado",
    detail: "260125-0001 gerou CI de 40 e compra complementar de 60.",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
  },
];

export default function PurchasesPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="grid gap-3 lg:grid-cols-[180px_1fr_180px] lg:items-center">
            <p className="text-sm font-semibold">Flavio Evangelista</p>

            <label htmlFor="purchase-search" className="sr-only">
              Buscar compras
            </label>
            <input
              id="purchase-search"
              type="search"
              placeholder="Buscar requisicao, OF ou materia-prima"
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />

            <Link
              href="/compras/planejamento"
              className="inline-flex h-10 items-center justify-center rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800"
            >
              Planejamento
            </Link>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700">Suprimentos</p>
              <h1 className="mt-1 text-2xl font-bold">Compras</h1>
            </div>

            <nav aria-label="Atalhos de compras" className="flex flex-wrap gap-2">
              <Link
                href="/dashboard"
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Comercial
              </Link>
              <Link
                href="/estoque/materias-primas"
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Estoque
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {decisionSummary.map((item) => (
            <div key={item.label} className="rounded-md border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                {item.label}
              </p>
              <p className={`mt-2 text-2xl font-bold ${item.tone}`}>
                {item.value}
              </p>
            </div>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-md border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold">Requisicoes abertas</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Compras externas geradas por falta de saldo livre.
                </p>
              </div>
              <Link
                href="/compras/decisao-material"
                className="text-xs font-semibold text-blue-700 hover:underline"
              >
                Ver decisoes
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Projeto</th>
                    <th className="px-4 py-2 font-semibold">OF</th>
                    <th className="px-4 py-2 font-semibold">Material</th>
                    <th className="px-4 py-2 font-semibold">Qtd</th>
                    <th className="px-4 py-2 font-semibold">Necess.</th>
                    <th className="px-4 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {openRequisitions.map((row) => (
                    <tr key={`${row.of}-${row.material}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-bold text-blue-700">
                        {row.project}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-950">
                        {row.of}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.material}</td>
                      <td className="px-4 py-3 text-slate-700">{row.quantity}</td>
                      <td className="px-4 py-3 text-slate-700">{row.needDate}</td>
                      <td className="px-4 py-3 text-slate-700">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            {alerts.map((alert) => (
              <div key={alert.title} className={`rounded-md border p-4 ${alert.tone}`}>
                <h2 className="text-sm font-bold">{alert.title}</h2>
                <p className="mt-2 text-sm leading-6">{alert.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold">Planejamento de compras</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Agrupe requisicoes compativeis antes do pedido de compra.
              </p>
            </div>
            <Link
              href="/compras/planejamento"
              className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Abrir planejamento
            </Link>
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-bold">Consumos internos recentes</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Material de estoque reservado para projeto e OF.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Projeto</th>
                  <th className="px-4 py-2 font-semibold">OF</th>
                  <th className="px-4 py-2 font-semibold">Material</th>
                  <th className="px-4 py-2 font-semibold">Qtd</th>
                  <th className="px-4 py-2 font-semibold">Custo CI</th>
                  <th className="px-4 py-2 font-semibold">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentInternalConsumptions.map((row) => (
                  <tr key={`${row.of}-${row.material}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-blue-700">
                      {row.project}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {row.of}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.material}</td>
                    <td className="px-4 py-3 text-slate-700">{row.quantity}</td>
                    <td className="px-4 py-3 text-slate-700">{row.cost}</td>
                    <td className="px-4 py-3 text-slate-700">{row.date}</td>
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
