"use client";
// Etapa 61 — componente compartilhado de conferência de matérias-primas
// (Adicionar/Editar/Remover material, consolidação por material+origem,
// seletor CI/CE/P, observação técnica, aviso de saída com alteração
// pendente). Extraído de src/app/design/pcp-momento-y-preview/page.tsx
// para ser usado tanto pelos 3 cenários mockados quanto pela página real
// da OF (/ordens/[id]) - mesma regra, uma única implementação.
//
// Este componente NUNCA grava nada: toda alteração vive só em memória
// (useState), e "onConfirmar" só é chamado depois de validar os itens -
// o que o chamador faz com o resultado (simular/gravar/mostrar como
// confirmado) é decisão exclusiva do chamador, nunca deste componente.
//
// Contrato de item confirmável (materiaPrimaId/origemFornecimento/
// quantidadeConfirmada/quantidadeCi/observacaoTecnica) já espelha de
// propósito o contrato real de confirmar_necessidades_momento_y
// (p_itens_confirmados), confirmado via pg_get_functiondef contra
// produção na investigação da Etapa 61 - quantidadeCe nunca é um campo
// independente, é sempre quantidadeConfirmada - quantidadeCi (ou 0 para
// origem "cliente").
//
// Catálogo de material para Adicionar/Substituir: dois modos.
// "lista" preserva literalmente o <Select> com um catálogo já carregado
// (usado pelos 3 cenários mockados, que têm um catálogo pequeno e
// fixo). "busca" usa o autocomplete real MateriaPrimaSearchInput
// (módulo roteiros, já em produção) para consulta por demanda - nunca
// carrega o catálogo inteiro de matérias-primas da empresa.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/modules/shared/ui/Button";
import { Badge } from "@/modules/shared/ui/Badge";
import { Card } from "@/modules/shared/ui/Card";
import { Field } from "@/modules/shared/ui/Field";
import { Select } from "@/modules/shared/ui/Select";
import { Modal } from "@/modules/shared/ui/Modal";
import { MateriaPrimaSearchInput, type MateriaPrimaResumo } from "@/modules/roteiros/components/MateriaPrimaSearchInput";

export type OrigemFornecimentoConferencia = "empresa" | "cliente";
export type DecisaoAbastecimentoConferencia = "CI" | "CE" | "P";

export interface MaterialCatalogoConferencia {
  readonly materiaPrimaId: string;
  readonly descricao: string;
  readonly materialEspecificacao: string;
  readonly formaDimensoes: string;
  readonly unidade: string;
}

export interface ItemConferenciaInicial {
  readonly materiaPrimaId: string;
  readonly descricao: string;
  readonly materialEspecificacao?: string;
  readonly formaDimensoes?: string;
  readonly unidade: string;
  readonly quantidade: number;
  readonly origemFornecimento?: OrigemFornecimentoConferencia;
  readonly observacaoTecnica?: string;
}

export type CatalogoConferenciaMateriasPrimas = { modo: "lista"; itens: readonly MaterialCatalogoConferencia[] } | { modo: "busca" };

export interface ItemConferenciaConfirmavel {
  readonly materiaPrimaId: string;
  readonly descricao: string;
  readonly unidade: string;
  readonly origemFornecimento: OrigemFornecimentoConferencia;
  readonly quantidadeConfirmada: number;
  readonly quantidadeCi: number;
  readonly quantidadeCe: number;
  readonly observacaoTecnica: string;
}

export interface ResumoConferenciaMateriasPrimas {
  readonly totalMateriais: number;
  readonly totalCi: number;
  readonly totalCe: number;
  readonly totalItensCliente: number;
}

interface ValoresOriginaisConferencia {
  quantidadeConfirmada: string;
  origemFornecimento: OrigemFornecimentoConferencia;
  decisaoAbastecimento: DecisaoAbastecimentoConferencia;
  quantidadeCi: string;
  observacaoTecnica: string;
}

interface ItemConferenciaMateriaPrima {
  id: string;
  materiaPrimaId: string;
  descricao: string;
  materialEspecificacao: string;
  formaDimensoes: string;
  unidade: string;
  quantidadeConfirmada: string;
  origemFornecimento: OrigemFornecimentoConferencia;
  decisaoAbastecimento: DecisaoAbastecimentoConferencia;
  quantidadeCi: string;
  observacaoTecnica: string;
  origemItem: "inicial" | "adicionado";
  substituiuDescricaoOriginal?: string;
  consolidado?: boolean;
  valoresOriginais?: ValoresOriginaisConferencia;
}

interface ErroItem {
  quantidade?: string;
  quantidadeCi?: string;
  ci?: string;
}

type ModalMaterialState = { modo: "adicionar" } | { modo: "editar"; itemId: string };

interface ConsolidacaoPendente {
  existenteId: string;
  existenteDescricao: string;
  quantidadeTotal: string;
  decisaoConsolidada: DecisaoAbastecimentoConferencia;
  quantidadeCiConsolidada: string;
  observacaoExistente: string;
  observacaoNova: string;
  origem: ModalMaterialState;
}

function paraNumero(valor: string): number {
  const numero = Number(valor.trim().replace(",", "."));
  return Number.isFinite(numero) ? numero : 0;
}

function paraTexto(valor: number): string {
  return String(valor).replace(".", ",");
}

function somarQuantidades(a: string, b: string): string {
  return paraTexto(paraNumero(a) + paraNumero(b));
}

