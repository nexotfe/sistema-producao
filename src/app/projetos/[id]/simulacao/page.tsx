"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { SimulacaoCapacidade } from "@/modules/simulacao-comercial/components/SimulacaoCapacidade";

type ProjectSimulacaoPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default function ProjectSimulacaoPage({ params }: ProjectSimulacaoPageProps) {
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
    <main className="min-h-screen bg-app-bg text-slate-950">
      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <nav
          aria-label="Hierarquia do projeto"
          className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500"
        >
          <Link href={`/projetos/${id}`} className="transition hover:text-slate-800">
            {numeroProjeto ? `Projeto ${numeroProjeto}` : "Orçamento"}
          </Link>
          <span>&gt;</span>
          <span>Simulação de Capacidade</span>
        </nav>

        <SimulacaoCapacidade projetoId={id} />
      </section>
    </main>
  );
}
