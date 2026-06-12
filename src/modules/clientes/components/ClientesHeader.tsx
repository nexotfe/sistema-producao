"use client";

import Link from "next/link";
import { useState } from "react";

type ClientesHeaderProps = {
  usuario: string;

  busca: string;
  setBusca: (value: string) => void;

  filtroStatus: string;
  setFiltroStatus: (value: string) => void;

  filtroCidade: string;
  setFiltroCidade: (value: string) => void;

  cidades: string[];

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

  filtroStatus,
  setFiltroStatus,

  filtroCidade,
setFiltroCidade,

cidades,

colunasVisiveis,
setColunasVisiveis,

onNovoCliente,
}: ClientesHeaderProps) {
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [mostrarColunas, setMostrarColunas] = useState(false);

  return (
    <>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-[220px] truncate text-sm font-medium text-slate-500">
          {usuario}
        </div>

        <div className="flex w-full justify-center lg:flex-1">
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar clientes"
            className="h-11 w-full max-w-sm rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
          />
        </div>

        <div className="flex w-full flex-wrap items-center justify-start gap-2 lg:w-auto lg:justify-end">
  <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
    <div className="relative">
      <button
        type="button"
        onClick={() => setMostrarFiltros(!mostrarFiltros)}
        className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        Filtros
        <span className="text-xs text-slate-400">{"\u25BE"}</span>
      </button>

      {mostrarFiltros && (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
          <div className="mb-5 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Filtros
            </p>

            <button
              type="button"
              onClick={() => setMostrarFiltros(false)}
              className="text-xs font-semibold text-slate-500 transition hover:text-slate-900"
            >
              Fechar
            </button>
          </div>

          <div className="grid gap-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">
                Status
              </p>

              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-slate-400"
              >
                <option value="todos">Todos</option>
                <option value="ativo">Ativos</option>
                <option value="inativo">Inativos</option>
              </select>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">
                Cidade
              </p>

              <select
                value={filtroCidade}
                onChange={(e) => setFiltroCidade(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-slate-400"
              >
                <option value="">Todas as cidades</option>

                {cidades.map((cidade) => (
                  <option key={cidade} value={cidade}>
                    {cidade}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>

    <div className="relative">
      <button
        type="button"
        onClick={() => setMostrarColunas(!mostrarColunas)}
        className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        Exibir
        <span className="text-xs text-slate-400">{"\u25BE"}</span>
      </button>

      {mostrarColunas && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
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
  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50">
    <input
      type="checkbox"
      checked={colunasVisiveis.nomeFantasia}
      onChange={() =>
        setColunasVisiveis((prev) => ({
          ...prev,
          nomeFantasia: !prev.nomeFantasia,
        }))
      }
      className="h-4 w-4 accent-slate-900"
    />
    Nome Fantasia
  </label>

  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
    <input
      type="checkbox"
      checked={colunasVisiveis.razaoSocial}
      onChange={() =>
        setColunasVisiveis((prev) => ({
          ...prev,
          razaoSocial: !prev.razaoSocial,
        }))
      }
      className="h-4 w-4 accent-slate-900"
    />
    Razão Social
  </label>

  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
    <input
      type="checkbox"
      checked={colunasVisiveis.cnpj}
      onChange={() =>
        setColunasVisiveis((prev) => ({
          ...prev,
          cnpj: !prev.cnpj,
        }))
      }
      className="h-4 w-4 accent-slate-900"
    />
    CNPJ
  </label>

  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
    <input
      type="checkbox"
      checked={colunasVisiveis.cidade}
      onChange={() =>
        setColunasVisiveis((prev) => ({
          ...prev,
          cidade: !prev.cidade,
        }))
      }
      className="h-4 w-4 accent-slate-900"
    />
    Cidade
  </label>

  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
    <input
      type="checkbox"
      checked={colunasVisiveis.status}
      onChange={() =>
        setColunasVisiveis((prev) => ({
          ...prev,
          status: !prev.status,
        }))
      }
      className="h-4 w-4 accent-slate-900"
    />
    Status
  </label>
</div>
        </div>
      )}
    </div>

    <button className="h-9 rounded-lg px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
      Exportar
    </button>
  </div>

  <Link
    href="/clientes/novo"
    className="inline-flex h-11 items-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
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