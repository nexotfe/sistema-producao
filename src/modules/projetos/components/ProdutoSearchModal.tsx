"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/modules/shared/ui/Button";

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

  const termoBusca = termo.trim();
  const buscaAtiva = !produtoSelecionado && termoBusca.length > 0;
  const resultadosExibidos = buscaAtiva ? resultados : [];
  const buscandoExibido = buscaAtiva ? buscando : false;

  useEffect(() => {
    if (!buscaAtiva) {
      return;
    }

    let cancelado = false;

    const timeoutId = setTimeout(async () => {
      setBuscando(true);

      const { data } = await supabase
        .from("itens_industriais")
        .select("id,codigo,descricao")
        .or(`codigo.ilike.%${termoBusca}%,descricao.ilike.%${termoBusca}%`)
        .eq("ativo", true)
        .order("codigo", { ascending: true })
        .limit(8);

      if (cancelado) {
        return;
      }

      setResultados((data ?? []) as ProdutoResumo[]);
      setBuscando(false);
    }, 300);

    return () => {
      cancelado = true;
      clearTimeout(timeoutId);
    };
  }, [buscaAtiva, termoBusca]);

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

  const semResultados =
    !buscandoExibido && termoBusca.length > 0 && resultadosExibidos.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-border bg-surface shadow-xl">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 className="text-lg font-semibold text-text-primary">
            Adicionar Item ao Orçamento
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Busque um produto já cadastrado para incluir no orçamento.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {produtoSelecionado ? (
            <div className="grid gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                  Produto selecionado
                </label>
                <div className="rounded-md border border-border-subtle bg-border-subtle px-3 py-2 text-sm text-text-primary">
                  <span className="font-semibold">
                    {produtoSelecionado.codigo}
                  </span>{" "}
                  — {produtoSelecionado.descricao}
                </div>
                <button
                  type="button"
                  onClick={() => setProdutoSelecionado(null)}
                  className="mt-1.5 text-xs font-semibold text-action-primary hover:underline"
                >
                  Buscar outro produto
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                  Quantidade
                </label>
                <input
                  value={quantidade}
                  onChange={(event) => setQuantidade(event.target.value)}
                  inputMode="decimal"
                  autoFocus
                  className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              {erro ? (
                <p className="text-sm font-medium text-status-danger-text">{erro}</p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
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
                  className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              {buscandoExibido ? (
                <p className="text-sm text-text-disabled">Buscando...</p>
              ) : semResultados ? (
                <div className="rounded-md border border-border-subtle bg-border-subtle px-3 py-4 text-center">
                  <p className="text-sm text-text-secondary">
                    Nenhum produto encontrado.
                  </p>
                  <button
                    type="button"
                    onClick={irParaCriarProduto}
                    className="mt-2 text-sm font-semibold text-action-primary hover:underline"
                  >
                    Criar novo produto
                  </button>
                </div>
              ) : resultadosExibidos.length > 0 ? (
                <div className="rounded-md border border-border">
                  {resultadosExibidos.map((produto) => (
                    <button
                      key={produto.id}
                      type="button"
                      onClick={() => setProdutoSelecionado(produto)}
                      className="block w-full border-b border-border-subtle px-3 py-2 text-left text-sm text-text-primary transition last:border-b-0 hover:bg-border-subtle"
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

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-4">
          <Button variant="secondary" onClick={limparEFechar}>
            Cancelar
          </Button>
          {produtoSelecionado ? (
            <Button onClick={handleAdicionar} disabled={salvando}>
              {salvando ? "Adicionando..." : "Adicionar"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
