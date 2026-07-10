"use client";

import Link from "next/link";
import { useState } from "react";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";

export type ProjectStructureItem = {
  description: string;
  pn: string;
  revision?: string;
  quantity: number;
  routeStatus?: string;
  hours?: string;
  destination?: string;
  structureSlug?: string;
  componentCount?: number;
  situation?: string;
  cost?: string;
  taxes?: string;
  profit?: string;
  total?: string;
};

type ProjectStructureItemsTableProps = {
  title: string;
  subtitle?: string;
  breadcrumb?: string[];
  items: ProjectStructureItem[];
  basePath?: string;
  hierarchyBackHref?: string;
  onAdicionarItem?: () => void;
};

export function ProjectStructureItemsTable({
  title,
  subtitle,
  breadcrumb,
  items,
  basePath = "/projetos/260123/estrutura",
  hierarchyBackHref,
  onAdicionarItem,
}: ProjectStructureItemsTableProps) {
  const [createdStructures, setCreatedStructures] = useState<
    Record<string, boolean>
  >({});

  function getStructureSlug(item: ProjectStructureItem) {
    return item.structureSlug ?? `${item.pn.toLowerCase()}-estrutura`;
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          {breadcrumb ? (
            <div className="mb-1 flex flex-wrap items-center gap-1 text-xs font-semibold text-slate-500">
              {breadcrumb.map((item, index) => (
                <span key={`${item}-${index}`} className="flex items-center gap-1">
                  {index > 0 ? <span>&gt;</span> : null}
                  <span>{item}</span>
                </span>
              ))}
            </div>
          ) : null}
          <h2 className="text-sm font-bold">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {hierarchyBackHref ? (
            <Link
              href={hierarchyBackHref}
              className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Voltar
            </Link>
          ) : null}
          {onAdicionarItem ? (
            <button
              type="button"
              onClick={onAdicionarItem}
              className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Adicionar item
            </button>
          ) : (
            <Link
              href="/produtos?origem=orcamento&retorno=/projetos/260123"
              className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Adicionar item
            </Link>
          )}
        </div>
      </div>

      <div>
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[26.5%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[5%]" />
            <col className="w-[10%]" />
            <col className="w-[8.5%]" />
            <col className="w-[8.5%]" />
            <col className="w-[8.5%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600">
            <tr>
              <th className="px-4 py-3 font-bold">Descrição</th>
              <th className="px-4 py-3 text-center font-bold">Código</th>
              <th className="px-4 py-3 text-center font-bold">Revisão</th>
              <th className="px-4 py-3 text-center font-bold">Qtd</th>
              <th className="px-4 py-3 font-bold">Roteiro</th>
              <th className="px-4 py-3 text-center font-bold">Custo</th>
              <th className="px-4 py-3 text-center font-bold">Impostos</th>
              <th className="px-4 py-3 text-center font-bold">Lucro</th>
              <th className="px-4 py-3 text-center font-bold">Total</th>
              <th className="py-3 pl-4 pr-6 text-center font-bold">Estrutura</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item, index) => {
              const hasStructure =
                Boolean(item.structureSlug) || Boolean(createdStructures[item.pn]);
              const structureHref = `${basePath}/${getStructureSlug(item)}`;
              const selected = index === 0;

              return (
                <tr
                  key={item.pn}
                  className={`transition hover:bg-slate-50 ${
                    selected ? "bg-slate-50" : ""
                  }`}
                >
                  <td className="line-clamp-2 px-4 py-4 align-middle text-slate-700">
                    {item.description}
                  </td>
                  <td className="px-4 py-4 text-center align-middle font-semibold text-blue-700">
                    <EntityLink type="item" id={item.pn}>
                      {item.pn}
                    </EntityLink>
                  </td>
                  <td className="px-4 py-4 text-center align-middle text-slate-700">
                    {item.revision ?? "—"}
                  </td>
                  <td className="px-4 py-4 text-center align-middle text-slate-700">{item.quantity}</td>
                  <td className="px-4 py-4 align-middle">
                    <Link
                      href={`/roteiros/${item.pn}`}
                      className="inline-flex h-8 items-center rounded-md border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Abrir roteiro
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-center align-middle text-slate-700">
                    {item.cost ?? "—"}
                  </td>
                  <td className="px-4 py-4 text-center align-middle text-slate-700">
                    {item.taxes ?? "—"}
                  </td>
                  <td className="px-4 py-4 text-center align-middle text-slate-700">
                    {item.profit ?? "—"}
                  </td>
                  <td className="px-4 py-4 text-center align-middle font-semibold text-slate-800">
                    {item.total ?? "—"}
                  </td>
                  <td className="py-4 pl-4 pr-6 text-center align-middle">
                    {hasStructure ? (
                      <Link
                        href={structureHref}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-sm transition hover:bg-slate-50"
                        aria-label="Abrir estrutura"
                      >
                        📂
                      </Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
