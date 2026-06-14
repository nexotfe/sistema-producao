"use client";

import Link from "next/link";
import { useState } from "react";

type SituacaoCliente = "todos" | "ativos" | "inativos";

type ClientesHeaderProps = {
  usuario: string;

  busca: string;
  setBusca: (value: string) => void;

  situacao: SituacaoCliente;
  setSituacao: (value: SituacaoCliente) => void;
  totais: {
    todos: number;
    ativos: number;
    inativos: number;
  };

  colunasVisiveis: {
    nomeFantasia: boolean;
    razaoSocial: boolean;
    cnpj: boolean;
    cidade: boolean;
    status: boolean;
  };

  setColunasVisiveis: React.Dispatch<
    React.SetStateAction<{
      nomeFantasia: boolean;
      razaoSocial: boolean;
      cnpj: boolean;
      cidade: boolean;
      status: boolean;
    }>
  >;

  onNovoCliente: () => void;
};

export function ClientesHeader({
  usuario,
  busca,
  setBusca,
  situacao,
  setSituacao,
  totais,
  colunasVisiveis,
  setColunasVisiveis,
}: ClientesHeaderProps) {
  const [mostrarColunas, setMostrarColunas] = useState(false);

  return (
    <>
      <header className="flex flex-col gap-5">
        <div className="text-sm font-medium text-slate-500">
          {usuario}
        </div>

        <input
          type="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder="Buscar clientes"
          className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
        />

        <div className="flex w-full flex-wrap items-center justify-start gap-2">
          <div className="inline-flex max-w-full flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
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

          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <div className="relative">
              <button
                type="button"
                onClick={() => setMostrarColunas(!mostrarColunas)}
                className="inline-flex h-9 min-w-24 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Exibir
                <span className="text-xs text-slate-400">{"\u25BE"}</span>
              </button>

              {mostrarColunas && (
                <div className="absolute left-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Exibir Campos
                    </p>

                    <button
                      type="button"
                      onClick={() => setMostrarColunas(false)}
                      className="text-xs font-semibold text-slate-500 transition hover:text-slate-900"
                    >
                      Fechar
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <CheckboxCampo
                      label="Nome Fantasia"
                      checked={colunasVisiveis.nomeFantasia}
                      onChange={() =>
                        setColunasVisiveis((prev) => ({
                          ...prev,
                          nomeFantasia: !prev.nomeFantasia,
                        }))
                      }
                    />

                    <CheckboxCampo
                      label="Razão Social"
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

            <button className="inline-flex h-9 min-w-24 items-center justify-center rounded-lg px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              Exportar
            </button>
          </div>

          <Link
            href="/clientes/novo"
            className="inline-flex h-11 min-w-28 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            + Cliente
          </Link>
        </div>
      </header>

      <section>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
          Comercial
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Clientes
        </h1>
      </section>
    </>
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
        ? "inline-flex h-9 items-center justify-center rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-900 transition"
        : "inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
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
    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50">
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