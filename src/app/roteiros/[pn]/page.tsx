"use client";

import Link from "next/link";
import { use } from "react";
import { useRouter } from "next/navigation";

const rawMaterials = [
  {
    description: "SAE 1045",
    requiredSize: "200mm x Ø90",
    consumption: "200mm",
    unit: "barra",
    unitCost: "R$ 60,00",
  },
  {
    description: "Chapa aço carbono",
    requiredSize: "12mm x 180 x 240",
    consumption: "1 peça",
    unit: "chapa",
    unitCost: "R$ 85,00",
  },
];

const operations = [
  {
    op: "OP10",
    description: "Preparar material",
    resource: "Almoxarifado",
    time: "0,5h",
    note: "Separar matérias-primas do PN.",
  },
  {
    op: "OP20",
    description: "Cortar conforme desenho",
    resource: "Serra horizontal",
    time: "0,8h",
    note: "Conferir medida antes de liberar.",
  },
  {
    op: "OP30",
    description: "Desbastar conforme desenho",
    resource: "Torno CNC",
    time: "3h",
    note: "Fabricar conforme PDF anexado.",
  },
  {
    op: "OP40",
    description: "Inspecionar conforme desenho",
    resource: "Inspeção",
    time: "0,4h",
    note: "Registrar divergência se houver.",
  },
];

const engineeringOperations = [
  {
    op: "OP10",
    description: "Reunião de abertura",
    resource: "Projeto 01",
    time: "60",
    note: "Alinhamento inicial com o cliente.",
  },
];

const thirdPartyServices = [
  {
    service: "Tratamento térmico",
    supplier: "Fornecedor Exemplo",
    deadline: "5 dias",
    value: "R$ 280,00",
  },
];

const transports = [
  {
    origin: "Empresa",
    destination: "Fornecedor HeatTech",
    carrier: "Transportadora XYZ",
    deadline: "1 dia",
    value: "R$ 120,00",
  },
];

const costRows = [
  { label: "Matéria-prima", value: "R$ 145,00" },
  { label: "Engenharia", value: "R$ 0,00" },
  { label: "Mão de obra", value: "R$ 386,00" },
  { label: "Terceiros", value: "R$ 0,00" },
  { label: "Logística", value: "R$ 0,00" },
];

type RoutePageProps = {
  params: Promise<{
    pn: string;
  }>;
};

export default function ManufacturingRoutePage({ params }: RoutePageProps) {
  const { pn } = use(params);
  const router = useRouter();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="bg-slate-50 px-4 pt-4 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-lg border border-slate-200 bg-white px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                  LOGO
                </div>

                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                    Roteiro de Fabricação
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">PN {pn}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <span className="whitespace-nowrap text-sm font-medium text-slate-500">
                  Nome do usuário
                </span>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Voltar
                  </button>
                  <Link
                    href="/central"
                    className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Início
                  </Link>
                  <button
                    type="button"
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Excluir
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800"
                  >
                    Salvar
                  </button>
                </div>

                <button className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                  Anexar PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <section className="rounded-md border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold">Engenharia</h2>
              </div>

              <button className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                Adicionar OP
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">OP</th>
                    <th className="px-4 py-2 font-semibold">Descrição</th>
                    <th className="px-4 py-2 font-semibold">Recurso</th>
                    <th className="px-4 py-2 font-semibold">Tempo (min)</th>
                    <th className="px-4 py-2 font-semibold">Observações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {engineeringOperations.map((operation) => (
                    <tr key={operation.op} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-bold">{operation.op}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {operation.description}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {operation.resource}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {operation.time}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {operation.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-md border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold">Matérias-primas</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Consumo por peça. A OF multiplica pela quantidade a fabricar.
                </p>
              </div>

              <button className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                Adicionar material
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Material</th>
                    <th className="px-4 py-2 font-semibold">Dimensão</th>
                    <th className="px-4 py-2 font-semibold">Consumo</th>
                    <th className="px-4 py-2 font-semibold">Unidade</th>
                    <th className="px-4 py-2 font-semibold">Valor unit.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rawMaterials.map((material) => (
                    <tr
                      key={`${material.description}-${material.requiredSize}`}
                      className="hover:bg-slate-50"
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {material.description}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {material.requiredSize}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {material.consumption}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {material.unit}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {material.unitCost}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-md border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold">Operações</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Como fabricar a peça, em linguagem de operador.
                </p>
              </div>

              <button className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                Adicionar OP
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">OP</th>
                    <th className="px-4 py-2 font-semibold">Descrição</th>
                    <th className="px-4 py-2 font-semibold">Recurso</th>
                    <th className="px-4 py-2 font-semibold">Tempo</th>
                    <th className="px-4 py-2 font-semibold">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {operations.map((operation) => (
                    <tr key={operation.op} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-bold">{operation.op}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {operation.description}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {operation.resource}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {operation.time}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {operation.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-md border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold">Serviços de Terceiros</h2>
              </div>

              <button className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                Adicionar Serviço
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Serviço</th>
                    <th className="px-4 py-2 font-semibold">Fornecedor</th>
                    <th className="px-4 py-2 font-semibold">Prazo</th>
                    <th className="px-4 py-2 font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {thirdPartyServices.map((service) => (
                    <tr key={service.service} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {service.service}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {service.supplier}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {service.deadline}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {service.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-md border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold">Transportes</h2>
              </div>

              <button className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                Adicionar Transporte
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Origem</th>
                    <th className="px-4 py-2 font-semibold">Destino</th>
                    <th className="px-4 py-2 font-semibold">Transportadora</th>
                    <th className="px-4 py-2 font-semibold">Prazo</th>
                    <th className="px-4 py-2 font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transports.map((transport) => (
                    <tr key={`${transport.origin}-${transport.destination}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {transport.origin}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {transport.destination}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {transport.carrier}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {transport.deadline}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {transport.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold">Resumo de Custos Industriais</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Os valores apresentados serão calculados automaticamente a partir
              das informações do roteiro.
            </p>
            <div className="mt-3 divide-y divide-slate-100 text-sm">
              {/*
                TODO: integrar automaticamente os valores com as seções do roteiro:
                Engenharia <- Engineering Operations
                Matéria-prima <- Raw Materials
                Mão de obra <- Manufacturing Operations
                Terceiros <- Third-party Services
                Logística <- Transport
              */}
              {costRows.map((row) => (
                <div key={row.label} className="flex justify-between gap-4 py-2">
                  <span className="text-slate-500">{row.label}</span>
                  <span className="font-semibold text-slate-800">
                    {row.value}
                  </span>
                </div>
              ))}
              <div className="flex justify-between gap-4 pt-3">
                <span className="font-semibold text-slate-700">
                  Total parcial
                </span>
                <span className="font-bold text-slate-950">R$ 531,00</span>
              </div>
            </div>
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold">PDF técnico</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Fabricar conforme revisão presente no desenho anexado.
            </p>
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold">Regra importante</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Roteiro não possui quantidade de produção. A quantidade pertence à OF.
            </p>
          </section>
        </aside>
      </section>
    </main>
  );
}