// CI = quantidade atendida pelo estoque próprio - o valor que o PCP
// efetivamente decide/digita (CI -> a necessidade inteira; CE -> 0; P ->
// o que o PCP informou; cliente -> sempre 0, nunca gera CI próprio).
function quantidadeCiEfetiva(
  item: Pick<ItemConferenciaMateriaPrima, "origemFornecimento" | "quantidadeConfirmada" | "decisaoAbastecimento" | "quantidadeCi">,
): number {
  if (item.origemFornecimento === "cliente") return 0;
  const necessidade = paraNumero(item.quantidadeConfirmada);
  if (item.decisaoAbastecimento === "CE") return 0;
  if (item.decisaoAbastecimento === "CI") return necessidade;
  return paraNumero(item.quantidadeCi);
}

// CE = necessidade - CI efetivo, nunca um valor digitado à parte - mesma
// regra que confirmar_necessidades_momento_y aplica no servidor (CE
// nunca é um campo próprio do contrato real).
function quantidadeCeEfetiva(
  item: Pick<ItemConferenciaMateriaPrima, "origemFornecimento" | "quantidadeConfirmada" | "decisaoAbastecimento" | "quantidadeCi">,
): number {
  if (item.origemFornecimento === "cliente") return 0;
  const necessidade = paraNumero(item.quantidadeConfirmada);
  return Math.max(necessidade - quantidadeCiEfetiva(item), 0);
}

function construirValoresOriginais(item: ItemConferenciaMateriaPrima): ValoresOriginaisConferencia {
  return {
    quantidadeConfirmada: item.quantidadeConfirmada,
    origemFornecimento: item.origemFornecimento,
    decisaoAbastecimento: item.decisaoAbastecimento,
    quantidadeCi: item.quantidadeCi,
    observacaoTecnica: item.observacaoTecnica,
  };
}

function estaCorrigido(item: ItemConferenciaMateriaPrima): boolean {
  const original = item.valoresOriginais;
  if (!original) return false;
  if (item.quantidadeConfirmada !== original.quantidadeConfirmada) return true;
  if (item.origemFornecimento !== original.origemFornecimento) return true;
  if (item.observacaoTecnica !== original.observacaoTecnica) return true;
  if (item.origemFornecimento === "empresa") {
    if (item.decisaoAbastecimento !== original.decisaoAbastecimento) return true;
    if (item.decisaoAbastecimento === "P" && item.quantidadeCi !== original.quantidadeCi) return true;
  }
  return false;
}

function construirItensIniciais(itensIniciais: readonly ItemConferenciaInicial[]): ItemConferenciaMateriaPrima[] {
  return itensIniciais.map((inicial) => {
    const base: ItemConferenciaMateriaPrima = {
      id: `item-${inicial.materiaPrimaId}`,
      materiaPrimaId: inicial.materiaPrimaId,
      descricao: inicial.descricao,
      materialEspecificacao: inicial.materialEspecificacao ?? "",
      formaDimensoes: inicial.formaDimensoes ?? "",
      unidade: inicial.unidade,
      quantidadeConfirmada: paraTexto(inicial.quantidade),
      // Nunca inferida a partir de nenhuma outra informação da OF -
      // decisão arquitetural vigente (mesmo padrão que
      // confirmar_necessidades_momento_y aplica quando o campo vem
      // ausente). O PCP decide ativamente, trocando a origem quando
      // for o caso.
      origemFornecimento: inicial.origemFornecimento ?? "empresa",
      decisaoAbastecimento: "CE",
      quantidadeCi: "",
      observacaoTecnica: inicial.observacaoTecnica ?? "",
      origemItem: "inicial" as const,
    };
    return { ...base, valoresOriginais: construirValoresOriginais(base) };
  });
}

// Critério de equivalência aprovado: materiaPrimaId + origem de
// fornecimento + unidade de medida. decisaoAbastecimento (CI/CE/P)
// nunca entra aqui - é uma decisão de atendimento a ser agregada, não
// um critério de separação.
function encontrarDuplicado(
  itens: ItemConferenciaMateriaPrima[],
  materiaPrimaId: string,
  origemFornecimento: OrigemFornecimentoConferencia,
  unidade: string,
  ignorarId?: string,
): ItemConferenciaMateriaPrima | undefined {
  return itens.find(
    (it) => it.id !== ignorarId && it.materiaPrimaId === materiaPrimaId && it.origemFornecimento === origemFornecimento && it.unidade === unidade,
  );
}

interface ResultadoAgregacao {
  quantidadeTotal: string;
  decisaoConsolidada: DecisaoAbastecimentoConferencia;
  quantidadeCiConsolidada: string;
  ciTotal: number;
  ceTotal: number;
}

// Agrega duas linhas equivalentes preservando a distribuição CI/CE de
// cada uma - nunca descarta a decisão de nenhuma das duas.
function agregarAtendimento(
  a: Pick<ItemConferenciaMateriaPrima, "origemFornecimento" | "quantidadeConfirmada" | "decisaoAbastecimento" | "quantidadeCi">,
  b: Pick<ItemConferenciaMateriaPrima, "origemFornecimento" | "quantidadeConfirmada" | "decisaoAbastecimento" | "quantidadeCi">,
): ResultadoAgregacao {
  const ciTotal = quantidadeCiEfetiva(a) + quantidadeCiEfetiva(b);
  const ceTotal = quantidadeCeEfetiva(a) + quantidadeCeEfetiva(b);
  const quantidadeTotal = somarQuantidades(a.quantidadeConfirmada, b.quantidadeConfirmada);

  let decisaoConsolidada: DecisaoAbastecimentoConferencia;
  let quantidadeCiConsolidada = "";
  if (ciTotal > 0 && ceTotal > 0) {
    decisaoConsolidada = "P";
    quantidadeCiConsolidada = paraTexto(ciTotal);
  } else if (ciTotal > 0) {
    decisaoConsolidada = "CI";
  } else {
    decisaoConsolidada = "CE";
  }

  return { quantidadeTotal, decisaoConsolidada, quantidadeCiConsolidada, ciTotal, ceTotal };
}

