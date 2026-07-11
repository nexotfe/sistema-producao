"use client";

import Link from "next/link";
import { use } from "react";
import { useRouter } from "next/navigation";
import { ProductForm } from "@/modules/produtos/components/ProductForm";
import { useEditarProduto } from "@/modules/produtos/hooks/useEditarProduto";
import { ModuleBackTrigger } from "@/modules/shared/navigation/ModuleBackTrigger";

type Props = {
  params: Promise<{
    pn: string;
  }>;
};

export default function EditProductPage({ params }: Props) {
  const { pn } = use(params);
  const router = useRouter();
  const {
    values,
    updateValue,
    adicionarRevisao,
    valorCalculado,
    estoque,
    ajustarEstoque,
    loading,
    salvando,
    erro,
    salvarProduto,
  } = useEditarProduto(decodeURIComponent(pn));

  async function handleSalvar() {
    const sucesso = await salvarProduto();

    if (sucesso) {
      router.push(`/produtos/${encodeURIComponent(values.code)}`);
    }
  }

  return (
    <main className="min-h-screen bg-app-bg px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Header
          titulo="Produto"
          subtitulo="Editar produto"
          onSalvar={handleSalvar}
          salvando={salvando}
        />

        {erro ? (
          <p className="text-sm font-medium text-red-600">{erro}</p>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-500">Carregando produto...</p>
        ) : (
          <ProductForm
            values={values}
            onChange={updateValue}
            onAdicionarRevisao={adicionarRevisao}
            valorFormatado={
              valorCalculado !== null
                ? valorCalculado.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })
                : undefined
            }
            estoque={estoque}
            onAjustarEstoque={ajustarEstoque}
          />
        )}
      </div>
    </main>
  );
}

function Header({
  titulo,
  subtitulo,
  onSalvar,
  salvando,
}: {
  titulo: string;
  subtitulo: string;
  onSalvar: () => void;
  salvando: boolean;
}) {
  return (
    <header className="rounded-t-lg border-x border-t border-slate-200 bg-[#0B1B2B] px-5 py-4 -mb-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/5 text-xs font-bold text-slate-300">
            LOGO
          </div>

          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
              {titulo}
            </h1>
            <p className="mt-1 text-sm text-slate-300">{subtitulo}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <span className="whitespace-nowrap text-sm font-medium text-slate-300">
            Nome do usuário
          </span>

          <div className="flex flex-wrap gap-2">
            <ModuleBackTrigger
              fallbackHref="/produtos"
              className="inline-flex h-10 items-center rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
            >
              Voltar
            </ModuleBackTrigger>
            <Link
              href="/central"
              className="inline-flex h-10 items-center rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
            >
              Início
            </Link>
            <button
              type="button"
              onClick={onSalvar}
              disabled={salvando}
              className="h-10 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
