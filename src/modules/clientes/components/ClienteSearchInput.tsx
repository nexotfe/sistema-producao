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
  // Ajuste de estado durante o render (padrao oficial do React) - sem
  // useEffect: reseta termo sempre que o objeto value mudar.
  const [valorAnterior, setValorAnterior] = useState(value);
  const [termo, setTermo] = useState(value?.nome ?? "");
  if (value !== valorAnterior) {
    setValorAnterior(value);
    setTermo(value?.nome ?? "");
  }

  const [resultados, setResultados] = useState<ClienteRow[]>([]);
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

  const termoBusca = termo.trim();
  const buscaAtiva =
    termoBusca.length > 0 && !(value && termoBusca === value.nome);
  // Deriva o que e' exibido em vez de limpar resultados/buscando via
  // setState no efeito - nunca sobra resultado/loading de uma busca
  // que deixou de ser relevante (termo vazio ou ja igual ao value).
  const resultadosExibidos = buscaAtiva ? resultados : [];
  const buscandoExibido = buscaAtiva ? buscando : false;

  useEffect(() => {
    if (!buscaAtiva) {
      // Nada a agendar - resultadosExibidos/buscandoExibido acima ja
      // refletem "sem busca ativa" sem nenhum setState aqui.
      return;
    }

    let cancelado = false;

    const timeoutId = setTimeout(async () => {
      // setBuscando so' roda quando o debounce realmente inicia a
      // consulta (300ms depois, macrotask separada) - nunca no corpo
      // sincrono do efeito.
      setBuscando(true);

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

      if (cancelado) {
        // Uma busca mais nova ja assumiu - nao aplica resultado nem
        // encerra o loading dela.
        return;
      }

      setResultados((data ?? []) as ClienteRow[]);
      setBuscando(false);
    }, 300);

    return () => {
      cancelado = true;
      clearTimeout(timeoutId);
    };
  }, [termoBusca, buscaAtiva]);

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
        className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
      />

      {mostrarDropdown ? (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface-elevated py-1 shadow-lg">
          {buscandoExibido ? (
            <p className="px-3 py-2 text-sm text-text-disabled">Buscando...</p>
          ) : resultadosExibidos.length === 0 ? (
            <p className="px-3 py-2 text-sm text-text-disabled">
              Nenhum cliente encontrado.
            </p>
          ) : (
            resultadosExibidos.map((cliente) => (
              <button
                key={cliente.id}
                type="button"
                onClick={() => selecionar(cliente)}
                className="block w-full px-3 py-2 text-left text-sm text-text-primary transition hover:bg-border-subtle"
              >
                {cliente.nome}
                {[cliente.nome_fantasia, cliente.cnpj].filter(Boolean).length >
                0 ? (
                  <span className="block text-xs text-text-disabled">
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
