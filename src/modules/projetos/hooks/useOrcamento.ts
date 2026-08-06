"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const CARGA_TRIBUTARIA_CHAVE = "carga_tributaria_por_natureza";

type ResultadoAdicionarItem =
  | { status: "ok" }
  | { status: "erro"; mensagem: string };

const MENSAGEM_CARGA_INVALIDA =
  "Carga Tributária não pode ser 100% ou mais.";

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

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);

    if (!idProjeto) {
      setLoading(false);
      return;
    }

    const { data: projeto, error } = await supabase
      .from("projetos")
      .select(
        "id,numero_projeto,nome,tipo_projeto,status,cliente_id,data_objetivo,created_at,margem_lucro_percent,carga_tributaria_percent,desconto_percentual,desconto_motivo",
      )
      .eq("id", idProjeto)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !projeto) {
      setErro("Projeto não encontrado.");
      setLoading(false);
      return;
    }

    setProjetoId(projeto.id);
    setNumero(projeto.numero_projeto);
    setNomeProjeto(projeto.nome);
    setTipoProjeto(projeto.tipo_projeto);
    setStatusProjeto(projeto.status);
    setDataObjetivo(projeto.data_objetivo);
    setCriadoEm(projeto.created_at);
    setMargemLucroPercentState(Number(projeto.margem_lucro_percent));
    setCargaTributariaPercentState(
      projeto.carga_tributaria_percent !== null
        ? Number(projeto.carga_tributaria_percent)
        : null,
    );
    setDescontoPercentual(
      projeto.desconto_percentual !== null
        ? Number(projeto.desconto_percentual)
        : null,
    );
    setDescontoMotivo(projeto.desconto_motivo ?? null);

    // Responsavel: nao existe coluna persistida em projetos (mesmo limite
    // de useProjeto) - usa o usuario logado como aproximacao.
    const { data: userData } = await supabase.auth.getUser();

    if (userData.user) {
      const { data: usuario } = await supabase
        .from("usuarios")
        .select("nome")
        .eq("id", userData.user.id)
        .single();

      if (usuario?.nome) {
        setResponsavelNome(usuario.nome);
      }
    }

    const { data: config } = await supabase
      .from("configuracoes_empresa")
      .select("valor")
      .eq("chave", CARGA_TRIBUTARIA_CHAVE)
      .maybeSingle();

    const tabela = (config?.valor ?? {}) as Record<string, number>;
    setCargaTributariaSugerida(Number(tabela[projeto.tipo_projeto] ?? 0));

    if (projeto.cliente_id) {
      const { data: clienteData } = await supabase
        .from("clientes")
        .select("id,nome,cnpj,email")
        .eq("id", projeto.cliente_id)
        .single();

      if (clienteData) {
        setCliente({
          id: clienteData.id,
          nome: clienteData.nome ?? "",
          cnpj: clienteData.cnpj,
          email: clienteData.email,
        });
      }
    } else {
      setCliente(null);
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

        const total = ((custo ?? []) as { categoria: string; valor: number }[]).find(
          (linha) => linha.categoria === "total",
        )?.valor;

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
    try {
      const resumo = await calcularResumoProdutivoProjeto(supabase, projeto.id);
      setResumoProdutivoResultado(resumo);
      setErroResumoProdutivo(null);
    } catch (erro) {
      setResumoProdutivoResultado(RESUMO_PRODUTIVO_VAZIO);
      setErroResumoProdutivo(
        erro instanceof Error
          ? erro.message
          : "Não foi possível calcular o resumo produtivo.",
      );
    }

    setItensBase(itensCalculados);
    setLoading(false);
  }, [idProjeto]);

  useEffect(() => {
    carregar();
  }, [carregar]);

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

  // Breakdown por item: cada linha aplica a formula individualmente
  // sobre o proprio custo (exibicao da tabela de itens).
  const itens: ItemOrcamento[] = useMemo(
    () =>
      itensBase.map((item) => {
        const { impostos, lucro, valorComercial } = calcularResumoOrcamento({
          custoTotal: item.custo,
          margemLucroPercent,
          cargaTributariaPercent: cargaTributariaEfetiva,
        });

        return { ...item, impostos, lucro, total: valorComercial };
      }),
    [itensBase, cargaTributariaEfetiva, margemLucroPercent],
  );

  // Resumo/Total: regra oficial do DEC-001 - a formacao de preco e
  // aplicada uma UNICA VEZ sobre o custo total do orcamento, nao item a
  // item. useProposta.ts segue exatamente o mesmo padrao via
  // calcularResumoOrcamento, para os dois "Valor Total" baterem sempre.
  // O desconto comercial (DEC-001) tambem e aplicado so aqui, sobre o
  // Valor Tecnico agregado - nunca no breakdown por item acima.
  const resumoOrcamento = useMemo(() => {
    const custoTotal = itensBase.reduce((acc, item) => acc + item.custo, 0);
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
      margemLucroPercent,
      cargaTributariaPercent: cargaTributariaEfetiva,
      descontoPercent: descontoPercentual,
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
  }, [itensBase, margemLucroPercent, cargaTributariaEfetiva, descontoPercentual]);

  const resumoProdutivo = useMemo(() => {
    const totalMinutos = resumoProdutivoResultado.recursos.reduce(
      (acc, linha) => acc + linha.minutos,
      0,
    );

    return {
      estado: resumoProdutivoResultado.estado,
      mensagem: resumoProdutivoResultado.mensagem,
      linhas: resumoProdutivoResultado.recursos,
      totalMinutos,
      itensIncompletos: resumoProdutivoResultado.itens.filter(
        (item) => !item.estruturaOk,
      ),
      erro: erroResumoProdutivo,
    };
  }, [resumoProdutivoResultado, erroResumoProdutivo]);

  async function salvar() {
    if (!projetoId) {
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
    if (!projetoId) {
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

    await carregar();

    return { status: "ok" };
  }

  async function editarQuantidadeItem(
    id: string,
    quantidade: number,
  ): Promise<ResultadoAdicionarItem> {
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

    await carregar();

    return { status: "ok" };
  }

  async function editarCustoItem(
    id: string,
    custo: number,
  ): Promise<ResultadoAdicionarItem> {
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

    await carregar();

    return { status: "ok" };
  }

  return {
    loading,
    erro,
    mensagem,

    projetoId,
    numeroProjeto: numero,
    nomeProjeto,
    tipoProjeto,
    statusProjeto,
    dataObjetivo,
    criadoEm,
    responsavelNome,
    cliente,

    margemLucroPercent,
    setMargemLucroPercent,
    cargaTributariaPercent,
    setCargaTributariaPercent,
    cargaTributariaSugerida,
    cargaTributariaEfetiva,
    formulaErro,
    descontoPercentual,
    setDescontoPercentual,
    descontoMotivo,
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
