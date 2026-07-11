"use client";

import { useState } from "react";

type SituacaoFornecedor = "todos" | "ativos" | "inativos";

type ColunasVisiveis = {
  nomeFantasia: boolean;
  razaoSocial: boolean;
  cnpj: boolean;
  cidade: boolean;
  status: boolean;
};

type FornecedoresHeaderProps = {
  usuario: string;
  busca: string;
  setBusca: (value: string) => void;
  situacao: SituacaoFornecedor;
  setSituacao: (value: SituacaoFornecedor) => void;
  totais: {
    todos: number;
    ativos: number;
    inativos: number;
  };
  colunasVisiveis: ColunasVisiveis;
  setColunasVisiveis: React.Dispatch<React.SetStateAction<ColunasVisiveis>>;
  onExportar: () => void;
};

export function FornecedoresHeader({
  usuario,
  busca,
  setBusca,
  situacao,
  setSituacao,
  totais,
  colunasVisiveis,
  setColunasVisiveis,
  onExportar,
}: FornecedoresHeaderProps) {
  const [mostrarColunas, setMostrarColunas] = useState(false);

  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Compras
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Fornecedores
          </h1>
        </div>

        <div className="text-sm font-medium text-slate-500">
          {usuario}
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <input
          type="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder="Buscar por fornecedor, CNPJ, cidade ou contato"
          className="h-11 w-full rounded-lg border border-slate-200 bg-app-card px-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70 lg:max-w-xl"
        />

        <div className="flex w-full flex-wrap items-center justify-start gap-2 lg:justify-end">
          <div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-slate-200 bg-app-card p-1">
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

          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-app-card p-1">
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
                <div className="absolute left-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-app-card p-4 shadow-xl">
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
              onClick={onExportar}
              className="inline-flex h-9 min-w-24 items-center justify-center rounded-md px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Exportar
            </button>
          </div>
        </div>
      </div>
    </header>
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
