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
      <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <p className="text-sm text-slate-500">Carregando cliente...</p>
        </div>
      </main>
    );
  }

  if (erro || !cliente) {
    return (
      <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <p className="text-sm text-slate-500">
            {erro || "Cliente não encontrado."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <a
            href="/clientes"
            className="inline-flex w-fit items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 transition hover:text-slate-700"
          >
            ‹ Cliente
          </a>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
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

            <a
              href={`/clientes/${id}/editar`}
              className="inline-flex h-11 w-fit items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Editar Cliente
            </a>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <Card titulo="Informações da Empresa">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
              <Info label="Razão Social" value={cliente.nome} />
              <Info label="Nome Fantasia" value={cliente.empresa} />
              <Info label="CNPJ" value={cliente.cnpj} />
              <Info label="Inscrição Estadual" value={cliente.inscricao_estadual} />
              <Info label="Inscrição Municipal" value={cliente.inscricao_municipal} />
              <Info label="Segmento" value={cliente.segmento} />
            </div>
          </Card>

          <Card titulo="Contato">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
              <Info label="Telefone" value={cliente.telefone} />
              <Info label="E-mail" value={cliente.email} />
              <Info label="Telefone Fiscal" value={cliente.telefone_fiscal} />
              <Info label="E-mail Fiscal" value={cliente.email_fiscal} />
              <Info label="Site" value={cliente.site} />
            </div>
          </Card>

          <Card titulo="Localização">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
              <Info label="CEP" value={cliente.cep} />
              <Info label="Estado" value={cliente.estado} />
              <Info label="Cidade" value={cliente.cidade} />
              <Info label="Bairro" value={cliente.bairro} />
              <Info label="Endereço" value={cliente.endereco} />
              <Info label="Número" value={cliente.numero} />
              <Info label="Complemento" value={cliente.complemento} />
            </div>
          </Card>

          <Card titulo="Observações">
            <div className="px-6 py-6">
              <p className="text-sm font-medium leading-6 text-slate-900">
                {cliente.observacoes || "Não informado"}
              </p>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}

function Card({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-5">
        <h2 className="text-base font-semibold text-slate-900">
          {titulo}
        </h2>
      </div>

      {children}
    </div>
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

      <p className="mt-2 text-sm font-medium leading-6 text-slate-900">
        {value || "Não informado"}
      </p>
    </div>
  );
}