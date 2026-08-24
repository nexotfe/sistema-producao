"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProductForm } from "@/modules/produtos/components/ProductForm";
import { useNovoProduto } from "@/modules/produtos/hooks/useNovoProduto";
import { ModuleBackTrigger } from "@/modules/shared/navigation/ModuleBackTrigger";
import { Button } from "@/modules/shared/ui/Button";

export default function NewProductPage() {
  const router = useRouter();
  const { values, updateValue, adicionarRevisao, salvando, erro, salvarProduto } =
    useNovoProduto();

  async function handleSalvar() {
    const sucesso = await salvarProduto();

    if (sucesso) {
      router.push("/produtos");
    }
  }

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Header
          titulo="Produto"
          subtitulo="Novo produto"
          onSalvar={handleSalvar}
          salvando={salvando}
        />

        {erro ? (
          <p className="text-sm font-medium text-status-danger-text">{erro}</p>
        ) : null}

        <ProductForm
          values={values}
          onChange={updateValue}
          onAdicionarRevisao={adicionarRevisao}
        />
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
    <header className="rounded-t-lg border-x border-t border-border bg-[#0B1B2B] px-5 py-4 -mb-6">
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
            <Button onClick={onSalvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
