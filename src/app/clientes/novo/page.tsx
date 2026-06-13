"use client";

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
        <header>
  <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
    Cliente
  </h1>

  <p className="mt-2 text-sm text-slate-500">
    Cadastro de cliente.
  </p>
</header>

        <section className="flex flex-col gap-5">
  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-100 px-6 py-5">
      <h2 className="text-base font-semibold text-slate-900">
        Informações da Empresa
      </h2>
    </div>

    <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
  <Field label="Razão Social" value={nome} onChange={setNome} />
  <Field label="Nome Fantasia" value={empresa} onChange={setEmpresa} />
  <Field label="CNPJ" value={cnpj} onChange={setCnpj} />
  <Field
    label="Inscrição Estadual"
    value={inscricaoEstadual}
    onChange={setInscricaoEstadual}
  />
  <Field
    label="Inscrição Municipal"
    value={inscricaoMunicipal}
    onChange={setInscricaoMunicipal}
  />
  <Field label="Segmento" value={segmento} onChange={setSegmento} />
</div>
  </div>

  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-100 px-6 py-5">
      <h2 className="text-base font-semibold text-slate-900">
        Contato
      </h2>
    </div>

    <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
  <Field label="Telefone" value={telefone} onChange={setTelefone} />
  <Field label="E-mail" value={email} onChange={setEmail} />
  <Field
    label="Telefone Fiscal"
    value={telefoneFiscal}
    onChange={setTelefoneFiscal}
  />
  <Field
    label="E-mail Fiscal"
    value={emailFiscal}
    onChange={setEmailFiscal}
  />
  <Field label="Site" value={site} onChange={setSite} />
</div>
  </div>

  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-100 px-6 py-5">
      <h2 className="text-base font-semibold text-slate-900">
        Localização
      </h2>
    </div>

    <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
  <Field label="CEP" value={cep} onChange={setCep} />
  <Field label="Estado" value={estado} onChange={setEstado} />
  <Field label="Cidade" value={cidade} onChange={setCidade} />
  <Field label="Bairro" value={bairro} onChange={setBairro} />
  <Field label="Endereço" value={endereco} onChange={setEndereco} />
  <Field label="Número" value={numero} onChange={setNumero} />
  <Field
    label="Complemento"
    value={complemento}
    onChange={setComplemento}
  />
</div>
  </div>

  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-100 px-6 py-5">
      <h2 className="text-base font-semibold text-slate-900">
        Observações
      </h2>
    </div>

    <div className="px-6 py-6">
      <textarea
        rows={5}
        value={observacoes}
        onChange={(event) => setObservacoes(event.target.value)}
        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
      />
    </div>
  </div>

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
      className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "Salvando..." : "Salvar"}
    </button>
  </div>
</section>
      </div>
    </main>
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