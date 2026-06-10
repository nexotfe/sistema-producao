"use client";

import { use } from "react";
import { useCliente } from "@/modules/clientes/hooks/useCliente";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default function ClientePage({ params }: Props) {
  const { id } = use(params);

  const { cliente, loading, erro } = useCliente(id);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-8">
        <p>Carregando cliente...</p>
      </main>
    );
  }

  if (erro || !cliente) {
    return (
      <main className="min-h-screen bg-slate-100 p-8">
        <p>{erro || "Cliente não encontrado."}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8">
<div className="mx-auto max-w-6xl">
  <div className="flex items-start justify-between gap-4">
    <div>
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
        Cliente
      </p>

      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-3xl font-semibold text-slate-950">
          {cliente.nome || "Cliente sem nome"}
        </h1>

        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          {cliente.ativo ? "Ativo" : "Inativo"}
        </span>
      </div>

      <p className="mt-2 text-sm text-slate-500">
        {cliente.empresa || "Nome fantasia não informado"}
      </p>
    </div>

    <div className="flex items-center gap-2">
      <a
        href="/clientes"
        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
      >
        ← Clientes
      </a>

      <button className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
        Editar Cliente
      </button>
    </div>
  </div>

  <section className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">

      
          <div className="grid gap-5 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
            <Info label="Razão Social" value={cliente.nome} />
            <Info label="Nome Fantasia" value={cliente.empresa} />
            <Info label="CNPJ" value={cliente.cnpj} />
            <Info label="Cidade" value={cliente.cidade} />
            <Info label="Telefone" value={cliente.telefone} />
            <Info label="E-mail" value={cliente.email} />
            
          </div>
        </section>
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
  <div className="border-b border-slate-100 px-6 py-5">
    <h2 className="text-base font-semibold text-slate-900">
      Endereço principal
    </h2>

    <p className="mt-1 text-sm text-slate-500">
      Localização fiscal e logística principal do cliente.
    </p>
  </div>

  <div className="grid gap-5 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
    <Info label="Endereço" value={undefined} />
    <Info label="Número" value={undefined} />
    <Info label="Bairro" value={undefined} />
    <Info label="Cidade" value={cliente.cidade} />
    <Info label="Estado" value={undefined} />
    <Info label="CEP" value={undefined} />
  </div>
</section>


      </div>
    </main>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-sm font-medium text-slate-900">
        {value || "Não informado"}
      </p>
    </div>
  );
}