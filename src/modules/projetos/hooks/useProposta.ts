"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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

type BomEscolhaRow = { id: string; status: string; created_at: string };

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

// Mesma formula hibrida de useOrcamento.ts: Margem "por fora" (% do
// custo), Carga Tributaria "por dentro" (% do proprio preco de venda,
// incidindo sobre Custo + Lucro). Precisa ficar identica para o Valor
// Total da Proposta bater com o Valor Total do Orcamento.
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
  const [valorTotalProposta, setValorTotalProposta] = useState(0);

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

      const { data: projeto, error } = await supabase
        .from("projetos")
        .select(
          "id,numero_projeto,tipo_projeto,cliente_id,margem_lucro_percent,carga_tributaria_percent,contato_comercial_nome,created_at,proposta_revisao,proposta_consideracoes",
        )
        .eq("id", idProjeto)
        .is("deleted_at", null)
        .maybeSingle();

      if (error || !projeto) {
        setErro("Projeto não encontrado.");
        setLoading(false);
        return;
      }

      // Proposta nao tem numeracao propria: usa o numero_projeto direto.
      setNumeroProjetoCarregado(projeto.numero_projeto);
      setNomeSolicitante(projeto.contato_comercial_nome);
      setCriadoEm(projeto.created_at);
      setRevisao(projeto.proposta_revisao ?? "A");
      setConsideracoes(
        projeto.proposta_consideracoes ?? TEXTO_CONSIDERACOES_PADRAO,
      );

      const { data: userData } = await supabase.auth.getUser();

      if (userData.user) {
        const { data: usuario } = await supabase
          .from("usuarios")
          .select("nome,empresa_id")
          .eq("id", userData.user.id)
          .single();

        if (usuario?.nome) {
          setResponsavelNome(usuario.nome);
        }
      }

      if (projeto.cliente_id) {
        const { data: clienteData } = await supabase
          .from("clientes")
          .select("nome,cnpj,email")
          .eq("id", projeto.cliente_id)
          .single();

        if (clienteData) {
          setCliente({
            nome: clienteData.nome ?? "",
            cnpj: clienteData.cnpj,
            email: clienteData.email,
          });
        }
      }

      // Itens: mesmo calculo do Orcamento (custo/impostos/lucro/total),
      // mas so expoe Valor Unitario (= total / quantidade) e Valor Total -
      // nunca Custo/Impostos/Lucro internos.
      const { data: itensProjeto } = await supabase
        .from("projeto_itens")
        .select("id,produto_id,pn,descricao,quantidade,custo_congelado")
        .eq("projeto_id", projeto.id)
        .order("created_at", { ascending: true });

      const linhas = (itensProjeto ?? []) as {
        id: string;
        produto_id: string;
        pn: string;
        descricao: string;
        quantidade: number;
        custo_congelado: number | null;
      }[];

      const excluirMateriaPrima = projeto.tipo_projeto === "industrializacao";
      const margem = Number(projeto.margem_lucro_percent);

      let cargaEfetiva = Number(projeto.carga_tributaria_percent ?? 0);

      if (projeto.carga_tributaria_percent === null) {
        const { data: config } = await supabase
          .from("configuracoes_empresa")
          .select("valor")
          .eq("chave", "carga_tributaria_por_natureza")
          .maybeSingle();

        const tabela = (config?.valor ?? {}) as Record<string, number>;
        cargaEfetiva = Number(tabela[projeto.tipo_projeto] ?? 0);
      }

      const itensCalculados: ItemProposta[] = [];
      let somaTotal = 0;

      for (const item of linhas) {
        const { data: produto } = await supabase
          .from("itens_industriais")
          .select("codigo_ncm")
          .eq("id", item.produto_id)
          .single();

        let custoUnitario =
          item.custo_congelado !== null ? Number(item.custo_congelado) : 0;

        if (item.custo_congelado === null) {
          const { data: boms } = await supabase
            .from("boms")
            .select("id,status,created_at")
            .eq("produto_id", item.produto_id)
            .is("deleted_at", null)
            .order("created_at", { ascending: false });

          const bomsLista = (boms ?? []) as BomEscolhaRow[];
          const bomEscolhido =
            bomsLista.find((bom) => bom.status === "ativo") ?? bomsLista[0];

          if (bomEscolhido) {
            const { data: custo } = await supabase.rpc("calcular_custo_bom", {
              p_bom_id: bomEscolhido.id,
              p_excluir_materia_prima: excluirMateriaPrima,
            });

            const totalCategoria = (
              (custo ?? []) as { categoria: string; valor: number }[]
            ).find((linha) => linha.categoria === "total")?.valor;

            custoUnitario = Number(totalCategoria ?? 0);
          }
        }

        const custoItem = custoUnitario * item.quantidade;
        const { total: totalItem } = calcularPrecoVenda(
          custoItem,
          margem,
          cargaEfetiva,
        );

        somaTotal += totalItem;

        itensCalculados.push({
          id: item.id,
          descricao: item.descricao,
          codigo: item.pn,
          ncm: produto?.codigo_ncm ?? null,
          quantidade: item.quantidade,
          valorUnitario: item.quantidade > 0 ? totalItem / item.quantidade : 0,
          valorTotal: totalItem,
        });
      }

      setItens(itensCalculados);
      setValorTotalProposta(somaTotal);
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
    valorTotalProposta,
    revisao,
    salvandoRevisao,
    avancarRevisao,
    consideracoes,
    salvandoConsideracoes,
    salvarConsideracoes,
  };
}
