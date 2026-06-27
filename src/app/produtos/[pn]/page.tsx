import Link from "next/link";
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
        <h1 className="mt-1 text-2xl font-bold">Portal técnico operacional</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          O detalhamento técnico do codigo agora fica em Roteiro Fabricação.
        </p>

        <Link
          href={`/roteiros/${pn}`}
          className="mt-5 inline-flex h-10 items-center rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
        >
          Abrir Roteiro Fabricação
        </Link>
      </section>
    </main>
  );
}
