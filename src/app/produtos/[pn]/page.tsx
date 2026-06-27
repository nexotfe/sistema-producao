import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";

type ProductPageProps = {
  params: Promise<{
    pn: string;
  }>;
};

export default async function ProductPage({ params }: ProductPageProps) {
  const { pn } = await params;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <section className="mx-auto max-w-2xl rounded-md border border-slate-200 bg-white p-5">
        <ModuleBackLink href="/dashboard" label="Codigo" />
        <p className="text-sm font-semibold text-blue-700">Codigo {pn}</p>
        <h1 className="mt-1 text-2xl font-bold">Portal tecnico operacional</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          O detalhamento tecnico do codigo sera conectado ao roteiro de
          fabricacao.
        </p>

        <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
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
              className="inline-flex h-10 items-center justify-center rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
            >
              Criar Roteiro
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
