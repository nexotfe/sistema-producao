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
        className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
      />

      {mostrarDropdown ? (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface-elevated py-1 shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-sm text-text-disabled">Carregando...</p>
          ) : resultados.length === 0 ? (
            <p className="px-3 py-2 text-sm text-text-disabled">
              Nenhum projeto encontrado.
            </p>
          ) : (
            resultados.map((projeto) => (
              <button
                key={projeto.id}
                type="button"
                onClick={() => selecionar(projeto.id)}
                className="block w-full px-3 py-2 text-left text-sm text-text-primary transition hover:bg-border-subtle"
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
