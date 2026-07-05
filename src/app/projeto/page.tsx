"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const cards = [
  "Identificação do Projeto",
  "Dados do Cliente",
  "Observações",
  "Resumo Operacional",
];

export default function ProjetoPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-lg border border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                LOGO
              </div>

              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                Projeto
              </h1>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label htmlFor="busca-projeto-global" className="sr-only">
                Buscar projeto
              </label>
              <input
                id="busca-projeto-global"
                type="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Buscar projeto, cliente, código, item, OF, NF ou documento..."
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 lg:w-[min(42vw,520px)]"
              />

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
              </div>
            </div>
          </div>
        </header>

        <div className="flex justify-start gap-2">
          <span
            aria-current="page"
            className="inline-flex h-10 items-center rounded-md bg-blue-700 px-3 text-sm font-semibold text-white"
          >
            Projeto
          </span>
          <Link
            href="/projetos/novo"
            className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Orçamento
          </Link>
          <Link
            href="/roteiros/1243-01"
            className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Roteiro
          </Link>
        </div>

        <section className="grid gap-6 lg:grid-cols-2">
          {cards.map((card, index) => (
            <article
              key={card}
              className={`min-h-40 rounded-lg border border-slate-200 bg-white px-5 py-5 ${
                index < 2 ? "lg:col-span-2" : ""
              }`}
            >
              <h2 className="text-sm font-bold text-slate-950">{card}</h2>
              {index === 0 ? (
                <div className="mt-5 space-y-5">
                  <div className="grid gap-x-4 gap-y-5 lg:grid-cols-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Projeto
                      </label>
                      <input
                        value="260123"
                        readOnly
                        className="h-10 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Descrição do Projeto
                      </label>
                      <input
                        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Natureza
                      </label>
                      <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100">
                        <option>Fabricação</option>
                        <option>Desenvolvimento</option>
                        <option>Industrialização</option>
                        <option>Serviço</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Responsável
                      </label>
                      <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100">
                        <option>Nome do usuário</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-x-4 gap-y-5 lg:grid-cols-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Cliente
                      </label>
                      <input
                        type="search"
                        placeholder="Buscar cliente"
                        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Status
                      </label>
                      <div className="flex h-10 items-center">
                        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                          Em elaboração
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Data de Inclusão
                      </label>
                      <input
                        value="02/07/2026"
                        readOnly
                        className="h-10 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Data Necessidade
                      </label>
                      <input
                        type="date"
                        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
              {index === 1 ? (
                <div className="mt-5 space-y-5">
                  <div className="grid gap-x-4 gap-y-5 lg:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Cliente
                      </label>
                      <input
                        type="search"
                        placeholder="Buscar cliente"
                        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Pedido de Compra do Cliente
                      </label>
                      <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Documento do Cliente
                      </label>
                      <input
                        placeholder="OM, Escopo, Contrato, RFQ"
                        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  {["Contato Comercial", "Contato Técnico", "Contato Técnico 2"].map(
                    (contato) => (
                      <div key={contato} className="grid gap-x-4 gap-y-5 lg:grid-cols-4">
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                            {contato}
                          </label>
                          <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100">
                            <option>Selecionar contato</option>
                          </select>
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                            E-mail
                          </label>
                          <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                            Telefone
                          </label>
                          <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                            Setor
                          </label>
                          <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
                        </div>
                      </div>
                    ),
                  )}
                </div>
              ) : null}
              {index === 2 ? (
                <textarea
                  placeholder="Informações importantes sobre este projeto..."
                  className="mt-5 h-64 w-full resize-none rounded-md border border-slate-300 px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              ) : null}
              {index === 3 ? (
                <div className="mt-5 divide-y divide-slate-200 rounded-md border border-slate-200">
                  {[
                    ["Pedido de Compra", "PC-000000"],
                    ["OFs Abertas", "0"],
                    ["Última Revisão", "Rev.00"],
                    ["Data do Pedido", "--"],
                    ["Responsável Atual", "Comercial"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-slate-600">{label}</span>
                      <span className="font-semibold text-slate-800">{value}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
