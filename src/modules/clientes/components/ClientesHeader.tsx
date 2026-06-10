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

  onNovoCliente,
}: ClientesHeaderProps) {
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
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

        <div className="flex min-w-[420px] items-center justify-start gap-2 lg:justify-end">
          
          <button
  onClick={() => setMostrarFiltros(!mostrarFiltros)}
  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
>
  Filtros
</button>

<button className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
  Colunas
</button>

<button className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
  Exportar
</button>

          <Link
  href="/clientes/novo"
  className="h-11 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 inline-flex items-center"
>
  + Cliente
</Link>

                    
        </div>
      </header>
      {mostrarFiltros && (
  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap gap-8">
  <div>
    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
      Status
    </p>

    <div className="flex gap-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="status"
          value="todos"
          checked={filtroStatus === "todos"}
          onChange={(e) => setFiltroStatus(e.target.value)}
        />
        Todos
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="status"
          value="ativo"
          checked={filtroStatus === "ativo"}
          onChange={(e) => setFiltroStatus(e.target.value)}
        />
        Ativos
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="status"
          value="inativo"
          checked={filtroStatus === "inativo"}
          onChange={(e) => setFiltroStatus(e.target.value)}
        />
        Inativos
      </label>
    </div>
  </div>
</div>
  </div>
)}

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