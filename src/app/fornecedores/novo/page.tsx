"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useNovoFornecedor } from "@/modules/fornecedores/hooks/useNovoFornecedor";

export default function NovoFornecedorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const retorno = searchParams.get("retorno");

  const {
    nome,
    setNome,
    nomeFantasia,
    setNomeFantasia,
    cnpj,
    setCnpj,
    inscricaoEstadual,
    setInscricaoEstadual,
    inscricaoMunicipal,
    setInscricaoMunicipal,
    segmento,
    setSegmento,
    telefone,
    setTelefone,
    email,
    setEmail,
    telefoneComercial,
    setTelefoneComercial,
    emailComercial,
    setEmailComercial,
    site,
    setSite,
    cep,
    setCep,
    estado,
    setEstado,
    cidade,
    setCidade,
    bairro,
    setBairro,
    endereco,
    setEndereco,
    numero,
    setNumero,
    complemento,
    setComplemento,
    observacoes,
    setObservacoes,
    loading,
    erro,
    salvarFornecedor,
  } = useNovoFornecedor();

  async function handleSalvar() {
    const sucesso = await salvarFornecedor();

    if (sucesso) {
      router.push(retorno || "/fornecedores");
    }
  }

  return (
    <main className="min-h-screen bg-app-bg px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="rounded-t-lg border-x border-t border-slate-200 bg-[#0B1B2B] px-5 py-4 -mb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/5 text-xs font-bold text-slate-300">
                LOGO
              </div>

              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
                  Fornecedor
                </h1>
                <p className="mt-1 text-sm text-slate-300">
                  Novo fornecedor
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <span className="whitespace-nowrap text-sm font-medium text-slate-300">
                Nome do usuário
              </span>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="h-10 rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
                >
                  Voltar
                </button>
                <Link
                  href="/central"
                  className="inline-flex h-10 items-center rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
                >
                  Início
                </Link>
                <button
                  type="button"
                  onClick={handleSalvar}
                  disabled={loading}
                  className="h-10 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <Card titulo="Informações da empresa">
            <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
              <Field label="Razão social" value={nome} onChange={setNome} />
              <Field label="Nome fantasia" value={nomeFantasia} onChange={setNomeFantasia} />
              <Field label="CNPJ" value={cnpj} onChange={setCnpj} />
              <Field label="Inscrição estadual" value={inscricaoEstadual} onChange={setInscricaoEstadual} />
              <Field label="Inscrição municipal" value={inscricaoMunicipal} onChange={setInscricaoMunicipal} />
              <Field label="Segmento" value={segmento} onChange={setSegmento} />
            </div>
          </Card>

          <Card titulo="Contato">
            <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
              <Field label="Telefone" value={telefone} onChange={setTelefone} />
              <Field label="E-mail" value={email} onChange={setEmail} />
              <Field label="Telefone comercial" value={telefoneComercial} onChange={setTelefoneComercial} />
              <Field label="E-mail comercial" value={emailComercial} onChange={setEmailComercial} />
              <Field label="Site" value={site} onChange={setSite} />
            </div>
          </Card>

          <Card titulo="Localização">
            <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
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
            <div className="px-4 py-4">
              <textarea
                rows={5}
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                className="w-full resize-y rounded-md border border-slate-300 px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </Card>

          {erro && (
            <p className="text-sm font-medium text-red-600">
              {erro}
            </p>
          )}

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
    <div className="rounded-md border border-slate-200 bg-app-card transition hover:border-blue-700">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-950">
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
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}
