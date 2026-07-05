"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { ClientesTable } from "@/modules/clientes/components/ClientesTable";
import { useClientes } from "@/modules/clientes/hooks/useClientes";

type SituacaoCliente = "todos" | "ativos" | "inativos";

export default function ClientesPage() {
  const router = useRouter();
  const {
    clientes,
    busca,
    setBusca,
    situacao,
    setSituacao,
    totais,
    loading,
    erro,
  } = useClientes();
  const [mostrarColunas, setMostrarColunas] = useState(false);
  const [colunasVisiveis, setColunasVisiveis] = useState({
    nomeFantasia: true,
    razaoSocial: true,
    cnpj: true,
    cidade: true,
    status: true,
  });

  function exportarClientes() {
    const cabecalho = [
      "Nome fantasia",
      "Razao social",
      "CNPJ",
      "Cidade",
      "Telefone",
      "Email",
      "Status",
    ];

    const linhas = clientes.map((cliente) => [
      cliente.nome_fantasia ?? "",
      cliente.nome ?? "",
      cliente.cnpj ?? "",
      cliente.cidade ?? "",
      cliente.telefone ?? "",
      cliente.email ?? "",
      cliente.ativo ? "Ativo" : "Inativo",
    ]);

    const conteudo = [cabecalho, ...linhas]
      .map((linha) =>
        linha
          .map((valor) => `"${String(valor).replaceAll('"', '""')}"`)
          .join(";"),
      )
      .join("\n");

    const arquivo = new Blob([conteudo], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");

    link.href = url;
    link.download = "clientes.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-lg border border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                LOGO
              </div>

              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                Cliente
              </h1>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label htmlFor="busca-clientes" className="sr-only">
                Buscar clientes
              </label>
              <input
                id="busca-clientes"
                type="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar por cliente, CNPJ, cidade ou contato"
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 lg:w-[min(42vw,520px)]"
              />

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
              </div>
            </div>
          </div>
        </header>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex w-full flex-wrap items-center justify-start gap-2">
              <div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
                <SituacaoButton
                  label="Todos"
                  quantidade={totais.todos}
                  ativo={situacao === "todos"}
                  onClick={() => setSituacao("todos")}
                />

                <SituacaoButton
                  label="Ativos"
                  quantidade={totais.ativos}
                  ativo={situacao === "ativos"}
                  onClick={() => setSituacao("ativos")}
                />

                <SituacaoButton
                  label="Inativos"
                  quantidade={totais.inativos}
                  ativo={situacao === "inativos"}
                  onClick={() => setSituacao("inativos")}
                />
              </div>

              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMostrarColunas(!mostrarColunas)}
                    className="inline-flex h-9 min-w-24 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Exibir
                    <span className="text-xs text-slate-400">{"\u25BE"}</span>
                  </button>

                  {mostrarColunas && (
                    <div className="absolute left-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Exibir campos
                        </p>

                        <button
                          type="button"
                          onClick={() => setMostrarColunas(false)}
                          className="text-xs font-semibold text-slate-500 transition hover:text-slate-900"
                        >
                          Fechar
                        </button>
                      </div>

                      <div className="space-y-1">
                        <CheckboxCampo
                          label="Nome fantasia"
                          checked={colunasVisiveis.nomeFantasia}
                          onChange={() =>
                            setColunasVisiveis((prev) => ({
                              ...prev,
                              nomeFantasia: !prev.nomeFantasia,
                            }))
                          }
                        />

                        <CheckboxCampo
                          label="Razao social"
                          checked={colunasVisiveis.razaoSocial}
                          onChange={() =>
                            setColunasVisiveis((prev) => ({
                              ...prev,
                              razaoSocial: !prev.razaoSocial,
                            }))
                          }
                        />

                        <CheckboxCampo
                          label="CNPJ"
                          checked={colunasVisiveis.cnpj}
                          onChange={() =>
                            setColunasVisiveis((prev) => ({
                              ...prev,
                              cnpj: !prev.cnpj,
                            }))
                          }
                        />

                        <CheckboxCampo
                          label="Cidade"
                          checked={colunasVisiveis.cidade}
                          onChange={() =>
                            setColunasVisiveis((prev) => ({
                              ...prev,
                              cidade: !prev.cidade,
                            }))
                          }
                        />

                        <CheckboxCampo
                          label="Status"
                          checked={colunasVisiveis.status}
                          onChange={() =>
                            setColunasVisiveis((prev) => ({
                              ...prev,
                              status: !prev.status,
                            }))
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={exportarClientes}
                  className="inline-flex h-9 min-w-24 items-center justify-center rounded-md px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Exportar
                </button>
              </div>
            </div>
          </div>
        </section>

        <ClientesTable
          clientes={clientes}
          loading={loading}
          erro={erro}
          busca={busca}
          colunasVisiveis={colunasVisiveis}
        />
      </div>
    </main>
  );
}

function SituacaoButton({
  label,
  quantidade,
  ativo,
  onClick,
}: {
  label: string;
  quantidade: number;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        ativo
          ? "inline-flex h-9 items-center justify-center rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-900 transition"
          : "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
      }
    >
      {label} ({quantidade})
    </button>
  );
}

function CheckboxCampo({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-slate-900"
      />
      {label}
    </label>
  );
}
