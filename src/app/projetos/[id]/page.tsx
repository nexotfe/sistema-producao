import Link from "next/link";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

type ProjectPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type ProjectRow = {
  id: string;
  empresa_id: string;
  cliente_id: string | null;
  contato_principal_id: string | null;
  numero_projeto: string;
  nome: string;
  tipo: string | null;
  status: string | null;
  prioridade: string | null;
  data_objetivo: string | null;
  observacoes: string | null;
};

type ClientRow = {
  id: string;
  nome: string;
  nome_fantasia: string | null;
  cpf_cnpj: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
  observacoes: string | null;
};

type ContactRow = {
  id: string;
  nome: string;
  finalidade: string | null;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  principal: boolean | null;
};

type OFRow = {
  id: string;
  status: string | null;
};

type PurchaseRow = {
  id: string;
  numero_requisicao: string;
  status: string | null;
  data_solicitacao: string | null;
  projeto_id: string | null;
};

type ProjectData =
  | {
      project: ProjectRow;
      client: ClientRow | null;
      contacts: ContactRow[];
      ofs: OFRow[];
      purchases: PurchaseRow[];
      error?: never;
    }
  | {
      project?: never;
      client?: never;
      contacts?: never;
      ofs?: never;
      purchases?: never;
      error: string;
    };

