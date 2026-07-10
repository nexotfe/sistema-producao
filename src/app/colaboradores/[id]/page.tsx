"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useRouter } from "next/navigation";

import { useEditarColaborador } from "@/modules/colaboradores/hooks/useEditarColaborador";
import { useNovoColaborador } from "@/modules/colaboradores/hooks/useNovoColaborador";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default function ColaboradorPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const registroNovo = id === "novo";
  const [editando, setEditando] = useState(registroNovo);

  const novo = useNovoColaborador();
  const edicao = useEditarColaborador(id);
  const form = registroNovo ? novo : edicao;
  const loading = registroNovo ? novo.loading : edicao.loading;
  const salvando = registroNovo ? novo.loading : edicao.salvando;
  const erro = registroNovo ? novo.erro : edicao.erro;
  const [bloqueioExclusao, setBloqueioExclusao] = useState<
    "vinculado" | "sem_permissao" | null
  >(null);

  async function salvarColaborador() {
    const sucesso = await form.salvarColaborador();

    if (sucesso) {
      if (registroNovo) {
        router.push("/colaboradores");
        return;
      }

      setEditando(false);
    }
  }

  async function inativarColaborador() {
    if (registroNovo) {
      return;
    }

    const sucesso = await edicao.inativarColaborador();

    if (sucesso) {
      router.push("/colaboradores");
    }
  }

  async function excluirColaborador() {
    if (registroNovo) {
      return;
    }

    const confirmado = window.confirm(
      "Deseja excluir permanentemente este colaborador? Essa ação não pode ser desfeita.",
    );

    if (!confirmado) {
      return;
    }

    setBloqueioExclusao(null);
    const resultado = await edicao.excluirColaborador();

    if (resultado.status === "excluido") {
      router.push("/colaboradores");
      return;
    }

    if (resultado.status === "vinculado" || resultado.status === "sem_permissao") {
      setBloqueioExclusao(resultado.status);
    }
  }

  if (!registroNovo && loading) {
    return (
      <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <p className="text-sm text-slate-500">Carregando colaborador...</p>
        </div>
      </main>
    );
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
                {!registroNovo ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditando(true)}
                      className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push("/colaboradores/novo")}
                      className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Duplicar
                    </button>
                    <button
                      type="button"
                      onClick={excluirColaborador}
                      disabled={salvando}
                      className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Excluir
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={salvarColaborador}
                  disabled={salvando}
                  className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {salvando ? "Salvando..." : "Salvar"}
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
                onChange={form.setCodigo}
              />
              <Field
                label="Nome"
                value={form.nome}
                disabled={!editando}
                onChange={form.setNome}
              />
              <Field
                label="Apelido"
                value={form.apelido}
                disabled={!editando}
                onChange={form.setApelido}
              />
              <Field
                label="Setor"
                value={form.setor}
                disabled={!editando}
                onChange={form.setSetor}
              />
              <Field
                label="Função"
                value={form.funcao}
                disabled={!editando}
                onChange={form.setFuncao}
              />
              <Field
                label="Data de admissão"
                type="date"
                value={form.dataAdmissao}
                disabled={!editando}
                onChange={form.setDataAdmissao}
              />
            </div>
          </Card>

          <Card titulo="Capacidade">
            <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
              <Field
                label="Carga Produtiva"
                value={form.cargaProdutiva}
                disabled={!editando}
                onChange={form.setCargaProdutiva}
              />
              <Field
                label="Habilidades"
                value={form.habilidades}
                disabled={!editando}
                onChange={form.setHabilidades}
              />
            </div>
          </Card>

          <Card titulo="Contato">
            <div className="grid gap-4 px-5 py-4 md:grid-cols-3">
              <Field
                label="Telefone"
                value={form.telefone}
                disabled={!editando}
                onChange={form.setTelefone}
              />
              <Field
                label="E-mail"
                value={form.email}
                disabled={!editando}
                onChange={form.setEmail}
              />
            </div>
          </Card>

          <Card titulo="Observações">
            <div className="px-5 py-4">
              <textarea
                rows={5}
                value={form.observacoes}
                disabled={!editando}
                onChange={(event) => form.setObservacoes(event.target.value)}
                className="w-full resize-y rounded-md border border-slate-300 px-3 py-3 text-sm outline-none transition disabled:bg-slate-50 disabled:text-slate-700 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </Card>

          {erro ? (
            <p className="text-sm font-medium text-red-600">
              {erro}
            </p>
          ) : null}

          {bloqueioExclusao === "vinculado" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span>
                Não é possível excluir - há vínculos com produção/histórico.
              </span>
              <button
                type="button"
                onClick={inativarColaborador}
                className="h-9 shrink-0 rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
              >
                Desativar em vez disso
              </button>
            </div>
          ) : null}

          {bloqueioExclusao === "sem_permissao" ? (
            <p className="text-sm font-medium text-red-600">
              Apenas administradores podem excluir registros.
            </p>
          ) : null}
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
