import Link from "next/link";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";

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

  const projectSituation = {
    status: "Em andamento",
    totalOFs: 12,
    liberadas: 5,
    emProducao: 3,
    programacaoCnc: 2,
    aguardandoMaterial: 2,
    finalizadas: 3,
  };

  const projectPurchases = [
    { req: "REQ-4101", status: "Concluida" },
    { req: "REQ-4125", status: "Concluida" },
    { req: "REQ-4287", status: "Pendente" },
    { req: "REQ-4291", status: "Pendente" },
  ];

  const engineeringSummary = [
    { label: "PNs", value: "24" },
    { label: "BOM", value: "Liberada" },
    { label: "Roteiros", value: "100%" },
    { label: "Documentos", value: "8" },
  ];

  const productionSummary = [
    { label: "Horas Planejadas", value: "680" },
    { label: "Horas Apontadas", value: "420" },
    { label: "Avanco", value: "62%" },
  ];

  const qualitySummary = [
    { label: "Inspecoes", value: "12" },
    { label: "RNC abertas", value: "1" },
    { label: "Certificados", value: "8" },
  ];

  const projectTimeline = [
    { date: "22/06/2026", event: "Projeto criado" },
    { date: "23/06/2026", event: "Orcamento aprovado" },
    { date: "24/06/2026", event: "REQ-4287 criada", req: "REQ-4287" },
    { date: "25/06/2026", event: "Material recebido" },
    { date: "27/06/2026", event: "Producao iniciada" },
    { date: "02/07/2026", event: "Projeto finalizado" },
  ];

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

        <div className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">Situação Operacional</h2>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-[1fr_2fr]">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Status</p>
              <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                {projectSituation.status}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <Metric label="OFs totais" value={String(projectSituation.totalOFs)} />
              <Metric label="Liberadas" value={String(projectSituation.liberadas)} />
              <Metric label="Em Produção" value={String(projectSituation.emProducao)} />
              <Metric label="Programação CNC" value={String(projectSituation.programacaoCnc)} />
              <Metric label="Aguardando Material" value={String(projectSituation.aguardandoMaterial)} />
              <Metric label="Finalizadas" value={String(projectSituation.finalizadas)} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <SummaryCard title="Engenharia" items={engineeringSummary} />
          <SummaryCard title="Produção" items={productionSummary} />
          <SummaryCard title="Qualidade" items={qualitySummary} />
        </div>

        <div className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">Histórico do Projeto</h2>
          </div>

          <div className="space-y-4 p-4">
            {projectTimeline.map((item) => (
              <div key={`${item.date}-${item.event}`} className="grid gap-1 border-l border-slate-200 pl-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {item.date}
                </p>
                <p className="text-sm font-medium text-slate-900">
                  {item.req ? (
                    <>
                      <EntityLink type="req" id={item.req}>
                        {item.req}
                      </EntityLink>{" "}
                      criada
                    </>
                  ) : (
                    item.event
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">Compras</h2>
          </div>

          <div className="p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {projectPurchases.map((purchase) => (
                <div
                  key={purchase.req}
                  className="rounded-md border border-slate-200 bg-slate-50 p-3"
                >
                  <EntityLink type="req" id={purchase.req}>
                    {purchase.req}
                  </EntityLink>
                  <p
                    className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                      purchase.status === "Concluida"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-amber-50 text-amber-700 ring-amber-200"
                    }`}
                  >
                    {purchase.status}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function SummaryCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="grid gap-3 p-4">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium text-slate-600">{item.label}</span>
            <span className="font-semibold text-slate-950">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
