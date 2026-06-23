"use client";

import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { useNovoCliente } from "@/modules/clientes/hooks/useNovoCliente";

export default function NovoClientePage() {
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
    erro,
    salvarCliente,
  } = useNovoCliente();

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <ModuleBackLink href="/clientes" label="Cliente" />

          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Cliente
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Cadastro de cliente.
            </p>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <Card titulo="Informacoes da empresa">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field label="Razao social" value={nome} onChange={setNome} />
              <Field label="Nome fantasia" value={empresa} onChange={setEmpresa} />
              <Field label="CNPJ" value={cnpj} onChange={setCnpj} />
              <Field label="Inscricao estadual" value={inscricaoEstadual} onChange={setInscricaoEstadual} />
              <Field label="Inscricao municipal" value={inscricaoMunicipal} onChange={setInscricaoMunicipal} />
              <Field label="Segmento" value={segmento} onChange={setSegmento} />
            </div>
          </Card>

          <Card titulo="Contato">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field label="Telefone" value={telefone} onChange={setTelefone} />
              <Field label="E-mail" value={email} onChange={setEmail} />
              <Field label="Telefone fiscal" value={telefoneFiscal} onChange={setTelefoneFiscal} />
              <Field label="E-mail fiscal" value={emailFiscal} onChange={setEmailFiscal} />
              <Field label="Site" value={site} onChange={setSite} />
            </div>
          </Card>

          <Card titulo="Localizacao">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field label="CEP" value={cep} onChange={setCep} />
              <Field label="Estado" value={estado} onChange={setEstado} />
              <Field label="Cidade" value={cidade} onChange={setCidade} />
              <Field label="Bairro" value={bairro} onChange={setBairro} />
              <Field label="Endereco" value={endereco} onChange={setEndereco} />
              <Field label="Numero" value={numero} onChange={setNumero} />
              <Field label="Complemento" value={complemento} onChange={setComplemento} />
            </div>
          </Card>

          <Card titulo="Observacoes">
            <div className="px-6 py-6">
              <textarea
                rows={5}
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
              />
            </div>
          </Card>

          {erro && (
            <p className="text-sm font-medium text-red-600">
              {erro}
            </p>
          )}

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={salvarCliente}
              disabled={loading}
              className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Salvando..." : "Salvar"}
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
        className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
      />
    </div>
  );
}

