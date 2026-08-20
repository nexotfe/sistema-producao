"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ProjectStatus, ProjectType } from "../types";
import { calcularResumoOrcamento } from "../lib/calcularResumoOrcamento";
import {
  buscarDadosOrcamento,
  type ClienteOrcamento,
  type DadosOrcamentoProjeto,
  type ItemOrcamentoBase,
} from "../lib/buscarDadosOrcamento";
import { buscarCenarioComercialAprovado, type CenarioComercialAprovadoResumo } from "../lib/buscarCenarioComercialAprovado";
import type { ResultadoResumoProdutivoProjeto } from "../lib/calcularResumoProdutivoProjeto";

export type { CenarioComercialAprovadoResumo } from "../lib/buscarCenarioComercialAprovado";

export type { ClienteOrcamento } from "../lib/buscarDadosOrcamento";

export type ItemOrcamento = ItemOrcamentoBase & {
  impostos: number;
  lucro: number;
  total: number;
};

type ItemBase = ItemOrcamentoBase;

export type { LinhaResumoProdutivoRecurso as LinhaResumoProdutivo } from "../lib/calcularResumoProdutivoProjeto";

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
  // DEC-007 §6.2/Fase 8b - null = nenhum cenário comercial aprovado
  // vigente (comportamento atual do Orçamento preservado). Quando
  // presente, novoCustoTecnico substitui a soma de itens como entrada de
  // resumoOrcamento (abaixo) - mudanças posteriores no orçamento NUNCA
  // alteram esse valor congelado (só uma nova aprovação de cenário o
  // substitui).
  const [cenarioComercialAprovado, setCenarioComercialAprovado] =
    useState<CenarioComercialAprovadoResumo | null>(null);

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

  function aplicarDadosOrcamento(dados: DadosOrcamentoProjeto, cenarioAprovado: CenarioComercialAprovadoResumo | null) {
    setProjetoId(dados.projeto.id);
    setCenarioComercialAprovado(cenarioAprovado);
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

    const [dados, cenarioAprovado] = await Promise.all([
      buscarDadosOrcamento(supabase, idProjetoAlvo),
      buscarCenarioComercialAprovado(supabase, idProjetoAlvo),
    ]);

    if (geracaoCargaRef.current !== minhaGeracao) {
      return;
    }

    if (dados) {
      aplicarDadosOrcamento(dados, cenarioAprovado);
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
      const [dados, cenarioAprovado] = await Promise.all([
        buscarDadosOrcamento(supabase, idProjetoAtual),
        buscarCenarioComercialAprovado(supabase, idProjetoAtual),
      ]);
      if (geracaoCargaRef.current !== minhaGeracao) return;

      if (!dados) {
        setErro("Projeto não encontrado.");
        setIdProjetoCarregado(idProjetoAtual);
        return;
      }

      aplicarDadosOrcamento(dados, cenarioAprovado);
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
  const cenarioComercialAprovadoExibido = dadosValidos ? cenarioComercialAprovado : null;

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
  //
  // CORREÇÃO (DEC-007 §6.2/Fase 8b, aprovação do cenário comercial):
  // quando existe um cenário comercial aprovado vigente, o valor-base
  // ("custoTotal" aqui) passa a ser `novoCustoTecnico` (congelado no
  // momento da aprovação - já soma o custo adicional do cenário), nunca
  // mais a soma bruta dos itens - continua sendo a MESMA
  // calcularResumoOrcamento (nunca uma segunda fórmula), só a entrada
  // muda. Sem cenário aprovado, comportamento idêntico ao anterior.
  const resumoOrcamento = useMemo(() => {
    const custoTotalItens = itensBaseExibidos.reduce((acc, item) => acc + item.custo, 0);
    const custoTotalEfetivo = cenarioComercialAprovadoExibido
      ? cenarioComercialAprovadoExibido.novoCustoTecnico
      : custoTotalItens;
    const cargaTributariaEfetivaCalculo = cargaTributariaPercentExibido ?? cargaTributariaSugeridaExibida;

    const { valorTecnico, valorDesconto, valorComercial, impostos, lucro, margemTecnica, margemEfetiva } =
      calcularResumoOrcamento({
        custoTotal: custoTotalEfetivo,
        margemLucroPercent: margemLucroPercentExibido,
        cargaTributariaPercent: cargaTributariaEfetivaCalculo,
        descontoPercent: descontoPercentualExibido,
      });

    return {
      custoTotal: custoTotalEfetivo,
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
    cargaTributariaPercentExibido,
    cargaTributariaSugeridaExibida,
    descontoPercentualExibido,
    cenarioComercialAprovadoExibido,
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
    cenarioComercialAprovado: cenarioComercialAprovadoExibido,

    salvando,
    salvar,
    adicionarItem,
    editarQuantidadeItem,
    editarCustoItem,
  };
}
