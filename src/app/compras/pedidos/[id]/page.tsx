import Link from "next/link";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";

type PurchaseOrderDraftPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const orderOrigins = [
  {
    project: "260125",
    of: "260125-0001",
    need: "200 mm",
  },
  {
    project: "260126",
    of: "260126-0002",
    need: "2.500 mm",
  },
  {
    project: "260127",
    of: "260127-0001",
    need: "1.000 mm",
  },
];

export default async function PurchaseOrderDraftPage({
  params,
}: PurchaseOrderDraftPageProps) {
  const { id } = await params;
  const planningNumber = id.replace("PED-", "PC-");

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <ModuleBackLink href={`/compras/planejamento/${planningNumber}`} label="Pedido" />

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700">
                Pedido de compra
              </p>
              <h1 className="mt-1 text-2xl font-bold">{id}</h1>
            </div>

            <span className="inline-flex h-9 items-center rounded-full bg-slate-100 px-3 text-xs font-bold uppercase text-slate-700 ring-1 ring-slate-200">
              Rascunho
            </span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Fornecedor
            </p>
            <input
              placeholder="Selecionar fornecedor"
              className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Origem
            </p>
            <p className="mt-2 text-sm font-bold text-slate-950">
              {planningNumber}
            </p>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Proxima acao
            </p>
            <button className="mt-2 h-10 w-full rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800">
              Enviar ao fornecedor
            </button>
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-bold">Item do pedido</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="w-[36%] px-4 py-2 font-semibold">Material</th>
                  <th className="w-[18%] px-4 py-2 font-semibold">Comprar</th>
                  <th className="w-[18%] px-4 py-2 font-semibold">Sobra</th>
                  <th className="w-[28%] px-4 py-2 font-semibold">Observacao</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    SAE 1045 redondo 4
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    1 barra 6.000 mm
                  </td>
                  <td className="px-4 py-3 text-slate-700">2.300 mm</td>
                  <td className="px-4 py-3 text-slate-700">
                    Compra consolidada por planejamento
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-bold">Rastreabilidade</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Projeto</th>
                  <th className="px-4 py-2 font-semibold">OF</th>
                  <th className="px-4 py-2 font-semibold">Necessidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orderOrigins.map((origin) => (
                  <tr key={origin.of}>
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
                      {origin.need}
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
