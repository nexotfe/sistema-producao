"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProjetosLista } from "@/modules/projetos/hooks/useProjetosLista";

export function ProjetoSearchInput() {
  const router = useRouter();
  const { projetos, busca, setBusca, loading } = useProjetosLista();
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setAberto(false);
      }
    }

    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  const termoBusca = busca.trim();
  const mostrarDropdown = aberto && termoBusca.length > 0;
  const resultados = projetos.slice(0, 8);

  function selecionar(id: string) {
    setBusca("");
    setAberto(false);
    router.push(`/projeto?id=${id}`);
  }

  return (
    <div ref={containerRef} className="relative w-full lg:w-[min(42vw,520px)]">
      <label htmlFor="busca-projeto-global" className="sr-only">
        Buscar projeto
      </label>
      <input
        id="busca-projeto-global"
        type="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={busca}
        onChange={(event) => {
          setBusca(event.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        placeholder="Buscar projeto por número, descrição ou cliente..."
        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />

      {mostrarDropdown ? (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-sm text-slate-400">Carregando...</p>
          ) : resultados.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-400">
              Nenhum projeto encontrado.
            </p>
          ) : (
            resultados.map((projeto) => (
              <button
                key={projeto.id}
                type="button"
                onClick={() => selecionar(projeto.id)}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <span className="font-semibold">{projeto.numeroProjeto}</span>
                {" — "}
                {projeto.nome}
                {projeto.clienteNome ? ` (${projeto.clienteNome})` : ""}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
