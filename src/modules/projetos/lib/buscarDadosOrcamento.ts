import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectStatus, ProjectType } from "../types";
import {
  calcularResumoProdutivoProjeto,
  type ResultadoResumoProdutivoProjeto,
} from "./calcularResumoProdutivoProjeto";

// Extraído de useOrcamento.ts (DEC-007 §6.2/Fase 8b) para ser a fonte
// ÚNICA e reutilizável de "dados do orçamento de um projeto" - a tela de
// Orçamento (useOrcamento.ts) e a tela de Cenários (valor atual do
// orçamento, para somar o custo adicional real de hora extra) precisam
// do MESMO dado, nunca de uma segunda consulta/fórmula paralela.
// Corpo movido byte-a-byte (mesmas queries, mesma ordem, mesmo fallback
// de custo/carga tributária) - caracterizado por testes em
// useOrcamento.test.ts ANTES desta extração, para garantir que nada
// mudou.
//
// CORREÇÃO (DEC-007 §6.2/Fase 8b, aprovação do cenário comercial):
// `client` passou a ser parâmetro (antes importava direto o singleton do
// navegador) - a Server Action de aprovação de cenário
// (orquestrarAprovacaoCenarioComercial.ts) precisa chamar esta MESMA
// função com o client de SESSÃO do servidor (createSupabaseServerClient),
// nunca duplicar esta consulta. Mesmo padrão client-first já usado em
// prepararJanelaComercial.ts/carregarBasePrevisaoComercial.ts.

export type ClienteOrcamento = {
  id: string;
  nome: string;
  cnpj: string | null;
  email: string | null;
};

export type ItemOrcamentoBase = {
  id: string;
  produtoId: string;
  pn: string;
  descricao: string;
  revisao: string | null;
  quantidade: number;
  temEstrutura: boolean;
  custo: number;
  custoCongelado: boolean;
};

type BomEscolhaRow = { id: string; status: string; created_at: string };

const RESUMO_PRODUTIVO_VAZIO: ResultadoResumoProdutivoProjeto = {
  estado: "calculado",
  mensagem: null,
  recursos: [],
  itens: [],
};

const CARGA_TRIBUTARIA_CHAVE = "carga_tributaria_por_natureza";

export type DadosOrcamentoProjeto = {
  projeto: {
    id: string;
    numeroProjeto: string;
    nomeProjeto: string;
    tipoProjeto: ProjectType;
    statusProjeto: ProjectStatus;
    dataObjetivo: string | null;
    criadoEm: string;
    margemLucroPercent: number;
    cargaTributariaPercent: number | null;
    descontoPercentual: number | null;
    descontoMotivo: string | null;
  };
  responsavelNome: string | null;
  cargaTributariaSugerida: number;
  cliente: ClienteOrcamento | null;
  itensCalculados: ItemOrcamentoBase[];
  resumoProdutivoResultado: ResultadoResumoProdutivoProjeto;
  erroResumoProdutivo: string | null;
};

