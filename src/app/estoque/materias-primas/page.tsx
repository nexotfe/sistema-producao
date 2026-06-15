import Link from "next/link";

const materials = [
  {
    code: "MP-001",
    description: "SAE 1045 redondo",
    unit: "metro",
    stock: "18.000",
    origin: "Compra",
    address: "ALM01-R5-E3/P6/4",
    reserved: "10.000",
    free: "8.000",
    purchase: "2.000",
    demand: "3 OFs / 2 projetos",
    status: "Compra necessaria",
  },
  {
    code: "MP-002",
    description: "Chapa aco carbono 12mm",
    unit: "chapa",
    stock: "12",
    origin: "Cliente",
    address: "ALM01-R2-E1/P1/2",
    reserved: "4",
    free: "8",
    purchase: "-",
    demand: "1 OF / 1 projeto",
    status: "Disponivel",
  },
  {
    code: "MP-003",
    description: "Aluminio 7075 bloco",
    unit: "peca",
    stock: "6",
    origin: "Industrializacao",
    address: "ALM02-R1-E4/P2/1",
    reserved: "6",
    free: "0",
    purchase: "3",
    demand: "10 OFs / 3 projetos",
    status: "Compra necessaria",
  },
  {
    code: "MP-004",
    description: "Barra inox 304",
    unit: "barra",
    stock: "9",
    origin: "Ajuste",
    address: "ALM01-R4-E2/P5/3",
    reserved: "2",
    free: "7",
    purchase: "-",
    demand: "Sem demanda",
    status: "Disponivel",
  },
];

const statusStyles = {
  Disponivel: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Compra necessaria": "bg-amber-50 text-amber-700 ring-amber-200",
} as const;

export default function RawMaterialsPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-5">
          <div>
            <Link
              href="/central"
              className="inline-flex items-center text-sm font-semibold text-slate-500 outline-none transition hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
            >
              <span aria-hidden="true" className="mr-2 text-base leading-none">
                {"\u2039"}
              </span>
              ESTOQUE
            </Link>

            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Materias-primas
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Consulta operacional de saldo, origem, endereco e demanda de
              materiais.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <label htmlFor="material-search" className="sr-only">
              Buscar materia-prima
            </label>
            <input
              id="material-search"
              type="search"
              placeholder="Buscar por codigo, descricao, origem, endereco ou projeto"
              className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />

            <nav aria-label="Atalhos de estoque" className="flex flex-wrap gap-2">
              <Link
                href="/compras/decisao-material"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Decisao material
              </Link>
              <Link
                href="/compras"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Compras
              </Link>
              <Link
                href="/projetos"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Projetos
              </Link>
            </nav>
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-950">
              Estoque de Materias-primas
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Estoque representa a quantidade fisica; Livre representa o saldo
              apos reservas.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1240px] table-fixed text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                <tr>
                  <th className="w-[8%] px-4 py-3">Codigo</th>
                  <th className="w-[20%] px-4 py-3">Descricao</th>
                  <th className="w-[8%] px-4 py-3">Unidade</th>
                  <th className="w-[8%] px-4 py-3">Estoque</th>
                  <th className="w-[11%] px-4 py-3">Origem</th>
                  <th className="w-[14%] px-4 py-3">Endereco</th>
                  <th className="w-[8%] px-4 py-3">Reserva</th>
                  <th className="w-[7%] px-4 py-3">Livre</th>
                  <th className="w-[8%] px-4 py-3">Compra</th>
                  <th className="w-[13%] px-4 py-3">Demanda</th>
                  <th className="w-[13%] px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {materials.map((material) => (
                  <tr key={material.code} className="transition hover:bg-slate-50">
                    <td className="px-4 py-4 font-semibold text-slate-950">
                      {material.code}
                    </td>
                    <td className="truncate px-4 py-4 text-slate-700">
                      {material.description}
                    </td>
                    <td className="px-4 py-4 text-slate-700">{material.unit}</td>
                    <td className="px-4 py-4 font-medium text-slate-950">
                      {material.stock}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {material.origin}
                    </td>
                    <td className="truncate px-4 py-4 font-medium text-slate-700">
                      {material.address}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {material.reserved}
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-950">
                      {material.free}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {material.purchase}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {material.demand}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                          statusStyles[
                            material.status as keyof typeof statusStyles
                          ]
                        }`}
                      >
                        {material.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
