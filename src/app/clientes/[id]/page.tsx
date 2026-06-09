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
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
          Cliente
        </p>

        <h1 className="mt-2 text-3xl font-semibold text-slate-950">
          {cliente.nome || "Cliente sem nome"}
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          {cliente.empresa || "Nome fantasia não informado"}
        </p>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-base font-semibold text-slate-900">
              Dados gerais
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Informações principais do cliente.
            </p>
          </div>

          <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
            <Info label="Razão Social" value={cliente.nome} />
            <Info label="Nome Fantasia" value={cliente.empresa} />
            <Info label="CNPJ" value={cliente.cnpj} />
            <Info label="Cidade" value={cliente.cidade} />
            <Info label="Telefone" value={cliente.telefone} />
            <Info label="E-mail" value={cliente.email} />
            <Info
              label="Status"
              value={cliente.ativo ? "Ativo" : "Inativo"}
            />
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