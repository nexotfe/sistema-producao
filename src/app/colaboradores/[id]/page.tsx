"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

type ColaboradorForm = {
  codigo: string;
  nome: string;
  apelido: string;
  setor: string;
  funcao: string;
  dataAdmissao: string;
  cargaHoraria: string;
  disponibilidadeAtual: string;
  habilidades: string;
  telefone: string;
  email: string;
  observacoes: string;
};

const colaboradorMock: ColaboradorForm = {
  codigo: "101",
  nome: "Marcos Oliveira",
  apelido: "Marcos",
  setor: "Usinagem",
  funcao: "Operador CNC",
  dataAdmissao: "2024-02-05",
  cargaHoraria: "44",
  disponibilidadeAtual: "32",
  habilidades: "Torno CNC, centro de usinagem",
  telefone: "(11) 90000-0001",
  email: "marcos@nexotfe.com.br",
  observacoes: "Colaborador mockado para revisão visual.",
};

const colaboradorVazio: ColaboradorForm = {
  codigo: "",
  nome: "",
  apelido: "",
  setor: "",
  funcao: "",
  dataAdmissao: "",
  cargaHoraria: "",
  disponibilidadeAtual: "",
  habilidades: "",
  telefone: "",
  email: "",
  observacoes: "",
};

export default function ColaboradorPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const registroNovo = id === "novo";
  const [editando, setEditando] = useState(registroNovo);
  const [registroSalvo, setRegistroSalvo] = useState(!registroNovo);
  const [form, setForm] = useState<ColaboradorForm>(
    registroNovo ? colaboradorVazio : colaboradorMock,
  );

  function atualizarCampo(campo: keyof ColaboradorForm, valor: string) {
    setForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  function editarColaborador() {
    setEditando(true);
  }

  function duplicarColaborador() {
    setForm({
      ...form,
      codigo: "",
      nome: "",
    });
    setRegistroSalvo(false);
    setEditando(true);
  }

  function excluirColaborador() {
    const confirmado = window.confirm("Deseja excluir este colaborador?");

    if (confirmado) {
      setForm(colaboradorVazio);
      setRegistroSalvo(false);
      setEditando(true);
    }
  }

  function salvarColaborador() {
    setRegistroSalvo(true);
    setEditando(false);
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <header className="rounded-lg border border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                LOGO
              </div>

              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                  Colaborador
                </h1>
                {registroNovo ? (
                  <p className="mt-1 text-sm text-slate-500">
                    Novo colaborador
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <span className="whitespace-nowrap text-sm font-medium text-slate-500">
                Nome do usuário
              </span>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Voltar
                </button>
                <Link
                  href="/central"
                  className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Início
                </Link>
                <button
                  type="button"
                  onClick={editarColaborador}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={duplicarColaborador}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  onClick={excluirColaborador}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Excluir
                </button>
                <button
                  type="button"
                  onClick={salvarColaborador}
                  className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="flex flex-col gap-4">
          <Card titulo="Informações do colaborador">
            <div className="grid gap-4 px-5 py-4 md:grid-cols-3">
              <Field
                label="Código"
                value={form.codigo}
                disabled={!editando}
                onChange={(valor) => atualizarCampo("codigo", valor)}
              />
              <Field
                label="Nome"
                value={form.nome}
                disabled={!editando}
                onChange={(valor) => atualizarCampo("nome", valor)}
              />
              <Field
                label="Apelido"
                value={form.apelido}
                disabled={!editando}
                onChange={(valor) => atualizarCampo("apelido", valor)}
              />
              <Field
                label="Setor"
                value={form.setor}
                disabled={!editando}
                onChange={(valor) => atualizarCampo("setor", valor)}
              />
              <Field
                label="Função"
                value={form.funcao}
                disabled={!editando}
                onChange={(valor) => atualizarCampo("funcao", valor)}
              />
              <Field
                label="Data de admissão"
                type="date"
                value={form.dataAdmissao}
                disabled={!editando}
                onChange={(valor) => atualizarCampo("dataAdmissao", valor)}
              />
            </div>
          </Card>

          <Card titulo="Capacidade">
            {/*
              A disponibilidade real do colaborador será calculada pelo
              Planejamento (PCP/APS), considerando carga produtiva, calendário,
              férias, feriados, ausências, alocações produtivas e horas extras.
            */}
            <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
              <Field
                label="Carga horária"
                value={form.cargaHoraria}
                disabled={!editando}
                onChange={(valor) => atualizarCampo("cargaHoraria", valor)}
              />
              <Field
                label="Habilidades"
                value={form.habilidades}
                disabled={!editando}
                onChange={(valor) => atualizarCampo("habilidades", valor)}
              />
            </div>
          </Card>

          <Card titulo="Contato">
            <div className="grid gap-4 px-5 py-4 md:grid-cols-3">
              <Field
                label="Telefone"
                value={form.telefone}
                disabled={!editando}
                onChange={(valor) => atualizarCampo("telefone", valor)}
              />
              <Field
                label="E-mail"
                value={form.email}
                disabled={!editando}
                onChange={(valor) => atualizarCampo("email", valor)}
              />
            </div>
          </Card>

          <Card titulo="Observações">
            <div className="px-5 py-4">
              <textarea
                rows={5}
                value={form.observacoes}
                disabled={!editando}
                onChange={(event) =>
                  atualizarCampo("observacoes", event.target.value)
                }
                className="w-full resize-y rounded-md border border-slate-300 px-3 py-3 text-sm outline-none transition disabled:bg-slate-50 disabled:text-slate-700 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
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
    <div className="rounded-md border border-slate-200 bg-white transition hover:border-blue-700">
      <div className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-bold text-slate-950">{titulo}</h2>
      </div>

      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>

      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition disabled:bg-slate-50 disabled:text-slate-700 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}
