"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ProjectStatus, ProjectType } from "../types";
import { calcularResumoOrcamento } from "../lib/calcularResumoOrcamento";
import {
  calcularResumoProdutivoProjeto,
  type ResultadoResumoProdutivoProjeto,
} from "../lib/calcularResumoProdutivoProjeto";

export type ClienteOrcamento = {
  id: string;
  nome: string;
  cnpj: string | null;
  email: string | null;
};

export type ItemOrcamento = {
  id: string;
  produtoId: string;
  pn: string;
  descricao: string;
  revisao: string | null;
  quantidade: number;
  temEstrutura: boolean;
  custo: number;
  custoCongelado: boolean;
  impostos: number;
  lucro: number;
  total: number;
};

type ItemBase = Omit<ItemOrcamento, "impostos" | "lucro" | "total">;

export type { LinhaResumoProdutivoRecurso as LinhaResumoProdutivo } from "../lib/calcularResumoProdutivoProjeto";

type BomEscolhaRow = { id: string; status: string; created_at: string };

const RESUMO_PRODUTIVO_VAZIO: ResultadoResumoProdutivoProjeto = {
  estado: "calculado",
  mensagem: null,
  recursos: [],
  itens: [],
};

// Referencia estavel (nao um "[]" novo a cada render) para nao
// invalidar as dependencias dos useMemo abaixo sempre que
// dadosValidos for false.
const ITENS_BASE_VAZIO: ItemBase[] = [];

const CARGA_TRIBUTARIA_CHAVE = "carga_tributaria_por_natureza";

type ResultadoAdicionarItem =
  | { status: "ok" }
  | { status: "erro"; mensagem: string };

const MENSAGEM_CARGA_INVALIDA =
  "Carga Tributária não pode ser 100% ou mais.";

type DadosOrcamentoProjeto = {
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
  itensCalculados: ItemBase[];
  resumoProdutivoResultado: ResultadoResumoProdutivoProjeto;
  erroResumoProdutivo: string | null;
};

