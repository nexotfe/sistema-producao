"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useEditarCliente } from "@/modules/clientes/hooks/useEditarCliente";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default function EditarClientePage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  const {
    nome,
    setNome,
    empresa,
    setEmpresa,
    telefone,
    setTelefone,
    email,
    setEmail,
    cidade,
    setCidade,
    cnpj,
    setCnpj,
    observacoes,
    setObservacoes,
    inscricaoEstadual,
    setInscricaoEstadual,
    inscricaoMunicipal,
    setInscricaoMunicipal,
    segmento,
    setSegmento,
    telefoneFiscal,
    setTelefoneFiscal,
    emailFiscal,
    setEmailFiscal,
    site,
    setSite,
    cep,
    setCep,
    estado,
    setEstado,
    bairro,
    setBairro,
    endereco,
    setEndereco,
    numero,
    setNumero,
    complemento,
    setComplemento,
    loading,
    salvando,
    erro,
    salvarCliente,
  } = useEditarCliente(id);

  async function handleSalvar() {
    const sucesso = await salvarCliente();

    if (sucesso) {
      router.push(`/clientes/${id}`);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <p className="text-sm text-slate-500">Carregando cliente...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <a
            href="/clientes"
            className="inline-flex w-fit items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 transition hover:text-slate-700"
          >
            ‹ Cliente
          </a>

          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Editar Cliente
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Atualização dos dados cadastrais do cliente.
            </p>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <Card titulo="Informações da Empresa">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field label="Razão Social" value={nome} onChange={setNome} />
              <Field label="Nome Fantasia" value={empresa} onChange={setEmpresa} />
              <Field label="CNPJ" value={cnpj} onChange={setCnpj} />
              <Field label="Inscrição Estadual" value={inscricaoEstadual} onChange={setInscricaoEstadual} />
              <Field label="Inscrição Municipal" value={inscricaoMunicipal} onChange={setInscricaoMunicipal} />
              <Field label="Segmento" value={segmento} onChange={setSegmento} />
            </div>
          </Card>

          <Card titulo="Contato">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field label="Telefone" value={telefone} onChange={setTelefone} />
              <Field label="E-mail" value={email} onChange={setEmail} />
              <Field label="Telefone Fiscal" value={telefoneFiscal} onChange={setTelefoneFiscal} />
              <Field label="E-mail Fiscal" value={emailFiscal} onChange={setEmailFiscal} />
              <Field label="Site" value={site} onChange={setSite} />
            </div>
          </Card>

          <Card titulo="Localização">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field label="CEP" value={cep} onChange={setCep} />
              <Field label="Estado" value={estado} onChange={setEstado} />
              <Field label="Cidade" value={cidade} onChange={setCidade} />
              <Field label="Bairro" value={bairro} onChange={setBairro} />
              <Field label="Endereço" value={endereco} onChange={setEndereco} />
              <Field label="Número" value={numero} onChange={setNumero} />
              <Field label="Complemento" value={complemento} onChange={setComplemento} />
            </div>
          </Card>

          <Card titulo="Observações">
            <div className="px-6 py-6">
              <textarea
                rows={5}
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
              />
            </div>
          </Card>

          {erro && (
            <p className="text-sm font-medium text-red-600">
              {erro}
            </p>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push(`/clientes/${id}`)}
              className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Voltar
            </button>

            <button
              type="button"
              onClick={handleSalvar}
              disabled={salvando}
              className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
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

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function Field({ label, value, onChange }: FieldProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
      />
    </div>
  );
}