function validarItem(item: ItemConferenciaMateriaPrima, saldoLivre: number | undefined): ErroItem {
  const erro: ErroItem = {};
  const quantidade = paraNumero(item.quantidadeConfirmada);
  if (!item.quantidadeConfirmada.trim() || quantidade <= 0) {
    erro.quantidade = "Informe uma quantidade confirmada maior que zero.";
    return erro;
  }

  if (item.origemFornecimento === "empresa") {
    if (item.decisaoAbastecimento === "P") {
      const ci = paraNumero(item.quantidadeCi);
      if (!item.quantidadeCi.trim() || ci <= 0 || ci >= quantidade) {
        erro.quantidadeCi = "Atendimento parcial exige quantidade CI maior que zero e menor que a quantidade confirmada.";
      }
    }
    const ciEfetivo = quantidadeCiEfetiva(item);
    if (saldoLivre !== undefined && ciEfetivo > saldoLivre) {
      erro.ci = `CI de ${paraTexto(ciEfetivo)} ${item.unidade} ultrapassa o saldo livre (livre: ${paraTexto(saldoLivre)} ${item.unidade}).`;
    }
  }

  return erro;
}

function calcularResumo(itens: ItemConferenciaMateriaPrima[]): ResumoConferenciaMateriasPrimas {
  let totalCi = 0;
  let totalCe = 0;
  let totalItensCliente = 0;

  for (const item of itens) {
    if (item.origemFornecimento === "cliente") {
      totalItensCliente += 1;
      continue;
    }
    totalCi += quantidadeCiEfetiva(item);
    totalCe += quantidadeCeEfetiva(item);
  }

  return { totalMateriais: itens.length, totalCi, totalCe, totalItensCliente };
}

function construirItensConfirmaveis(itens: ItemConferenciaMateriaPrima[]): readonly ItemConferenciaConfirmavel[] {
  return itens.map((item) => ({
    materiaPrimaId: item.materiaPrimaId,
    descricao: item.descricao,
    unidade: item.unidade,
    origemFornecimento: item.origemFornecimento,
    quantidadeConfirmada: paraNumero(item.quantidadeConfirmada),
    quantidadeCi: quantidadeCiEfetiva(item),
    quantidadeCe: quantidadeCeEfetiva(item),
    observacaoTecnica: item.observacaoTecnica,
  }));
}

const TITULO_DECISAO_ABASTECIMENTO: Record<DecisaoAbastecimentoConferencia, string> = {
  CI: "CI — Consumo Interno: atendido integralmente pelo estoque próprio.",
  CE: "CE — Compra Externa: nada do estoque próprio, compra integral.",
  P: "P — Parcial: parte pelo estoque, parte por compra (informe a quantidade de compra).",
};

// Seletor compacto de 3 vias - mesmo padrão já aprovado no protótipo,
// só disponível para origem='empresa'.
function SeletorAbastecimento({
  valor,
  onChange,
  ariaLabel,
}: {
  valor: DecisaoAbastecimentoConferencia;
  onChange: (valor: DecisaoAbastecimentoConferencia) => void;
  ariaLabel: string;
}) {
  const opcoes: DecisaoAbastecimentoConferencia[] = ["CI", "CE", "P"];
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex overflow-hidden rounded-[8px] border border-border">
      {opcoes.map((opcao, indice) => (
        <button
          key={opcao}
          type="button"
          title={TITULO_DECISAO_ABASTECIMENTO[opcao]}
          aria-pressed={valor === opcao}
          onClick={() => onChange(opcao)}
          className={[
            "h-9 w-10 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-focus-ring",
            indice > 0 ? "border-l border-border" : "",
            valor === opcao ? "bg-action-primary text-action-primary-text" : "bg-surface-elevated text-text-primary hover:bg-border-subtle",
          ].join(" ")}
        >
          {opcao}
        </button>
      ))}
    </div>
  );
}

export interface ConferenciaMateriasPrimasPcpProps {
  readonly itensIniciais: readonly ItemConferenciaInicial[];
  readonly catalogo: CatalogoConferenciaMateriasPrimas;
  /** Preview de saldo livre - sujeito a revalidação real no momento da confirmação. */
  readonly saldoLivrePorMaterial?: Readonly<Record<string, number>>;
  readonly notaSaldoLivre?: string;
  readonly textoBotaoConfirmar?: string;
  readonly onConfirmar: (resultado: { itens: readonly ItemConferenciaConfirmavel[]; resumo: ResumoConferenciaMateriasPrimas }) => void;
  /** Espelha o estado "há alteração não confirmada" para o chamador (ex.: guarda de troca de cenário/saída). */
  readonly onEditadoChange?: (editado: boolean) => void;
  /**
   * Etapa 63 — desabilita só o botão de confirmação (ex.: OF não
   * elegível, ou uma confirmação já está em andamento). Nunca afeta
   * Adicionar/Editar/Remover - a conferência em memória continua livre
   * mesmo quando a confirmação real ainda não pode ser enviada.
   */
  readonly confirmarDesabilitado?: boolean;
  /**
   * Etapa 64A — quando o chamador já mostra um título "Matérias-primas"
   * próprio (ex.: o Card da OF real), esconde só o <h2> interno para não
   * duplicar o título na tela - o subtítulo explicativo e o botão
   * "Adicionar material" continuam aparecendo normalmente. Os 3 cenários
   * mockados não passam este prop, então continuam exatamente como
   * antes (default true).
   */
  readonly mostrarTitulo?: boolean;
}

