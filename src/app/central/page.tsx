import Link from "next/link";

type NavigationLink = {
  label: string;
  href: string;
  note?: string;
};

type NavigationGroup = {
  title: string;
  description: string;
  links: NavigationLink[];
};

const navigationGroups: NavigationGroup[] = [
  {
    title: "Comercial",
    description: "Clientes, projetos e entrada de demandas comerciais.",
    links: [
      { label: "Clientes", href: "/clientes" },
      { label: "Novo cliente", href: "/clientes/novo" },
      { label: "Colaboradores", href: "/colaboradores" },
      { label: "Novo colaborador", href: "/colaboradores/novo" },
      { label: "Projeto", href: "/projeto" },
      { label: "Projetos", href: "/projetos" },
      { label: "Novo projeto", href: "/projetos/novo" },
    ],
  },
  {
    title: "Suprimentos",
    description: "Fornecedores, compras, planejamento e decisao de material.",
    links: [
      { label: "Fornecedores", href: "/fornecedores" },
      { label: "Novo fornecedor", href: "/fornecedores/novo" },
      { label: "Compras", href: "/compras" },
      { label: "Planejamento de compras", href: "/compras/planejamento" },
      { label: "Detalhe do planejamento", href: "/compras/planejamento/PL-001", note: "exemplo" },
      { label: "Decisao de material", href: "/compras/decisao-material" },
      { label: "Pedido de compra", href: "/compras/pedidos/PC-001", note: "exemplo" },
    ],
  },
  {
    title: "Estoque",
    description: "Consulta de materias-primas e saldos operacionais.",
    links: [
      { label: "Grupos de recursos", href: "/grupos-recursos" },
      { label: "Novo grupo de recursos", href: "/grupos-recursos/novo" },
      { label: "Recursos produtivos", href: "/recursos" },
      { label: "Novo recurso", href: "/recursos/novo" },
      { label: "Materias-primas", href: "/estoque/materias-primas" },
    ],
  },
  {
    title: "Producao e Engenharia",
    description: "Produtos, roteiros e ordens de fabricacao.",
    links: [
      { label: "Produtos", href: "/produtos" },
      { label: "Novo produto", href: "/produtos/novo" },
      { label: "Roteiro", href: "/roteiros/1243-01", note: "exemplo" },
      { label: "Ordem de fabricacao", href: "/ordens/OF-001", note: "exemplo" },
    ],
  },
  {
    title: "Sistema",
    description: "Entrada principal e rotas de compatibilidade.",
    links: [
      { label: "Central Nexus", href: "/central" },
      { label: "Dashboard antigo", href: "/dashboard", note: "redireciona para Central" },
    ],
  },
];

const totalLinks = navigationGroups.reduce(
  (total, group) => total + group.links.length,
  0
);

export default function CentralNexusPage() {
  return (
    <main className="min-h-screen bg-app-bg px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Nexus
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                Bem-vindo ao NEXOTFE
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Navegacao simples para acessar todas as paginas atuais e revisar
                cada modulo com seguranca.
              </p>
            </div>

            <span className="text-sm font-semibold text-slate-500">
              {totalLinks} acessos
            </span>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {navigationGroups.map((group) => (
            <section
              key={group.title}
              className="rounded-lg border border-slate-200 bg-app-card"
            >
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-semibold text-slate-900">
                  {group.title}
                </h2>

                <p className="mt-1 text-sm leading-5 text-slate-500">
                  {group.description}
                </p>
              </div>

              <div className="grid gap-1 p-3">
                {group.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex min-h-11 items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition hover:bg-slate-50 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                  >
                    <span>
                      {link.label}
                      {link.note ? (
                        <span className="ml-2 text-xs font-medium text-slate-400">
                          {link.note}
                        </span>
                      ) : null}
                    </span>

                    <span
                      aria-hidden="true"
                      className="ml-3 text-base font-semibold leading-none text-slate-400"
                    >
                      {"\u203A"}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </section>
      </div>
    </main>
  );
}
