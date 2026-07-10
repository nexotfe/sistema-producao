"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ProdutoResumo = {
  id: string;
  codigo: string;
  descricao: string;
};

export type ResultadoAdicionarItem =
  | { status: "ok" }
  | { status: "erro"; mensagem: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (input: {
    produtoId: string;
    quantidade: number;
  }) => Promise<ResultadoAdicionarItem>;
};

export function ProdutoSearchModal({ open, onClose, onAdd }: Props) {
  const router = useRouter();

  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ProdutoResumo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [produtoSelecionado, setProdutoSelecionado] =
    useState<ProdutoResumo | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const termoBusca = termo.trim();

    if (produtoSelecionado || !termoBusca) {
      setResultados([]);
      return;
    }

    setBuscando(true);

    const timeoutId = setTimeout(async () => {
      const { data } = await supabase
        .from("itens_industriais")
        .select("id,codigo,descricao")
        .or(`codigo.ilike.%${termoBusca}%,descricao.ilike.%${termoBusca}%`)
        .eq("ativo", true)
        .order("codigo", { ascending: true })
        .limit(8);

      setResultados((data ?? []) as ProdutoResumo[]);
      setBuscando(false);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [termo, produtoSelecionado]);

  if (!open) {
    return null;
  }

  function limparEFechar() {
    setTermo("");
    setResultados([]);
    setProdutoSelecionado(null);
    setQuantidade("");
    setErro(null);
    onClose();
  }

  function irParaCriarProduto() {
    limparEFechar();
    router.push("/produtos/novo");
  }

  async function handleAdicionar() {
    if (!produtoSelecionado) {
      return;
    }

    const quantidadeNumerica = Number(quantidade.replace(",", "."));

    if (!Number.isFinite(quantidadeNumerica) || quantidadeNumerica <= 0) {
      setErro("Informe uma quantidade numérica maior que zero.");
      return;
    }

    setSalvando(true);
    setErro(null);

    const resultado = await onAdd({
      produtoId: produtoSelecionado.id,
      quantidade: quantidadeNumerica,
    });

    setSalvando(false);

    if (resultado.status === "erro") {
      setErro(resultado.mensagem);
      return;
    }

    limparEFechar();
  }

  const termoBusca = termo.trim();
  const semResultados =
    !buscando && termoBusca.length > 0 && resultados.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">
            Adicionar Item ao Orçamento
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Busque um produto já cadastrado para incluir no orçamento.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {produtoSelecionado ? (
            <div className="grid gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Produto selecionado
                </label>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <span className="font-semibold">
                    {produtoSelecionado.codigo}
                  </span>{" "}
                  — {produtoSelecionado.descricao}
                </div>
                <button
                  type="button"
                  onClick={() => setProdutoSelecionado(null)}
                  className="mt-1.5 text-xs font-semibold text-blue-700 hover:underline"
                >
                  Buscar outro produto
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Quantidade
                </label>
                <input
                  value={quantidade}
                  onChange={(event) => setQuantidade(event.target.value)}
                  inputMode="decimal"
                  autoFocus
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {erro ? (
                <p className="text-sm font-medium text-red-600">{erro}</p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Buscar produto (código ou descrição)
                </label>
                <input
                  type="search"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={termo}
                  onChange={(event) => setTermo(event.target.value)}
                  placeholder="Ex: M12345 ou Cortadora"
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {buscando ? (
                <p className="text-sm text-slate-400">Buscando...</p>
              ) : semResultados ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-center">
                  <p className="text-sm text-slate-500">
                    Nenhum produto encontrado.
                  </p>
                  <button
                    type="button"
                    onClick={irParaCriarProduto}
                    className="mt-2 text-sm font-semibold text-blue-700 hover:underline"
                  >
                    Criar novo produto
                  </button>
                </div>
              ) : resultados.length > 0 ? (
                <div className="rounded-md border border-slate-200">
                  {resultados.map((produto) => (
                    <button
                      key={produto.id}
                      type="button"
                      onClick={() => setProdutoSelecionado(produto)}
                      className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 transition last:border-b-0 hover:bg-slate-50"
                    >
                      <span className="font-semibold">{produto.codigo}</span>{" "}
                      — {produto.descricao}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={limparEFechar}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancelar
          </button>
          {produtoSelecionado ? (
            <button
              type="button"
              onClick={handleAdicionar}
              disabled={salvando}
              className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {salvando ? "Adicionando..." : "Adicionar"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
