import Link from "next/link";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";

const quoteItems = [
  {
    description: "Base soldada",
    pn: "1243-01",
    quantity: 1,
    routeStatus: "Em edição",
    hours: "Depende do roteiro",
    destination: "Após aprovação",
  },
  {
    description: "Eixo usinado",
    pn: "1244-01",
    quantity: 2,
    routeStatus: "Completo",
    hours: "5,5h",
    destination: "Após aprovação",
  },
  {
    description: "Suporte",
    pn: "1245-01",
    quantity: 4,
    routeStatus: "Pendente",
    hours: "Depende do roteiro",
    destination: "Após aprovação",
  },
];

const taxes = [
  {
    description: "Imposto venda",
    base: "R$ 10.000,00",
    percentage: "20,13%",
    value: "R$ 2.013,00",
    note: "Conforme condição do cliente",
  },
  {
    description: "Imposto serviço",
    base: "R$ 5.000,00",
    percentage: "14,33%",
    value: "R$ 716,50",
    note: "Serviços aplicados no orçamento",
  },
];

export default function NewProjectPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <ModuleBackLink href="/projetos" label="Projeto" />

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700">
                Novo Projeto
              </p>
              <h1 className="mt-1 text-2xl font-bold">
                Criar orçamento
              </h1>
            </div>

            <button className="h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800">
              Salvar rascunho
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <section className="rounded-md border border-slate-200 bg-white p-4">
          <div className="mb-4">
            <h2 className="text-sm font-bold">Dados do projeto</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Informações principais do orçamento.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Projeto
              </label>
              <input
                value="260125"
                readOnly
                className="h-10 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Cliente
              </label>
              <input
                placeholder="Nome do cliente"
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Tipo
              </label>
              <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100">
                <option>Fabricação</option>
                <option>Desenvolvimento</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Data objetivo
              </label>
              <input
                type="date"
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Prioridade
              </label>
              <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100">
                <option>Normal</option>
                <option>Baixa</option>
                <option>Urgente</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Margem lucro %
              </label>
              <input
                type="number"
                min="0"
                placeholder="Ex: 20"
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold">Itens do projeto</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Abra o roteiro para definir matéria-prima, operações e horas.
              </p>
            </div>

            <button className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
              Adicionar item
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] table-fixed text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="w-[28%] px-4 py-2 font-semibold">Descrição</th>
                  <th className="w-[14%] px-4 py-2 font-semibold">PN</th>
                  <th className="w-[10%] px-4 py-2 font-semibold">Qtd</th>
                  <th className="w-[16%] px-4 py-2 font-semibold">Roteiro</th>
                  <th className="w-[16%] px-4 py-2 font-semibold">Horas roteiro</th>
                  <th className="w-[16%] px-4 py-2 font-semibold">Destino</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quoteItems.map((item) => (
                  <tr key={item.pn} className="hover:bg-slate-50">
                    <td className="truncate px-4 py-3 text-slate-700">
                      {item.description}
                    </td>
                    <td className="px-4 py-3 font-semibold text-blue-700">
                      <Link href={`/roteiros/${item.pn}`}>{item.pn}</Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.quantity}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/roteiros/${item.pn}`}
                        className="inline-flex h-8 items-center rounded-md border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Abrir roteiro
                      </Link>
                      <span className="ml-2 text-xs text-slate-500">
                        {item.routeStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{item.hours}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {item.destination}
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
              <h2 className="text-sm font-bold">Impostos</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Condições fiscais do orçamento. Podem variar por cliente.
              </p>
            </div>

            <button className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
              Adicionar imposto
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Descrição</th>
                  <th className="px-4 py-2 font-semibold">Base</th>
                  <th className="px-4 py-2 font-semibold">%</th>
                  <th className="px-4 py-2 font-semibold">Valor</th>
                  <th className="px-4 py-2 font-semibold">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {taxes.map((tax) => (
                  <tr key={tax.description} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {tax.description}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{tax.base}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {tax.percentage}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{tax.value}</td>
                    <td className="px-4 py-3 text-slate-500">{tax.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
