"use client";

import Link from "next/link";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { use } from "react";
import { useFornecedor } from "@/modules/fornecedores/hooks/useFornecedor";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default function FornecedorPage({ params }: Props) {
  const { id } = use(params);
  const { fornecedor, loading, erro } = useFornecedor(id);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <p className="text-sm text-slate-500">Carregando fornecedor...</p>
        </div>
      </main>
    );
  }

  if (erro || !fornecedor) {
    return (
      <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <p className="text-sm text-slate-500">
            {erro || "Fornecedor nao encontrado."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <ModuleBackLink href="/fornecedores" label="Fornecedor" />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                  {fornecedor.nome || "Fornecedor sem nome"}
                </h1>

                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {fornecedor.ativo ? "Ativo" : "Inativo"}
                </span>
              </div>

              <p className="mt-2 text-sm text-slate-500">
                {fornecedor.empresa || "Nome fantasia nao informado"}
              </p>
            </div>

            <Link
              href={`/fornecedores/${id}/editar`}
              className="inline-flex h-11 w-fit items-center justify-center rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Editar fornecedor
            </Link>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <Card titulo="Informacoes da empresa">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
              <Info label="Razao social" value={fornecedor.nome} />
              <Info label="Nome fantasia" value={fornecedor.empresa} />
              <Info label="CNPJ" value={fornecedor.cnpj} />
              <Info label="Inscricao estadual" value={fornecedor.inscricao_estadual} />
              <Info label="Inscricao municipal" value={fornecedor.inscricao_municipal} />
              <Info label="Segmento" value={fornecedor.segmento} />
            </div>
          </Card>

          <Card titulo="Contato">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
              <Info label="Telefone" value={fornecedor.telefone} />
              <Info label="E-mail" value={fornecedor.email} />
              <Info label="Telefone comercial" value={fornecedor.telefone_comercial} />
              <Info label="E-mail comercial" value={fornecedor.email_comercial} />
              <Info label="Site" value={fornecedor.site} />
            </div>
          </Card>

          <Card titulo="Localizacao">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
              <Info label="CEP" value={fornecedor.cep} />
              <Info label="Estado" value={fornecedor.estado} />
              <Info label="Cidade" value={fornecedor.cidade} />
              <Info label="Bairro" value={fornecedor.bairro} />
              <Info label="Endereco" value={fornecedor.endereco} />
              <Info label="Numero" value={fornecedor.numero} />
              <Info label="Complemento" value={fornecedor.complemento} />
            </div>
          </Card>

          <Card titulo="Observacoes">
            <div className="px-6 py-6">
              <p className="text-sm font-medium leading-6 text-slate-900">
                {fornecedor.observacoes || "Nao informado"}
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
    <div className="rounded-lg border border-slate-200 bg-white">
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
        {value || "Nao informado"}
      </p>
    </div>
  );
}
