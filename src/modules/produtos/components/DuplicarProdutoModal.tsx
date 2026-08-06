"use client";
// Modal único de duplicação de produto - reaproveitado tanto pelo
// kebab da lista de produtos (ProductsTable) quanto pelo cabeçalho da
// tela de roteiro (/roteiros/[pn]): mesmo componente, mesma chamada a
// duplicarProdutoComRoteiro, para garantir que as duas entradas da UI
// executem exatamente a mesma operação.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { duplicarProdutoComRoteiro } from "../lib/duplicarProdutoComRoteiro";
import { ControladorChamadaUnica } from "@/modules/shared/lib/controladorChamadaUnica";

type Props = {
  open: boolean;
  onClose: () => void;
  produtoOrigemId: string;
  produtoOrigemCodigo: string;
};

export function DuplicarProdutoModal({ open, ...props }: Props) {
  if (!open) {
    return null;
  }

  return (
    <DuplicarProdutoModalConteudo
      key={`${props.produtoOrigemId}:${props.produtoOrigemCodigo}`}
      {...props}
    />
  );
}

type ConteudoProps = Omit<Props, "open">;

function DuplicarProdutoModalConteudo({
  onClose,
  produtoOrigemId,
  produtoOrigemCodigo,
}: ConteudoProps) {
  const router = useRouter();
  // Sugestão "CODIGO-ORIGINAL-COPIA" - editável antes de confirmar.
  const [codigo, setCodigo] = useState(`${produtoOrigemCodigo}-COPIA`);
  const [duplicando, setDuplicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [controlador] = useState(() => new ControladorChamadaUnica());

  function fechar() {
    if (duplicando) return; // não fecha no meio da chamada
    onClose();
  }

  async function handleDuplicar() {
    const codigoNormalizado = codigo.trim();

    if (!codigoNormalizado) {
      setErro("Informe o código do novo produto.");
      return;
    }

    if (!controlador.iniciar()) return; // clique duplo - ignorado

    setDuplicando(true);
    setErro(null);

    try {
      // A RPC grava exatamente btrim(p_novo_codigo) - o código
      // persistido é comprovadamente igual a codigoNormalizado, então
      // redireciona direto por ele. Uma segunda consulta para
      // "confirmar" criaria um risco pior: RPC com sucesso real +
      // consulta falhando por rede = tela de erro para um produto que
      // já foi criado de verdade.
      await duplicarProdutoComRoteiro(supabase, produtoOrigemId, codigoNormalizado);
      onClose();
      router.push(`/roteiros/${encodeURIComponent(codigoNormalizado)}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível duplicar o produto.");
    } finally {
      setDuplicando(false);
      controlador.finalizar();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="w-full max-w-md rounded-md border border-slate-200 bg-app-card shadow-xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Duplicar produto</h2>
          <p className="mt-1 text-sm text-slate-500">
            Cria um produto novo com uma cópia independente do roteiro de {produtoOrigemCodigo}{" "}
            (materiais, operações, vínculos com subconjuntos e serviços de terceiros). Produtos
            usados como subconjunto não são duplicados, apenas referenciados.
          </p>
        </div>

        <div className="px-5 py-4">
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
            Código do novo produto
          </label>
          <input
            value={codigo}
            onChange={(event) => setCodigo(event.target.value)}
            disabled={duplicando}
            autoFocus
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
          />

          {erro ? <p className="mt-3 text-sm font-medium text-red-600">{erro}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={fechar}
            disabled={duplicando}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDuplicar}
            disabled={duplicando}
            className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {duplicando ? "Duplicando..." : "Duplicar"}
          </button>
        </div>
      </div>
    </div>
  );
}
