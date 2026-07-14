"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ProjectStatus, ProjectType } from "../types";

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
  impostos: number;
  lucro: number;
  total: number;
};

type ItemBase = Omit<ItemOrcamento, "impostos" | "lucro" | "total">;

export type LinhaResumoProdutivo = {
  recursoId: string | null;
  codigo: string | null;
  nome: string | null;
  minutos: number;
};

type BomEscolhaRow = { id: string; status: string; created_at: string };
type BomOperacaoTempoRow = {
  tempo_estimado_minutos: number;
  recurso_produtivo_id: string | null;
};
type RecursoProdutivoRow = { id: string; codigo: string | null; nome: string | null };

const SEM_RECURSO_CHAVE = "__sem_recurso__";

const CARGA_TRIBUTARIA_CHAVE = "carga_tributaria_por_natureza";

type ResultadoAdicionarItem =
  | { status: "ok" }
  | { status: "erro"; mensagem: string };

const MENSAGEM_CARGA_INVALIDA =
  "Carga Tributária não pode ser 100% ou mais.";

/**
 * Formula hibrida: Margem e "por fora" (% direto do custo, como antes);
 * Carga Tributaria e "por dentro", incidindo sobre Custo + Lucro (o
 * valor final da nota), nao sobre o custo isolado. Com carga >= 100 o
 * denominador zera ou fica negativo - por isso e bloqueada antes de
 * chegar aqui (ver setCargaTributariaPercent); o fallback abaixo e so
 * uma rede de seguranca para nao gerar NaN/Infinity na tela.
 */
function calcularPrecoVenda(
  custo: number,
  margemPercent: number,
  cargaPercent: number,
) {
  const margem = margemPercent / 100;
  const carga = cargaPercent / 100;
  const lucro = custo * margem;
  const subtotal = custo + lucro;
  const denominador = 1 - carga;

  if (denominador <= 0) {
    return { impostos: 0, lucro, total: subtotal };
  }

  const precoVenda = subtotal / denominador;

  return {
    impostos: precoVenda * carga,
    lucro,
    total: precoVenda,
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

  const [itensBase, setItensBase] = useState<ItemBase[]>([]);
  const [resumoProdutivoLinhas, setResumoProdutivoLinhas] = useState<
    LinhaResumoProdutivo[]
  >([]);

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
        "id,numero_projeto,nome,tipo_projeto,status,cliente_id,data_objetivo,created_at,margem_lucro_percent,carga_tributaria_percent",
      )
      .eq("id", idProjeto)
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
      .select("id,produto_id,pn,descricao,revisao,quantidade")
      .eq("projeto_id", projeto.id)
      .order("created_at", { ascending: true });

    const linhas = (itens ?? []) as {
      id: string;
      produto_id: string;
      pn: string;
      descricao: string;
      revisao: string | null;
      quantidade: number;
    }[];

    const excluirMateriaPrima = projeto.tipo_projeto === "industrializacao";
    const itensCalculados: ItemBase[] = [];
    const minutosPorRecurso = new Map<string, number>();

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

      let custoUnitario = 0;

      if (bomEscolhido) {
        const { data: custo } = await supabase.rpc("calcular_custo_bom", {
          p_bom_id: bomEscolhido.id,
          p_excluir_materia_prima: excluirMateriaPrima,
        });

        const total = ((custo ?? []) as { categoria: string; valor: number }[]).find(
          (linha) => linha.categoria === "total",
        )?.valor;

        custoUnitario = Number(total ?? 0);

        const { data: operacoes } = await supabase
          .from("bom_operacoes")
          .select("tempo_estimado_minutos,recurso_produtivo_id")
          .eq("bom_id", bomEscolhido.id)
          .eq("ativo", true)
          .is("deleted_at", null);

        for (const operacao of (operacoes ?? []) as BomOperacaoTempoRow[]) {
          const chave = operacao.recurso_produtivo_id ?? SEM_RECURSO_CHAVE;
          const atual = minutosPorRecurso.get(chave) ?? 0;
          minutosPorRecurso.set(
            chave,
            atual + Number(operacao.tempo_estimado_minutos),
          );
        }
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
      });
    }

    const recursoIds = [...minutosPorRecurso.keys()].filter(
      (chave) => chave !== SEM_RECURSO_CHAVE,
    );
    const recursosPorId = new Map<string, RecursoProdutivoRow>();

    if (recursoIds.length > 0) {
      const { data: recursos } = await supabase
        .from("recursos_produtivos")
        .select("id,codigo,nome")
        .in("id", recursoIds);

      for (const recurso of (recursos ?? []) as RecursoProdutivoRow[]) {
        recursosPorId.set(recurso.id, recurso);
      }
    }

    const linhasResumoProdutivo: LinhaResumoProdutivo[] = [
      ...minutosPorRecurso.entries(),
    ]
      .map(([chave, minutos]) => {
        if (chave === SEM_RECURSO_CHAVE) {
          return { recursoId: null, codigo: null, nome: null, minutos };
        }

        const recurso = recursosPorId.get(chave);
        return {
          recursoId: chave,
          codigo: recurso?.codigo ?? null,
          nome: recurso?.nome ?? null,
          minutos,
        };
      })
      .sort((a, b) => {
        if (a.recursoId === null) return 1;
        if (b.recursoId === null) return -1;
        return (a.codigo ?? "").localeCompare(b.codigo ?? "");
      });

    setItensBase(itensCalculados);
    setResumoProdutivoLinhas(linhasResumoProdutivo);
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

  // Imposto e margem sao "por dentro" (% do proprio preco de venda, nao
  // do custo). margem/carga sao os mesmos para todo o orcamento (nao por
  // item), entao aplicar a formula uma vez sobre o custo total e somar o
  // preco de venda de cada item dao o mesmo resultado matematicamente -
  // optamos por aplicar uma vez sobre o total no Resumo (mais simples,
  // sem depender do array `itens` nem repetir a divisao por item).
  const itens: ItemOrcamento[] = useMemo(
    () =>
      itensBase.map((item) => {
        const { impostos, lucro, total } = calcularPrecoVenda(
          item.custo,
          margemLucroPercent,
          cargaTributariaEfetiva,
        );

        return { ...item, impostos, lucro, total };
      }),
    [itensBase, cargaTributariaEfetiva, margemLucroPercent],
  );

  const resumoOrcamento = useMemo(() => {
    const custoTotal = itensBase.reduce((acc, item) => acc + item.custo, 0);
    const { impostos, lucro, total } = calcularPrecoVenda(
      custoTotal,
      margemLucroPercent,
      cargaTributariaEfetiva,
    );

    return {
      custoTotal,
      impostosTotal: impostos,
      lucroTotal: lucro,
      valorTotal: total,
    };
  }, [itensBase, margemLucroPercent, cargaTributariaEfetiva]);

  const resumoProdutivo = useMemo(() => {
    const totalMinutos = resumoProdutivoLinhas.reduce(
      (acc, linha) => acc + linha.minutos,
      0,
    );

    return { linhas: resumoProdutivoLinhas, totalMinutos };
  }, [resumoProdutivoLinhas]);

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

    itens,
    resumoOrcamento,
    resumoProdutivo,

    salvando,
    salvar,
    adicionarItem,
  };
}
