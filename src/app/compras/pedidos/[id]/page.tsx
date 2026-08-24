"use client";

import Link from "next/link";
import { use } from "react";
import { useRouter } from "next/navigation";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";
import { Button } from "@/modules/shared/ui/Button";

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

export default function PurchaseOrderDraftPage({
  params,
}: PurchaseOrderDraftPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const planningNumber = id.replace("PED-", "PC-");

  return (
    <main className="min-h-screen bg-background text-text-primary">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6">
        <header className="rounded-t-lg border-x border-t border-border bg-[#0B1B2B] px-5 py-4 -mb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/5 text-xs font-bold text-slate-300">
                LOGO
              </div>

              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
                  Pedido de Compras
                </h1>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
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
                <button
                  type="button"
                  className="h-10 rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="h-10 rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  className="h-10 rounded-md border border-red-500/40 bg-red-500/10 px-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
                >
                  Excluir
                </button>
                <Button>Salvar</Button>
              </div>
            </div>
          </div>
        </header>
      </div>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-md border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase text-text-secondary">
              Fornecedor
            </p>
            <input
              placeholder="Selecionar fornecedor"
              className="mt-2 h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm font-semibold text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
            />
          </div>

          <div className="rounded-md border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase text-text-secondary">
              Origem
            </p>
            <p className="mt-2 text-sm font-bold text-text-primary">
              {planningNumber}
            </p>
          </div>

          <div className="rounded-md border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase text-text-secondary">
              Proxima acao
            </p>
            <Button className="mt-2 w-full">
              Enviar ao fornecedor
            </Button>
          </div>
        </section>

        <section className="rounded-md border border-border bg-surface">
          <div className="border-b border-border-subtle px-4 py-3">
            <h2 className="text-sm font-bold">Item do pedido</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-left text-sm">
              <thead className="border-b border-border-subtle bg-border-subtle text-xs uppercase text-text-secondary">
                <tr>
                  <th className="w-[36%] px-4 py-2 font-semibold">Material</th>
                  <th className="w-[18%] px-4 py-2 font-semibold">Comprar</th>
                  <th className="w-[18%] px-4 py-2 font-semibold">Sobra</th>
                  <th className="w-[28%] px-4 py-2 font-semibold">Observacao</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border-subtle">
                  <td className="px-4 py-3 font-semibold text-text-primary">
                    SAE 1045 redondo 4
                  </td>
                  <td className="px-4 py-3 text-text-primary">
                    1 barra 6.000 mm
                  </td>
                  <td className="px-4 py-3 text-text-primary">2.300 mm</td>
                  <td className="px-4 py-3 text-text-primary">
                    Compra consolidada por planejamento
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-md border border-border bg-surface">
          <div className="border-b border-border-subtle px-4 py-3">
            <h2 className="text-sm font-bold">Rastreabilidade</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-border-subtle bg-border-subtle text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-2 font-semibold">Projeto</th>
                  <th className="px-4 py-2 font-semibold">OF</th>
                  <th className="px-4 py-2 font-semibold">Necessidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {orderOrigins.map((origin) => (
                  <tr key={origin.of}>
                    <td className="px-4 py-3 font-bold text-action-primary">
                      <EntityLink type="projeto" id={origin.project}>
                        {origin.project}
                      </EntityLink>
                    </td>
                    <td className="px-4 py-3 font-semibold text-text-primary">
                      <EntityLink
                        type="of"
                        id={origin.of}
                        className="font-semibold text-text-primary transition hover:text-text-secondary"
                      >
                        {origin.of}
                      </EntityLink>
                    </td>
                    <td className="px-4 py-3 text-text-primary">
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
