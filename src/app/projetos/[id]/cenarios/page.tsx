"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { GeradorComparadorCenarios } from "@/modules/simulacao-comercial/components/cenarios/GeradorComparadorCenarios";

type ProjectCenariosPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default function ProjectCenariosPage({ params }: ProjectCenariosPageProps) {
  const { id } = use(params);
  const [numeroProjeto, setNumeroProjeto] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function carregarNumeroProjeto() {
      const { data } = await supabase
        .from("projetos")
        .select("numero_projeto")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();

      if (!cancelado) {
        setNumeroProjeto(data?.numero_projeto ?? null);
      }
    }

    carregarNumeroProjeto();

    return () => {
      cancelado = true;
    };
  }, [id]);

  return (
    // bg-background/text-text-primary (nunca bg-background/text-slate-*, os
    // tokens LEGADOS estáticos que /simulacao/page.tsx usa) - esta tela
    // usa o Design System novo (Card/Field) por dentro, que É reativo a
    // tema (prefers-color-scheme/data-theme). Misturar um shell estático
    // com conteúdo reativo foi o bug real encontrado no teste manual:
    // com o navegador em modo escuro, o conteúdo virava escuro sobre um
    // fundo que nunca mudava, arruinando o contraste. Mesmo padrão já
    // usado em /recursos/page.tsx, a tela mais próxima que já adota o
    // Design System novo de ponta a ponta.
    <main className="min-h-screen bg-background text-text-primary">
      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <nav
          aria-label="Hierarquia do projeto"
          className="flex flex-wrap items-center gap-2 text-xs font-semibold text-text-secondary"
        >
          <Link href={`/projetos/${id}`} className="transition hover:text-text-primary">
            {numeroProjeto ? `← Projeto ${numeroProjeto}` : "← Orçamento"}
          </Link>
          <span>&gt;</span>
          <span>Cenários</span>
        </nav>

        <GeradorComparadorCenarios projetoId={id} />
      </section>
    </main>
  );
}
