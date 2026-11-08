"use client";
// NEXOTFE — Etapa 58: substitui por completo a implementação anterior
// desta rota (usava o client de NAVEGADOR dentro de um Server Component
// e 2 views pré-Momento Y, vw_of_fluxo_operacional/vw_of_consumo_detalhado
// - nunca retornava dado real sob RLS, investigação da Etapa 57). Mesmo
// padrão já em produção em /projetos/[id]: "use client" + use(params),
// delega todo o conteúdo para um componente do módulo.
import { use } from "react";
import { OrdemFabricacaoDetalhePageContent } from "@/modules/pcp/components/OrdemFabricacaoDetalhePageContent";

export default function OrdemFabricacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <OrdemFabricacaoDetalhePageContent ofId={id} />;
}
