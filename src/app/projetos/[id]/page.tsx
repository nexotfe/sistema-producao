import Link from "next/link";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";

type ProjectPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;

  // Dados do projeto (placeholders para MVP)
  const projectType = "Fabricação";
  const projectStatus = "Ativa";
  const projectPriority = "Alta";
  const projectDeliveryDate = "28/06/2026";

  const clientData = {
    nome: "Cliente Exemplo Ltda.",
    numeroPedido: "PED-260123",
    documento: "PO-2026-0001",
    escopo: "OM-MASTER-2026",
  };

  const contactCommercial = {
    nome: "Eng. Comercial Silva",
    telefone: "(11) 98765-4321",
    email: "silva@clienteexemplo.com",
  };

  const contactTechnical = {
    nome: "Eng. Técnico Santos",
    telefone: "(11) 98765-4322",
    email: "santos@clienteexemplo.com",
  };

  const contactTechnical2 = {
    nome: "Engª. Fabricação Costa",
    telefone: "(11) 98765-4323",
    email: "costa@clienteexemplo.com",
  };

  const operationalSummary = {
    totalOFs: 12,
    iniciadas: 5,
    finalizadas: 3,
  };

  const purchasesPending = ["REQ-4287", "REQ-4291", "REQ-4302"];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      {/* HEADER COM PADRÃO VISUAL COMERCIAL */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          {/* Topo: Voltar + Nome Usuário */}
          <div className="mb-4 flex items-center gap-3">
            <ModuleBackLink href="/projetos" label="Projeto" />
            <p className="text-sm font-semibold">Flavio Evangelista</p>
          </div>

          {/* Título Principal */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-950">
                Informações do Projeto Nº{id}
              </h1>
            </div>

            <nav className="flex flex-wrap gap-2">
              <Link
                href="/projetos"
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Comercial
              </Link>
              <Link
                href="/compras"
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Compras
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL */}
      <section className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        {/* BLOCO 1: LINHA SUPERIOR - TIPO, STATUS, PRIORIDADE, DATA */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col">
            <label className="mb-2 text-xs font-semibold text-slate-700">
              Tipo do Projeto
            </label>
            <select
              defaultValue={projectType}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Selecionar tipo</option>
              <option value="Desenvolvimento">Desenvolvimento</option>
              <option value="Fabricação">Fabricação</option>
              <option value="Industrialização">Industrialização</option>
              <option value="Serviços">Serviços</option>
            </select>
          </div>

          <div className="flex flex-col">
            <label className="mb-2 text-xs font-semibold text-slate-700">
              Status
            </label>
            <select
              defaultValue={projectStatus}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            >
              <option value="Ativa">Ativa</option>
              <option value="Suspensa">Suspensa</option>
              <option value="Finalizada">Finalizada</option>
              <option value="Cancelada">Cancelada</option>
            </select>
          </div>

          <div className="flex flex-col">
            <label className="mb-2 text-xs font-semibold text-slate-700">
              Prioridade
            </label>
            <select
              defaultValue={projectPriority}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            >
              <option value="Baixa">Baixa</option>
              <option value="Média">Média</option>
              <option value="Alta">Alta</option>
              <option value="Crítica">Crítica</option>
            </select>
          </div>

          <div className="flex flex-col">
            <label className="mb-2 text-xs font-semibold text-slate-700">
              Data Prevista de Entrega
            </label>
            <input
              type="text"
              defaultValue={projectDeliveryDate}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {/* BLOCO 2: DADOS DO CLIENTE */}
        <div className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">Dados do Cliente</h2>
          </div>

          <div className="space-y-3 p-4">
            {/* Linha 1 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">
                  Nome do Cliente
                </label>
                <input
                  type="text"
                  placeholder="Selecionar cliente"
                  defaultValue={clientData.nome}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">
                  Nº Pedido
                </label>
                <input
                  type="text"
                  placeholder="Informar número do pedido"
                  defaultValue={clientData.numeroPedido}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            {/* Linha 2 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">
                  Documento Cliente
                </label>
                <input
                  type="text"
                  placeholder="Pedido, documento ou referência do cliente"
                  defaultValue={clientData.documento}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">
                  Escopo/Referência Cliente
                </label>
                <input
                  type="text"
                  placeholder="Escopo, contrato ou referência principal"
                  defaultValue={clientData.escopo}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          </div>
        </div>

        {/* BLOCO 3: CONTATO COMERCIAL */}
        <div className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">Contato Comercial</h2>
          </div>

          <div className="p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">
                  Nome
                </label>
                <input
                  type="text"
                  defaultValue={contactCommercial.nome}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">
                  Telefone
                </label>
                <input
                  type="tel"
                  defaultValue={contactCommercial.telefone}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">
                  E-mail
                </label>
                <input
                  type="email"
                  defaultValue={contactCommercial.email}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          </div>
        </div>

        {/* BLOCO 4: CONTATO TÉCNICO */}
        <div className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">Contato Técnico</h2>
          </div>

          <div className="p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">
                  Nome
                </label>
                <input
                  type="text"
                  defaultValue={contactTechnical.nome}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">
                  Telefone
                </label>
                <input
                  type="tel"
                  defaultValue={contactTechnical.telefone}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">
                  E-mail
                </label>
                <input
                  type="email"
                  defaultValue={contactTechnical.email}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          </div>
        </div>

        {/* BLOCO 5: CONTATO TÉCNICO 2 */}
        <div className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">Contato Técnico 2</h2>
          </div>

          <div className="p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">
                  Nome
                </label>
                <input
                  type="text"
                  defaultValue={contactTechnical2.nome}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">
                  Telefone
                </label>
                <input
                  type="tel"
                  defaultValue={contactTechnical2.telefone}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">
                  E-mail
                </label>
                <input
                  type="email"
                  defaultValue={contactTechnical2.email}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          </div>
        </div>

        {/* BLOCO 6: RESUMO OPERACIONAL */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Nº Total de OFs
            </p>
            <p className="mt-3 text-3xl font-bold text-slate-950">
              {operationalSummary.totalOFs}
            </p>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              OFs Iniciadas
            </p>
            <p className="mt-3 text-3xl font-bold text-blue-700">
              {operationalSummary.iniciadas}
            </p>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              OFs Finalizadas
            </p>
            <p className="mt-3 text-3xl font-bold text-emerald-700">
              {operationalSummary.finalizadas}
            </p>
          </div>
        </div>

        {/* BLOCO 7: COMPRAS PENDENTES */}
        <div className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">Compras Pendentes</h2>
          </div>

          <div className="p-4">
            {purchasesPending.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {purchasesPending.map((purchase) => (
                  <Link
                    key={purchase}
                    href={`/compras/requisicoes/${purchase}`}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 hover:border-blue-300"
                  >
                    {purchase}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Nenhuma compra pendente</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
