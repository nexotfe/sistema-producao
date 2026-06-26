"use client";

import { use } from "react";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { useRouter } from "next/navigation";
import { useEditarColaborador } from "@/modules/colaboradores/hooks/useEditarColaborador";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default function EditarColaboradorPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const {
    codigo,
    setCodigo,
    nome,
    setNome,
    apelido,
    setApelido,
    setor,
    setSetor,
    funcao,
    setFuncao,
    habilidades,
    setHabilidades,
    cargaHoraria,
    setCargaHoraria,
    disponibilidadeAtual,
    setDisponibilidadeAtual,
    telefone,
    setTelefone,
    email,
    setEmail,
    dataAdmissao,
    setDataAdmissao,
    observacoes,
    setObservacoes,
    loading,
    salvando,
    erro,
    salvarColaborador,
  } = useEditarColaborador(id);

  async function handleSalvar() {
    const sucesso = await salvarColaborador();

    if (sucesso) {
      router.push(`/colaboradores/${id}`);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <p className="text-sm text-slate-500">Carregando colaborador...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <ModuleBackLink href="/colaboradores" label="Colaborador" />

          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Editar colaborador
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Atualizacao dos dados cadastrais do colaborador.
            </p>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <Card titulo="Informacoes do colaborador">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field label="Codigo" value={codigo} onChange={setCodigo} />
              <Field label="Nome" value={nome} onChange={setNome} />
              <Field label="Apelido" value={apelido} onChange={setApelido} />
              <Field label="Setor" value={setor} onChange={setSetor} />
              <Field label="Funcao" value={funcao} onChange={setFuncao} />
              <Field
                label="Data de admissao"
                type="date"
                value={dataAdmissao}
                onChange={setDataAdmissao}
              />
            </div>
          </Card>

          <Card titulo="Capacidade">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field
                label="Carga horaria"
                value={cargaHoraria}
                onChange={setCargaHoraria}
              />
              <Field
                label="Disponibilidade atual"
                value={disponibilidadeAtual}
                onChange={setDisponibilidadeAtual}
              />
              <Field
                label="Habilidades"
                value={habilidades}
                onChange={setHabilidades}
              />
            </div>
          </Card>

          <Card titulo="Contato">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field label="Telefone" value={telefone} onChange={setTelefone} />
              <Field label="E-mail" value={email} onChange={setEmail} />
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

          {erro && <p className="text-sm font-medium text-red-600">{erro}</p>}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push(`/colaboradores/${id}`)}
              className="rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSalvar}
              disabled={salvando}
              className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
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
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-5">
        <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
      </div>

      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
      />
    </div>
  );
}
