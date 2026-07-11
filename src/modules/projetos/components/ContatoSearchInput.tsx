"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type ContatoSugestao = {
  nome: string;
  email: string;
  telefone: string;
  setor: string;
};

export type PrefixoContatoColuna =
  | "contato_comercial"
  | "contato_tecnico"
  | "contato_tecnico_2";

type ProjetoContatoRow = Record<string, string | null>;

type ContatoSearchInputProps = {
  valorNome: string;
  onChangeNome: (nome: string) => void;
  onSelecionar: (contato: ContatoSugestao) => void;
  clienteId: string | null;
  prefixoColuna: PrefixoContatoColuna;
  projetoIdAtual?: string | null;
  placeholder?: string;
};

export function ContatoSearchInput({
  valorNome,
  onChangeNome,
  onSelecionar,
  clienteId,
  prefixoColuna,
  projetoIdAtual,
  placeholder = "Nome do contato",
}: ContatoSearchInputProps) {
  const [resultados, setResultados] = useState<ContatoSugestao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
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

  useEffect(() => {
    const termo = valorNome.trim();

    // Sem cliente selecionado, o campo funciona normal - sem autocomplete.
    if (!clienteId || !termo) {
      setResultados([]);
      return;
    }

    const colNome = `${prefixoColuna}_nome`;
    const colEmail = `${prefixoColuna}_email`;
    const colTelefone = `${prefixoColuna}_telefone`;
    const colSetor = `${prefixoColuna}_setor`;

    setBuscando(true);

    const timeoutId = setTimeout(async () => {
      let query = supabase
        .from("projetos")
        .select(`${colNome},${colEmail},${colTelefone},${colSetor},created_at`)
        .eq("cliente_id", clienteId)
        .not(colNome, "is", null)
        .ilike(colNome, `%${termo}%`)
        .order(colNome, { ascending: true })
        .order("created_at", { ascending: false })
        .limit(20);

      if (projetoIdAtual) {
        query = query.neq("id", projetoIdAtual);
      }

      const { data } = await query;
      const linhas = (data ?? []) as unknown as ProjetoContatoRow[];

      const vistos = new Set<string>();
      const sugestoes: ContatoSugestao[] = [];

      for (const linha of linhas) {
        const nome = linha[colNome];

        if (!nome || vistos.has(nome)) {
          continue;
        }

        vistos.add(nome);
        sugestoes.push({
          nome,
          email: linha[colEmail] ?? "",
          telefone: linha[colTelefone] ?? "",
          setor: linha[colSetor] ?? "",
        });

        if (sugestoes.length >= 8) {
          break;
        }
      }

      setResultados(sugestoes);
      setBuscando(false);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [valorNome, clienteId, prefixoColuna, projetoIdAtual]);

  function selecionar(contato: ContatoSugestao) {
    onSelecionar(contato);
    setAberto(false);
  }

  const mostrarDropdown =
    aberto && Boolean(clienteId) && valorNome.trim().length > 0;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        value={valorNome}
        onChange={(event) => {
          onChangeNome(event.target.value);
          setAberto(true);
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
              Nenhuma sugestão.
            </p>
          ) : (
            resultados.map((contato) => (
              <button
                key={contato.nome}
                type="button"
                onClick={() => selecionar(contato)}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                {contato.nome}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
