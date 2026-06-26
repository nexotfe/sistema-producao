"use client";

import { useState } from "react";
import type { ColunasRecursos, SituacaoRecurso } from "../types";

type RecursosHeaderProps = {
  usuario: string;
  busca: string;
  setBusca: (value: string) => void;
  situacao: SituacaoRecurso;
  setSituacao: (value: SituacaoRecurso) => void;
  totais: {
    todos: number;
    ativos: number;
    inativos: number;
  };
  colunasVisiveis: ColunasRecursos;
  setColunasVisiveis: React.Dispatch<React.SetStateAction<ColunasRecursos>>;
  onExportar: () => void;
};

export function RecursosHeader({
  usuario,
  busca,
  setBusca,
  situacao,
  setSituacao,
  totais,
  colunasVisiveis,
  setColunasVisiveis,
  onExportar,
}: RecursosHeaderProps) {
  const [mostrarColunas, setMostrarColunas] = useState(false);

  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Administrativo
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Recursos Produtivos
          </h1>
        </div>

        <div className="text-sm font-medium text-slate-500">{usuario}</div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <input
          type="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder="Buscar por recurso, codigo, grupo ou setor"
          className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70 lg:max-w-xl"
        />

        <div className="flex w-full flex-wrap items-center justify-start gap-2 lg:justify-end">
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
                    {(
                      [
                        ["codigo", "Codigo"],
                        ["nome", "Nome"],
                        ["grupo", "Grupo"],
                        ["setor", "Setor"],
                        ["capacidade", "Capacidade"],
                        ["status", "Status"],
                      ] as const
                    ).map(([key, label]) => (
                      <CheckboxCampo
                        key={key}
                        label={label}
                        checked={colunasVisiveis[key]}
                        onChange={() =>
                          setColunasVisiveis((prev) => ({
                            ...prev,
                            [key]: !prev[key],
                          }))
                        }
                      />
                    ))}
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
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 text-sm text-slate-600 transition hover:bg-slate-50">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-slate-300 text-slate-900"
      />
    </label>
  );
}
