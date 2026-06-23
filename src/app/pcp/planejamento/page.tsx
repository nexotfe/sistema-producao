import { EntityLink } from "@/modules/shared/navigation/EntityLink";
import { ModuleBackButton } from "@/modules/shared/navigation/ModuleBackButton";

const planningRows = [
  {
    priority: "01",
    project: "260124",
    client: "Cliente Delta",
    state: "Aguardando material",
    nextAction: "Liberar compra complementar",
    progress: "35%",
    delivery: "26/06",
  },
  {
    priority: "02",
    project: "260125",
    client: "Cliente ABC",
    state: "Em preparacao",
    nextAction: "Separar roteiro e BOM",
    progress: "20%",
    delivery: "28/06",
  },
  {
    priority: "03",
    project: "260126",
    client: "Cliente Metal",
    state: "Em producao",
    nextAction: "Acompanhar OF principal",
    progress: "62%",
    delivery: "02/07",
  },
  {
    priority: "04",
    project: "260127",
    client: "Cliente Exemplo Ltda.",
    state: "Qualidade",
    nextAction: "Inspecao final",
    progress: "84%",
    delivery: "04/07",
  },
];

const stateStyles = {
  "Aguardando material": "bg-amber-50 text-amber-700 ring-amber-200",
  "Em preparacao": "bg-blue-50 text-blue-700 ring-blue-200",
  "Em producao": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Qualidade: "bg-slate-100 text-slate-700 ring-slate-200",
} as const;

export default function PCPPlanningPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <ModuleBackButton label="PCP" />
            <p className="text-sm font-semibold">Flavio Evangelista</p>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                PCP
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                Planejamento PCP
              </h1>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(240px,360px)_auto_auto] sm:items-center">
              <label htmlFor="pcp-search" className="sr-only">
                Buscar planejamento
              </label>
              <input
                id="pcp-search"
                type="search"
                placeholder="Buscar projeto, cliente ou estado"
                className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />

              <button className="h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Atualizar
              </button>

              <button className="h-11 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">
                Filtros
              </button>
            </div>
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-950">
              Sequenciamento operacional
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Visao inicial das frentes de fabrica para planejamento.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                <tr>
                  <th className="px-5 py-3">Prioridade</th>
                  <th className="px-5 py-3">Projeto</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Proxima acao</th>
                  <th className="px-5 py-3">Avanco</th>
                  <th className="px-5 py-3">Entrega</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {planningRows.map((row) => (
                  <tr key={row.project} className="transition hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <span className="inline-flex h-7 w-10 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-semibold tabular-nums text-slate-700">
                        {row.priority}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <EntityLink
                        type="projeto"
                        id={row.project}
                        className="font-semibold text-slate-950 outline-none transition hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                      >
                        {row.project}
                      </EntityLink>
                    </td>
                    <td className="px-5 py-4 text-slate-700">{row.client}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                          stateStyles[row.state as keyof typeof stateStyles]
                        }`}
                      >
                        {row.state}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-700">{row.nextAction}</td>
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      {row.progress}
                    </td>
                    <td className="px-5 py-4 text-slate-700">{row.delivery}</td>
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
