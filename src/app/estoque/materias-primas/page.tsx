import Link from "next/link";

const materials = [
  {
    code: "MP-001",
    description: "SAE 1045 redondo",
    unit: "metro",
    available: "18.000",
    reserved: "10.000",
    free: "8.000",
    status: "Compra necessaria",
    need: "2.000",
    demand: "3 OFs / 2 projetos",
  },
  {
    code: "MP-002",
    description: "Chapa aco carbono 12mm",
    unit: "chapa",
    available: "12",
    reserved: "4",
    free: "8",
    status: "Disponivel",
    need: "-",
    demand: "1 OF / 1 projeto",
  },
  {
    code: "MP-003",
    description: "Aluminio 7075 bloco",
    unit: "peca",
    available: "6",
    reserved: "6",
    free: "0",
    status: "Compra necessaria",
    need: "3",
    demand: "10 OFs / 3 projetos",
  },
  {
    code: "MP-004",
    description: "Barra inox 304",
    unit: "barra",
    available: "9",
    reserved: "2",
    free: "7",
    status: "Disponivel",
    need: "-",
    demand: "Sem demanda",
  },
];

const statusStyles = {
  Disponivel: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Compra necessaria": "bg-amber-50 text-amber-700 ring-amber-200",
} as const;

export default function RawMaterialsPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="grid gap-3 lg:grid-cols-[180px_1fr_160px] lg:items-center">
            <p className="text-sm font-semibold">Flavio Evangelista</p>

            <label htmlFor="material-search" className="sr-only">
              Buscar materia-prima
            </label>
            <input
              id="material-search"
              type="search"
              placeholder="Buscar materia-prima, codigo ou projeto"
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />

            <button className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800">
              Nova materia-prima
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700">Estoque</p>
              <h1 className="mt-1 text-2xl font-bold">Materias-primas</h1>
            </div>

            <nav aria-label="Atalhos de estoque" className="flex flex-wrap gap-2">
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
              <h2 className="text-sm font-bold">Saldo por materia-prima</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Visao simples para decidir se a OF pode entrar na fila real.
              </p>
            </div>

            <Link
              href="/compras/decisao-material"
              className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Decisao material
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="w-[10%] px-4 py-2 font-semibold">Codigo</th>
                  <th className="w-[24%] px-4 py-2 font-semibold">Descricao</th>
                  <th className="w-[9%] px-4 py-2 font-semibold">Unidade</th>
                  <th className="w-[11%] px-4 py-2 font-semibold">Disponivel</th>
                  <th className="w-[10%] px-4 py-2 font-semibold">Reservado</th>
                  <th className="w-[9%] px-4 py-2 font-semibold">Livre</th>
                  <th className="w-[13%] px-4 py-2 font-semibold">Status</th>
                  <th className="w-[8%] px-4 py-2 font-semibold">Comprar</th>
                  <th className="w-[16%] px-4 py-2 font-semibold">Demandas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {materials.map((material) => (
                  <tr key={material.code} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-950">
                      {material.code}
                    </td>
                    <td className="truncate px-4 py-3 text-slate-700">
                      {material.description}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {material.unit}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {material.available}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {material.reserved}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {material.free}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${
                          statusStyles[
                            material.status as keyof typeof statusStyles
                          ]
                        }`}
                      >
                        {material.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {material.need}
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-xs font-semibold text-blue-700 hover:underline">
                        {material.demand}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold">Regra operacional</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Sem materia-prima disponivel, a OF permanece fora da fila real de
              producao.
            </p>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold">Saldo livre</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Saldo livre = saldo disponivel menos saldo reservado.
            </p>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold">Compra</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Quando faltar material, o sistema prepara a necessidade de compra.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}