// Busca pura (sem setState) de todos os dados do orcamento de um projeto.
// Compartilhada entre a carga inicial (efeito) e as recargas apos
// mutacao (adicionarItem/editarQuantidadeItem/editarCustoItem) - cada
// chamador decide como e quando aplicar o resultado ao estado.
export async function buscarDadosOrcamento(
  client: SupabaseClient,
  idProjeto: string,
): Promise<DadosOrcamentoProjeto | null> {
  const { data: projeto, error } = await client
    .from("projetos")
    .select(
      "id,numero_projeto,nome,tipo_projeto,status,cliente_id,data_objetivo,created_at,margem_lucro_percent,carga_tributaria_percent,desconto_percentual,desconto_motivo",
    )
    .eq("id", idProjeto)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !projeto) {
    return null;
  }

  // Responsavel: nao existe coluna persistida em projetos (mesmo limite
  // de useProjeto) - usa o usuario logado como aproximacao.
  let responsavelNome: string | null = null;
  const { data: userData } = await client.auth.getUser();

  if (userData.user) {
    const { data: usuario } = await client
      .from("usuarios")
      .select("nome")
      .eq("id", userData.user.id)
      .single();

    if (usuario?.nome) {
      responsavelNome = usuario.nome;
    }
  }

  const { data: config } = await client
    .from("configuracoes_empresa")
    .select("valor")
    .eq("chave", CARGA_TRIBUTARIA_CHAVE)
    .maybeSingle();

  const tabela = (config?.valor ?? {}) as Record<string, number>;
  const cargaTributariaSugerida = Number(tabela[projeto.tipo_projeto] ?? 0);

  let cliente: ClienteOrcamento | null = null;

  if (projeto.cliente_id) {
    const { data: clienteData } = await client
      .from("clientes")
      .select("id,nome,cnpj,email")
      .eq("id", projeto.cliente_id)
      .single();

    if (clienteData) {
      cliente = {
        id: clienteData.id,
        nome: clienteData.nome ?? "",
        cnpj: clienteData.cnpj,
        email: clienteData.email,
      };
    }
  }

  const { data: itens } = await client
    .from("projeto_itens")
    .select("id,produto_id,pn,descricao,revisao,quantidade,custo_congelado")
    .eq("projeto_id", projeto.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const linhas = (itens ?? []) as {
    id: string;
    produto_id: string;
    pn: string;
    descricao: string;
    revisao: string | null;
    quantidade: number;
    custo_congelado: number | null;
  }[];

  const excluirMateriaPrima = projeto.tipo_projeto === "industrializacao";
  const itensCalculados: ItemOrcamentoBase[] = [];

  for (const item of linhas) {
    const { data: boms } = await client
      .from("boms")
      .select("id,status,created_at")
      .eq("produto_id", item.produto_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    const bomsLista = (boms ?? []) as BomEscolhaRow[];
    const bomEscolhido =
      bomsLista.find((bom) => bom.status === "ativo") ?? bomsLista[0];

    let custoUnitario =
      item.custo_congelado !== null ? Number(item.custo_congelado) : 0;

    if (bomEscolhido && item.custo_congelado === null) {
      const { data: custo } = await client.rpc("calcular_custo_bom", {
        p_bom_id: bomEscolhido.id,
        p_excluir_materia_prima: excluirMateriaPrima,
      });

      const total = (
        (custo ?? []) as { categoria: string; valor: number }[]
      ).find((linha) => linha.categoria === "total")?.valor;

      custoUnitario = Number(total ?? 0);
    }

    itensCalculados.push({
      id: item.id,
      produtoId: item.produto_id,
      pn: item.pn,
      descricao: item.descricao,
      revisao: item.revisao,
      quantidade: item.quantidade,
      temEstrutura: Boolean(bomEscolhido),
      custo: custoUnitario * item.quantidade,
      custoCongelado: item.custo_congelado !== null,
    });
  }

  // Resumo Produtivo: uma unica chamada para o projeto inteiro
  // (calcular_resumo_produtivo_projeto, migration 202608060001) -
  // substitui a soma manual de bom_operacoes do BOM de topo de cada
  // item, que nunca descia em subconjuntos. A RPC ja percorre a
  // arvore inteira (inclusive subconjuntos), nunca lanca excecao por
  // item sem roteiro/com ciclo/profundidade excedida - devolve esses
  // casos em "itens" e sinaliza estado="incompleto" para a tela nunca
  // apresentar minutos parciais como se fossem o total real.
  let resumoProdutivoResultado: ResultadoResumoProdutivoProjeto;
  let erroResumoProdutivo: string | null;

  try {
    resumoProdutivoResultado = await calcularResumoProdutivoProjeto(
      client,
      projeto.id,
    );
    erroResumoProdutivo = null;
  } catch (erro) {
    resumoProdutivoResultado = RESUMO_PRODUTIVO_VAZIO;
    erroResumoProdutivo =
      erro instanceof Error
        ? erro.message
        : "Não foi possível calcular o resumo produtivo.";
  }

  return {
    projeto: {
      id: projeto.id,
      numeroProjeto: projeto.numero_projeto,
      nomeProjeto: projeto.nome,
      tipoProjeto: projeto.tipo_projeto,
      statusProjeto: projeto.status,
      dataObjetivo: projeto.data_objetivo,
      criadoEm: projeto.created_at,
      margemLucroPercent: Number(projeto.margem_lucro_percent),
      cargaTributariaPercent:
        projeto.carga_tributaria_percent !== null
          ? Number(projeto.carga_tributaria_percent)
          : null,
      descontoPercentual:
        projeto.desconto_percentual !== null
          ? Number(projeto.desconto_percentual)
          : null,
      descontoMotivo: projeto.desconto_motivo ?? null,
    },
    responsavelNome,
    cargaTributariaSugerida,
    cliente,
    itensCalculados,
    resumoProdutivoResultado,
    erroResumoProdutivo,
  };
}
