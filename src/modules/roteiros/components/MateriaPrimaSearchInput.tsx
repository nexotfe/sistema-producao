"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type MateriaPrimaResumo = {
  id: string;
  codigo: string | null;
  descricao: string;
  unidade: string;
};

type MateriaPrimaRow = {
  id: string;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
};

type MateriaPrimaSearchInputProps = {
  value: MateriaPrimaResumo | null;
  onChange: (materiaPrima: MateriaPrimaResumo | null) => void;
  placeholder?: string;
};

export function MateriaPrimaSearchInput({
  value,
  onChange,
  placeholder = "Buscar matéria-prima",
}: MateriaPrimaSearchInputProps) {
  const [termo, setTermo] = useState(value?.descricao ?? "");
  const [resultados, setResultados] = useState<MateriaPrimaRow[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTermo(value?.descricao ?? "");
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

    if (!termoBusca || (value && termoBusca === value.descricao)) {
      setResultados([]);
      return;
    }

    setBuscando(true);

    const timeoutId = setTimeout(async () => {
      const termoEscapado = termoBusca.replace(/"/g, '\\"');
      const filtro = ["codigo", "descricao"]
        .map((coluna) => `${coluna}.ilike."%${termoEscapado}%"`)
        .join(",");

      const { data } = await supabase
        .from("materias_primas")
        .select("id,codigo,descricao,unidade")
        .or(filtro)
        .eq("ativo", true)
        .order("descricao", { ascending: true })
        .limit(8);

      setResultados((data ?? []) as MateriaPrimaRow[]);
      setBuscando(false);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [termo, value]);

  function selecionar(materia: MateriaPrimaRow) {
    onChange({
      id: materia.id,
      codigo: materia.codigo,
      descricao: materia.descricao ?? "",
      unidade: materia.unidade ?? "",
    });
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
        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />

      {mostrarDropdown ? (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-app-card py-1 shadow-lg">
          {buscando ? (
            <p className="px-3 py-2 text-sm text-slate-400">Buscando...</p>
          ) : resultados.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-400">
              Nenhuma matéria-prima encontrada.
            </p>
          ) : (
            resultados.map((materia) => (
              <button
                key={materia.id}
                type="button"
                onClick={() => selecionar(materia)}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                {materia.descricao}
                {materia.codigo ? (
                  <span className="block text-xs text-slate-400">
                    {materia.codigo}
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