// Busca pura (sem setState) de todos os dados do orcamento de um projeto.
// Compartilhada entre a carga inicial (efeito) e as recargas apos
// mutacao (adicionarItem/editarQuantidadeItem/editarCustoItem) - cada
// chamador decide como e quando aplicar o resultado ao estado.
async function buscarDadosOrcamento(
  idProjeto: string,
): Promise<DadosOrcamentoProjeto | null> {
  const { data: projeto, error } = await supabase
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
  const { data: userData } = await supabase.auth.getUser();

  if (userData.user) {
    const { data: usuario } = await supabase
      .from("usuarios")
      .select("nome")
      .eq("id", userData.user.id)
      .single();

    if (usuario?.nome) {
      responsavelNome = usuario.nome;
    }
  }

  const { data: config } = await supabase
    .from("configuracoes_empresa")
    .select("valor")
    .eq("chave", CARGA_TRIBUTARIA_CHAVE)
    .maybeSingle();

  const tabela = (config?.valor ?? {}) as Record<string, number>;
  const cargaTributariaSugerida = Number(tabela[projeto.tipo_projeto] ?? 0);

  let cliente: ClienteOrcamento | null = null;

  if (projeto.cliente_id) {
    const { data: clienteData } = await supabase
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

  const { data: itens } = await supabase
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
  const itensCalculados: ItemBase[] = [];

  for (const item of linhas) {
    const { data: boms } = await supabase
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
      const { data: custo } = await supabase.rpc("calcular_custo_bom", {
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
      supabase,
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

export function useOrcamento(idProjeto: string | null) {
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [numero, setNumero] = useState<string | null>(null);
  const [nomeProjeto, setNomeProjeto] = useState("");
  const [tipoProjeto, setTipoProjeto] = useState<ProjectType>("fabricacao");
  const [statusProjeto, setStatusProjeto] = useState<ProjectStatus>("rascunho");
  const [dataObjetivo, setDataObjetivo] = useState<string | null>(null);
  const [criadoEm, setCriadoEm] = useState<string | null>(null);
  const [responsavelNome, setResponsavelNome] = useState("");
  const [cliente, setCliente] = useState<ClienteOrcamento | null>(null);

  const [margemLucroPercent, setMargemLucroPercentState] = useState(20);
  const [cargaTributariaPercent, setCargaTributariaPercentState] = useState<
    number | null
  >(null);
  const [cargaTributariaSugerida, setCargaTributariaSugerida] = useState(0);
  const [formulaErro, setFormulaErro] = useState<string | null>(null);
  const [descontoPercentual, setDescontoPercentual] = useState<number | null>(
    null,
  );
  const [descontoMotivo, setDescontoMotivo] = useState<string | null>(null);

  const [itensBase, setItensBase] = useState<ItemBase[]>([]);
  const [resumoProdutivoResultado, setResumoProdutivoResultado] =
    useState<ResultadoResumoProdutivoProjeto>(RESUMO_PRODUTIVO_VAZIO);
  const [erroResumoProdutivo, setErroResumoProdutivo] = useState<string | null>(
    null,
  );

  // idProjetoCarregado rastreia para qual projeto os dados acima
  // realmente correspondem. Enquanto for diferente de idProjeto,
  // a tela esta carregando (ou trocando de projeto) e os dados
  // acima podem ainda ser de um projeto anterior - nunca exibi-los
  // como se fossem do projeto atual nesse intervalo.
  const [idProjetoCarregado, setIdProjetoCarregado] = useState<
    string | null
  >(null);
  const loading = idProjeto !== null && idProjeto !== idProjetoCarregado;

  // dadosValidos: so' true quando os campos brutos abaixo realmente
  // correspondem ao idProjeto atual. projetoId so' e' atualizado por
  // aplicarDadosOrcamento (ou seja, em sucesso) - continua com o valor
  // antigo tanto durante um carregamento quanto apos uma falha, o que
  // faz dadosValidos virar false automaticamente nesses dois casos,
  // sem precisar de nenhum setState para "limpar" nada. Usado tanto
  // para nunca EXIBIR dado de outro projeto quanto para nunca permitir
  // MUTACAO (salvar/adicionarItem/editar...) usando dado de outro
  // projeto - erro (visual) nao e' protecao suficiente por si so'.
  const dadosValidos = idProjeto !== null && projetoId === idProjeto;

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const erroExibido = idProjeto !== null ? erro : null;

  // Token de geracao: compartilhado entre a carga do efeito e as
  // recargas manuais apos mutacao. Cada carga/recarga incrementa e
  // guarda seu proprio numero; se ao terminar o numero atual nao bater
  // mais com o guardado, uma carga mais nova ja assumiu - descarta o
  // resultado obsoleto em vez de aplica-lo.
  const geracaoCargaRef = useRef(0);

  function aplicarDadosOrcamento(dados: DadosOrcamentoProjeto) {
    setProjetoId(dados.projeto.id);
    setNumero(dados.projeto.numeroProjeto);
    setNomeProjeto(dados.projeto.nomeProjeto);
    setTipoProjeto(dados.projeto.tipoProjeto);
    setStatusProjeto(dados.projeto.statusProjeto);
    setDataObjetivo(dados.projeto.dataObjetivo);
    setCriadoEm(dados.projeto.criadoEm);
    setMargemLucroPercentState(dados.projeto.margemLucroPercent);
    setCargaTributariaPercentState(dados.projeto.cargaTributariaPercent);
    setDescontoPercentual(dados.projeto.descontoPercentual);
    setDescontoMotivo(dados.projeto.descontoMotivo);

    if (dados.responsavelNome) {
      setResponsavelNome(dados.responsavelNome);
    }

    setCargaTributariaSugerida(dados.cargaTributariaSugerida);
    setCliente(dados.cliente);
    setItensBase(dados.itensCalculados);
    setResumoProdutivoResultado(dados.resumoProdutivoResultado);
    setErroResumoProdutivo(dados.erroResumoProdutivo);
    setErro(null);
  }

  // Recarga apos mutacao (adicionarItem/editarQuantidadeItem/
  // editarCustoItem): chamada direta de um handler de evento, nunca de
  // um efeito - nao tem restricao de setState sincrono. Invalida
  // idProjetoCarregado antes de buscar para que "loading" reflita a
  // recarga tambem (mesmo criterio usado na troca de projeto), e usa o
  // mesmo token de geracao do efeito para nunca aplicar um resultado
  // mais antigo por cima de um mais novo.
  async function recarregarAposMutacao() {
    if (!idProjeto) {
      return;
    }

    const idProjetoAlvo = idProjeto;
    const minhaGeracao = ++geracaoCargaRef.current;

    setIdProjetoCarregado(null);

    const dados = await buscarDadosOrcamento(idProjetoAlvo);

    if (geracaoCargaRef.current !== minhaGeracao) {
      return;
    }

    if (dados) {
      aplicarDadosOrcamento(dados);
    } else {
      setErro("Projeto não encontrado.");
    }

    setIdProjetoCarregado(idProjetoAlvo);
  }

  useEffect(() => {
    const minhaGeracao = ++geracaoCargaRef.current;

    if (!idProjeto) {
      // "Sem projeto": nada para buscar. loading e dadosValidos ja
      // derivam corretamente de idProjeto===null (acima) - nenhum
      // setState precisa rodar aqui.
      return;
    }

    const idProjetoAtual = idProjeto;

    async function rodar() {
      const dados = await buscarDadosOrcamento(idProjetoAtual);
      if (geracaoCargaRef.current !== minhaGeracao) return;

      if (!dados) {
        setErro("Projeto não encontrado.");
        setIdProjetoCarregado(idProjetoAtual);
        return;
      }

      aplicarDadosOrcamento(dados);
      setIdProjetoCarregado(idProjetoAtual);
    }

    rodar();
  }, [idProjeto]);

  const cargaTributariaEfetiva = cargaTributariaPercent ?? cargaTributariaSugerida;

  function setMargemLucroPercent(valor: number) {
    setMargemLucroPercentState(valor);
  }

  function setCargaTributariaPercent(valor: number | null) {
    const cargaParaValidar = valor ?? cargaTributariaSugerida;

    if (cargaParaValidar >= 100) {
      setFormulaErro(MENSAGEM_CARGA_INVALIDA);
      return;
    }

    setFormulaErro(null);
    setCargaTributariaPercentState(valor);
  }

  // Versoes expostas dos campos brutos abaixo: nunca refletem dado de
  // outro projeto (loading, falha, ou "sem projeto") - dadosValidos
  // controla tudo em um so' lugar, sem duplicar a checagem em cada
  // campo do retorno do hook.
  const itensBaseExibidos = dadosValidos ? itensBase : ITENS_BASE_VAZIO;
  const margemLucroPercentExibido = dadosValidos ? margemLucroPercent : 20;
  const cargaTributariaPercentExibido = dadosValidos
    ? cargaTributariaPercent
    : null;
  const cargaTributariaSugeridaExibida = dadosValidos
    ? cargaTributariaSugerida
    : 0;
  const cargaTributariaEfetivaExibida =
    cargaTributariaPercentExibido ?? cargaTributariaSugeridaExibida;
  const descontoPercentualExibido = dadosValidos ? descontoPercentual : null;
  const resumoProdutivoResultadoExibido = dadosValidos
    ? resumoProdutivoResultado
    : RESUMO_PRODUTIVO_VAZIO;
  const erroResumoProdutivoExibido = dadosValidos ? erroResumoProdutivo : null;

  // Breakdown por item: cada linha aplica a formula individualmente
  // sobre o proprio custo (exibicao da tabela de itens).
  const itens: ItemOrcamento[] = useMemo(
    () =>
      itensBaseExibidos.map((item) => {
        const { impostos, lucro, valorComercial } = calcularResumoOrcamento({
          custoTotal: item.custo,
          margemLucroPercent: margemLucroPercentExibido,
          cargaTributariaPercent: cargaTributariaEfetivaExibida,
        });

        return { ...item, impostos, lucro, total: valorComercial };
      }),
    [itensBaseExibidos, cargaTributariaEfetivaExibida, margemLucroPercentExibido],
  );

  // Resumo/Total: regra oficial do DEC-001 - a formacao de preco e
  // aplicada uma UNICA VEZ sobre o custo total do orcamento, nao item a
  // item. useProposta.ts segue exatamente o mesmo padrao via
  // calcularResumoOrcamento, para os dois "Valor Total" baterem sempre.
  // O desconto comercial (DEC-001) tambem e aplicado so aqui, sobre o
  // Valor Tecnico agregado - nunca no breakdown por item acima.
  const resumoOrcamento = useMemo(() => {
    const custoTotal = itensBaseExibidos.reduce(
      (acc, item) => acc + item.custo,
      0,
    );
    const {
      valorTecnico,
      valorDesconto,
      valorComercial,
      impostos,
      lucro,
      margemTecnica,
      margemEfetiva,
    } = calcularResumoOrcamento({
      custoTotal,
      margemLucroPercent: margemLucroPercentExibido,
      cargaTributariaPercent: cargaTributariaEfetivaExibida,
      descontoPercent: descontoPercentualExibido,
    });

    return {
      custoTotal,
      impostosTotal: impostos,
      lucroTotal: lucro,
      valorTecnico,
      valorDesconto,
      valorComercial,
      margemTecnica,
      margemEfetiva,
    };
  }, [
    itensBaseExibidos,
    margemLucroPercentExibido,
    cargaTributariaEfetivaExibida,
    descontoPercentualExibido,
  ]);

  const resumoProdutivo = useMemo(() => {
    const totalMinutos = resumoProdutivoResultadoExibido.recursos.reduce(
      (acc, linha) => acc + linha.minutos,
      0,
    );

    return {
      estado: resumoProdutivoResultadoExibido.estado,
      mensagem: resumoProdutivoResultadoExibido.mensagem,
      linhas: resumoProdutivoResultadoExibido.recursos,
      totalMinutos,
      itensIncompletos: resumoProdutivoResultadoExibido.itens.filter(
        (item) => !item.estruturaOk,
      ),
      erro: erroResumoProdutivoExibido,
    };
  }, [resumoProdutivoResultadoExibido, erroResumoProdutivoExibido]);

  async function salvar() {
    if (!dadosValidos || !projetoId) {
      return { status: "erro" as const, mensagem: "Projeto não encontrado." };
    }

    if (cargaTributariaEfetiva >= 100) {
      setFormulaErro(MENSAGEM_CARGA_INVALIDA);
      return { status: "erro" as const, mensagem: MENSAGEM_CARGA_INVALIDA };
    }

    setSalvando(true);
    setMensagem(null);

    const { error } = await supabase
      .from("projetos")
      .update({
        margem_lucro_percent: margemLucroPercent,
        carga_tributaria_percent: cargaTributariaPercent,
        desconto_percentual: descontoPercentual,
        desconto_motivo:
          descontoMotivo && descontoMotivo.trim() !== ""
            ? descontoMotivo
            : null,
      })
      .eq("id", projetoId);

    setSalvando(false);

    if (error) {
      setErro("Não foi possível salvar o orçamento.");
      return { status: "erro" as const, mensagem: error.message };
    }

    setMensagem("Orçamento salvo com sucesso.");
    return { status: "ok" as const };
  }

  async function adicionarItem(
    produtoId: string,
    quantidade: number,
  ): Promise<ResultadoAdicionarItem> {
    if (!dadosValidos || !projetoId) {
      return { status: "erro", mensagem: "Projeto não encontrado." };
    }

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      return { status: "erro", mensagem: "Usuário não autenticado." };
    }

    const { data: usuario, error: usuarioError } = await supabase
      .from("usuarios")
      .select("empresa_id")
      .eq("id", userData.user.id)
      .single();

    if (usuarioError || !usuario?.empresa_id) {
      return { status: "erro", mensagem: "Empresa do usuário não encontrada." };
    }

    const { data: produto, error: produtoError } = await supabase
      .from("itens_industriais")
      .select("codigo,descricao")
      .eq("id", produtoId)
      .single();

    if (produtoError || !produto) {
      return { status: "erro", mensagem: "Produto não encontrado." };
    }

    const { error } = await supabase.from("projeto_itens").insert({
      empresa_id: usuario.empresa_id,
      projeto_id: projetoId,
      produto_id: produtoId,
      pn: produto.codigo,
      descricao: produto.descricao,
      quantidade,
      created_by: userData.user.id,
    });

    if (error) {
      return { status: "erro", mensagem: error.message };
    }

    await recarregarAposMutacao();

    return { status: "ok" };
  }

  async function editarQuantidadeItem(
    id: string,
    quantidade: number,
  ): Promise<ResultadoAdicionarItem> {
    if (!dadosValidos) {
      return { status: "erro", mensagem: "Projeto não encontrado." };
    }

    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return {
        status: "erro",
        mensagem: "Informe uma quantidade numérica maior que zero.",
      };
    }

    const { error } = await supabase
      .from("projeto_itens")
      .update({ quantidade })
      .eq("id", id);

    if (error) {
      return { status: "erro", mensagem: error.message };
    }

    await recarregarAposMutacao();

    return { status: "ok" };
  }

  async function editarCustoItem(
    id: string,
    custo: number,
  ): Promise<ResultadoAdicionarItem> {
    if (!dadosValidos) {
      return { status: "erro", mensagem: "Projeto não encontrado." };
    }

    if (!Number.isFinite(custo) || custo < 0) {
      return {
        status: "erro",
        mensagem: "Informe um custo numérico maior ou igual a zero.",
      };
    }

    const { error } = await supabase
      .from("projeto_itens")
      .update({
        custo_congelado: custo,
        custo_congelado_em: new Date().toISOString(),
        custo_editado_manualmente: true,
      })
      .eq("id", id)
      .not("custo_congelado", "is", null);

    if (error) {
      return { status: "erro", mensagem: error.message };
    }

    await recarregarAposMutacao();

    return { status: "ok" };
  }

  return {
    loading,
    erro: erroExibido,
    mensagem,

    projetoId: dadosValidos ? projetoId : null,
    numeroProjeto: dadosValidos ? numero : null,
    nomeProjeto: dadosValidos ? nomeProjeto : "",
    tipoProjeto: dadosValidos ? tipoProjeto : "fabricacao",
    statusProjeto: dadosValidos ? statusProjeto : "rascunho",
    dataObjetivo: dadosValidos ? dataObjetivo : null,
    criadoEm: dadosValidos ? criadoEm : null,
    responsavelNome: dadosValidos ? responsavelNome : "",
    cliente: dadosValidos ? cliente : null,

    margemLucroPercent: margemLucroPercentExibido,
    setMargemLucroPercent,
    cargaTributariaPercent: cargaTributariaPercentExibido,
    setCargaTributariaPercent,
    cargaTributariaSugerida: cargaTributariaSugeridaExibida,
    cargaTributariaEfetiva: cargaTributariaEfetivaExibida,
    formulaErro,
    descontoPercentual: descontoPercentualExibido,
    setDescontoPercentual,
    descontoMotivo: dadosValidos ? descontoMotivo : null,
    setDescontoMotivo,

    itens,
    resumoOrcamento,
    resumoProdutivo,

    salvando,
    salvar,
    adicionarItem,
    editarQuantidadeItem,
    editarCustoItem,
  };
}
