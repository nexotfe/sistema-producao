"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type ClienteResumo = {
  id: string;
  nome: string;
};

type ClienteRow = {
  id: string;
  nome: string | null;
  nome_fantasia: string | null;
  cnpj: string | null;
};

type ClienteSearchInputProps = {
  value: ClienteResumo | null;
  onChange: (cliente: ClienteResumo | null) => void;
  placeholder?: string;
};

export function ClienteSearchInput({
  value,
  onChange,
  placeholder = "Buscar cliente",
}: ClienteSearchInputProps) {
  const [termo, setTermo] = useState(value?.nome ?? "");
  const [resultados, setResultados] = useState<ClienteRow[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTermo(value?.nome ?? "");
  }, [value]);

  useEffect(() => {
    function aoClicarFora(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setAberto(false);
      }
    }

    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  useEffect(() => {
    const termoBusca = termo.trim();

    if (!termoBusca || (value && termoBusca === value.nome)) {
      setResultados([]);
      return;
    }

    setBuscando(true);

    const timeoutId = setTimeout(async () => {
      const termoEscapado = termoBusca.replace(/"/g, '\\"');
      const filtro = ["nome", "nome_fantasia", "cnpj"]
        .map((coluna) => `${coluna}.ilike."%${termoEscapado}%"`)
        .join(",");

      const { data } = await supabase
        .from("clientes")
        .select("id,nome,nome_fantasia,cnpj")
        .or(filtro)
        .eq("ativo", true)
        .is("deleted_at", null)
        .order("nome", { ascending: true })
        .limit(8);

      setResultados((data ?? []) as ClienteRow[]);
      setBuscando(false);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [termo, value]);

  function selecionar(cliente: ClienteRow) {
    onChange({ id: cliente.id, nome: cliente.nome ?? "" });
    setAberto(false);
  }

  const mostrarDropdown = aberto && termo.trim().length > 0 && !value;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        value={termo}
        onChange={(event) => {
          setTermo(event.target.value);
          setAberto(true);
          if (value) {
            onChange(null);
          }
        }}
        onFocus={() => setAberto(true)}
        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />

      {mostrarDropdown ? (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-app-card py-1 shadow-lg">
          {buscando ? (
            <p className="px-3 py-2 text-sm text-slate-400">Buscando...</p>
          ) : resultados.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-400">
              Nenhum cliente encontrado.
            </p>
          ) : (
            resultados.map((cliente) => (
              <button
                key={cliente.id}
                type="button"
                onClick={() => selecionar(cliente)}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                {cliente.nome}
                {[cliente.nome_fantasia, cliente.cnpj].filter(Boolean).length >
                0 ? (
                  <span className="block text-xs text-slate-400">
                    {[cliente.nome_fantasia, cliente.cnpj]
                      .filter(Boolean)
                      .join(" / ")}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
