"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { calcularResumoOrcamento } from "../lib/calcularResumoOrcamento";
import { buscarCenarioComercialAprovado, type CenarioComercialAprovadoResumo } from "../lib/buscarCenarioComercialAprovado";
import { avaliarCenarioComercialAprovado } from "../lib/avaliarCenarioComercialAprovado";
import { buscarDadosOrcamento } from "../lib/buscarDadosOrcamento";
import { distribuirAjusteProporcional } from "../lib/distribuirAjusteProporcional";
import {
  buscarIdentidadeEmpresaAtual,
  type IdentidadeEmpresa,
} from "@/modules/empresa/lib/buscarIdentidadeEmpresaAtual";

export type ClienteProposta = {
  nome: string;
  cnpj: string | null;
  email: string | null;
};

export type ItemProposta = {
  id: string;
  descricao: string;
  codigo: string;
  ncm: string | null;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
};

const TEXTO_CONSIDERACOES_PADRAO =
  "Apresentamos nossa proposta comercial para fornecimento dos itens " +
  "relacionados abaixo, conforme escopo técnico recebido e condições " +
  "comerciais indicadas neste documento.";

export function proximaRevisao(atual: string): string {
  const letras = atual.split("");
  let indice = letras.length - 1;

  while (indice >= 0) {
    if (letras[indice] === "Z") {
      letras[indice] = "A";
      indice -= 1;
    } else {
      letras[indice] = String.fromCharCode(letras[indice].charCodeAt(0) + 1);
      return letras.join("");
    }
  }

  return "A" + letras.join("");
}

