import type { Area } from "./types";

// Conteúdo da Central — estrutura aprovada no mockup (/design/central-preview).
// Ações "consultar"/"criar" sem `href` são funcionalidade futura
// ("Em desenvolvimento"); toda ação com `href` aponta para uma rota
// real já existente no app, nenhuma inventada.
export const areas: Area[] = [
  {
    id: "comercial",
    titulo: "Comercial",
    descricao: "Clientes e projetos.",
    icon: "briefcase",
    modulos: [
      {
        id: "clientes",
        titulo: "Clientes",
        icon: "user",
        acoes: [
          { label: "Novo cliente", tipo: "criar", href: "/clientes/novo" },
          { label: "Lista de clientes", tipo: "consultar", href: "/clientes" },
        ],
      },
      {
        id: "projetos",
        titulo: "Projetos",
        icon: "folder",
        acoes: [
          { label: "Novo projeto", tipo: "criar", href: "/projetos/novo" },
          { label: "Lista de projetos", tipo: "consultar", href: "/projetos" },
        ],
      },
    ],
  },
  {
    id: "suprimentos",
    titulo: "Suprimentos",
    descricao: "Compras, fornecedores e matérias-primas.",
    icon: "package",
    modulos: [
      {
        id: "compras",
        titulo: "Compras",
        icon: "cart",
        futuro: true,
        acoes: [
          { label: "Requisições", tipo: "consultar", futuro: true },
          { label: "Pedidos de compra", tipo: "consultar", futuro: true },
          { label: "Aprovados", tipo: "consultar", futuro: true },
          { label: "Aguardando recebimento", tipo: "consultar", futuro: true },
          { label: "Recebidos", tipo: "consultar", futuro: true },
        ],
      },
      {
        id: "fornecedores",
        titulo: "Fornecedores",
        icon: "truck",
        acoes: [
          { label: "Novo fornecedor", tipo: "criar", href: "/fornecedores/novo" },
          { label: "Lista de fornecedores", tipo: "consultar", href: "/fornecedores" },
        ],
      },
      {
        id: "materias-primas",
        titulo: "Matérias-primas",
        icon: "layers",
        acoes: [
          {
            label: "Cadastro de matéria-prima",
            tipo: "criar",
            href: "/estoque/materias-primas/novo",
          },
          {
            label: "Estoque de matérias-primas",
            tipo: "consultar",
            href: "/estoque/materias-primas",
          },
        ],
      },
    ],
  },
  {
    id: "pcp",
    titulo: "PCP",
    descricao: "Planejamento e controle da produção — em desenvolvimento.",
    icon: "bar-chart",
    futuro: true,
    modulos: [
      {
        id: "planejamento",
        titulo: "Planejamento",
        icon: "calendar",
        futuro: true,
        acoes: [
          { label: "Lista de prioridades", tipo: "consultar", futuro: true },
          { label: "OFs por projeto", tipo: "consultar", futuro: true },
          { label: "Remanejamentos e retrabalhos", tipo: "consultar", futuro: true },
          { label: "Cenários de produção", tipo: "consultar", futuro: true },
          { label: "Necessidades de orçamentos aprovados", tipo: "consultar", futuro: true },
          { label: "Fabricação interna x compra externa", tipo: "consultar", futuro: true },
          { label: "Análise de risco por projeto", tipo: "consultar", futuro: true },
        ],
      },
      {
        id: "apontamentos",
        titulo: "Apontamentos",
        icon: "clipboard-check",
        futuro: true,
        acoes: [
          { label: "Operação atual por máquina", tipo: "consultar", futuro: true },
          { label: "Operação atual por setor", tipo: "consultar", futuro: true },
        ],
      },
      {
        id: "controle",
        titulo: "Controle",
        icon: "bar-chart",
        futuro: true,
        acoes: [
          { label: "Monitoramento por prioridade", tipo: "consultar", futuro: true },
          { label: "Percentual fabricado", tipo: "consultar", futuro: true },
          { label: "Acompanhamento da produção", tipo: "consultar", futuro: true },
        ],
      },
    ],
  },
  {
    id: "engenharia",
    titulo: "Engenharia",
    descricao: "Produtos, roteiros, colaboradores e capacidade produtiva.",
    icon: "cog",
    modulos: [
      {
        id: "produtos-roteiros",
        titulo: "Produtos e roteiros",
        icon: "box",
        nota: "Roteiros são acessados a partir do produto correspondente.",
        acoes: [
          { label: "Novo produto", tipo: "criar", href: "/produtos/novo" },
          { label: "Lista de produtos", tipo: "consultar", href: "/produtos" },
        ],
      },
      {
        id: "colaboradores",
        titulo: "Colaboradores",
        icon: "users",
        acoes: [
          { label: "Novo colaborador", tipo: "criar", href: "/colaboradores/novo" },
          { label: "Lista de colaboradores", tipo: "consultar", href: "/colaboradores" },
        ],
      },
      {
        id: "capacidade",
        titulo: "Capacidade produtiva",
        icon: "gauge",
        acoes: [
          { label: "Novo grupo de recursos", tipo: "criar", href: "/grupos-recursos/novo" },
          { label: "Lista de grupos de recursos", tipo: "consultar", href: "/grupos-recursos" },
          { label: "Novo recurso produtivo", tipo: "criar", href: "/recursos/novo" },
          { label: "Lista de recursos produtivos", tipo: "consultar", href: "/recursos" },
        ],
      },
    ],
  },
  {
    id: "qualidade",
    titulo: "Qualidade",
    descricao: "Inspeções e conformidade — em desenvolvimento.",
    icon: "shield-check",
    futuro: true,
    modulos: [
      { id: "inspecoes", titulo: "Inspeções", icon: "shield-check", futuro: true, acoes: [] },
      {
        id: "nao-conformidades",
        titulo: "Não conformidades",
        icon: "shield-check",
        futuro: true,
        acoes: [],
      },
      { id: "planos-acao", titulo: "Planos de ação", icon: "shield-check", futuro: true, acoes: [] },
      {
        id: "documentos",
        titulo: "Documentos e certificados",
        icon: "shield-check",
        futuro: true,
        acoes: [],
      },
      {
        id: "qualidade-projeto-of",
        titulo: "Controle por projeto ou OF",
        icon: "shield-check",
        futuro: true,
        acoes: [],
      },
    ],
  },
  {
    id: "configuracoes",
    titulo: "Configurações",
    descricao: "Parâmetros operacionais da empresa.",
    icon: "sliders",
    modulos: [
      {
        id: "identidade-empresa",
        titulo: "Identidade da empresa",
        icon: "building",
        acoes: [
          {
            label: "Acessar dados da empresa",
            tipo: "consultar",
            href: "/configuracoes/empresa",
          },
        ],
      },
      {
        id: "calendario-operacional",
        titulo: "Calendário operacional",
        icon: "calendar",
        acoes: [
          {
            label: "Acessar calendário operacional",
            tipo: "consultar",
            href: "/configuracoes/calendario-operacional",
          },
        ],
      },
      {
        id: "convencao-coletiva",
        titulo: "Convenção coletiva",
        icon: "file-text",
        acoes: [
          {
            label: "Acessar convenção coletiva",
            tipo: "consultar",
            href: "/configuracoes/convencao-coletiva",
          },
        ],
      },
    ],
    notaFinal: "Mais parâmetros globais serão adicionados aqui.",
  },
];
