"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { calcularResumoOrcamento } from "../lib/calcularResumoOrcamento";
import { buscarCenarioComercialAprovado, type CenarioComercialAprovadoResumo } from "../lib/buscarCenarioComercialAprovado";
import { buscarDadosOrcamento } from "../lib/buscarDadosOrcamento";

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

export type AjusteComercialProposta = {
  descricao: string;
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
  // DEC-007 §6.2/Fase 8b (correção 2 de 6, teste visual real 260011) -
  // linha separada na Proposta, nunca redistribuída entre os itens (o
  // custo adicional do cenário não é atribuível a nenhum item
  // específico). Calculada como DIFERENÇA entre dois resumos agregados
  // (custo original congelado + ajuste) − (custo original congelado),
  // nunca recalculando o ajuste isolado, para bater exatamente com
  // valorTecnicoProposta/valorTotalProposta apesar de qualquer
  // arredondamento interno de calcularResumoOrcamento.
  const [ajusteComercial, setAjusteComercial] =
    useState<AjusteComercialProposta | null>(null);

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
      setCenarioComercialAprovado(cenarioAprovado);

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
      const itensCalculados: ItemProposta[] = [];
      let custoTotalSoma = 0;

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

        itensCalculados.push({
          id: item.id,
          descricao: item.descricao,
          codigo: item.pn,
          ncm: (produto?.codigo_ncm as string | null) ?? null,
          quantidade: item.quantidade,
          valorUnitario: item.quantidade > 0 ? totalItem / item.quantidade : 0,
          valorTotal: totalItem,
        });
      }

      // Total: regra oficial do DEC-001 - mesma formula do
      // useOrcamento.ts, aplicada uma UNICA VEZ sobre o custo total
      // somado (nao item a item), para os dois "Valor Total" baterem. O
      // desconto comercial tambem so entra aqui, nunca no breakdown por
      // item acima (mesmo criterio de useOrcamento.ts).
      //
      // CORREÇÃO (DEC-007 §6.2/Fase 8b, aprovação do cenário comercial):
      // havendo cenário aprovado vigente, o valor-base vira
      // novoCustoTecnico (congelado na aprovação: custo técnico + custo
      // adicional do cenário) em vez da soma bruta dos itens - mesma
      // calcularResumoOrcamento, nunca uma segunda fórmula. O breakdown
      // por item acima NUNCA é alterado por isso (o custo adicional não
      // é atribuível a nenhum item específico) - só o total muda.
      const custoTotalEfetivo = cenarioAprovado ? cenarioAprovado.novoCustoTecnico : custoTotalSoma;
      const { valorTecnico, valorDesconto, valorComercial: totalProposta } =
        calcularResumoOrcamento({
          custoTotal: custoTotalEfetivo,
          margemLucroPercent: margem,
          cargaTributariaPercent: cargaEfetiva,
          descontoPercent: descontoPercentual,
        });

      // Ajuste comercial (correção 2 de 6): diferença entre os dois
      // resumos agregados, usando SEMPRE custoTecnicoAtual congelado na
      // aprovação como base "sem ajuste" (nunca custoTotalSoma ao vivo -
      // o snapshot é o que foi aprovado, não o estado atual dos itens).
      let ajusteComercialCalculado: AjusteComercialProposta | null = null;

      if (cenarioAprovado) {
        const { valorComercial: valorComAjuste } = calcularResumoOrcamento({
          custoTotal: cenarioAprovado.custoTecnicoAtual + cenarioAprovado.custoAdicionalTotal,
          margemLucroPercent: margem,
          cargaTributariaPercent: cargaEfetiva,
          descontoPercent: descontoPercentual,
        });
        const { valorComercial: valorSemAjuste } = calcularResumoOrcamento({
          custoTotal: cenarioAprovado.custoTecnicoAtual,
          margemLucroPercent: margem,
          cargaTributariaPercent: cargaEfetiva,
          descontoPercent: descontoPercentual,
        });

        ajusteComercialCalculado = {
          descricao: "Ajuste comercial — cenário aprovado",
          valorTotal: valorComAjuste - valorSemAjuste,
        };
      }

      setItens(itensCalculados);
      setValorTecnicoProposta(valorTecnico);
      setValorDescontoProposta(valorDesconto);
      setValorTotalProposta(totalProposta);
      setAjusteComercial(ajusteComercialCalculado);
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
    cliente,
    nomeSolicitante,
    responsavelNome,
    itens,
    valorTecnicoProposta,
    valorDescontoProposta,
    valorTotalProposta,
    cenarioComercialAprovado,
    ajusteComercial,
    revisao,
    salvandoRevisao,
    avancarRevisao,
    consideracoes,
    salvandoConsideracoes,
    salvarConsideracoes,
  };
}