export function ConferenciaMateriasPrimasPcp({
  itensIniciais,
  catalogo,
  saldoLivrePorMaterial,
  notaSaldoLivre,
  textoBotaoConfirmar = "Confirmar matérias-primas",
  onConfirmar,
  onEditadoChange,
  confirmarDesabilitado = false,
  mostrarTitulo = true,
}: ConferenciaMateriasPrimasPcpProps) {
  const [itens, setItens] = useState<ItemConferenciaMateriaPrima[]>(() => construirItensIniciais(itensIniciais));
  const [editado, setEditado] = useState(false);
  const [errosPorItem, setErrosPorItem] = useState<Record<string, ErroItem>>({});
  const [notaConsolidacao, setNotaConsolidacao] = useState<string | null>(null);

  const [modalMaterial, setModalMaterial] = useState<ModalMaterialState | null>(null);
  const [materialSelecionadoId, setMaterialSelecionadoId] = useState("");
  const [materialBuscaSelecionado, setMaterialBuscaSelecionado] = useState<MateriaPrimaResumo | null>(null);
  const [quantidadeModal, setQuantidadeModal] = useState("");
  const [origemModal, setOrigemModal] = useState<OrigemFornecimentoConferencia>("empresa");
  const [decisaoModal, setDecisaoModal] = useState<DecisaoAbastecimentoConferencia>("CE");
  const [quantidadeCiModal, setQuantidadeCiModal] = useState("");
  const [observacaoModal, setObservacaoModal] = useState("");
  const [erroModal, setErroModal] = useState("");

  const [consolidacaoPendente, setConsolidacaoPendente] = useState<ConsolidacaoPendente | null>(null);
  const [observacaoRevisaoEscolhida, setObservacaoRevisaoEscolhida] = useState("");

  const proximoIdItemAdicionadoRef = useRef(0);

  useEffect(() => {
    onEditadoChange?.(editado);
    // onEditadoChange é só um espelho para o chamador - não deve disparar de novo por sua própria identidade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editado]);

  // Aviso de saída nativo (fechar aba/recarregar) enquanto houver
  // alteração não confirmada - regra preservada do protótipo (não
  // significa persistência real, é só o aviso do navegador).
  useEffect(() => {
    if (!editado) return;
    function handler(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editado]);

  function fecharModalMaterial() {
    setModalMaterial(null);
  }

  function abrirModalAdicionar() {
    setMaterialSelecionadoId("");
    setMaterialBuscaSelecionado(null);
    setQuantidadeModal("");
    setOrigemModal("empresa");
    setDecisaoModal("CE");
    setQuantidadeCiModal("");
    setObservacaoModal("");
    setErroModal("");
    setModalMaterial({ modo: "adicionar" });
  }

  function abrirModalEditar(itemId: string) {
    const item = itens.find((it) => it.id === itemId);
    if (!item) return;
    setMaterialSelecionadoId("");
    setMaterialBuscaSelecionado(null);
    setQuantidadeModal(item.quantidadeConfirmada);
    setOrigemModal(item.origemFornecimento);
    setDecisaoModal(item.decisaoAbastecimento);
    setQuantidadeCiModal(item.quantidadeCi);
    setObservacaoModal(item.observacaoTecnica);
    setErroModal("");
    setModalMaterial({ modo: "editar", itemId });
  }

  function removerItem(itemId: string) {
    setEditado(true);
    setItens((prev) => prev.filter((it) => it.id !== itemId));
    setErrosPorItem((prev) => {
      if (!prev[itemId]) return prev;
      const { [itemId]: _removido, ...resto } = prev;
      return resto;
    });
  }

  function adicionarItem(
    material: MaterialCatalogoConferencia,
    quantidade: string,
    origem: OrigemFornecimentoConferencia,
    decisao: DecisaoAbastecimentoConferencia,
    quantidadeCi: string,
    observacao: string,
  ) {
    const novoItem: ItemConferenciaMateriaPrima = {
      id: `item-adicionado-${material.materiaPrimaId}-${proximoIdItemAdicionadoRef.current++}`,
      materiaPrimaId: material.materiaPrimaId,
      descricao: material.descricao,
      materialEspecificacao: material.materialEspecificacao,
      formaDimensoes: material.formaDimensoes,
      unidade: material.unidade,
      quantidadeConfirmada: quantidade,
      origemFornecimento: origem,
      decisaoAbastecimento: decisao,
      quantidadeCi,
      observacaoTecnica: observacao,
      origemItem: "adicionado" as const,
    };
    setNotaConsolidacao(null);
    setEditado(true);
    setItens((prev) => [...prev, novoItem]);
  }

  function editarItem(
    itemId: string,
    novoMaterial: MaterialCatalogoConferencia | undefined,
    quantidade: string,
    origem: OrigemFornecimentoConferencia,
    decisao: DecisaoAbastecimentoConferencia,
    quantidadeCi: string,
    observacao: string,
  ) {
    const itemAtual = itens.find((it) => it.id === itemId);
    if (!itemAtual) return;

    let dadosMaterial = {
      materiaPrimaId: itemAtual.materiaPrimaId,
      descricao: itemAtual.descricao,
      materialEspecificacao: itemAtual.materialEspecificacao,
      formaDimensoes: itemAtual.formaDimensoes,
      unidade: itemAtual.unidade,
    };
    let substituiuDescricaoOriginal = itemAtual.substituiuDescricaoOriginal;

    if (novoMaterial && novoMaterial.materiaPrimaId !== itemAtual.materiaPrimaId) {
      dadosMaterial = { ...novoMaterial };
      substituiuDescricaoOriginal = itemAtual.substituiuDescricaoOriginal ?? itemAtual.descricao;
    }

    const itemEditado: ItemConferenciaMateriaPrima = {
      ...itemAtual,
      ...dadosMaterial,
      quantidadeConfirmada: quantidade,
      origemFornecimento: origem,
      decisaoAbastecimento: decisao,
      quantidadeCi,
      observacaoTecnica: observacao,
      substituiuDescricaoOriginal,
    };

    setNotaConsolidacao(null);
    setEditado(true);
    setItens((prev) => prev.map((it) => (it.id === itemId ? itemEditado : it)));
    setErrosPorItem((prev) => {
      if (!prev[itemId]) return prev;
      const { [itemId]: _removido, ...resto } = prev;
      return resto;
    });
  }

  function aplicarConsolidacao(
    existenteId: string,
    existenteDescricao: string,
    resultado: Pick<ConsolidacaoPendente, "quantidadeTotal" | "decisaoConsolidada" | "quantidadeCiConsolidada">,
    observacaoFinal: string,
    origemChamada: ModalMaterialState,
  ) {
    setEditado(true);
    setItens((prev) => {
      const base = origemChamada.modo === "editar" ? prev.filter((it) => it.id !== origemChamada.itemId) : prev;
      return base.map((it) =>
        it.id === existenteId
          ? {
              ...it,
              quantidadeConfirmada: resultado.quantidadeTotal,
              decisaoAbastecimento: resultado.decisaoConsolidada,
              quantidadeCi: resultado.quantidadeCiConsolidada,
              observacaoTecnica: observacaoFinal,
              consolidado: true,
            }
          : it,
      );
    });
    setNotaConsolidacao(`Consolidado com "${existenteDescricao}" (mesmo material, mesma origem e mesma unidade).`);
    if (origemChamada.modo === "editar") {
      setErrosPorItem((prev) => {
        if (!prev[origemChamada.itemId]) return prev;
        const { [origemChamada.itemId]: _removido, ...resto } = prev;
        return resto;
      });
    }
  }

  const materialSelecionadoCatalogo: MaterialCatalogoConferencia | undefined =
    catalogo.modo === "lista"
      ? catalogo.itens.find((m) => m.materiaPrimaId === materialSelecionadoId)
      : materialBuscaSelecionado
        ? {
            materiaPrimaId: materialBuscaSelecionado.id,
            descricao: materialBuscaSelecionado.descricao,
            materialEspecificacao: materialBuscaSelecionado.codigo ?? "",
            formaDimensoes: "",
            unidade: materialBuscaSelecionado.unidade,
          }
        : undefined;

  function confirmarModalMaterial() {
    if (!modalMaterial) return;

    const quantidade = paraNumero(quantidadeModal);
    if (!quantidadeModal.trim() || quantidade <= 0) {
      setErroModal("Informe uma quantidade maior que zero.");
      return;
    }

    if (origemModal === "empresa") {
      if (decisaoModal === "P") {
        const ci = paraNumero(quantidadeCiModal);
        if (!quantidadeCiModal.trim() || ci <= 0 || ci >= quantidade) {
          setErroModal("Atendimento parcial exige quantidade CI maior que zero e menor que a quantidade confirmada.");
          return;
        }
      }

      const ciEfetivoModal = decisaoModal === "CI" ? quantidade : decisaoModal === "CE" ? 0 : paraNumero(quantidadeCiModal);
      const materiaPrimaIdParaSaldo =
        modalMaterial.modo === "adicionar" ? materialSelecionadoCatalogo?.materiaPrimaId : itens.find((it) => it.id === modalMaterial.itemId)?.materiaPrimaId;
      const saldoLivreEfetivoModal = materiaPrimaIdParaSaldo ? saldoLivrePorMaterial?.[materiaPrimaIdParaSaldo] : undefined;
      if (saldoLivreEfetivoModal !== undefined && ciEfetivoModal > saldoLivreEfetivoModal) {
        setErroModal(
          `CI de ${paraTexto(ciEfetivoModal)} ultrapassa o saldo livre (livre: ${paraTexto(saldoLivreEfetivoModal)}).`,
        );
        return;
      }
    }

    let materiaPrimaIdPretendida: string;
    let unidadePretendida: string;
    let materialParaAdicionar: MaterialCatalogoConferencia | undefined;

    if (modalMaterial.modo === "adicionar") {
      materialParaAdicionar = materialSelecionadoCatalogo;
      if (!materialParaAdicionar) {
        setErroModal("Selecione um material do cadastro.");
        return;
      }
      materiaPrimaIdPretendida = materialParaAdicionar.materiaPrimaId;
      unidadePretendida = materialParaAdicionar.unidade;
    } else {
      const itemAtual = itens.find((it) => it.id === modalMaterial.itemId);
      if (!itemAtual) return;
      const novoMaterial =
        materialSelecionadoCatalogo && materialSelecionadoCatalogo.materiaPrimaId !== itemAtual.materiaPrimaId ? materialSelecionadoCatalogo : undefined;
      materiaPrimaIdPretendida = novoMaterial?.materiaPrimaId ?? itemAtual.materiaPrimaId;
      unidadePretendida = novoMaterial?.unidade ?? itemAtual.unidade;
    }

    const existente = encontrarDuplicado(
      itens,
      materiaPrimaIdPretendida,
      origemModal,
      unidadePretendida,
      modalMaterial.modo === "editar" ? modalMaterial.itemId : undefined,
    );

    if (existente) {
      const itemPretendidoVirtual = {
        origemFornecimento: origemModal,
        quantidadeConfirmada: quantidadeModal,
        decisaoAbastecimento: decisaoModal,
        quantidadeCi: quantidadeCiModal,
      };
      const agregado = agregarAtendimento(existente, itemPretendidoVirtual);

      const saldoLivreDestino = saldoLivrePorMaterial?.[existente.materiaPrimaId];
      if (saldoLivreDestino !== undefined && agregado.ciTotal > saldoLivreDestino) {
        setErroModal(
          `A soma com "${existente.descricao}" resultaria em CI de ${paraTexto(agregado.ciTotal)} ${unidadePretendida}, que ultrapassa o saldo livre (livre: ${paraTexto(saldoLivreDestino)} ${unidadePretendida}). Ajuste o atendimento antes de salvar.`,
        );
        return;
      }

      const obsExistente = existente.observacaoTecnica.trim();
      const obsNova = observacaoModal.trim();

      if (obsExistente !== obsNova) {
        setModalMaterial(null);
        setObservacaoRevisaoEscolhida("");
        setConsolidacaoPendente({
          existenteId: existente.id,
          existenteDescricao: existente.descricao,
          quantidadeTotal: agregado.quantidadeTotal,
          decisaoConsolidada: agregado.decisaoConsolidada,
          quantidadeCiConsolidada: agregado.quantidadeCiConsolidada,
          observacaoExistente: existente.observacaoTecnica,
          observacaoNova: observacaoModal,
          origem: modalMaterial,
        });
        return;
      }

      aplicarConsolidacao(existente.id, existente.descricao, agregado, observacaoModal, modalMaterial);
      setModalMaterial(null);
      return;
    }

    if (modalMaterial.modo === "adicionar") {
      if (!materialParaAdicionar) {
        setErroModal("Selecione um material do cadastro.");
        return;
      }
      adicionarItem(materialParaAdicionar, quantidadeModal, origemModal, decisaoModal, quantidadeCiModal, observacaoModal);
      setModalMaterial(null);
      return;
    }

    editarItem(modalMaterial.itemId, materialSelecionadoCatalogo, quantidadeModal, origemModal, decisaoModal, quantidadeCiModal, observacaoModal);
    setModalMaterial(null);
  }

  function solicitarCancelarRevisaoConsolidacao() {
    const origem = consolidacaoPendente?.origem;
    setConsolidacaoPendente(null);
    if (origem) {
      setErroModal("");
      setModalMaterial(origem);
    }
  }

  function confirmarRevisaoConsolidacao() {
    if (!consolidacaoPendente) return;
    aplicarConsolidacao(
      consolidacaoPendente.existenteId,
      consolidacaoPendente.existenteDescricao,
      consolidacaoPendente,
      observacaoRevisaoEscolhida,
      consolidacaoPendente.origem,
    );
    setConsolidacaoPendente(null);
  }

  function confirmar() {
    const novosErros: Record<string, ErroItem> = {};
    let valido = true;

    for (const item of itens) {
      const erro = validarItem(item, saldoLivrePorMaterial?.[item.materiaPrimaId]);
      if (erro.quantidade || erro.quantidadeCi || erro.ci) {
        novosErros[item.id] = erro;
        valido = false;
      }
    }

    setErrosPorItem(novosErros);
    if (!valido) return;

    onConfirmar({ itens: construirItensConfirmaveis(itens), resumo: calcularResumo(itens) });
  }

  const resumo = calcularResumo(itens);

  const itemEmEdicao = modalMaterial?.modo === "editar" ? itens.find((it) => it.id === modalMaterial.itemId) : undefined;
  const descricaoEfetiva = materialSelecionadoCatalogo?.descricao ?? itemEmEdicao?.descricao;
  const especificacaoEfetiva = materialSelecionadoCatalogo
    ? [materialSelecionadoCatalogo.materialEspecificacao, materialSelecionadoCatalogo.formaDimensoes].filter(Boolean).join(" · ")
    : itemEmEdicao
      ? [itemEmEdicao.materialEspecificacao, itemEmEdicao.formaDimensoes].filter(Boolean).join(" · ")
      : undefined;
  const unidadeEfetiva = materialSelecionadoCatalogo?.unidade ?? itemEmEdicao?.unidade ?? "";
  const materiaPrimaIdEfetiva = materialSelecionadoCatalogo?.materiaPrimaId ?? itemEmEdicao?.materiaPrimaId;
  const saldoLivreEfetivo = materiaPrimaIdEfetiva ? saldoLivrePorMaterial?.[materiaPrimaIdEfetiva] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-md border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
          <div>
            {mostrarTitulo ? <h2 className="text-sm font-bold text-text-primary">Matérias-primas</h2> : null}
            <p className="mt-0.5 text-xs text-text-secondary">
              Cópia de trabalho desta OF, a partir do roteiro vigente — altera só esta OF, nunca o roteiro nem outras OFs que o usem.
            </p>
          </div>
          <button
            type="button"
            onClick={abrirModalAdicionar}
            className="h-9 rounded-md border border-border px-3 text-xs font-semibold text-text-primary transition hover:bg-border-subtle"
          >
            Adicionar material
          </button>
        </div>

        {notaConsolidacao ? (
          <div className="border-b border-status-info-border bg-status-info-bg px-4 py-2.5 text-xs font-semibold text-status-info-text">
            {notaConsolidacao}
          </div>
        ) : null}

        {itens.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-text-secondary">
            Nenhum material em conferência. Use Adicionar material caso, excepcionalmente, esta OF precise de algum insumo não previsto no roteiro.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border-subtle bg-border-subtle text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-2 font-semibold">Material</th>
                  <th className="px-4 py-2 font-semibold">Quantidade</th>
                  <th className="px-4 py-2 font-semibold">Unidade</th>
                  <th className="px-4 py-2 font-semibold">Origem</th>
                  <th className="px-4 py-2 font-semibold">CE calculado</th>
                  <th className="px-4 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {itens.map((item) => {
                  const erro = errosPorItem[item.id];
                  const ce = quantidadeCeEfetiva(item);
                  const corrigido = estaCorrigido(item);

                  return (
                    <tr key={item.id} className="hover:bg-border-subtle">
                      <td className="px-4 py-3 align-top font-medium text-text-primary">
                        {item.descricao}
                        {item.materialEspecificacao || item.formaDimensoes ? (
                          <p className="mt-1 text-xs text-text-disabled">
                            {[item.materialEspecificacao, item.formaDimensoes].filter(Boolean).join(" · ")}
                          </p>
                        ) : null}
                        {item.origemItem === "adicionado" || item.substituiuDescricaoOriginal || corrigido || item.consolidado ? (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {item.origemItem === "adicionado" ? <Badge variant="neutral">Adicionado</Badge> : null}
                            {item.substituiuDescricaoOriginal ? <Badge variant="neutral">Substituiu: {item.substituiuDescricaoOriginal}</Badge> : null}
                            {corrigido ? <Badge variant="warning">Corrigido</Badge> : null}
                            {item.consolidado ? <Badge variant="neutral">Consolidado</Badge> : null}
                          </div>
                        ) : null}
                        {item.observacaoTecnica ? <p className="mt-1 text-xs italic text-text-secondary">Obs.: {item.observacaoTecnica}</p> : null}
                        {erro ? <p className="mt-1 text-xs font-semibold text-status-danger-text">{erro.quantidade ?? erro.quantidadeCi ?? erro.ci}</p> : null}
                      </td>
                      <td className="px-4 py-3 align-top text-text-primary">{item.quantidadeConfirmada}</td>
                      <td className="px-4 py-3 align-top text-text-secondary">{item.unidade}</td>
                      <td className="px-4 py-3 align-top">
                        {item.origemFornecimento === "cliente" ? <Badge variant="warning">Cliente</Badge> : <Badge variant="neutral">Empresa</Badge>}
                      </td>
                      <td className="px-4 py-3 align-top text-text-primary">{item.origemFornecimento === "cliente" ? "—" : `${paraTexto(ce)} ${item.unidade}`}</td>
                      <td className="whitespace-nowrap px-4 py-3 align-top text-right">
                        <button type="button" onClick={() => abrirModalEditar(item.id)} className="mr-3 text-xs font-semibold text-action-primary hover:underline">
                          Editar
                        </button>
                        <button type="button" onClick={() => removerItem(item.id)} className="text-xs font-semibold text-status-danger-text hover:underline">
                          Remover
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Card title="Resumo antes da confirmação">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <ResumoItemConferencia rotulo="Materiais" valor={String(resumo.totalMateriais)} />
          <ResumoItemConferencia rotulo="CI a reservar" valor={paraTexto(resumo.totalCi)} />
          <ResumoItemConferencia rotulo="CE a requisitar" valor={paraTexto(resumo.totalCe)} />
          <ResumoItemConferencia rotulo="Itens do cliente" valor={String(resumo.totalItensCliente)} />
        </div>
        {notaSaldoLivre ? <p className="mt-4 text-[11.5px] text-text-secondary">{notaSaldoLivre}</p> : null}
        <p className="mt-2 text-[11.5px] text-text-secondary">
          Confirmar as matérias-primas não significa recebimento físico do material — apenas a decisão técnica/CI-CE do PCP para esta OF.
        </p>
        <div className="mt-4">
          <Button onClick={confirmar} disabled={confirmarDesabilitado}>
            {textoBotaoConfirmar}
          </Button>
        </div>
      </Card>

      <Modal
        open={modalMaterial !== null}
        onClose={fecharModalMaterial}
        title={modalMaterial?.modo === "editar" ? "Editar material" : "Adicionar material"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={fecharModalMaterial}>
              Cancelar
            </Button>
            <Button onClick={confirmarModalMaterial}>{modalMaterial?.modo === "editar" ? "Salvar edição" : "Adicionar"}</Button>
          </>
        }
      >
        <div className="flex min-h-[320px] flex-col gap-3.5 text-left">
          {modalMaterial?.modo === "editar" && descricaoEfetiva ? (
            <div className="rounded-[10px] border border-border bg-surface-elevated px-3.5 py-2.5">
              <p className="text-[13.5px] font-semibold text-text-primary">{descricaoEfetiva}</p>
              {especificacaoEfetiva ? <p className="mt-0.5 text-[12px] text-text-secondary">{especificacaoEfetiva}</p> : null}
              {materialSelecionadoCatalogo ? (
                <p className="mt-1.5 text-[11px] font-semibold text-status-info-text">Novo material selecionado — substituirá o atual ao salvar.</p>
              ) : null}
            </div>
          ) : null}

          {catalogo.modo === "lista" ? (
            <Select
              label={modalMaterial?.modo === "editar" ? "Trocar por outro material (opcional)" : "Material do cadastro"}
              value={materialSelecionadoId}
              placeholder={modalMaterial?.modo === "editar" ? undefined : "Selecione um material"}
              onChange={(event) => setMaterialSelecionadoId(event.target.value)}
              options={[
                ...(modalMaterial?.modo === "editar" ? [{ value: "", label: "Manter material atual" }] : []),
                ...catalogo.itens.map((m) => ({
                  value: m.materiaPrimaId,
                  label: [m.descricao, m.materialEspecificacao, m.formaDimensoes].filter(Boolean).join(" — "),
                })),
              ]}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-text-primary">
                {modalMaterial?.modo === "editar" ? "Trocar por outro material (opcional)" : "Material do cadastro"}
              </span>
              <MateriaPrimaSearchInput
                value={materialBuscaSelecionado}
                onChange={setMaterialBuscaSelecionado}
                placeholder={modalMaterial?.modo === "editar" ? "Buscar material para substituir" : "Buscar matéria-prima"}
              />
              {modalMaterial?.modo === "editar" ? (
                <span className="text-[11px] text-text-secondary">Deixe em branco para manter o material atual.</span>
              ) : null}
            </div>
          )}

          <div className="flex items-end gap-2">
            <Field label="Quantidade" value={quantidadeModal} onChange={(event) => setQuantidadeModal(event.target.value)} placeholder="0" className="w-[110px]" />
            <span className="pb-2.5 text-[12.5px] text-text-secondary">{unidadeEfetiva}</span>
          </div>

          <Select
            label="Origem do fornecimento"
            value={origemModal}
            onChange={(event) => setOrigemModal(event.target.value as OrigemFornecimentoConferencia)}
            options={[
              { value: "empresa", label: "Empresa" },
              { value: "cliente", label: "Cliente" },
            ]}
          />

          {origemModal === "empresa" ? (
            <div className="flex flex-col gap-2">
              <span className="text-[12.5px] font-semibold text-text-primary">Atendimento</span>
              <div className="flex flex-wrap items-end gap-2.5">
                <SeletorAbastecimento valor={decisaoModal} onChange={setDecisaoModal} ariaLabel="Decisão de abastecimento" />
                {decisaoModal === "P" ? (
                  <Field label="Quantidade CI (estoque)" value={quantidadeCiModal} onChange={(event) => setQuantidadeCiModal(event.target.value)} placeholder="0" className="w-[130px]" />
                ) : null}
              </div>
              {decisaoModal === "P" ? (
                <span className="text-[11px] text-text-secondary">
                  CE = necessidade − CI = {paraTexto(Math.max(paraNumero(quantidadeModal) - paraNumero(quantidadeCiModal), 0))} {unidadeEfetiva}
                </span>
              ) : null}
              {saldoLivreEfetivo !== undefined ? (
                <span className="text-[11px] text-text-secondary">
                  Saldo livre em estoque: {paraTexto(saldoLivreEfetivo)} {unidadeEfetiva}
                  {notaSaldoLivre ? " (preview — sujeito a revalidação na confirmação)" : ""}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-[12px] text-text-secondary">Material fornecido pelo cliente — não há CI/CE para este item.</p>
          )}

          <Field label="Observação técnica (opcional)" value={observacaoModal} onChange={(event) => setObservacaoModal(event.target.value)} placeholder="Ex.: motivo da correção" />

          {erroModal ? <span className="text-[11.5px] text-status-danger-text">{erroModal}</span> : null}
        </div>
      </Modal>

      <Modal
        open={consolidacaoPendente !== null}
        onClose={solicitarCancelarRevisaoConsolidacao}
        title="Revisar observação técnica"
        footer={
          <>
            <Button variant="secondary" onClick={solicitarCancelarRevisaoConsolidacao}>
              Cancelar
            </Button>
            <Button onClick={confirmarRevisaoConsolidacao}>Confirmar consolidação</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5 text-left">
          <p className="text-[12.5px] text-text-secondary">
            Este material já existe na proposta (&quot;{consolidacaoPendente?.existenteDescricao}&quot;). As observações técnicas são diferentes — escolha ou escreva qual deve valer para a
            linha consolidada.
          </p>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setObservacaoRevisaoEscolhida(consolidacaoPendente?.observacaoExistente ?? "")}
              className="rounded-[10px] border border-border bg-surface-elevated px-3.5 py-2.5 text-left text-[12.5px] transition hover:bg-border-subtle"
            >
              <span className="block font-semibold text-text-primary">Usar a observação existente</span>
              <span className="text-text-secondary">{consolidacaoPendente?.observacaoExistente || "(vazia)"}</span>
            </button>
            <button
              type="button"
              onClick={() => setObservacaoRevisaoEscolhida(consolidacaoPendente?.observacaoNova ?? "")}
              className="rounded-[10px] border border-border bg-surface-elevated px-3.5 py-2.5 text-left text-[12.5px] transition hover:bg-border-subtle"
            >
              <span className="block font-semibold text-text-primary">Usar a observação nova</span>
              <span className="text-text-secondary">{consolidacaoPendente?.observacaoNova || "(vazia)"}</span>
            </button>
          </div>

          <Field
            label="Observação consolidada"
            value={observacaoRevisaoEscolhida}
            onChange={(event) => setObservacaoRevisaoEscolhida(event.target.value)}
            placeholder="Escreva a observação final para esta linha, ou escolha uma das duas acima"
          />
        </div>
      </Modal>
    </div>
  );
}

function ResumoItemConferencia({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-secondary">{rotulo}</span>
      <span className="text-[13px] text-text-primary">{valor}</span>
    </div>
  );
}