export function useProposta(idProjeto: string | null) {
  const [criadoEm, setCriadoEm] = useState<string | null>(null);
  const [numeroProjetoCarregado, setNumeroProjetoCarregado] = useState<
    string | null
  >(null);
  const [revisao, setRevisao] = useState("A");
  const [consideracoes, setConsideracoes] = useState(
    TEXTO_CONSIDERACOES_PADRAO,
  );
  const [identidadeEmpresa, setIdentidadeEmpresa] = useState<IdentidadeEmpresa | null>(null);
  const [cliente, setCliente] = useState<ClienteProposta | null>(null);
  const [nomeSolicitante, setNomeSolicitante] = useState<string | null>(null);
  const [responsavelNome, setResponsavelNome] = useState("");
  const [itens, setItens] = useState<ItemProposta[]>([]);
  const [valorTecnicoProposta, setValorTecnicoProposta] = useState(0);
  const [valorDescontoProposta, setValorDescontoProposta] = useState(0);
  const [valorTotalProposta, setValorTotalProposta] = useState(0);
  // DEC-007 §6.2/Fase 8b - null = nenhum cenário comercial aprovado
  // vigente (comportamento atual da Proposta preservado: valor-base =
  // soma bruta dos itens). Quando presente, novoCustoTecnico (congelado
  // na aprovação) substitui essa soma como entrada da MESMA
  // calcularResumoOrcamento (nunca uma fórmula nova), e prazoProposto
  // fica disponível para a tela usar como prazo da proposta.
  const [cenarioComercialAprovado, setCenarioComercialAprovado] =
    useState<CenarioComercialAprovadoResumo | null>(null);
  // DEC-007 §6.2/Fase 8b (invalidação automática) - true só quando o
  // cenário acima existe e passou pela verificação de assinatura
  // técnica (ou o projeto está com status=aprovado - congelamento
  // definitivo, nunca recalcula). Mesma decisão pura de useOrcamento.ts
  // (decidirUsoCenarioComercialAprovado.ts) - nunca uma segunda regra.
  const [cenarioComercialDesatualizado, setCenarioComercialDesatualizado] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoRevisao, setSalvandoRevisao] = useState(false);
  const [salvandoConsideracoes, setSalvandoConsideracoes] = useState(false);

  useEffect(() => {
    async function carregar() {
      setLoading(true);
      setErro(null);

      if (!idProjeto) {
        setLoading(false);
        return;
      }

      // Identidade da empresa (nome/CNPJ/endereço/contato) é pré-requisito
      // do documento - carregada primeiro e aborta o restante em caso de
      // erro real ou ausência do dado obrigatório (nome), em vez de
      // deixar a proposta renderizar parcialmente sem essa identificação.
      const resultadoIdentidade = await buscarIdentidadeEmpresaAtual(supabase);

      if (resultadoIdentidade.status === "erro") {
        setErro(resultadoIdentidade.mensagem);
        setLoading(false);
        return;
      }

      if (resultadoIdentidade.status === "sem_empresa") {
        setErro("Não foi possível identificar a empresa do usuário logado.");
        setLoading(false);
        return;
      }

      setIdentidadeEmpresa(resultadoIdentidade.identidade);

      // Fonte ÚNICA de "custo dos itens do orçamento" (consolidação
      // pedida pelo usuário, 2026-08-22): antes, esta lógica (preferir
      // custo_congelado, senão BOM ativo mais recente + calcular_custo_bom)
      // estava DUPLICADA aqui e em buscarDadosOrcamento.ts - as duas
      // telas podiam divergir sobre "o que é custo congelado" sem que
      // nada acusasse. Responsável, cliente, itens (com custo já
      // resolvido) e carga tributária sugerida vêm todos daqui agora;
      // só os 3 campos exclusivos da Proposta (abaixo) continuam numa
      // consulta própria.
      const dados = await buscarDadosOrcamento(supabase, idProjeto);

      if (!dados) {
        setErro("Projeto não encontrado.");
        setLoading(false);
        return;
      }

      const { data: propostaCampos } = await supabase
        .from("projetos")
        .select("contato_comercial_nome,proposta_revisao,proposta_consideracoes")
        .eq("id", idProjeto)
        .maybeSingle();

      const cenarioAprovado = await buscarCenarioComercialAprovado(supabase, idProjeto);
      // Calculado ANTES de qualquer setState de cenário/valores - nunca
      // existe um render em que o cenário desatualizado aparece
      // temporariamente como corrente enquanto a verificação roda (mesma
      // garantia estrutural de useOrcamento.ts).
      const decisaoCenario = await avaliarCenarioComercialAprovado(
        supabase,
        idProjeto,
        dados.projeto.statusProjeto,
        cenarioAprovado,
      );
      const cenarioUsavel = cenarioAprovado && decisaoCenario?.usarCenario === true ? cenarioAprovado : null;

      setCenarioComercialAprovado(cenarioAprovado);
      setCenarioComercialDesatualizado(cenarioAprovado !== null && decisaoCenario?.usarCenario !== true);

      // Proposta nao tem numeracao propria: usa o numero_projeto direto.
      setNumeroProjetoCarregado(dados.projeto.numeroProjeto);
      setNomeSolicitante((propostaCampos?.contato_comercial_nome as string | null) ?? null);
      setCriadoEm(dados.projeto.criadoEm);
      setRevisao((propostaCampos?.proposta_revisao as string | null) ?? "A");
      setConsideracoes(
        (propostaCampos?.proposta_consideracoes as string | null) ?? TEXTO_CONSIDERACOES_PADRAO,
      );
      setResponsavelNome(dados.responsavelNome ?? "");

      if (dados.cliente) {
        setCliente({
          nome: dados.cliente.nome,
          cnpj: dados.cliente.cnpj,
          email: dados.cliente.email,
        });
      }

      const margem = dados.projeto.margemLucroPercent;
      const descontoPercentual = dados.projeto.descontoPercentual;
      const cargaEfetiva = dados.projeto.cargaTributariaPercent ?? dados.cargaTributariaSugerida;

      // Itens: mesmo custo já resolvido pelo Orcamento, mas a Proposta
      // so expoe Valor Unitario (= total / quantidade) e Valor Total -
      // nunca Custo/Impostos/Lucro internos.
      let custoTotalSoma = 0;

      type ItemPropostaBase = Omit<ItemProposta, "valorUnitario">;
      const itensBase: ItemPropostaBase[] = [];

      for (const item of dados.itensCalculados) {
        const { data: produto } = await supabase
          .from("itens_industriais")
          .select("codigo_ncm")
          .eq("id", item.produtoId)
          .single();

        custoTotalSoma += item.custo;

        const { valorComercial: totalItem } = calcularResumoOrcamento({
          custoTotal: item.custo,
          margemLucroPercent: margem,
          cargaTributariaPercent: cargaEfetiva,
        });

        itensBase.push({
          id: item.id,
          descricao: item.descricao,
          codigo: item.pn,
          ncm: (produto?.codigo_ncm as string | null) ?? null,
          quantidade: item.quantidade,
          valorTotal: totalItem,
        });
      }

      // Subtotal: regra oficial do DEC-001 - mesma formula do
      // useOrcamento.ts, aplicada uma UNICA VEZ sobre o custo total
      // somado (nao item a item). O desconto comercial so entra aqui,
      // nunca no breakdown por item (mesmo criterio de useOrcamento.ts).
      //
      // Havendo cenário aprovado vigente, o valor-base vira
      // novoCustoTecnico (congelado na aprovação: custo técnico + custo
      // adicional do cenário) em vez da soma bruta dos itens - mesma
      // calcularResumoOrcamento, nunca uma segunda fórmula.
      const custoTotalEfetivo = cenarioUsavel ? cenarioUsavel.novoCustoTecnico : custoTotalSoma;
      const { valorTecnico, valorDesconto, valorComercial: totalProposta } =
        calcularResumoOrcamento({
          custoTotal: custoTotalEfetivo,
          margemLucroPercent: margem,
          cargaTributariaPercent: cargaEfetiva,
          descontoPercent: descontoPercentual,
        });

      // Correção (pedido do usuário, 2026-08-22): a Proposta não mostra
      // mais uma linha separada "Ajuste comercial" - o ajuste (diferença
      // entre valorTecnico agregado, que já inclui o cenário aprovado, e
      // a soma dos valores-base por item) é distribuído proporcionalmente
      // entre os itens, garantindo soma(itens.valorTotal) === Subtotal
      // sempre, com qualquer sinal (positivo/negativo). O detalhamento do
      // ajuste (custoAdicionalTotal etc.) continua só no Orçamento, via
      // cenarioComercialAprovado - não removido nem duplicado aqui.
      const itensCalculadosFinal: ItemProposta[] = distribuirAjusteProporcional(
        itensBase,
        valorTecnico,
      ).map((item) => ({
        ...item,
        valorUnitario: item.quantidade > 0 ? item.valorTotal / item.quantidade : 0,
      }));

      setItens(itensCalculadosFinal);
      setValorTecnicoProposta(valorTecnico);
      setValorDescontoProposta(valorDesconto);
      setValorTotalProposta(totalProposta);
      setLoading(false);
    }

    carregar();
  }, [idProjeto]);

  async function avancarRevisao() {
    if (!idProjeto) {
      return;
    }

    const novaRevisao = proximaRevisao(revisao);

    setSalvandoRevisao(true);

    const { error: revisaoError } = await supabase
      .from("projetos")
      .update({ proposta_revisao: novaRevisao })
      .eq("id", idProjeto);

    setSalvandoRevisao(false);

    if (revisaoError) {
      setErro(`Não foi possível avançar a revisão: ${revisaoError.message}`);
      return;
    }

    setErro(null);
    setRevisao(novaRevisao);
  }

  async function salvarConsideracoes(texto: string) {
    if (!idProjeto) {
      return;
    }

    setSalvandoConsideracoes(true);

    const { error: consideracoesError } = await supabase
      .from("projetos")
      .update({ proposta_consideracoes: texto })
      .eq("id", idProjeto);

    setSalvandoConsideracoes(false);

    if (consideracoesError) {
      setErro(
        `Não foi possível salvar as considerações: ${consideracoesError.message}`,
      );
      return;
    }

    setErro(null);
    setConsideracoes(texto);
  }

  return {
    loading,
    erro,
    numeroProposta: numeroProjetoCarregado,
    criadoEm,
    identidadeEmpresa,
    cliente,
    nomeSolicitante,
    responsavelNome,
    itens,
    valorTecnicoProposta,
    valorDescontoProposta,
    valorTotalProposta,
    cenarioComercialAprovado,
    cenarioComercialDesatualizado,
    revisao,
    salvandoRevisao,
    avancarRevisao,
    consideracoes,
    salvandoConsideracoes,
    salvarConsideracoes,
  };
}
