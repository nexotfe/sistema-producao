import { ProductNavigation } from "@/modules/produtos/components/ProductNavigation";

type ProductPageProps = {
  params: Promise<{
    pn: string;
  }>;
};

export default async function ProductPage({ params }: ProductPageProps) {
  const { pn } = await params;

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <ProductNavigation />

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-sm font-semibold text-blue-700">Codigo {pn}</p>
          <h1 className="mt-1 text-2xl font-bold">
            Portal tecnico operacional
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            O detalhamento tecnico do codigo sera conectado ao roteiro de
            fabricacao.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                Roteiro Atual
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                Sem roteiro
              </p>
            </div>

            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Criar Roteiro
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