const EMPTY_VALUE = "—";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formatLabel(value: string | null | undefined) {
  if (!value) return EMPTY_VALUE;
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return EMPTY_VALUE;
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function present(value: string | null | undefined) {
  return value?.trim() ? value : EMPTY_VALUE;
}

function normalizeContactKey(value: string | null | undefined) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function pickContact(contacts: ContactRow[], keys: string[], fallbackIndex: number) {
  const found = contacts.find((contact) => {
    const key = normalizeContactKey(contact.finalidade);
    return key ? keys.some((candidate) => key.includes(candidate)) : false;
  });

  return found ?? contacts[fallbackIndex] ?? null;
}

function getProjectStatusBadgeClass(status: string | null | undefined) {
  const normalized = status ?? "";

  if (["concluido", "aprovado", "em_producao"].includes(normalized)) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (["cancelado"].includes(normalized)) {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  return "bg-amber-50 text-amber-700 ring-amber-200";
}

function getPurchaseBadgeClass(status: string | null | undefined) {
  const normalized = status ?? "";

  if (["aprovada", "convertida_pedido"].includes(normalized)) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (normalized === "cancelada") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  return "bg-amber-50 text-amber-700 ring-amber-200";
}

async function getProjectData(id: string): Promise<ProjectData> {
  if (!isSupabaseConfigured) {
    return { error: "Supabase não está configurado." };
  }

  const projectQuery = supabase
    .from("projetos")
    .select(
      "id,empresa_id,cliente_id,contato_principal_id,numero_projeto,nome,tipo,status,prioridade,data_objetivo,observacoes"
    )
    .is("deleted_at", null);

  const projectResult = isUuid(id)
    ? await projectQuery.eq("id", id).maybeSingle()
    : await projectQuery.eq("numero_projeto", id).maybeSingle();

  if (projectResult.error) {
    return { error: projectResult.error.message };
  }

  const project = projectResult.data as ProjectRow | null;

  if (!project) {
    return { error: "Projeto não encontrado." };
  }

  const [clientResult, contactsResult, ofsResult, purchasesResult] = await Promise.all([
    project.cliente_id
      ? supabase
          .from("clientes")
          .select("id,nome,nome_fantasia,cpf_cnpj,email,telefone,cidade,estado,observacoes")
          .eq("id", project.cliente_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    project.cliente_id
      ? supabase
          .from("cliente_contatos")
          .select("id,nome,finalidade,cargo,email,telefone,principal")
          .eq("cliente_id", project.cliente_id)
          .eq("ativo", true)
          .is("deleted_at", null)
          .order("principal", { ascending: false })
          .order("nome", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("ordens_fabricacao")
      .select("id,status")
      .eq("projeto_id", project.id)
      .is("deleted_at", null),
    supabase
      .from("requisicoes_compra")
      .select("id,numero_requisicao,status,data_solicitacao,projeto_id")
      .eq("projeto_id", project.id)
      .order("data_solicitacao", { ascending: true }),
  ]);

  const error =
    clientResult.error ?? contactsResult.error ?? ofsResult.error ?? purchasesResult.error;

  if (error) {
    return { error: error.message };
  }

  return {
    project,
    client: (clientResult.data as ClientRow | null) ?? null,
    contacts: (contactsResult.data as ContactRow[] | null) ?? [],
    ofs: (ofsResult.data as OFRow[] | null) ?? [],
    purchases: (purchasesResult.data as PurchaseRow[] | null) ?? [],
  };
}

function ContactCard({
  title,
  contact,
}: {
  title: string;
  contact: ContactRow | null;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      </div>

      <div className="p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col">
            <label className="mb-2 text-xs font-semibold text-slate-700">Nome</label>
            <input
              type="text"
              defaultValue={present(contact?.nome)}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex flex-col">
            <label className="mb-2 text-xs font-semibold text-slate-700">Telefone</label>
            <input
              type="tel"
              defaultValue={present(contact?.telefone)}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex flex-col">
            <label className="mb-2 text-xs font-semibold text-slate-700">E-mail</label>
            <input
              type="email"
              defaultValue={present(contact?.email)}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;
  const data = await getProjectData(id);

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
    { date: "25/06/2026", event: "Material recebido" },
    { date: "27/06/2026", event: "Producao iniciada" },
    { date: "02/07/2026", event: "Projeto finalizado" },
  ];

  if ("error" in data) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-950">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
            <div className="mb-4 flex items-center gap-3">
              <ModuleBackLink href="/projetos" label="Projeto" />
              <p className="text-sm font-semibold">Flavio Evangelista</p>
            </div>
            <h1 className="text-2xl font-bold text-slate-950">
              Informações do Projeto Nº{id}
            </h1>
          </div>
        </header>

        <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
            {data.error}
          </div>
        </section>
      </main>
    );
  }

  const { project, client, contacts, ofs, purchases } = data;
  const projectType = formatLabel(project.tipo);
  const projectStatus = formatLabel(project.status);
  const projectPriority = formatLabel(project.prioridade);
  const projectDeliveryDate = formatDate(project.data_objetivo);
  const contactCommercial = pickContact(contacts, ["comercial"], 0);
  const contactTechnical = pickContact(contacts, ["tecnico", "engenharia"], 1);
  const contactTechnical2 = pickContact(contacts, ["fabricacao", "producao"], 2);
  const projectSituation = {
    status: projectStatus,
    totalOFs: ofs.length,
    liberadas: EMPTY_VALUE,
    emProducao: ofs.filter((of) => of.status === "em_producao").length,
    programacaoCnc: EMPTY_VALUE,
    aguardandoMaterial: ofs.filter((of) => of.status === "aguardando_material").length,
    finalizadas: ofs.filter((of) => of.status === "finalizada").length,
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="mb-4 flex items-center gap-3">
            <ModuleBackLink href="/projetos" label="Projeto" />
            <p className="text-sm font-semibold">Flavio Evangelista</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-950">
                Informações do Projeto Nº{project.numero_projeto}
              </h1>
              <p className="mt-1 text-sm font-medium text-slate-600">{project.nome}</p>
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

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col">
            <label className="mb-2 text-xs font-semibold text-slate-700">
              Tipo do Projeto
            </label>
            <select
              defaultValue={projectType}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            >
              <option value={projectType}>{projectType}</option>
              <option value="Desenvolvimento">Desenvolvimento</option>
              <option value="Fabricação">Fabricação</option>
              <option value="Industrialização">Industrialização</option>
              <option value="Serviços">Serviços</option>
            </select>
          </div>

          <div className="flex flex-col">
            <label className="mb-2 text-xs font-semibold text-slate-700">Status</label>
            <select
              defaultValue={projectStatus}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            >
              <option value={projectStatus}>{projectStatus}</option>
              <option value="Ativa">Ativa</option>
              <option value="Suspensa">Suspensa</option>
              <option value="Finalizada">Finalizada</option>
              <option value="Cancelada">Cancelada</option>
            </select>
          </div>

          <div className="flex flex-col">
            <label className="mb-2 text-xs font-semibold text-slate-700">Prioridade</label>
            <select
              defaultValue={projectPriority}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            >
              <option value={projectPriority}>{projectPriority}</option>
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

        <div className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">Dados do Cliente</h2>
          </div>

          <div className="space-y-3 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">
                  Nome do Cliente
                </label>
                <input
                  type="text"
                  placeholder="Selecionar cliente"
                  defaultValue={present(client?.nome)}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">
                  Nome Fantasia
                </label>
                <input
                  type="text"
                  defaultValue={present(client?.nome_fantasia)}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">
                  Documento Cliente
                </label>
                <input
                  type="text"
                  defaultValue={present(client?.cpf_cnpj)}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">
                  Cidade/UF
                </label>
                <input
                  type="text"
                  defaultValue={
                    client?.cidade || client?.estado
                      ? `${present(client?.cidade)} / ${present(client?.estado)}`
                      : EMPTY_VALUE
                  }
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">E-mail</label>
                <input
                  type="email"
                  defaultValue={present(client?.email)}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="flex flex-col">
                <label className="mb-2 text-xs font-semibold text-slate-700">Telefone</label>
                <input
                  type="tel"
                  defaultValue={present(client?.telefone)}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="flex flex-col">
              <label className="mb-2 text-xs font-semibold text-slate-700">
                Observações
              </label>
              <input
                type="text"
                defaultValue={present(client?.observacoes ?? project.observacoes)}
                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
        </div>

        <ContactCard title="Contato Comercial" contact={contactCommercial} />
        <ContactCard title="Contato Técnico" contact={contactTechnical} />
        <ContactCard title="Contato Técnico 2" contact={contactTechnical2} />

        {contacts.length === 0 ? (
          <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600">
            Sem contatos cadastrados para este cliente.
          </div>
        ) : null}

        <div className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">Situação Operacional</h2>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-[1fr_2fr]">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Status</p>
              <p
                className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getProjectStatusBadgeClass(
                  project.status
                )}`}
              >
                {projectSituation.status}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <Metric label="OFs totais" value={String(projectSituation.totalOFs)} />
              <Metric label="Liberadas" value={String(projectSituation.liberadas)} />
              <Metric label="Em Produção" value={String(projectSituation.emProducao)} />
              <Metric label="Programação CNC" value={String(projectSituation.programacaoCnc)} />
              <Metric
                label="Aguardando Material"
                value={String(projectSituation.aguardandoMaterial)}
              />
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
                <p className="text-sm font-medium text-slate-900">{item.event}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">Compras</h2>
          </div>

          <div className="p-4">
            {purchases.length === 0 ? (
              <p className="text-sm font-medium text-slate-600">
                Sem requisições cadastradas para este projeto.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {purchases.map((purchase) => (
                  <div
                    key={purchase.id}
                    className="rounded-md border border-slate-200 bg-slate-50 p-3"
                  >
                    <EntityLink type="req" id={purchase.id}>
                      {purchase.numero_requisicao}
                    </EntityLink>
                    <p
                      className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getPurchaseBadgeClass(
                        purchase.status
                      )}`}
                    >
                      {formatLabel(purchase.status)}
                    </p>
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      {formatDate(purchase.data_solicitacao)}
                    </p>
                  </div>
                ))}
              </div>
            )}
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
