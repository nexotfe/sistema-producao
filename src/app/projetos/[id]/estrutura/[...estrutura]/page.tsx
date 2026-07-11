"use client";

import Link from "next/link";
import { use } from "react";
import {
  ProjectStructureItemsTable,
  type ProjectStructureItem,
} from "@/modules/projetos/components/ProjectStructureItemsTable";

type ProjectStructurePageProps = {
  params: Promise<{
    id: string;
    estrutura: string[];
  }>;
};

const structureNames: Record<string, string> = {
  "conjunto-da-serra": "Conjunto da Serra",
  "eixo-montado": "Eixo montado",
  "base-de-fixacao": "Base de fixação",
};

const structureItems: Record<string, ProjectStructureItem[]> = {
  "conjunto-da-serra": [
    {
      description: "Eixo montado",
      pn: "1243-01-01",
      quantity: 1,
      routeStatus: "Em edição",
      hours: "Depende do roteiro",
      destination: "Após aprovação",
      structureSlug: "eixo-montado",
      componentCount: 5,
      situation: "Estrutura criada",
    },
    {
      description: "Base de fixação",
      pn: "1243-01-02",
      quantity: 1,
      routeStatus: "Pendente",
      hours: "Depende do roteiro",
      destination: "Após aprovação",
      situation: "Produto cadastrado",
    },
    {
      description: "Proteção lateral",
      pn: "1243-01-03",
      quantity: 2,
      routeStatus: "Completo",
      hours: "1,5h",
      destination: "Após aprovação",
      situation: "Roteiro concluído",
    },
  ],
  "eixo-montado": [
    {
      description: "Eixo principal",
      pn: "1243-01-01-01",
      quantity: 1,
      routeStatus: "Completo",
      hours: "2,0h",
      destination: "Após aprovação",
      situation: "Roteiro concluído",
    },
    {
      description: "Bucha espaçadora",
      pn: "1243-01-01-02",
      quantity: 2,
      routeStatus: "Pendente",
      hours: "Depende do roteiro",
      destination: "Após aprovação",
      situation: "Novo",
    },
  ],
};

function getCurrentStructure(path: string[]) {
  return path[path.length - 1] ?? "conjunto-da-serra";
}

function getHierarchyBackHref(projectId: string, path: string[]) {
  if (path.length <= 1) {
    return `/projetos/${projectId}`;
  }

  return `/projetos/${projectId}/estrutura/${path.slice(0, -1).join("/")}`;
}

function formatStructureLabel(slug: string) {
  if (structureNames[slug]) {
    return structureNames[slug];
  }

  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getBreadcrumbItems(projectId: string, path: string[]) {
  return [
    {
      label: `Projeto ${projectId}`,
      href: `/projetos/${projectId}`,
    },
    ...path.map((item, index) => ({
      label: formatStructureLabel(item),
      href: `/projetos/${projectId}/estrutura/${path
        .slice(0, index + 1)
        .join("/")}`,
    })),
  ];
}

export default function ProjectStructurePage({
  params,
}: ProjectStructurePageProps) {
  const { id, estrutura } = use(params);
  const currentStructure = getCurrentStructure(estrutura);
  const currentPath = estrutura;
  const breadcrumb = getBreadcrumbItems(id, currentPath);
  const items = structureItems[currentStructure] ?? [];
  const basePath = `/projetos/${id}/estrutura/${currentPath.join("/")}`;
  const hierarchyBackHref = getHierarchyBackHref(id, currentPath);

  return (
    <main className="min-h-screen bg-app-bg text-slate-950">
      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <nav
          aria-label="Hierarquia do projeto"
          className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500"
        >
          {breadcrumb.map((item, index) => (
            <span key={`${item}-${index}`} className="flex items-center gap-2">
              {index > 0 ? <span>&gt;</span> : null}
              {index === breadcrumb.length - 1 ? (
                <span>{item.label}</span>
              ) : (
                <Link href={item.href} className="transition hover:text-slate-800">
                  {item.label}
                </Link>
              )}
            </span>
          ))}
        </nav>

        <ProjectStructureItemsTable
          title="Itens da Estrutura"
          items={items}
          basePath={basePath}
          hierarchyBackHref={hierarchyBackHref}
        />
      </section>
    </main>
  );
}
