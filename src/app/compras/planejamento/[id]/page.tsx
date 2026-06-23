import Link from "next/link";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
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

export default async function PurchasePlanningDetailPage({
  params,
}: PurchasePlanningDetailPageProps) {
  const { id } = await params;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <ModuleBackLink href="/compras/planejamento" label="Planejamento" />

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700">
                Planejamento de compras
              </p>
              <h1 className="mt-1 text-2xl font-bold">{id}</h1>
            </div>

            <Link
              href="/compras"
              className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Compras
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Material
            </p>
            <p className="mt-2 text-sm font-bold text-slate-950">
              SAE 1045 redondo 4
            </p>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Soma total
            </p>
            <p className="mt-2 text-sm font-bold text-slate-950">
              3.700 mm
            </p>
          </div>

        </section>

        <PurchasePlanningDecision planningNumber={id} />

        <section className="rounded-md border border-slate-200 bg-white">
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
