"use client";
// Modal da Lista Técnica de Materiais do PROJETO - a lista oficial
// pertence ao projeto (produtos + quantidades solicitadas), não ao
// roteiro avulso. "Recarregar lista" permite atualizar sem fechar o
// modal (útil se os itens do orçamento mudaram enquanto o modal
// estava aberto). Sem campo de quantidade - cada item já traz sua
// própria quantidade solicitada do orçamento.
import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  gerarListaTecnicaProjeto,
  type ResultadoListaTecnicaProjeto,
} from "../lib/gerarListaTecnicaProjeto";

type Props = {
  open: boolean;
  onClose: () => void;
  projetoId: string;
  numeroProjeto: string | null;
};

function formatarQuantidade(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function ListaTecnicaProjetoModal({ open, onClose, projetoId, numeroProjeto }: Props) {
  if (!open) {
    return null;
  }

  // key=projetoId: cada abertura (ou troca de projeto com o modal já
  // aberto) monta uma instância nova do conteúdo - o estado nasce
  // zerado pelo próprio useState, sem precisar de um efeito para
  // "resetar" estado a cada abertura (React remonta em vez de
  // resetar manualmente um componente que persiste).
  return (
    <ListaTecnicaProjetoModalConteudo
      key={projetoId}
      projetoId={projetoId}
      numeroProjeto={numeroProjeto}
      onClose={onClose}
    />
  );
}

type ConteudoProps = {
  projetoId: string;
  numeroProjeto: string | null;
  onClose: () => void;
};

function ListaTecnicaProjetoModalConteudo({ projetoId, numeroProjeto, onClose }: ConteudoProps) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoListaTecnicaProjeto | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelado = false;

    async function carregarNaAbertura() {
      try {
        const dados = await gerarListaTecnicaProjeto(supabase, projetoId);
        if (cancelado) return;
        setResultado(dados);
        setExpandidos(new Set());
      } catch (err) {
        if (cancelado) return;
        setErro(err instanceof Error ? err.message : "Não foi possível gerar a lista técnica do projeto.");
        setResultado(null);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    void carregarNaAbertura();

    return () => {
      cancelado = true;
    };
  }, [projetoId]);

  async function recarregar() {
    setCarregando(true);
    setErro(null);
    try {
      const dados = await gerarListaTecnicaProjeto(supabase, projetoId);
      setResultado(dados);
      setExpandidos(new Set());
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível gerar a lista técnica do projeto.");
      setResultado(null);
    } finally {
      setCarregando(false);
    }
  }

  function alternarExpandido(materiaPrimaId: string) {
    setExpandidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(materiaPrimaId)) {
        proximo.delete(materiaPrimaId);
      } else {
        proximo.add(materiaPrimaId);
      }
      return proximo;
    });
  }

  function fechar() {
    if (carregando) return;
    onClose();
  }

  const itensSemMaterial = resultado?.itensAnalisados.filter((item) => !item.possuiMateriais) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-md border border-slate-200 bg-app-card shadow-xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Lista técnica de materiais</h2>
          <p className="mt-1 text-sm text-slate-500">
            {numeroProjeto ? `Projeto ${numeroProjeto}` : "Projeto"} - materiais consolidados de todos
            os itens do orçamento, expandindo roteiros recursivamente. Somente leitura - não gera
            reserva, requisição ou registro de compra.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-b border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={() => void recarregar()}
            disabled={carregando}
            className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {carregando ? "Calculando..." : "Recarregar lista"}
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {erro ? (
            <p className="text-sm font-medium text-red-600">{erro}</p>
          ) : carregando && !resultado ? (
            <p className="text-sm text-slate-500">Calculando lista técnica...</p>
          ) : resultado?.estado === "nao_aplicavel_industrializacao" ? (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-sm font-medium text-blue-900">{resultado.mensagem}</p>
            </div>
          ) : resultado ? (
            <>
              {itensSemMaterial.length > 0 ? (
                <p className="mb-3 text-sm text-slate-500">
                  {itensSemMaterial.length} de {resultado.itensAnalisados.length} item(ns) sem consumo
                  de material (mão de obra):{" "}
                  {itensSemMaterial.map((item) => item.produtoRaizCodigo).join(", ")}
                </p>
              ) : null}

              {resultado.materiais.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum material consolidado.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
                      <th className="py-2 pr-3">Código</th>
                      <th className="py-2 pr-3">Descrição</th>
                      <th className="py-2 pr-3 text-right">Quantidade total</th>
                      <th className="py-2 pr-3">Unidade</th>
                      <th className="py-2 pr-3 text-right">Origens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.materiais.map((material) => {
                      const expandido = expandidos.has(material.materiaPrimaId);
                      return (
                        <Fragment key={material.materiaPrimaId}>
                          <tr
                            className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                            onClick={() => alternarExpandido(material.materiaPrimaId)}
                          >
                            <td className="py-2 pr-3 font-medium text-slate-900">
                              {expandido ? "▾" : "▸"} {material.materiaPrimaCodigo}
                            </td>
                            <td className="py-2 pr-3 text-slate-700">{material.materiaPrimaDescricao}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-slate-900">
                              {formatarQuantidade(material.quantidadeTotal)}
                            </td>
                            <td className="py-2 pr-3 text-slate-700">{material.unidadeBase}</td>
                            <td className="py-2 pr-3 text-right text-slate-500">
                              {material.origens.length}
                            </td>
                          </tr>
                          {expandido
                            ? material.origens.map((origem) => (
                                <tr
                                  key={origem.bomItemId}
                                  className="border-b border-slate-50 bg-slate-50/60 text-xs text-slate-600"
                                >
                                  <td className="py-1.5 pl-6 pr-3" colSpan={2}>
                                    {origem.produtoRaizCodigo} (qtd. solicitada{" "}
                                    {formatarQuantidade(origem.quantidadeSolicitada)}) —{" "}
                                    {origem.caminhoCodigos.join(" → ")}
                                    {origem.dimensoes ? ` · ${origem.dimensoes}` : ""}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums">
                                    {formatarQuantidade(origem.quantidadeConvertida)}
                                  </td>
                                  <td className="py-1.5 pr-3">{origem.unidadeLinha}</td>
                                  <td className="py-1.5 pr-3 text-right">
                                    {formatarQuantidade(origem.quantidadeLinha)} ×{" "}
                                    {origem.quantidadeAcumuladaProduto}
                                  </td>
                                </tr>
                              ))
                            : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={fechar}
            disabled={carregando}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
