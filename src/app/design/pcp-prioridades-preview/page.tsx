"use client";

// AMBIENTE DE DEMONSTRAÇÃO — protótipo visual/funcional mockado da
// reformulação da Lista de Prioridades do PCP. Rota isolada
// (/design/pcp-prioridades-preview), sem relação com a rota operacional
// real (/pcp/prioridades, Etapa A em produção - intocada). Nenhuma
// chamada ao Supabase, nenhuma Server Action real, nenhum dado real de
// projeto/cliente/OF. Toda interação (liberar, mover prioridade,
// solicitar cálculo) é simulada em memória (useState), nunca persistida.
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { ModuleBackButton } from "@/modules/shared/navigation/ModuleBackButton";
import { Button } from "@/modules/shared/ui/Button";
import { Badge } from "@/modules/shared/ui/Badge";
import { Field } from "@/modules/shared/ui/Field";
import { Select } from "@/modules/shared/ui/Select";
import { Modal } from "@/modules/shared/ui/Modal";
import { EmptyState } from "@/modules/shared/ui/EmptyState";
import { Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell } from "@/modules/shared/ui/Table";
// Momento Y - mesmo combobox de busca paginada já usado para vincular
// matéria-prima num roteiro (MateriaPrimaSearchInput), reaproveitado aqui
// para o seletor "Adicionar/Substituir material" - busca puramente local
// contra o catálogo mockado (nenhuma chamada real), mas a MECÂNICA de
// busca (campo único, debounce, navegação por teclado, destaque do item
// ativo) é a mesma do cadastro real, não uma reinvenção.
import { DropdownBuscaPaginada } from "@/modules/shared/components/DropdownBuscaPaginada";
import { useBuscaPaginada } from "@/modules/shared/hooks/useBuscaPaginada";
import type { DragEvent, ReactNode } from "react";
import {
  PROJETOS_AGUARDANDO_MOCK,
  PROJETOS_LIBERADOS_MOCK,
  LABEL_NATUREZA_COMERCIAL,
  LABEL_NATUREZA_OPERACAO,
  CATALOGO_GENERICO_MATERIA_PRIMA,
  type ProjetoAguardandoMock,
  type ProjetoLiberadoMock,
  type ConfiabilidadePrevisao,
  type SituacaoPrazo,
  type SituacaoMaterialCompra,
  type MaterialRequisicaoMock,
  type ObservacaoPcpMock,
  type OrdemFabricacaoMock,
  type OperacaoProducaoMock,
  type RevisaoOperacaoMock,
  type RevisaoObservacaoOperacaoMock,
  type MateriaPrimaOfMock,
  type MaterialCatalogoMock,
  type OrigemFornecimento,
  type NaturezaComercial,
  type SituacaoLiberacaoOf,
  type CoberturaOfsMock,
  calcularCoberturaOfs,
  calcularPrevisaoOperacional,
  calcularSituacaoPrazo,
  calcularDiferencaDias,
} from "./mockData";

type Area = "aguardando" | "liberados";
type Visao =
  | { tipo: "lista" }
  | { tipo: "resumo"; projetoId: string }
  | { tipo: "ofs"; projetoId: string }
  | { tipo: "ops"; projetoId: string; ofId: string }
  | { tipo: "impressao"; projetoId: string; ofId: string };

function formatarHoras(horas: number | null): string {
  if (horas === null) return "Não iniciado";
  return `${horas.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
}

// --- Rascunho da cópia operacional (OF aberta) - nunca escreve no estado
// compartilhado até "Salvar alterações"; X e Z nunca entram aqui (regra 4).
//
// Refinamento (Adicionar/Editar/Remover OP) - mesma mudança estrutural já
// aplicada a materiais: de um mapa 1-para-1 com ordem.operacoes para uma
// lista de trabalho, porque agora precisa suportar operações adicionadas
// nesta revisão (sem OP original correspondente) e remoção. X (tempoXComercial)
// e Z (tempoZRealizado) são carregados junto mas NUNCA editados por este
// modelo - só repassados como vieram do roteiro (ou, para OP nova, X nasce
// igual ao Y informado, já que não existe referência comercial para uma
// operação que o PCP está incluindo agora).
interface RascunhoOperacaoItem {
  itemId: string;
  // id da operação original em ordem.operacoes da qual esta linha descende
  // - null quando a operação foi adicionada nesta revisão.
  origemOpId: string | null;
  descricao: string;
  sequencia: string;
  recurso: string;
  tempoYPcp: string;
  // Texto livre editável "10, 20" - convertido para number[] só ao validar/salvar.
  dependeDeTexto: string;
  tempoXComercial: number;
  tempoZRealizado: number | null;
  horasMaquina?: number;
  horasColaborador?: number;
  ferramentaEspecial?: string;
  tratamento?: string;
  terceirizada: boolean;
  condicaoLiberacao: string;
  semRecursoProdutivo?: boolean;
  revisoes: RevisaoOperacaoMock[];
  origemItem: "roteiro" | "adicionada";
  // Observação X/Y (mesma separação já aprovada para o tempo) - texto
  // atualmente efetivo e editável no rascunho (Y se já revisado, senão X).
  observacaoTexto: string;
  // X - observação original do roteiro (bom_operacoes.observacoes), só
  // leitura; null para operação adicionada pelo PCP (sem roteiro de origem).
  observacaoRoteiroOriginal: string | null;
  revisoesObservacao: RevisaoObservacaoOperacaoMock[];
}

interface ErroOperacaoItem {
  descricao?: string;
  sequencia?: string;
  recurso?: string;
  tempoY?: string;
  dependeDe?: string;
}

function parseDependeDe(texto: string): number[] {
  return texto
    .split(",")
    .map((parte) => parte.trim())
    .filter((parte) => parte.length > 0)
    .map((parte) => Number(parte))
    .filter((numero) => Number.isFinite(numero));
}

function construirItemOperacaoDeProposta(op: OperacaoProducaoMock): RascunhoOperacaoItem {
  return {
    itemId: op.id,
    origemOpId: op.id,
    descricao: op.descricao,
    sequencia: String(op.sequencia),
    recurso: op.recurso,
    tempoYPcp: String(op.tempoYPcp).replace(".", ","),
    dependeDeTexto: op.dependeDe.join(", "),
    tempoXComercial: op.tempoXComercial,
    tempoZRealizado: op.tempoZRealizado,
    horasMaquina: op.horasMaquina,
    horasColaborador: op.horasColaborador,
    ferramentaEspecial: op.ferramentaEspecial,
    tratamento: op.tratamento,
    terceirizada: op.terceirizada,
    condicaoLiberacao: op.condicaoLiberacao,
    semRecursoProdutivo: op.semRecursoProdutivo,
    revisoes: op.revisoes,
    origemItem: "roteiro",
    observacaoTexto: (op.revisoesObservacao.length > 0 ? op.observacaoPcp : op.observacaoRoteiro) ?? "",
    observacaoRoteiroOriginal: op.observacaoRoteiro ?? null,
    revisoesObservacao: op.revisoesObservacao,
  };
}

// "Reescrever" uma operação com execução já registrada (Z preenchido) é
// proibido (regra 3 do pedido) - só o tempo Y continua revisável para uma
// OP já executada, igual ao comportamento já aprovado antes deste
// refinamento; descrição/sequência/recurso/dependências ficam travados.
function operacaoJaExecutada(item: RascunhoOperacaoItem): boolean {
  return item.tempoZRealizado !== null;
}

function validarOperacaoItem(item: RascunhoOperacaoItem, todasOperacoes: RascunhoOperacaoItem[]): ErroOperacaoItem {
  const erro: ErroOperacaoItem = {};
  if (!item.descricao.trim()) erro.descricao = "Informe a descrição da operação.";

  const sequencia = Number(item.sequencia);
  if (!item.sequencia.trim() || !Number.isFinite(sequencia) || sequencia <= 0) {
    erro.sequencia = "Sequência inválida.";
  }

  if (!item.recurso.trim()) erro.recurso = "Informe o recurso.";

  const tempoY = Number(item.tempoYPcp.replace(",", "."));
  if (!item.tempoYPcp.trim() || !Number.isFinite(tempoY) || tempoY <= 0) {
    erro.tempoY = "Tempo Y inválido.";
  }

  const partesDependeDe = item.dependeDeTexto
    .split(",")
    .map((parte) => parte.trim())
    .filter((parte) => parte.length > 0);
  const dependeDeTextoValido = partesDependeDe.every((parte) => Number.isFinite(Number(parte)));
  if (!dependeDeTextoValido) {
    erro.dependeDe = "Use números de sequência separados por vírgula (ex.: 10, 20).";
  } else {
    const dependencias = parseDependeDe(item.dependeDeTexto);
    if (Number.isFinite(sequencia) && dependencias.includes(sequencia)) {
      erro.dependeDe = "Uma operação não pode depender de si mesma.";
    } else {
      const sequenciasExistentes = new Set(
        todasOperacoes.filter((op) => op.itemId !== item.itemId).map((op) => Number(op.sequencia)),
      );
      const inexistente = dependencias.find((seq) => !sequenciasExistentes.has(seq));
      if (inexistente !== undefined) {
        erro.dependeDe = `Nenhuma operação com sequência ${inexistente} nesta OF.`;
      }
    }
  }

  return erro;
}
// Momento Y - item de trabalho da conferência de matéria-prima. Lista (não
// mais um mapa 1-para-1 com ordem.materiaPrima) porque precisa suportar
// substituir, adicionar e consolidar - uma linha pode não ter mais nenhuma
// correspondência direta com nenhum item original do roteiro.
//
// Tabela compacta (revisão aprovada): a antiga apresentação CI/CE em dois
// campos numéricos independentes virou um seletor de três vias -
// decisaoAbastecimento ('CI'|'CE'|'P') + quantidadeCompra (só editável e só
// lida quando 'P'). Os dados e as regras de CI/CE não mudaram - CI/CE
// continuam calculáveis a qualquer momento (ver quantidadeCiEfetiva/
// quantidadeCompraEfetiva abaixo), só a FORMA DE ENTRADA mudou. Para
// origem='cliente', decisaoAbastecimento/quantidadeCompra nunca são lidos
// nem exibidos (regra 5 do pedido - nenhuma escolha fictícia exigida).
type DecisaoAbastecimento = "CI" | "CE" | "P";

interface RascunhoMaterialItem {
  itemId: string;
  // id do item original em ordem.materiaPrima do qual esta linha descende
  // (para mapear de volta ao salvar) - null quando a linha foi adicionada
  // nesta conferência, sem nenhum item original correspondente.
  origemMpId: string | null;
  materiaPrimaId: string;
  descricao: string;
  materialEspecificacao: string;
  formaDimensoes: string;
  unidade: string;
  quantidadeConfirmada: string;
  origemFornecimento: OrigemFornecimento;
  decisaoAbastecimento: DecisaoAbastecimento;
  quantidadeCompra: string;
  ajusteOperacional: string;
  origemItem: "roteiro" | "adicionado";
  substituiuDescricaoOriginal?: string;
}
interface RascunhoOfState {
  ofId: string;
  operacoes: RascunhoOperacaoItem[];
  materiais: RascunhoMaterialItem[];
  // Ambas as listas podem mudar de FORMATO (adicionar/editar/remover,
  // operações inclusive) - um flag explícito por lista, setado em toda
  // mutação e zerado só ao reconstruir o rascunho, é mais robusto que
  // recomparar a lista inteira contra ordem.* a cada render.
  operacoesEditado: boolean;
  materiaisEditado: boolean;
}

interface ErroItemMaterial {
  quantidade?: string;
  quantidadeCompra?: string;
}

function paraNumeroMaterial(valor: string): number {
  const numero = Number(valor.trim().replace(",", "."));
  return Number.isFinite(numero) ? numero : 0;
}

function paraTextoMaterial(valor: number): string {
  return String(valor).replace(".", ",");
}

function somarQuantidadesMaterial(a: string, b: string): string {
  return paraTextoMaterial(paraNumeroMaterial(a) + paraNumeroMaterial(b));
}

// Quantidade efetivamente destinada à compra - derivada da decisão, nunca
// um segundo valor que possa divergir dela. CI -> 0; CE -> necessidade
// inteira; P -> o que o PCP informou; cliente -> sempre 0 (nunca gera CE
// próprio).
function quantidadeCompraEfetiva(item: RascunhoMaterialItem): number {
  if (item.origemFornecimento === "cliente") return 0;
  const necessidade = paraNumeroMaterial(item.quantidadeConfirmada);
  if (item.decisaoAbastecimento === "CI") return 0;
  if (item.decisaoAbastecimento === "CE") return necessidade;
  return paraNumeroMaterial(item.quantidadeCompra);
}

// CI efetivo = necessidade - compra efetiva, nunca um valor digitado à
// parte (elimina por construção a classe de bug "CI e CE divergem da
// necessidade" - sempre somam a quantidade confirmada).
function quantidadeCiEfetiva(item: RascunhoMaterialItem): number {
  if (item.origemFornecimento === "cliente") return 0;
  const necessidade = paraNumeroMaterial(item.quantidadeConfirmada);
  return Math.max(necessidade - quantidadeCompraEfetiva(item), 0);
}

// Deriva quantidade/unidade de materiais legados (quantidadeNecessaria é
// texto livre, ex. "4 un (1 barra por peça)") só para semear o valor
// inicial editável - nunca reescreve o campo original. Materiais já salvos
// pelo Momento Y trazem quantidadeConfirmada/unidade próprios e não passam
// por este parser.
function inferirQuantidadeUnidadeMaterial(quantidadeNecessaria: string): { quantidade: string; unidade: string } {
  const match = quantidadeNecessaria.trim().match(/^(\d+(?:[.,]\d+)?)\s*(\S+)/);
  if (!match) return { quantidade: "1", unidade: "un" };
  return { quantidade: match[1].replace(".", ","), unidade: match[2] };
}

// Reconstrói decisaoAbastecimento/quantidadeCompra a partir do par
// quantidadeConfirmada/quantidadeCi já salvo (MateriaPrimaOfMock continua
// guardando só quantidadeCi, não um terceiro campo redundante) - mesma
// matemática de antes, só a leitura inicial do seletor muda.
function inferirDecisaoAbastecimento(
  quantidade: number,
  quantidadeCiSalva: number | undefined,
): { decisaoAbastecimento: DecisaoAbastecimento; quantidadeCompra: string } {
  if (quantidadeCiSalva === undefined || quantidadeCiSalva <= 0) {
    return { decisaoAbastecimento: "CE", quantidadeCompra: paraTextoMaterial(quantidade) };
  }
  if (quantidade > 0 && quantidadeCiSalva >= quantidade) {
    return { decisaoAbastecimento: "CI", quantidadeCompra: "0" };
  }
  return { decisaoAbastecimento: "P", quantidadeCompra: paraTextoMaterial(quantidade - quantidadeCiSalva) };
}

function construirItemMaterialDeProposta(mp: MateriaPrimaOfMock): RascunhoMaterialItem {
  const derivado = inferirQuantidadeUnidadeMaterial(mp.quantidadeNecessaria);
  const quantidadeConfirmada = mp.quantidadeConfirmada !== undefined ? paraTextoMaterial(mp.quantidadeConfirmada) : derivado.quantidade;
  const { decisaoAbastecimento, quantidadeCompra } = inferirDecisaoAbastecimento(
    paraNumeroMaterial(quantidadeConfirmada),
    mp.quantidadeCi,
  );
  return {
    itemId: mp.id,
    origemMpId: mp.id,
    materiaPrimaId: mp.materiaPrimaId ?? mp.id,
    descricao: mp.descricao,
    materialEspecificacao: mp.materialEspecificacao,
    formaDimensoes: mp.formaDimensoes,
    unidade: mp.unidade ?? derivado.unidade,
    quantidadeConfirmada,
    origemFornecimento: mp.origemFornecimento ?? "empresa",
    decisaoAbastecimento,
    quantidadeCompra,
    ajusteOperacional: mp.ajusteOperacional ?? "",
    origemItem: "roteiro",
  };
}

function validarItemMaterial(item: RascunhoMaterialItem): ErroItemMaterial {
  const erro: ErroItemMaterial = {};
  const quantidade = paraNumeroMaterial(item.quantidadeConfirmada);
  if (!item.quantidadeConfirmada.trim() || quantidade <= 0) {
    erro.quantidade = "Informe uma quantidade maior que zero.";
  }

  if (item.origemFornecimento === "empresa" && item.decisaoAbastecimento === "P") {
    const compra = paraNumeroMaterial(item.quantidadeCompra);
    if (!item.quantidadeCompra.trim() || compra <= 0 || (quantidade > 0 && compra >= quantidade)) {
      erro.quantidadeCompra = "Para atendimento parcial, informe uma quantidade de compra maior que zero e menor que a necessidade.";
    }
  }

  return erro;
}

function construirRascunho(ordem: OrdemFabricacaoMock): RascunhoOfState {
  const operacoes = ordem.operacoes.map(construirItemOperacaoDeProposta);
  const materiais = ordem.materiaPrima.map(construirItemMaterialDeProposta);
  return { ofId: ordem.id, operacoes, materiais, operacoesEditado: false, materiaisEditado: false };
}

function rascunhoTemAlteracoes(rascunho: RascunhoOfState): boolean {
  return rascunho.operacoesEditado || rascunho.materiaisEditado;
}

function rascunhoOfInvalido(rascunho: RascunhoOfState): boolean {
  const operacoesInvalidas = rascunho.operacoes.some((item) => {
    const erro = validarOperacaoItem(item, rascunho.operacoes);
    return Boolean(erro.descricao || erro.sequencia || erro.recurso || erro.tempoY || erro.dependeDe);
  });
  if (operacoesInvalidas) return true;
  return rascunho.materiais.some((item) => {
    const erro = validarItemMaterial(item);
    return Boolean(erro.quantidade || erro.quantidadeCompra);
  });
}

function formatarDataBr(dataIso: string | null): string {
  if (!dataIso) return "—";
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </svg>
  );
}

function MoveVerticalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v18M7 8l5-5 5 5M7 16l5 5 5-5" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

// Refinamento visual (ações compactas) - mesmo traço/peso dos ícones já
// existentes no arquivo (GripIcon/MoveVerticalIcon/ChevronLeftIcon).
function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/** Confiabilidade/cobertura da previsão OPERACIONAL - nunca a entrega comercial, que é fixa. Nunca misturada com a situação do prazo. */
function BadgeConfiabilidade({ confiabilidade }: { confiabilidade: ConfiabilidadePrevisao }) {
  if (confiabilidade === "integral") return <Badge variant="neutral">Previsão integral calculada</Badge>;
  if (confiabilidade === "parcial") return <Badge variant="neutral">Programação parcial</Badge>;
  return <Badge variant="warning">Previsão indisponível</Badge>;
}

/** Situação do prazo - independente da confiabilidade; um projeto com previsão integral pode estar atrasado. Ausência de previsão integral NUNCA conta como "no prazo". */
function BadgeSituacaoPrazo({ situacao }: { situacao: SituacaoPrazo }) {
  if (situacao === "adiantado") return <Badge variant="success">Adiantado</Badge>;
  if (situacao === "no_prazo") return <Badge variant="success">No prazo</Badge>;
  if (situacao === "atrasado") return <Badge variant="danger">Atrasado</Badge>;
  return <Badge variant="neutral">Indeterminado</Badge>;
}

// Sempre derivada ao vivo de ordensFabricacao (calcularCoberturaOfs) -
// nunca um contador próprio, para não repetir o desalinhamento já
// encontrado entre este resumo e a tela de OFs (correção aprovada).
function ResumoCoberturaOfs({ cobertura }: { cobertura: CoberturaOfsMock }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-text-secondary">
      <span>
        Total: <strong className="text-text-primary">{cobertura.total}</strong>
      </span>
      <span>
        Liberadas: <strong className="text-text-primary">{cobertura.liberadas}</strong>
      </span>
      <span>
        Aguardando análise: <strong className="text-text-primary">{cobertura.aptas}</strong>
      </span>
      {cobertura.bloqueadas > 0 ? <Badge variant="warning">{cobertura.bloqueadas} bloqueada(s)</Badge> : null}
    </div>
  );
}

/** Situação do material dentro de uma Requisição de Compra - nunca mistura com confiabilidade/prazo do projeto. */
function BadgeSituacaoMaterial({ situacao }: { situacao: SituacaoMaterialCompra }) {
  if (situacao === "em_orcamento") return <Badge variant="neutral">Em orçamento</Badge>;
  if (situacao === "pedido_emitido") return <Badge variant="warning">Pedido emitido</Badge>;
  if (situacao === "recebido_parcial") return <Badge variant="warning">Recebido parcialmente</Badge>;
  return <Badge variant="success">Recebido</Badge>;
}

/** Texto de previsão/recebimento - nunca inventa data quando o Compras não informou prazo confiável (regras 4-6 do pedido). */
function descreverPrevisaoMaterial(material: MaterialRequisicaoMock): string {
  if (material.situacao === "recebido" || material.situacao === "recebido_parcial") {
    const data = material.dataRecebimento ? formatarDataBr(material.dataRecebimento) : "—";
    return material.detalheQuantidade ? `Recebido em ${data} — ${material.detalheQuantidade}` : `Recebido em ${data}`;
  }
  if (material.situacao === "pedido_emitido") {
    return material.dataPrevista ? `Previsto: ${formatarDataBr(material.dataPrevista)}` : "Prazo ainda não informado pelo Compras";
  }
  return "Sem prazo confiável — ainda em orçamento";
}

function SecaoResumo({ titulo, acoes, children }: { titulo: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-text-secondary">{titulo}</h2>
        {acoes}
      </div>
      {children}
    </section>
  );
}

// Visualização virtual/impressa da OF - documento de produção, não a tela
// de edição do PCP. Mesmo conteúdo para os dois modos (tela/A4); só a
// largura/moldura do wrapper muda (ver ConteudoImpressaoOf). Tempo
// planejado por operação usa SOMENTE revisoes.length > 0 como critério de
// "existe revisão operacional válida" - nunca comparação numérica Y!==X
// (correção explícita do pedido: um Y que por acaso coincide com X depois
// de revisado não pode voltar a parecer "não revisado", e uma OP nova,
// cujo X nasce igual ao Y inicial por definição, nunca teria Y!==X mesmo
// sendo a única referência que existe).
function tempoPlanejadoOperacaoImpressao(op: OperacaoProducaoMock): number {
  return op.revisoes.length > 0 ? op.tempoYPcp : op.tempoXComercial;
}

// Observação X/Y de uma operação - mesma regra do tempo: usa
// revisoesObservacao.length > 0 como critério de "existe revisão
// operacional válida", nunca comparação de igualdade de texto entre
// observacaoPcp e observacaoRoteiro.
function observacaoPlanejadaOperacao(op: OperacaoProducaoMock): string | null {
  return (op.revisoesObservacao.length > 0 ? op.observacaoPcp : op.observacaoRoteiro) ?? null;
}

// Documento impresso/A4 (sempre o que de fato sai na impressão, independente
// do modo selecionado em tela - ver uso em "impressao" mais abaixo). Visual
// de papel: bg-white/text literal (não token reativo) é deliberado aqui,
// precisa parecer a mesma folha branca com tinta preta independente do tema
// claro/escuro do app em volta.
function ConteudoImpressaoOfA4({
  projeto,
  ordem,
  naoLiberada,
  temAlteracoesNaoSalvas,
  comTempoPlanejado,
}: {
  projeto: { numeroProjeto: string; nomeCliente: string; naturezaComercial: NaturezaComercial };
  ordem: OrdemFabricacaoMock;
  naoLiberada: boolean;
  temAlteracoesNaoSalvas: boolean;
  comTempoPlanejado: boolean;
}) {
  const identificacaoOf = `${ordem.numero} · ${projeto.numeroProjeto}`;

  return (
    <div className="of-impressao-conteudo mx-auto flex w-[210mm] max-w-full flex-col gap-5 border border-gray-300 bg-white p-[15mm] text-gray-900 shadow-lg">
      {naoLiberada ? (
        <div className="border-2 border-gray-900 px-4 py-3 text-center text-[13px] font-bold uppercase tracking-wide text-gray-900">
          Simulação — não liberada para produção
        </div>
      ) : null}

      <div className="flex flex-col gap-1 border-b border-gray-300 pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-bold text-gray-900">{identificacaoOf}</h1>
          <span className="text-[11px] text-gray-600">Natureza da Operação: {LABEL_NATUREZA_OPERACAO[projeto.naturezaComercial] ?? "Não informada"}</span>
        </div>
        <p className="text-[13px] text-gray-800">
          {ordem.codigoPeca} — {ordem.descricaoPeca} · Quantidade: {ordem.quantidade} un
        </p>
        <p className="text-[12px] text-gray-600">
          Projeto {projeto.numeroProjeto} · Cliente: {projeto.nomeCliente} · Desenho: {ordem.desenhoTecnico}
        </p>
        {temAlteracoesNaoSalvas ? (
          <p className="text-[11px] italic text-gray-600">
            Esta visualização usa a última versão salva da cópia operacional - existem alterações ainda não salvas que
            não estão refletidas aqui.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-gray-900">Matérias-primas</h2>
        {ordem.materiaPrima.length === 0 ? (
          <p className="text-[12px] text-gray-600">Nenhuma matéria-prima prevista para esta OF.</p>
        ) : (
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              {/* Linha dentro do thead (não um cabeçalho de página via CSS)
                  para repetir a identificação da OF nas páginas adicionais:
                  navegadores repetem <thead> em cada página impressa de
                  forma nativa e confiável, diferente de position: running()
                  (GCPM), que o Chrome não suporta. */}
              <tr className="border-b border-gray-300 text-left">
                <th colSpan={4} className="py-1 text-[10px] font-normal text-gray-500">
                  {identificacaoOf}
                </th>
              </tr>
              <tr className="border-b-2 border-gray-900 text-left">
                <th className="py-1.5 pr-2 font-bold text-gray-900">Material</th>
                <th className="py-1.5 pr-2 font-bold text-gray-900">Quantidade</th>
                <th className="py-1.5 pr-2 font-bold text-gray-900">Origem</th>
                <th className="py-1.5 font-bold text-gray-900">Observação técnica</th>
              </tr>
            </thead>
            <tbody>
              {ordem.materiaPrima.map((mp) => (
                <tr key={mp.id} className="border-b border-gray-300 align-top">
                  <td className="py-1.5 pr-2 text-gray-900">{mp.descricao}</td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-gray-900">{mp.quantidadeNecessaria}</td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-gray-900">
                    {mp.origemFornecimento === "cliente" ? "Cliente" : "Empresa"}
                  </td>
                  <td className="py-1.5 text-gray-700">{mp.ajusteOperacional ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-gray-900">Operações</h2>
        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="border-b border-gray-300 text-left">
              <th colSpan={comTempoPlanejado ? 5 : 4} className="py-1 text-[10px] font-normal text-gray-500">
                {identificacaoOf}
              </th>
            </tr>
            <tr className="border-b-2 border-gray-900 text-left">
              <th className="py-1.5 pr-2 font-bold text-gray-900">OP</th>
              <th className="py-1.5 pr-2 font-bold text-gray-900">Operação</th>
              <th className="py-1.5 pr-2 font-bold text-gray-900">Recurso</th>
              <th className={comTempoPlanejado ? "py-1.5 pr-2 font-bold text-gray-900" : "py-1.5 font-bold text-gray-900"}>
                Observações
              </th>
              {comTempoPlanejado ? <th className="py-1.5 font-bold text-gray-900">Tempo planejado</th> : null}
            </tr>
          </thead>
          <tbody>
            {ordem.operacoes.map((op) => (
              <tr key={op.id} className="border-b border-gray-300 align-top" style={{ breakInside: "avoid" }}>
                <td className="whitespace-nowrap py-1.5 pr-2 text-gray-900">{op.sequencia}</td>
                <td className="py-1.5 pr-2 text-gray-900">{op.descricao}</td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-gray-900">{op.recurso}</td>
                <td className={comTempoPlanejado ? "py-1.5 pr-2 text-gray-700" : "py-1.5 text-gray-700"}>
                  {observacaoPlanejadaOperacao(op) ?? "—"}
                </td>
                {comTempoPlanejado ? (
                  <td className="whitespace-nowrap py-1.5 text-gray-900">{formatarHoras(tempoPlanejadoOperacaoImpressao(op))}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Visualização em tela da OF - mesma informação do documento A4, mas em
// chrome de aplicativo (tokens do DESIGN.md, cards, Badge, Table
// compartilhada), para ser realmente distinta da simulação de papel, não
// uma cópia estreita dela. O que sai na impressão continua sendo sempre
// ConteudoImpressaoOfA4 (ver uso em "impressao" mais abaixo).
function ConteudoOfVirtual({
  projeto,
  ordem,
  naoLiberada,
  temAlteracoesNaoSalvas,
  comTempoPlanejado,
}: {
  projeto: { numeroProjeto: string; nomeCliente: string; naturezaComercial: NaturezaComercial };
  ordem: OrdemFabricacaoMock;
  naoLiberada: boolean;
  temAlteracoesNaoSalvas: boolean;
  comTempoPlanejado: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-4">
      {naoLiberada ? (
        <div className="rounded-[10px] border border-status-warning-border bg-status-warning-bg px-4 py-2.5 text-[12.5px] font-semibold text-status-warning-text">
          Simulação — não liberada para produção
        </div>
      ) : null}

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            {ordem.numero} · {projeto.numeroProjeto}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <BadgeSituacaoLiberacaoOf situacao={ordem.situacaoLiberacao} />
            {ordem.revisaoSalvaEm ? <Badge variant="success">Revisada</Badge> : <Badge variant="warning">Aguardando revisão</Badge>}
            <Badge variant="neutral">{LABEL_NATUREZA_OPERACAO[projeto.naturezaComercial] ?? "Natureza não informada"}</Badge>
          </div>
        </div>
        <p className="text-[13.5px] text-text-secondary">
          {ordem.codigoPeca} — {ordem.descricaoPeca} · Quantidade: {ordem.quantidade} un
        </p>
        <p className="text-[12.5px] text-text-secondary">
          Projeto {projeto.numeroProjeto} · Cliente: {projeto.nomeCliente} · Desenho: {ordem.desenhoTecnico}
        </p>
        {temAlteracoesNaoSalvas ? (
          <p className="text-[12px] italic text-text-secondary">
            Esta visualização usa a última versão salva da cópia operacional - existem alterações ainda não salvas que
            não estão refletidas aqui.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-5 py-4">
        <h2 className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-text-secondary">Matérias-primas</h2>
        {ordem.materiaPrima.length === 0 ? (
          <p className="text-[12.5px] text-text-secondary">Nenhuma matéria-prima prevista para esta OF.</p>
        ) : (
          <Table>
            <TableHead>
              <TableHeaderCell>Material</TableHeaderCell>
              <TableHeaderCell>Quantidade</TableHeaderCell>
              <TableHeaderCell>Origem</TableHeaderCell>
              <TableHeaderCell>Observação técnica</TableHeaderCell>
            </TableHead>
            <TableBody>
              {ordem.materiaPrima.map((mp) => (
                <TableRow key={mp.id}>
                  <TableCell>{mp.descricao}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{mp.quantidadeNecessaria}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant="neutral">{mp.origemFornecimento === "cliente" ? "Cliente" : "Empresa"}</Badge>
                  </TableCell>
                  <TableCell className="text-text-secondary">{mp.ajusteOperacional ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-5 py-4">
        <h2 className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-text-secondary">Operações</h2>
        <Table>
          <TableHead>
            <TableHeaderCell>OP</TableHeaderCell>
            <TableHeaderCell>Operação</TableHeaderCell>
            <TableHeaderCell>Recurso</TableHeaderCell>
            <TableHeaderCell>Observações</TableHeaderCell>
            {comTempoPlanejado ? <TableHeaderCell>Tempo planejado</TableHeaderCell> : null}
          </TableHead>
          <TableBody>
            {ordem.operacoes.map((op) => (
              <TableRow key={op.id}>
                <TableCell className="whitespace-nowrap tabular-nums">{op.sequencia}</TableCell>
                <TableCell>{op.descricao}</TableCell>
                <TableCell className="whitespace-nowrap">{op.recurso}</TableCell>
                <TableCell className={comTempoPlanejado ? "min-w-[280px] text-text-secondary" : "min-w-[420px] text-text-secondary"}>
                  {observacaoPlanejadaOperacao(op) ?? "—"}
                </TableCell>
                {comTempoPlanejado ? (
                  <TableCell className="whitespace-nowrap tabular-nums">{formatarHoras(tempoPlanejadoOperacaoImpressao(op))}</TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

// Momento Y - seletor compacto de 3 vias (tabela reduzida): substitui os
// dois campos numéricos independentes de CI/CE por uma única decisão,
// mais rápida de ler/operar numa OF com 20+ materiais. Só aparece para
// origem='empresa' - material do cliente nunca usa este seletor (regra 5
// do pedido, ver render da célula).
const TITULO_DECISAO_ABASTECIMENTO: Record<DecisaoAbastecimento, string> = {
  CI: "CI — Consumo Interno: atendido integralmente pelo estoque próprio.",
  CE: "CE — Compra Externa: nada no estoque próprio, compra integral.",
  P: "P — Parcial: parte pelo estoque, parte por compra (informe a quantidade de compra).",
};

function SeletorAbastecimento({
  valor,
  onChange,
  ariaLabel,
}: {
  valor: DecisaoAbastecimento;
  onChange: (valor: DecisaoAbastecimento) => void;
  ariaLabel: string;
}) {
  const opcoes: DecisaoAbastecimento[] = ["CI", "CE", "P"];
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
            "h-8 w-9 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-focus-ring",
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

function CampoCompacto({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{label}</dt>
      <dd className="mt-0.5 text-[14px] font-semibold text-text-primary">{children}</dd>
    </div>
  );
}

/** Situação de liberação da OF - análise industrial prévia, sempre derivada ao vivo de ordensFabricacao. */
function BadgeSituacaoLiberacaoOf({ situacao }: { situacao: SituacaoLiberacaoOf }) {
  if (situacao === "liberada") return <Badge variant="success">Liberada</Badge>;
  if (situacao === "bloqueada") return <Badge variant="danger">Bloqueada</Badge>;
  return <Badge variant="neutral">Apta para liberação</Badge>;
}

const SITUACOES_PRAZO_FILTRO = [
  { value: "adiantado", label: "Adiantado" },
  { value: "no_prazo", label: "No prazo" },
  { value: "atrasado", label: "Atrasado" },
  { value: "indeterminado", label: "Indeterminado" },
];

export default function PcpPrioridadesPreviewPage() {
  const [area, setArea] = useState<Area>("liberados");
  const [visao, setVisao] = useState<Visao>({ tipo: "lista" });
  const [busca, setBusca] = useState("");
  const [filtroSituacaoPrazo, setFiltroSituacaoPrazo] = useState("");

  const [aguardando, setAguardando] = useState<ProjetoAguardandoMock[]>(PROJETOS_AGUARDANDO_MOCK);
  const [liberados, setLiberados] = useState<ProjetoLiberadoMock[]>(PROJETOS_LIBERADOS_MOCK);

  const [pedidoLiberacao, setPedidoLiberacao] = useState<ProjetoAguardandoMock | null>(null);

  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [indiceSobrevoado, setIndiceSobrevoado] = useState<number | null>(null);
  const [pedidoMovimentacao, setPedidoMovimentacao] = useState<{
    projeto: ProjetoLiberadoMock;
    posicaoDestinoInicial: number;
  } | null>(null);
  const [posicaoDestinoSelecionada, setPosicaoDestinoSelecionada] = useState(1);
  const [justificativa, setJustificativa] = useState("");

  const [calculoSimulado, setCalculoSimulado] = useState<"ocioso" | "calculando" | "concluido">("ocioso");

  // Observações do PCP - exclusivamente em memória (useState), nunca
  // persistidas; semente vem do mock, mas novas entradas nunca sobrescrevem
  // as anteriores (regra explícita do pedido).
  const [observacoesPorProjeto, setObservacoesPorProjeto] = useState<Record<string, ObservacaoPcpMock[]>>(() => {
    const inicial: Record<string, ObservacaoPcpMock[]> = {};
    for (const projeto of PROJETOS_LIBERADOS_MOCK) {
      inicial[projeto.id] = projeto.observacoesPcp;
    }
    return inicial;
  });
  const [novaObservacaoTexto, setNovaObservacaoTexto] = useState("");

  const [pedidoLiberacaoOf, setPedidoLiberacaoOf] = useState<{ projetoId: string; of: OrdemFabricacaoMock } | null>(null);

  // Cópia operacional da OF - rascunho local (sequência/recurso/Y de cada
  // OP + liberada/ajuste de cada MP). Nada aqui toca o estado compartilhado
  // (aguardando/liberados) até "Salvar alterações" (regra 5 do pedido).
  const [rascunhoOf, setRascunhoOf] = useState<RascunhoOfState | null>(null);
  const [justificativaSalvar, setJustificativaSalvar] = useState("");
  const [confirmandoSaidaSemSalvar, setConfirmandoSaidaSemSalvar] = useState(false);

  // Momento Y - conferência de matéria-prima dentro da cópia operacional.
  // Erros de validação por item são derivados ao vivo de rascunhoOf
  // (validarItemMaterial), nunca guardados em estado próprio - ficam
  // sempre em sincronia com a última edição, sem precisar limpar
  // manualmente a cada mutação.
  const [notaConsolidacaoMaterial, setNotaConsolidacaoMaterial] = useState<string | null>(null);
  const [modalMaterial, setModalMaterial] = useState<{ modo: "adicionar" } | { modo: "editar"; itemId: string } | null>(
    null,
  );
  const [materialSelecionado, setMaterialSelecionado] = useState<MaterialCatalogoMock | null>(null);
  const [quantidadeNovoItemMaterial, setQuantidadeNovoItemMaterial] = useState("");
  const [origemNovoItemMaterial, setOrigemNovoItemMaterial] = useState<OrigemFornecimento>("empresa");
  const [observacaoNovoItemMaterial, setObservacaoNovoItemMaterial] = useState("");
  const [erroModalMaterial, setErroModalMaterial] = useState("");

  // Operações de Produção - Adicionar/Editar/Remover (mesmo padrão do
  // material: erro de remoção bloqueada é um aviso transitório, não um
  // estado por item).
  const [erroOperacao, setErroOperacao] = useState<string | null>(null);
  const [modalOperacao, setModalOperacao] = useState<{ modo: "adicionar" } | { modo: "editar"; itemId: string } | null>(
    null,
  );
  const [descricaoNovaOperacao, setDescricaoNovaOperacao] = useState("");
  const [sequenciaNovaOperacao, setSequenciaNovaOperacao] = useState("");
  const [recursoNovaOperacao, setRecursoNovaOperacao] = useState("");
  const [tempoYNovaOperacao, setTempoYNovaOperacao] = useState("");
  const [dependeDeNovaOperacao, setDependeDeNovaOperacao] = useState("");
  const [observacaoNovaOperacao, setObservacaoNovaOperacao] = useState("");
  const [erroModalOperacao, setErroModalOperacao] = useState("");

  // Visualização virtual/impressa da OF - alternância em tela, nunca afeta
  // o conteúdo real (a prévia impressa via Ctrl+P sempre usa o layout A4,
  // independente deste estado - ele só controla a pré-visualização em tela).
  const [modoApresentacaoImpressao, setModoApresentacaoImpressao] = useState<"tela" | "a4">("tela");
  // Dois modelos de OF para Produção - a única diferença funcional é a
  // presença (ou não) da coluna/valor de tempo planejado; nunca altera
  // X/Y/Z armazenados, só a apresentação. Vale para tela, A4 e impressão
  // nativa (ambos os componentes abaixo recebem o mesmo estado).
  const [modeloTempoPlanejado, setModeloTempoPlanejado] = useState<"com" | "sem">("com");

  // Catálogo disponível para a OF atualmente aberta (ou [] fora da view
  // "ops") - calculado no topo do componente porque o hook de busca
  // abaixo precisa ser chamado incondicionalmente (regra dos hooks),
  // mesmo que só seja usado dentro da view "ops".
  const ofAtualParaCatalogo =
    visao.tipo === "ops"
      ? (liberados.find((p) => p.id === visao.projetoId) ?? aguardando.find((p) => p.id === visao.projetoId))?.ordensFabricacao.find(
          (of) => of.id === visao.ofId,
        )
      : undefined;
  const catalogoDisponivel: MaterialCatalogoMock[] =
    ofAtualParaCatalogo?.catalogoMateriaPrima && ofAtualParaCatalogo.catalogoMateriaPrima.length > 0
      ? ofAtualParaCatalogo.catalogoMateriaPrima
      : CATALOGO_GENERICO_MATERIA_PRIMA;

  // Busca local (nunca chama Supabase/RPC) contra catalogoDisponivel,
  // pesquisando por código, descrição, especificação e forma/bitola -
  // mesmos campos que a busca real de matéria-prima usa.
  const buscarPaginaMaterialMock = useCallback(
    async ({ termo }: { termo: string; offset: number; limite: number }) => {
      const termoNormalizado = termo.trim().toLowerCase();
      if (!termoNormalizado) return catalogoDisponivel;
      return catalogoDisponivel.filter((material) =>
        [material.codigo, material.descricao, material.materialEspecificacao, material.formaDimensoes]
          .join(" ")
          .toLowerCase()
          .includes(termoNormalizado),
      );
    },
    [catalogoDisponivel],
  );
  const buscaMaterial = useBuscaPaginada<MaterialCatalogoMock>({
    buscarPagina: buscarPaginaMaterialMock,
    obterId: (material) => material.materiaPrimaId,
  });

  const idFiltroPrazo = useId();
  const idNovaObservacao = useId();

  const aguardandoFiltrado = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return aguardando
      .filter(
        (p) =>
          !termo ||
          p.numeroProjeto.toLowerCase().includes(termo) ||
          p.nomeCliente.toLowerCase().includes(termo) ||
          p.documentoCliente.toLowerCase().includes(termo),
      )
      .sort((a, b) => a.dataEntradaPcp.localeCompare(b.dataEntradaPcp));
  }, [aguardando, busca]);

  const liberadosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return liberados
      .filter((p) => {
        const correspondeTermo =
          !termo ||
          p.numeroProjeto.toLowerCase().includes(termo) ||
          p.nomeCliente.toLowerCase().includes(termo) ||
          p.documentoCliente.toLowerCase().includes(termo);
        if (!correspondeTermo) return false;
        if (!filtroSituacaoPrazo) return true;
        // Status é derivado ao vivo das OFs - nunca lido de um campo
        // estático, que ficaria desatualizado a cada liberação de OF.
        const previsao = calcularPrevisaoOperacional(p.ordensFabricacao, p.dataConclusaoPrevista);
        return calcularSituacaoPrazo(previsao, p.dataEntregaComprometida) === filtroSituacaoPrazo;
      })
      .sort((a, b) => a.prioridade - b.prioridade);
  }, [liberados, busca, filtroSituacaoPrazo]);

  function abrirModalLiberar(projeto: ProjetoAguardandoMock) {
    setPedidoLiberacao(projeto);
  }

  function confirmarLiberacao() {
    if (!pedidoLiberacao) return;
    const proximaPrioridade = liberados.length > 0 ? Math.max(...liberados.map((p) => p.prioridade)) + 1 : 1;
    setAguardando((atual) => atual.filter((p) => p.id !== pedidoLiberacao.id));
    setLiberados((atual) => [
      ...atual,
      {
        id: pedidoLiberacao.id,
        numeroProjeto: pedidoLiberacao.numeroProjeto,
        nomeCliente: pedidoLiberacao.nomeCliente,
        documentoCliente: pedidoLiberacao.documentoCliente,
        naturezaComercial: pedidoLiberacao.naturezaComercial,
        dataEntregaComprometida: pedidoLiberacao.dataEntregaComprometida,
        prioridade: proximaPrioridade,
        // Recém-liberado: o Motor ainda não rodou para este projeto -
        // nunca inventar uma previsão nesse momento (calcularPrevisaoOperacional
        // já resolve isso ao vivo a partir de ordensFabricacao).
        dataConclusaoPrevista: null,
        pendenciasOperacionais: ["Aguardando primeiro cálculo do Motor"],
        pendenciasExternas: [],
        requisicoesCompra: [],
        observacoesPcp: [],
        ordensFabricacao: pedidoLiberacao.ordensFabricacao,
        historico: [{ data: "2026-10-28", evento: "Projeto liberado para programação (simulado)" }],
      },
    ]);
    setPedidoLiberacao(null);
  }

  function abrirModalMovimentacao(projeto: ProjetoLiberadoMock, destinoInicial: number) {
    setPedidoMovimentacao({ projeto, posicaoDestinoInicial: destinoInicial });
    setPosicaoDestinoSelecionada(destinoInicial);
    setJustificativa("");
  }

  function cancelarMovimentacao() {
    setPedidoMovimentacao(null);
    setJustificativa("");
    setIndiceSobrevoado(null);
    setArrastandoId(null);
  }

  function confirmarMovimentacao() {
    if (!pedidoMovimentacao || !justificativa.trim()) return;
    const { projeto } = pedidoMovimentacao;
    const destino = Math.max(1, Math.min(posicaoDestinoSelecionada, liberados.length));

    setLiberados((atual) => {
      const ordenada = [...atual].sort((a, b) => a.prioridade - b.prioridade);
      const semProjeto = ordenada.filter((p) => p.id !== projeto.id);
      const indiceInsercao = destino - 1;
      semProjeto.splice(indiceInsercao, 0, projeto);
      return semProjeto.map((p, indice) => ({ ...p, prioridade: indice + 1 }));
    });

    setPedidoMovimentacao(null);
    setJustificativa("");
    setIndiceSobrevoado(null);
    setArrastandoId(null);
  }

  function onDropNaLinha(indiceAlvo: number) {
    setIndiceSobrevoado(null);
    if (!arrastandoId) return;
    const projeto = liberadosFiltrados.find((p) => p.id === arrastandoId);
    setArrastandoId(null);
    if (!projeto) return;
    const destino = indiceAlvo + 1;
    // Soltar na própria posição não é uma movimentação - não abre o modal
    // de confirmação (regra explícita do pedido).
    if (destino === projeto.prioridade) return;
    abrirModalMovimentacao(projeto, destino);
  }

  function solicitarCalculoSimulado() {
    if (calculoSimulado === "calculando") return;
    setCalculoSimulado("calculando");
    setTimeout(() => setCalculoSimulado("concluido"), 900);
  }

  function adicionarObservacaoPcp(projetoId: string) {
    const texto = novaObservacaoTexto.trim();
    if (!texto) return;
    const agora = new Date();
    const nova: ObservacaoPcpMock = {
      id: `obs-${projetoId}-${agora.getTime()}`,
      data: agora.toISOString().slice(0, 10),
      hora: agora.toTimeString().slice(0, 5),
      responsavel: "Usuário de demonstração (protótipo)",
      texto,
    };
    setObservacoesPorProjeto((atual) => ({
      ...atual,
      [projetoId]: [...(atual[projetoId] ?? []), nova],
    }));
    setNovaObservacaoTexto("");
  }

  // Projeto pode estar em "aguardando" ou em "liberados" neste momento -
  // o mutador só encontra correspondência em um dos dois arrays.
  function atualizarOrdensFabricacao(
    projetoId: string,
    atualizador: (ordens: OrdemFabricacaoMock[]) => OrdemFabricacaoMock[],
  ) {
    setAguardando((atual) =>
      atual.map((p) => (p.id === projetoId ? { ...p, ordensFabricacao: atualizador(p.ordensFabricacao) } : p)),
    );
    setLiberados((atual) =>
      atual.map((p) => (p.id === projetoId ? { ...p, ordensFabricacao: atualizador(p.ordensFabricacao) } : p)),
    );
  }

  function abrirModalLiberacaoOf(projetoId: string, ordem: OrdemFabricacaoMock) {
    if (ordem.situacaoLiberacao !== "apta") return;
    setPedidoLiberacaoOf({ projetoId, of: ordem });
  }

  function confirmarLiberacaoOf() {
    if (!pedidoLiberacaoOf) return;
    const agora = new Date();
    const { projetoId, of: ordem } = pedidoLiberacaoOf;
    atualizarOrdensFabricacao(projetoId, (ordens) =>
      ordens.map((of) =>
        of.id === ordem.id
          ? {
              ...of,
              situacaoLiberacao: "liberada",
              liberacao: {
                responsavel: "Usuário de demonstração (protótipo)",
                data: agora.toISOString().slice(0, 10),
                hora: agora.toTimeString().slice(0, 5),
              },
            }
          : of,
      ),
    );
    setPedidoLiberacaoOf(null);
  }

  // Reconstrói o rascunho sempre que o usuário navega para a cópia
  // operacional de uma OF diferente - nunca ao vivo a cada render (só
  // quando "visao" muda), senão edições em andamento seriam perdidas.
  // ACHADO PRÉ-EXISTENTE (não introduzido pelo Momento Y): setRascunhoOf/
  // setJustificativaSalvar já violavam react-hooks/set-state-in-effect
  // antes desta evolução - o fix correto (derivar via `key={ofId}` num
  // componente próprio para a view "ops", eliminando o efeito) é um
  // refactor estrutural maior, fora do escopo autorizado aqui. Suprimido
  // com o mesmo padrão já aceito em useCompatibilidadesRecurso.ts,
  // registrado explicitamente para decisão futura - nunca escondido.
  useEffect(() => {
    if (visao.tipo !== "ops") return;
    const projetoAtual = liberados.find((p) => p.id === visao.projetoId) ?? aguardando.find((p) => p.id === visao.projetoId);
    const ordemAtual = projetoAtual?.ordensFabricacao.find((of) => of.id === visao.ofId);
    if (!ordemAtual) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRascunhoOf((atual) => (atual?.ofId === ordemAtual.id ? atual : construirRascunho(ordemAtual)));
    setJustificativaSalvar("");
    setNotaConsolidacaoMaterial(null);
    setErroOperacao(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visao]);

  function abrirModalAdicionarOperacao() {
    setDescricaoNovaOperacao("");
    setSequenciaNovaOperacao("");
    setRecursoNovaOperacao("");
    setTempoYNovaOperacao("");
    setDependeDeNovaOperacao("");
    setObservacaoNovaOperacao("");
    setErroModalOperacao("");
    setModalOperacao({ modo: "adicionar" });
  }

  function abrirModalEditarOperacao(itemId: string) {
    const item = rascunhoOf?.operacoes.find((op) => op.itemId === itemId);
    if (!item) return;
    setDescricaoNovaOperacao(item.descricao);
    setSequenciaNovaOperacao(item.sequencia);
    setRecursoNovaOperacao(item.recurso);
    setTempoYNovaOperacao(item.tempoYPcp);
    setDependeDeNovaOperacao(item.dependeDeTexto);
    setObservacaoNovaOperacao(item.observacaoTexto);
    setErroModalOperacao("");
    setModalOperacao({ modo: "editar", itemId });
  }

  function confirmarModalOperacao() {
    if (!modalOperacao || !rascunhoOf) return;

    let operacoesAtualizadas: RascunhoOperacaoItem[];
    let itemCandidato: RascunhoOperacaoItem;

    if (modalOperacao.modo === "editar") {
      const itemAtual = rascunhoOf.operacoes.find((op) => op.itemId === modalOperacao.itemId);
      if (!itemAtual) {
        setModalOperacao(null);
        return;
      }
      // CORREÇÃO (integridade X/Y/Z): operação com qualquer execução
      // registrada, inclusive parcial, trava TODOS os campos - nem o
      // tempo Y pode mais ser revisado (decisão anterior permitia Y
      // continuar editável; proibido explicitamente agora, para nunca
      // permitir ajustar o planejado depois de já saber o resultado
      // real). O indicador é o valor real tempoZRealizado !== null, não
      // o texto formatado exibido na coluna Z.
      if (operacaoJaExecutada(itemAtual)) {
        setErroModalOperacao("Operação com execução registrada. Planejamento bloqueado.");
        return;
      }
      itemCandidato = {
        ...itemAtual,
        descricao: descricaoNovaOperacao,
        sequencia: sequenciaNovaOperacao,
        recurso: recursoNovaOperacao,
        tempoYPcp: tempoYNovaOperacao,
        dependeDeTexto: dependeDeNovaOperacao,
        observacaoTexto: observacaoNovaOperacao,
      };
      operacoesAtualizadas = rascunhoOf.operacoes.map((op) => (op.itemId === itemCandidato.itemId ? itemCandidato : op));
    } else {
      const dependencias = parseDependeDe(dependeDeNovaOperacao);
      itemCandidato = {
        itemId: `op-adicionada-${rascunhoOf.operacoes.length}`,
        origemOpId: null,
        descricao: descricaoNovaOperacao,
        sequencia: sequenciaNovaOperacao,
        recurso: recursoNovaOperacao,
        tempoYPcp: tempoYNovaOperacao,
        dependeDeTexto: dependeDeNovaOperacao,
        // Operação adicionada pelo PCP nesta revisão não tem referência
        // comercial - X nasce igual ao Y informado (nunca editado depois),
        // nunca inventado como zero nem copiado de outra operação.
        tempoXComercial: paraNumeroMaterial(tempoYNovaOperacao),
        tempoZRealizado: null,
        terceirizada: false,
        condicaoLiberacao:
          dependencias.length > 0
            ? `Depende da(s) OP ${dependencias.join(", ")}`
            : "Nenhuma dependência - pode iniciar imediatamente",
        revisoes: [],
        origemItem: "adicionada" as const,
        observacaoTexto: observacaoNovaOperacao,
        observacaoRoteiroOriginal: null,
        revisoesObservacao: [],
      };
      operacoesAtualizadas = [...rascunhoOf.operacoes, itemCandidato];
    }

    const erro = validarOperacaoItem(itemCandidato, operacoesAtualizadas);
    const primeiraMensagemErro = erro.descricao ?? erro.sequencia ?? erro.recurso ?? erro.tempoY ?? erro.dependeDe;
    if (primeiraMensagemErro) {
      setErroModalOperacao(primeiraMensagemErro);
      return;
    }

    setRascunhoOf({ ...rascunhoOf, operacoesEditado: true, operacoes: operacoesAtualizadas });
    setModalOperacao(null);
  }

  function removerOperacaoItem(itemId: string) {
    if (!rascunhoOf) return;
    const item = rascunhoOf.operacoes.find((op) => op.itemId === itemId);
    if (!item) return;

    if (operacaoJaExecutada(item)) {
      setErroOperacao("Não é possível remover: esta operação já tem execução registrada (Z preenchido).");
      return;
    }

    const sequenciaItem = Number(item.sequencia);
    const dependentes = rascunhoOf.operacoes.filter(
      (op) => op.itemId !== itemId && parseDependeDe(op.dependeDeTexto).includes(sequenciaItem),
    );
    if (dependentes.length > 0) {
      setErroOperacao(
        `Não é possível remover: a(s) OP ${dependentes.map((dependente) => dependente.sequencia).join(", ")} depende(m) desta operação.`,
      );
      return;
    }

    setErroOperacao(null);
    setRascunhoOf({
      ...rascunhoOf,
      operacoesEditado: true,
      operacoes: rascunhoOf.operacoes.filter((op) => op.itemId !== itemId),
    });
  }

  function atualizarItemMaterial(itemId: string, parcial: Partial<RascunhoMaterialItem>) {
    setRascunhoOf((atual) => {
      if (!atual) return atual;
      return {
        ...atual,
        materiaisEditado: true,
        materiais: atual.materiais.map((item) => (item.itemId === itemId ? { ...item, ...parcial } : item)),
      };
    });
  }

  function removerItemMaterial(itemId: string) {
    setRascunhoOf((atual) => {
      if (!atual) return atual;
      return { ...atual, materiaisEditado: true, materiais: atual.materiais.filter((item) => item.itemId !== itemId) };
    });
  }

  // Momento Y - mesma decisão de identidade de sempre: dois itens
  // consolidam quando materiaPrimaId + origemFornecimento coincidem.
  // Usado por "Editar" (quantidade/origem/material/observação, tudo numa
  // ação atômica) e por "Adicionar".
  function materialExistenteParaConsolidar(
    materiais: RascunhoMaterialItem[],
    itemIdExcluido: string | null,
    materiaPrimaId: string,
    origemFornecimento: OrigemFornecimento,
  ): RascunhoMaterialItem | undefined {
    return materiais.find(
      (item) => item.itemId !== itemIdExcluido && item.materiaPrimaId === materiaPrimaId && item.origemFornecimento === origemFornecimento,
    );
  }

  function alterarDecisaoAbastecimento(itemId: string, decisao: DecisaoAbastecimento) {
    atualizarItemMaterial(itemId, { decisaoAbastecimento: decisao });
  }

  function alterarQuantidadeCompra(itemId: string, valor: string) {
    atualizarItemMaterial(itemId, { quantidadeCompra: valor });
  }

  // "Editar" (substitui a antiga "Substituir" como botão isolado): revisa,
  // numa ação só, quantidade, origem, material (opcional - troca igual à
  // antiga "Substituir") e observação técnica. decisaoAbastecimento/
  // quantidadeCompra permanecem com o que já estava, intocados aqui (são
  // editados direto na tabela, nunca neste modal).
  function confirmarEdicaoMaterial(novoMaterial: MaterialCatalogoMock | null) {
    if (!rascunhoOf || modalMaterial?.modo !== "editar") return;
    const itemId = modalMaterial.itemId;
    const itemAtual = rascunhoOf.materiais.find((item) => item.itemId === itemId);
    if (!itemAtual) {
      setModalMaterial(null);
      return;
    }

    const quantidade = paraNumeroMaterial(quantidadeNovoItemMaterial);
    if (!quantidadeNovoItemMaterial.trim() || quantidade <= 0) {
      setErroModalMaterial("Informe uma quantidade maior que zero.");
      return;
    }

    const itemEditado: RascunhoMaterialItem = {
      ...itemAtual,
      materiaPrimaId: novoMaterial?.materiaPrimaId ?? itemAtual.materiaPrimaId,
      descricao: novoMaterial?.descricao ?? itemAtual.descricao,
      materialEspecificacao: novoMaterial?.materialEspecificacao ?? itemAtual.materialEspecificacao,
      formaDimensoes: novoMaterial?.formaDimensoes ?? itemAtual.formaDimensoes,
      unidade: novoMaterial?.unidade ?? itemAtual.unidade,
      quantidadeConfirmada: quantidadeNovoItemMaterial,
      origemFornecimento: origemNovoItemMaterial,
      ajusteOperacional: observacaoNovoItemMaterial,
      substituiuDescricaoOriginal: novoMaterial ? itemAtual.substituiuDescricaoOriginal ?? itemAtual.descricao : itemAtual.substituiuDescricaoOriginal,
    };

    const existente = materialExistenteParaConsolidar(
      rascunhoOf.materiais,
      itemId,
      itemEditado.materiaPrimaId,
      itemEditado.origemFornecimento,
    );

    let materiais: RascunhoMaterialItem[];
    if (existente) {
      materiais = rascunhoOf.materiais
        .filter((item) => item.itemId !== itemId)
        .map((item) =>
          item.itemId === existente.itemId
            ? { ...item, quantidadeConfirmada: somarQuantidadesMaterial(existente.quantidadeConfirmada, itemEditado.quantidadeConfirmada) }
            : item,
        );
      setNotaConsolidacaoMaterial(`Consolidado com "${existente.descricao}" (mesmo material e mesma origem do fornecimento).`);
    } else {
      materiais = rascunhoOf.materiais.map((item) => (item.itemId === itemId ? itemEditado : item));
      setNotaConsolidacaoMaterial(null);
    }

    setRascunhoOf({ ...rascunhoOf, materiaisEditado: true, materiais });
    setModalMaterial(null);
  }

  function adicionarItemMaterial(material: MaterialCatalogoMock, quantidade: string, origem: OrigemFornecimento, observacao: string) {
    if (!rascunhoOf) return;
    const existente = materialExistenteParaConsolidar(rascunhoOf.materiais, null, material.materiaPrimaId, origem);

    let materiais: RascunhoMaterialItem[];
    if (existente) {
      materiais = rascunhoOf.materiais.map((item) =>
        item.itemId === existente.itemId
          ? { ...item, quantidadeConfirmada: somarQuantidadesMaterial(existente.quantidadeConfirmada, quantidade) }
          : item,
      );
      setNotaConsolidacaoMaterial(`Consolidado com "${existente.descricao}" (mesmo material e mesma origem do fornecimento).`);
    } else {
      materiais = [
        ...rascunhoOf.materiais,
        {
          itemId: `item-adicionado-${material.materiaPrimaId}-${rascunhoOf.materiais.length}`,
          origemMpId: null,
          materiaPrimaId: material.materiaPrimaId,
          descricao: material.descricao,
          materialEspecificacao: material.materialEspecificacao,
          formaDimensoes: material.formaDimensoes,
          unidade: material.unidade,
          quantidadeConfirmada: quantidade,
          origemFornecimento: origem,
          decisaoAbastecimento: "CE",
          quantidadeCompra: quantidade,
          ajusteOperacional: observacao,
          origemItem: "adicionado" as const,
        },
      ];
      setNotaConsolidacaoMaterial(null);
    }

    setRascunhoOf({ ...rascunhoOf, materiaisEditado: true, materiais });
  }

  function abrirModalAdicionarMaterial() {
    setMaterialSelecionado(null);
    buscaMaterial.setTermo("");
    setQuantidadeNovoItemMaterial("");
    setOrigemNovoItemMaterial("empresa");
    setObservacaoNovoItemMaterial("");
    setErroModalMaterial("");
    setModalMaterial({ modo: "adicionar" });
  }

  // "Editar" pré-preenche com os valores ATUAIS do item (diferente de
  // "Adicionar", que começa em branco) - é uma revisão, não um cadastro novo.
  function abrirModalEditarMaterial(itemId: string) {
    const item = rascunhoOf?.materiais.find((m) => m.itemId === itemId);
    if (!item) return;
    setMaterialSelecionado(null);
    buscaMaterial.setTermo("");
    setQuantidadeNovoItemMaterial(item.quantidadeConfirmada);
    setOrigemNovoItemMaterial(item.origemFornecimento);
    setObservacaoNovoItemMaterial(item.ajusteOperacional);
    setErroModalMaterial("");
    setModalMaterial({ modo: "editar", itemId });
  }

  function confirmarModalMaterial() {
    if (!modalMaterial) return;

    if (modalMaterial.modo === "editar") {
      confirmarEdicaoMaterial(materialSelecionado);
      return;
    }

    if (!materialSelecionado) {
      setErroModalMaterial("Selecione um material do cadastro.");
      return;
    }
    const quantidade = paraNumeroMaterial(quantidadeNovoItemMaterial);
    if (!quantidadeNovoItemMaterial.trim() || quantidade <= 0) {
      setErroModalMaterial("Informe uma quantidade maior que zero.");
      return;
    }

    adicionarItemMaterial(materialSelecionado, quantidadeNovoItemMaterial, origemNovoItemMaterial, observacaoNovoItemMaterial);
    setModalMaterial(null);
  }

  function descartarRascunho(ordem: OrdemFabricacaoMock) {
    setRascunhoOf(construirRascunho(ordem));
    setJustificativaSalvar("");
    setNotaConsolidacaoMaterial(null);
    setErroOperacao(null);
  }

  function salvarAlteracoesOf(projetoId: string, ordem: OrdemFabricacaoMock) {
    if (!rascunhoOf || rascunhoOf.ofId !== ordem.id) return;
    if (!justificativaSalvar.trim()) return;
    if (rascunhoOfInvalido(rascunhoOf)) return;

    const agora = new Date();
    const dataIso = agora.toISOString().slice(0, 10);
    const horaIso = agora.toTimeString().slice(0, 5);
    const responsavel = "Usuário de demonstração (protótipo)";
    const justificativa = justificativaSalvar.trim();

    // Refinamento (Adicionar/Editar/Remover OP) - a lista salva é
    // inteiramente derivada do rascunho (suporta operação adicionada, sem
    // origemOpId correspondente, e operação removida, ausente do
    // rascunho). Para cada operação que já existia, o histórico de
    // revisão (revisoes) é lido de ordem.operacoes - nunca do rascunho -
    // e só recebe uma entrada nova quando o tempo Y realmente mudou;
    // operação nova começa sem nenhuma revisão (não há "antes" para
    // comparar na criação).
    const operacoesAtualizadas: OperacaoProducaoMock[] = rascunhoOf.operacoes.map((item) => {
      const original = item.origemOpId ? ordem.operacoes.find((op) => op.id === item.origemOpId) : undefined;

      // CORREÇÃO (integridade X/Y/Z) - defesa em profundidade: mesmo que a
      // UI do modal já bloqueie a edição de uma operação com execução
      // registrada, o salvamento também ignora qualquer alteração
      // eventualmente presente no rascunho para essa operação e grava o
      // original sem modificação nenhuma - nunca confia só na trava da
      // interface.
      if (original && original.tempoZRealizado !== null) {
        return original;
      }

      const novaSequencia = Number(item.sequencia);
      const novoTempoY = Number(item.tempoYPcp.replace(",", "."));
      const dependeDe = parseDependeDe(item.dependeDeTexto);
      const revisoesBase = original?.revisoes ?? item.revisoes;
      const revisoes =
        original && novoTempoY !== original.tempoYPcp
          ? [
              ...revisoesBase,
              {
                id: `rev-${item.itemId}-${agora.getTime()}`,
                data: dataIso,
                hora: horaIso,
                responsavel,
                tempoAnterior: original.tempoYPcp,
                tempoNovo: novoTempoY,
                justificativa,
              },
            ]
          : revisoesBase;

      // Observação X/Y - mesmo padrão do tempo: compara o texto novo
      // contra o EFETIVO anterior (Y se já revisado, senão X original),
      // nunca contra um valor fixo. Operação nova (sem original) nasce
      // direto como observação operacional, sem "antes" para comparar -
      // nunca gera entrada de revisão na criação (mesmo princípio já
      // aplicado ao tempo Y de operação nova).
      const observacaoTextoNovo = item.observacaoTexto.trim() || null;
      const observacaoRoteiro = original?.observacaoRoteiro ?? null;
      const observacaoEfetivaAnterior = original ? observacaoPlanejadaOperacao(original) : null;
      const revisoesObservacaoBase = original?.revisoesObservacao ?? item.revisoesObservacao;
      const revisoesObservacao =
        original && observacaoTextoNovo !== observacaoEfetivaAnterior
          ? [
              ...revisoesObservacaoBase,
              {
                id: `rev-obs-${item.itemId}-${agora.getTime()}`,
                data: dataIso,
                hora: horaIso,
                responsavel,
                textoAnterior: observacaoEfetivaAnterior,
                textoNovo: observacaoTextoNovo,
                justificativa,
              },
            ]
          : revisoesObservacaoBase;
      const observacaoPcp = original
        ? (revisoesObservacao.length > 0 ? observacaoTextoNovo : (original.observacaoPcp ?? null))
        : observacaoTextoNovo;

      return {
        id: item.origemOpId ?? item.itemId,
        sequencia: novaSequencia,
        descricao: item.descricao,
        recurso: item.recurso,
        dependeDe,
        ferramentaEspecial: item.ferramentaEspecial,
        tratamento: item.tratamento,
        terceirizada: item.terceirizada,
        tempoXComercial: item.tempoXComercial,
        tempoYPcp: novoTempoY,
        tempoZRealizado: item.tempoZRealizado,
        horasMaquina: item.horasMaquina,
        horasColaborador: item.horasColaborador,
        condicaoLiberacao: item.condicaoLiberacao,
        semRecursoProdutivo: item.semRecursoProdutivo,
        revisoes,
        observacaoRoteiro,
        observacaoPcp,
        revisoesObservacao,
      };
    });
    operacoesAtualizadas.sort((a, b) => a.sequencia - b.sequencia);

    // Momento Y - a proposta original do roteiro (ordem.materiaPrima tal
    // como veio do BOM) nunca é lida de volta aqui: a lista salva é
    // inteiramente derivada do rascunho, que já é a cópia operacional da
    // OF, nunca o roteiro - corrigir/substituir/adicionar/remover/
    // consolidar refletem só nesta OF, nunca no roteiro original nem em
    // outra OF/projeto.
    const materiaPrimaAtualizada: MateriaPrimaOfMock[] = rascunhoOf.materiais.map((item) => ({
      id: item.origemMpId ?? item.itemId,
      descricao: item.descricao,
      materialEspecificacao: item.materialEspecificacao,
      formaDimensoes: item.formaDimensoes,
      quantidadeNecessaria: `${item.quantidadeConfirmada} ${item.unidade}`,
      ajusteOperacional: item.ajusteOperacional.trim() || undefined,
      materiaPrimaId: item.materiaPrimaId,
      quantidadeConfirmada: paraNumeroMaterial(item.quantidadeConfirmada),
      unidade: item.unidade,
      origemFornecimento: item.origemFornecimento,
      quantidadeCi: item.origemFornecimento === "empresa" ? quantidadeCiEfetiva(item) : undefined,
    }));

    const revisaoSalvaEm = agora.toISOString();

    atualizarOrdensFabricacao(projetoId, (ordens) =>
      ordens.map((of) =>
        of.id === ordem.id
          ? { ...of, operacoes: operacoesAtualizadas, materiaPrima: materiaPrimaAtualizada, revisaoSalvaEm }
          : of,
      ),
    );
    setJustificativaSalvar("");
    setNotaConsolidacaoMaterial(null);
    setErroOperacao(null);
    setRascunhoOf(
      construirRascunho({ ...ordem, operacoes: operacoesAtualizadas, materiaPrima: materiaPrimaAtualizada, revisaoSalvaEm }),
    );
  }

  if (visao.tipo === "resumo") {
    const projetoLiberado = liberados.find((p) => p.id === visao.projetoId);
    const projetoAguardando = projetoLiberado ? undefined : aguardando.find((p) => p.id === visao.projetoId);
    const projeto = projetoLiberado ?? projetoAguardando;
    const observacoes = projetoLiberado ? observacoesPorProjeto[projetoLiberado.id] ?? [] : [];

    return (
      <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <div className="rounded-[10px] border border-status-warning-border bg-status-warning-bg px-4 py-2.5 text-[12.5px] font-semibold text-status-warning-text">
            Ambiente de demonstração — dados fictícios, nenhuma conexão com produção.
          </div>

          <button
            type="button"
            onClick={() => setVisao({ tipo: "lista" })}
            className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-action-primary hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus-ring"
          >
            <ChevronLeftIcon />
            Voltar à Lista de Prioridades
          </button>

          {!projeto ? (
            <EmptyState title="Projeto não encontrado" description="Este projeto de demonstração não existe mais na lista atual." />
          ) : (
            <>
              <header>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-disabled">Resumo do Projeto</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">{projeto.numeroProjeto}</h1>
                <p className="mt-2 text-sm text-text-secondary">
                  {projeto.nomeCliente} · Documento {projeto.documentoCliente}
                </p>
              </header>

              {projetoLiberado ? (
                <>
                  {(() => {
                    const previsao = calcularPrevisaoOperacional(
                      projetoLiberado.ordensFabricacao,
                      projetoLiberado.dataConclusaoPrevista,
                    );
                    const status = calcularSituacaoPrazo(previsao, projetoLiberado.dataEntregaComprometida);
                    const diferencaDias =
                      previsao.confiabilidade === "integral" && previsao.dataConclusaoPrevista
                        ? calcularDiferencaDias(previsao.dataConclusaoPrevista, projetoLiberado.dataEntregaComprometida)
                        : null;
                    return (
                      <>
                        {/* 1. Cabeçalho compacto de identificação (número/cliente/documento já no header acima) */}
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-surface px-5 py-3.5">
                          <CampoCompacto label="Prioridade">#{projetoLiberado.prioridade}</CampoCompacto>
                          <CampoCompacto label="Entrega (compromisso Comercial)">
                            {formatarDataBr(projetoLiberado.dataEntregaComprometida)}
                          </CampoCompacto>
                          <CampoCompacto label="Previsão operacional (PCP)">
                            <span className="inline-flex flex-wrap items-center gap-2">
                              {previsao.confiabilidade === "integral" ? formatarDataBr(previsao.dataConclusaoPrevista) : null}
                              <BadgeConfiabilidade confiabilidade={previsao.confiabilidade} />
                            </span>
                          </CampoCompacto>
                          <CampoCompacto label="Status">
                            <BadgeSituacaoPrazo situacao={status} />
                          </CampoCompacto>
                        </div>
                        {previsao.motivo ? <p className="text-[12px] text-text-secondary">{previsao.motivo}</p> : null}
                        {diferencaDias !== null ? (
                          <p className="text-[12px] text-text-secondary">
                            {diferencaDias === 0
                              ? "Previsão operacional igual à data prometida ao cliente."
                              : diferencaDias > 0
                                ? `Previsão operacional ${diferencaDias} dia(s) após o compromisso com o cliente.`
                                : `Previsão operacional ${Math.abs(diferencaDias)} dia(s) antes do compromisso com o cliente.`}
                          </p>
                        ) : null}
                      </>
                    );
                  })()}

                  {/* 2. Situação das OFs e operações - sempre ao vivo de ordensFabricacao, nunca um contador próprio */}
                  <SecaoResumo titulo="Ordens de Fabricação e Operações">
                    <ResumoCoberturaOfs cobertura={calcularCoberturaOfs(projetoLiberado.ordensFabricacao)} />
                    {projetoLiberado.pendenciasOperacionais.length > 0 ? (
                      <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-3">
                        {projetoLiberado.pendenciasOperacionais.map((pendencia) => (
                          <span key={pendencia} className="text-[13px] text-text-primary">
                            • {pendencia}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <Button
                      variant="secondary"
                      className="w-fit"
                      onClick={() => setVisao({ tipo: "ofs", projetoId: projetoLiberado.id })}
                    >
                      Ver OFs e Operações
                    </Button>
                  </SecaoResumo>

                  {/* 3. Requisições de Compras */}
                  <SecaoResumo titulo="Requisições de Compras">
                    {projetoLiberado.requisicoesCompra.length === 0 ? (
                      <p className="text-[13px] text-text-secondary">Nenhuma requisição de compra pendente para este projeto.</p>
                    ) : (
                      <div className="flex flex-col gap-4">
                        {projetoLiberado.requisicoesCompra.map((requisicao) => (
                          <div key={requisicao.numero} className="flex flex-col gap-2">
                            <p className="text-[12.5px] font-semibold text-text-primary">Requisição nº {requisicao.numero}</p>
                            <Table>
                              <TableHead>
                                <TableHeaderCell>Descrição do material</TableHeaderCell>
                                <TableHeaderCell>Situação / Previsão</TableHeaderCell>
                              </TableHead>
                              <TableBody>
                                {requisicao.materiais.map((material) => (
                                  <TableRow key={material.descricao}>
                                    <TableCell className="whitespace-nowrap">{material.descricao}</TableCell>
                                    <TableCell>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <BadgeSituacaoMaterial situacao={material.situacao} />
                                        <span className="text-[12px] text-text-secondary">{descreverPrevisaoMaterial(material)}</span>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-text-disabled">
                      Demonstração — na integração real, estes dados virão do módulo Compras (Requisição/Pedido/Recebimento).
                    </p>
                  </SecaoResumo>

                  {/* 4. Outras pendências industriais e serviços externos */}
                  <SecaoResumo titulo="Outras pendências industriais e serviços externos">
                    {projetoLiberado.pendenciasExternas.length === 0 ? (
                      <p className="text-[13px] text-text-secondary">Nenhuma pendência registrada.</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {projetoLiberado.pendenciasExternas.map((pendencia) => (
                          <span key={pendencia} className="text-[13px] text-text-primary">
                            • {pendencia}
                          </span>
                        ))}
                      </div>
                    )}
                  </SecaoResumo>

                  {/* 5. Observações do PCP - exclusivamente em memória, nunca sobrescreve observações anteriores */}
                  <SecaoResumo titulo="Observações do PCP">
                    <div className="flex flex-col gap-[7px]">
                      <label htmlFor={idNovaObservacao} className="text-[12.5px] font-semibold text-text-primary">
                        Nova observação
                      </label>
                      <textarea
                        id={idNovaObservacao}
                        value={novaObservacaoTexto}
                        onChange={(event) => setNovaObservacaoTexto(event.target.value)}
                        rows={3}
                        placeholder="Registrar pendência, providência, decisão ou comunicação relevante ao acompanhamento do projeto"
                        className="w-full rounded-[10px] border border-border bg-surface-elevated px-[13px] py-[10px] text-[13.5px] text-text-primary outline-none transition placeholder:text-text-disabled focus-visible:border-action-primary focus-visible:ring-[3px] focus-visible:ring-focus-ring"
                      />
                      <Button
                        variant="secondary"
                        className="w-fit"
                        onClick={() => adicionarObservacaoPcp(projetoLiberado.id)}
                        disabled={!novaObservacaoTexto.trim()}
                      >
                        Adicionar observação
                      </Button>
                    </div>

                    {observacoes.length === 0 ? (
                      <p className="text-[13px] text-text-secondary">Nenhuma observação registrada ainda.</p>
                    ) : (
                      <div className="flex flex-col gap-3 border-t border-border-subtle pt-3">
                        {[...observacoes].reverse().map((observacao) => (
                          <div key={observacao.id} className="flex flex-col gap-0.5">
                            <p className="text-[11.5px] font-semibold text-text-secondary">
                              {formatarDataBr(observacao.data)} às {observacao.hora} · {observacao.responsavel}
                            </p>
                            <p className="text-[13px] text-text-primary">{observacao.texto}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </SecaoResumo>

                  <SecaoResumo titulo="Histórico resumido">
                    <div className="flex flex-col gap-1.5">
                      {projetoLiberado.historico.map((evento) => (
                        <span key={evento.data + evento.evento} className="text-[13px] text-text-secondary">
                          <span className="font-semibold text-text-primary">{formatarDataBr(evento.data)}</span> — {evento.evento}
                        </span>
                      ))}
                    </div>
                  </SecaoResumo>
                </>
              ) : projetoAguardando ? (
                <>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-surface px-5 py-3.5">
                    <CampoCompacto label="Entrega">{formatarDataBr(projetoAguardando.dataEntregaComprometida)}</CampoCompacto>
                  </div>
                  <SecaoResumo titulo="Situação">
                    <p className="text-[13px] text-text-primary">
                      Ainda em Aguardando Análise — pendências:{" "}
                      {projetoAguardando.pendencias.join(", ") || "nenhuma registrada"}
                    </p>
                    <Button
                      variant="secondary"
                      className="w-fit"
                      onClick={() => setVisao({ tipo: "ofs", projetoId: projetoAguardando.id })}
                    >
                      Analisar OFs
                    </Button>
                  </SecaoResumo>
                </>
              ) : null}
            </>
          )}
        </div>
      </main>
    );
  }

  if (visao.tipo === "ofs") {
    const projetoLiberado = liberados.find((p) => p.id === visao.projetoId);
    const projetoAguardando = projetoLiberado ? undefined : aguardando.find((p) => p.id === visao.projetoId);
    const projeto = projetoLiberado ?? projetoAguardando;

    return (
      <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div className="rounded-[10px] border border-status-warning-border bg-status-warning-bg px-4 py-2.5 text-[12.5px] font-semibold text-status-warning-text">
            Ambiente de demonstração — dados fictícios. Nenhuma liberação aqui chama o Motor, &quot;liberar_of&quot; ou
            qualquer RPC real.
          </div>

          <button
            type="button"
            onClick={() => setVisao({ tipo: "resumo", projetoId: visao.projetoId })}
            className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-action-primary hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus-ring"
          >
            <ChevronLeftIcon />
            Voltar ao Resumo do Projeto
          </button>

          {!projeto ? (
            <EmptyState title="Projeto não encontrado" description="Este projeto de demonstração não existe mais na lista atual." />
          ) : (
            <>
              <header>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-disabled">Ordens de Fabricação</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">{projeto.numeroProjeto}</h1>
                <p className="mt-2 text-sm text-text-secondary">
                  {projeto.nomeCliente} · Documento {projeto.documentoCliente}
                </p>
              </header>

              {projeto.ordensFabricacao.length === 0 ? (
                <EmptyState
                  title="Nenhuma OF cadastrada"
                  description="Este projeto de demonstração ainda não possui Ordens de Fabricação simuladas."
                />
              ) : (
                <Table>
                  <TableHead>
                    <TableHeaderCell>OF</TableHeaderCell>
                    <TableHeaderCell>
                      <span className="whitespace-nowrap">Código da peça</span>
                    </TableHeaderCell>
                    <TableHeaderCell>Descrição da peça</TableHeaderCell>
                    <TableHeaderCell>Quantidade</TableHeaderCell>
                    <TableHeaderCell>Liberada</TableHeaderCell>
                  </TableHead>
                  <TableBody>
                    {projeto.ordensFabricacao.map((ordem) => (
                      <TableRow key={ordem.id}>
                        <TableCell className="whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setVisao({ tipo: "ops", projetoId: projeto.id, ofId: ordem.id })}
                            className="font-semibold text-text-primary outline-none transition hover:text-action-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                          >
                            {ordem.numero}
                          </button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{ordem.codigoPeca}</TableCell>
                        <TableCell className="whitespace-nowrap">{ordem.descricaoPeca}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{ordem.quantidade}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={ordem.situacaoLiberacao === "liberada"}
                            disabled={ordem.situacaoLiberacao !== "apta"}
                            onChange={() => abrirModalLiberacaoOf(projeto.id, ordem)}
                            aria-label={`Liberar OF ${ordem.numero}`}
                            title={
                              ordem.situacaoLiberacao === "bloqueada"
                                ? "OF bloqueada - abra a cópia operacional para ver os impedimentos"
                                : ordem.situacaoLiberacao === "liberada"
                                  ? "OF já liberada"
                                  : "Liberar esta OF (abre confirmação)"
                            }
                            className="h-4 w-4 cursor-pointer rounded border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {(() => {
                const cobertura = calcularCoberturaOfs(projeto.ordensFabricacao);
                return (
                  <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-5 py-4">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-text-secondary">
                      <span>
                        Total: <strong className="text-text-primary">{cobertura.total}</strong> OFs
                      </span>
                      <span>
                        Liberadas: <strong className="text-text-primary">{cobertura.liberadas}</strong>
                      </span>
                      <span>
                        Aguardando análise: <strong className="text-text-primary">{cobertura.aptas}</strong>
                      </span>
                      <span>
                        Bloqueadas: <strong className="text-text-primary">{cobertura.bloqueadas}</strong>
                      </span>
                    </div>
                    <p className="text-[11.5px] text-text-secondary">
                      O Motor PCP considera apenas as operações das OFs liberadas, respeitando suas dependências e os
                      recursos disponíveis. Novas OFs liberadas tornam-se elegíveis para o próximo cálculo
                      automaticamente - nenhum recálculo real é disparado neste protótipo.
                    </p>
                    {projetoAguardando ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
                        {cobertura.liberadas === 0 ? (
                          <p className="text-[13px] text-text-secondary">
                            Nenhuma OF liberada ainda - libere ao menos uma OF apta para poder enviar o projeto à
                            Lista de Prioridades.
                          </p>
                        ) : (
                          <p className="text-[13px] text-text-secondary">
                            {cobertura.pendentes > 0
                              ? `A programação será parcial: ${cobertura.liberadas} OF(s) liberada(s), ${cobertura.pendentes} ainda pendente(s).`
                              : `Todas as ${cobertura.total} OF(s) estão liberadas.`}
                          </p>
                        )}
                        <Button
                          variant="primary"
                          className="w-fit"
                          disabled={cobertura.liberadas === 0}
                          onClick={() => abrirModalLiberar(projetoAguardando)}
                        >
                          Liberar projeto para Programação
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </>
          )}
        </div>

        <Modal
          open={pedidoLiberacaoOf !== null}
          onClose={() => setPedidoLiberacaoOf(null)}
          title="Confirmar liberação da OF"
          footer={
            <>
              <Button variant="secondary" onClick={() => setPedidoLiberacaoOf(null)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={confirmarLiberacaoOf}>
                Confirmar liberação
              </Button>
            </>
          }
        >
          {pedidoLiberacaoOf ? (
            <p>
              Confirma a liberação da OF <strong className="text-text-primary">{pedidoLiberacaoOf.of.numero}</strong>{" "}
              ({pedidoLiberacaoOf.of.codigoPeca} — {pedidoLiberacaoOf.of.descricaoPeca}) para fabricação? O responsável
              e o momento da autorização serão registrados automaticamente. (Simulado — nenhuma chamada real.)
            </p>
          ) : null}
        </Modal>
      </main>
    );
  }

  if (visao.tipo === "ops") {
    const projetoIdAtual = visao.projetoId;
    const projetoLiberado = liberados.find((p) => p.id === visao.projetoId);
    const projetoAguardando = projetoLiberado ? undefined : aguardando.find((p) => p.id === visao.projetoId);
    const projeto = projetoLiberado ?? projetoAguardando;
    const ordem = projeto?.ordensFabricacao.find((of) => of.id === visao.ofId);
    const draft = ordem && rascunhoOf?.ofId === ordem.id ? rascunhoOf : null;
    const temAlteracoes = Boolean(draft && ordem && rascunhoTemAlteracoes(draft));
    // Toda OF pode adicionar/substituir material - cai no catálogo genérico
    // quando a OF não tem um catálogo próprio equipado.
    const catalogoDisponivel =
      ordem?.catalogoMateriaPrima && ordem.catalogoMateriaPrima.length > 0
        ? ordem.catalogoMateriaPrima
        : CATALOGO_GENERICO_MATERIA_PRIMA;

    function voltarParaOfs() {
      if (ordem && temAlteracoes) {
        setConfirmandoSaidaSemSalvar(true);
        return;
      }
      setVisao({ tipo: "ofs", projetoId: projetoIdAtual });
    }

    return (
      <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div className="rounded-[10px] border border-status-warning-border bg-status-warning-bg px-4 py-2.5 text-[12.5px] font-semibold text-status-warning-text">
            Ambiente de demonstração — dados fictícios. Esta é uma cópia operacional da OF, não o roteiro original: X
            (Comercial) nunca é alterado aqui; Z (Realizado) nunca é editável. Nada é persistido de verdade.
          </div>

          <button
            type="button"
            onClick={voltarParaOfs}
            className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-action-primary hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus-ring"
          >
            <ChevronLeftIcon />
            Voltar às OFs do Projeto
          </button>

          {!projeto || !ordem || !draft ? (
            <EmptyState title="OF não encontrada" description="Esta Ordem de Fabricação de demonstração não existe mais." />
          ) : (
            <>
              <header className="flex flex-col gap-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
                    {ordem.numero} · {projeto.numeroProjeto}
                  </h1>
                  {/*
                    Requisito registrado (docs/ARQUITETURA_OPERACIONAL_PCP_NEXOTFE.md) -
                    abre a prévia virtual/A4, mesmo para OF não liberada (a
                    segurança vem do aviso "SIMULAÇÃO", não de bloquear o
                    acesso). Nenhuma emissão oficial nem integração com
                    impressora - só a prévia demonstrativa.
                  */}
                  <Button
                    variant="secondary"
                    className="h-9 px-3 text-[12.5px]"
                    onClick={() => setVisao({ tipo: "impressao", projetoId: projetoIdAtual, ofId: ordem.id })}
                  >
                    Imprimir OF
                  </Button>
                </div>
                <p className="text-sm text-text-secondary">
                  {ordem.codigoPeca} — {ordem.descricaoPeca} · {ordem.quantidade} un
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <BadgeSituacaoLiberacaoOf situacao={ordem.situacaoLiberacao} />
                  {ordem.revisaoSalvaEm ? (
                    <Badge variant="success">Revisada</Badge>
                  ) : (
                    <Badge variant="warning">Aguardando revisão</Badge>
                  )}
                  <Badge variant="neutral">{LABEL_NATUREZA_COMERCIAL[projeto.naturezaComercial]}</Badge>
                  {ordem.liberacao ? (
                    <span className="text-[11px] text-text-secondary">
                      {ordem.liberacao.responsavel} em {formatarDataBr(ordem.liberacao.data)} às {ordem.liberacao.hora}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-text-secondary">
                  <span>Desenho: {ordem.desenhoTecnico}</span>
                  {ordem.ferramentaEspecial ? <span>Ferramenta: {ordem.ferramentaEspecial}</span> : null}
                  {ordem.servicoExterno ? <span>Serviço externo: {ordem.servicoExterno}</span> : null}
                </div>
                {ordem.pendencias.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {ordem.pendencias.map((pendencia) => (
                      <span key={pendencia} className="text-[12.5px] text-status-danger-text">
                        • {pendencia}
                      </span>
                    ))}
                  </div>
                ) : null}
              </header>

              {temAlteracoes ? (
                <div className="rounded-[10px] border border-status-warning-border bg-status-warning-bg px-4 py-2.5 text-[12.5px] font-semibold text-status-warning-text">
                  Alterações ainda não salvas nesta cópia operacional.
                </div>
              ) : null}

              <SecaoResumo
                titulo="Matéria-prima"
                acoes={
                  <Button variant="secondary" className="h-8 px-3 text-[12px]" onClick={abrirModalAdicionarMaterial}>
                    Adicionar material
                  </Button>
                }
              >
                <div className="flex flex-col gap-3">
                  {notaConsolidacaoMaterial ? (
                    <div className="rounded-[10px] border border-status-info-border bg-status-info-bg px-4 py-2.5 text-[12.5px] font-semibold text-status-info-text">
                      {notaConsolidacaoMaterial}
                    </div>
                  ) : null}

                  {draft.materiais.length === 0 ? (
                    <EmptyState
                      title="Nenhuma matéria-prima nesta OF"
                      description="O roteiro não prevê consumo de material próprio para esta natureza. Use &quot;Adicionar material&quot; caso, excepcionalmente, seja necessário algum insumo."
                    />
                  ) : (
                    // Tabela compacta (OF com 20+ materiais): Material ocupa o espaço
                    // livre e quebra linha (sem whitespace-nowrap, sem truncamento);
                    // as demais colunas são estreitas de propósito para não forçar
                    // rolagem horizontal.
                    <Table>
                      <TableHead>
                        <TableHeaderCell>Material</TableHeaderCell>
                        <TableHeaderCell>Qtd.</TableHeaderCell>
                        <TableHeaderCell>Un.</TableHeaderCell>
                        <TableHeaderCell>CI/CE/P</TableHeaderCell>
                        <TableHeaderCell>
                          <span className="whitespace-nowrap">Qtd. Compra</span>
                        </TableHeaderCell>
                        <TableHeaderCell>Ações</TableHeaderCell>
                      </TableHead>
                      <TableBody>
                        {draft.materiais.map((item) => {
                          const erro = validarItemMaterial(item);
                          const quantidade = paraNumeroMaterial(item.quantidadeConfirmada);
                          const compraEfetiva = quantidadeCompraEfetiva(item);
                          return (
                            <TableRow key={item.itemId}>
                              <TableCell className="w-auto">
                                <div className="flex flex-col gap-1">
                                  <span className="font-semibold text-text-primary">{item.descricao}</span>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {item.origemFornecimento === "cliente" ? (
                                      <Badge variant="neutral">Fornecido pelo cliente</Badge>
                                    ) : null}
                                    {item.origemItem === "adicionado" ? <Badge variant="neutral">Adicionado</Badge> : null}
                                    {item.substituiuDescricaoOriginal ? (
                                      <span className="text-[11px] text-text-secondary">
                                        Substituiu: {item.substituiuDescricaoOriginal}
                                      </span>
                                    ) : null}
                                  </div>
                                  {item.ajusteOperacional ? (
                                    <span className="text-[11px] italic text-text-secondary">Obs.: {item.ajusteOperacional}</span>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell className="w-[64px] tabular-nums">
                                {paraTextoMaterial(quantidade)}
                                {erro.quantidade ? (
                                  <p className="mt-1 text-[11px] font-semibold text-status-danger-text">{erro.quantidade}</p>
                                ) : null}
                              </TableCell>
                              <TableCell className="w-[56px]">{item.unidade}</TableCell>
                              <TableCell className="w-[140px]">
                                {item.origemFornecimento === "cliente" ? (
                                  <span className="text-[11.5px] text-text-secondary">Não se aplica</span>
                                ) : (
                                  <SeletorAbastecimento
                                    valor={item.decisaoAbastecimento}
                                    onChange={(decisao) => alterarDecisaoAbastecimento(item.itemId, decisao)}
                                    ariaLabel={`Decisão de abastecimento de ${item.descricao}`}
                                  />
                                )}
                              </TableCell>
                              <TableCell className="w-[120px]">
                                {item.origemFornecimento === "cliente" ? (
                                  <span className="text-[11.5px] text-text-secondary">—</span>
                                ) : item.decisaoAbastecimento === "P" ? (
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={item.quantidadeCompra}
                                    onChange={(event) => alterarQuantidadeCompra(item.itemId, event.target.value)}
                                    aria-label={`Quantidade de compra de ${item.descricao}`}
                                    className={[
                                      "h-9 w-20 rounded-[8px] border bg-surface-elevated px-2 text-[12.5px] tabular-nums text-text-primary outline-none transition focus-visible:border-action-primary focus-visible:ring-[3px] focus-visible:ring-focus-ring",
                                      erro.quantidadeCompra ? "border-status-danger-border" : "border-border",
                                    ].join(" ")}
                                  />
                                ) : (
                                  <span className="tabular-nums text-text-secondary">{paraTextoMaterial(compraEfetiva)}</span>
                                )}
                                {erro.quantidadeCompra ? (
                                  <p className="mt-1 text-[11px] font-semibold text-status-danger-text">{erro.quantidadeCompra}</p>
                                ) : null}
                              </TableCell>
                              <TableCell className="w-[110px]">
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    className="h-7 gap-1 px-2 text-[11.5px]"
                                    onClick={() => abrirModalEditarMaterial(item.itemId)}
                                  >
                                    <PencilIcon />
                                    Editar
                                  </Button>
                                  <Button
                                    variant="danger"
                                    className="h-7 gap-1 px-2 text-[11.5px]"
                                    onClick={() => removerItemMaterial(item.itemId)}
                                  >
                                    <TrashIcon />
                                    Remover
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </SecaoResumo>

              <SecaoResumo
                titulo="Operações de Produção"
                acoes={
                  <Button variant="secondary" className="h-8 px-3 text-[12px]" onClick={abrirModalAdicionarOperacao}>
                    Adicionar OP
                  </Button>
                }
              >
                <div className="flex flex-col gap-3">
                  {erroOperacao ? (
                    <div className="rounded-[10px] border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-[12.5px] font-semibold text-status-danger-text">
                      {erroOperacao}
                    </div>
                  ) : null}

                  {draft.operacoes.length === 0 ? (
                    <EmptyState title="Nenhuma operação nesta OF" description="Use &quot;Adicionar OP&quot; para incluir uma operação de produção." />
                  ) : (
                    <Table>
                      <TableHead>
                        <TableHeaderCell>OP</TableHeaderCell>
                        <TableHeaderCell>Operação</TableHeaderCell>
                        <TableHeaderCell>Recurso</TableHeaderCell>
                        <TableHeaderCell>Observações</TableHeaderCell>
                        <TableHeaderCell>
                          <span className="whitespace-nowrap" title="X Comercial">
                            X
                          </span>
                        </TableHeaderCell>
                        <TableHeaderCell>
                          <span className="whitespace-nowrap" title="Y PCP">
                            Y
                          </span>
                        </TableHeaderCell>
                        <TableHeaderCell>
                          <span className="whitespace-nowrap" title="Z Realizado">
                            Z
                          </span>
                        </TableHeaderCell>
                        <TableHeaderCell>Ações</TableHeaderCell>
                      </TableHead>
                      <TableBody>
                        {draft.operacoes.map((item) => {
                          const tempoYNumero = paraNumeroMaterial(item.tempoYPcp);
                          const mostrarDetalheZ =
                            item.tempoZRealizado !== null && (item.horasMaquina !== undefined || item.horasColaborador !== undefined);
                          const executada = operacaoJaExecutada(item);
                          return (
                            <TableRow key={item.itemId}>
                              <TableCell className="w-[40px] tabular-nums">{item.sequencia}</TableCell>
                              <TableCell className="min-w-[240px]">
                                <div className="flex min-w-0 flex-col gap-1">
                                  <span className="font-semibold text-text-primary">{item.descricao}</span>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-text-secondary">
                                    {item.origemItem === "adicionada" ? <Badge variant="neutral">Adicionada</Badge> : null}
                                    {item.ferramentaEspecial ? <Badge variant="neutral">Ferramenta especial</Badge> : null}
                                    {item.tratamento ? <Badge variant="neutral">{item.tratamento}</Badge> : null}
                                    {item.terceirizada ? <Badge variant="warning">Terceirizada</Badge> : null}
                                    {item.semRecursoProdutivo ? <Badge variant="danger">Sem recurso produtivo</Badge> : null}
                                  </div>
                                  {item.semRecursoProdutivo ? (
                                    <span className="text-[11.5px] text-status-danger-text">
                                      Excluída do cálculo oficial do Motor até que um recurso produtivo seja associado -
                                      impede previsão operacional integral mesmo com a OF liberada.
                                    </span>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell className="w-[130px]">{item.recurso}</TableCell>
                              <TableCell className="min-w-[200px]">
                                <span className="block w-full break-words text-[12px] text-text-secondary">
                                  {item.observacaoTexto || "—"}
                                </span>
                              </TableCell>
                              <TableCell className="w-[52px] whitespace-nowrap text-[11.5px] tabular-nums text-text-secondary">
                                {formatarHoras(item.tempoXComercial)}
                              </TableCell>
                              <TableCell className="w-[70px] whitespace-nowrap text-[11.5px] tabular-nums text-text-secondary">
                                {formatarHoras(tempoYNumero)}
                              </TableCell>
                              <TableCell className="w-[70px]">
                                <div className="flex min-w-0 flex-col items-start gap-0.5 text-[11.5px] tabular-nums">
                                  <span className={item.tempoZRealizado === null ? "text-text-disabled" : "text-text-secondary"}>
                                    {formatarHoras(item.tempoZRealizado)}
                                  </span>
                                  {mostrarDetalheZ ? (
                                    <span className="block w-full break-words text-[10.5px] text-text-secondary">
                                      {item.horasMaquina !== undefined ? `Máquina: ${formatarHoras(item.horasMaquina)}` : ""}
                                      {item.horasMaquina !== undefined && item.horasColaborador !== undefined ? " · " : ""}
                                      {item.horasColaborador !== undefined ? `Colaborador: ${formatarHoras(item.horasColaborador)}` : ""}
                                    </span>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell className="w-[110px]">
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    className="h-7 gap-1 px-2 text-[11.5px]"
                                    onClick={() => abrirModalEditarOperacao(item.itemId)}
                                  >
                                    <PencilIcon />
                                    Editar
                                  </Button>
                                  <Button
                                    variant="danger"
                                    className="h-7 gap-1 px-2 text-[11.5px]"
                                    disabled={executada}
                                    title={executada ? "Operação já executada - não pode ser removida." : undefined}
                                    onClick={() => removerOperacaoItem(item.itemId)}
                                  >
                                    <TrashIcon />
                                    Remover
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </SecaoResumo>

              <SecaoResumo titulo="Salvar alterações">
                <Field
                  label="Justificativa da revisão"
                  value={justificativaSalvar}
                  onChange={(event) => setJustificativaSalvar(event.target.value)}
                  placeholder="Ex.: necessidade de fixação especial"
                  disabled={!temAlteracoes}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="primary"
                    className="w-fit"
                    disabled={!temAlteracoes || !justificativaSalvar.trim() || rascunhoOfInvalido(draft)}
                    onClick={() => salvarAlteracoesOf(projeto.id, ordem)}
                  >
                    Salvar alterações
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-fit"
                    disabled={!temAlteracoes}
                    onClick={() => descartarRascunho(ordem)}
                  >
                    Descartar alterações
                  </Button>
                </div>
                {rascunhoOfInvalido(draft) ? (
                  <p className="text-[12px] text-status-danger-text">
                    Verifique sequência, recurso, tempo Y e a matéria-prima (quantidade e CI/CE) - todos precisam de um
                    valor válido antes de salvar.
                  </p>
                ) : null}
              </SecaoResumo>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-5 py-4">
                <p className="text-[13px] text-text-secondary">
                  {ordem.situacaoLiberacao === "liberada"
                    ? "Esta OF já está liberada."
                    : ordem.situacaoLiberacao === "bloqueada"
                      ? "OF bloqueada - trate as pendências listadas acima antes de liberar."
                      : temAlteracoes
                        ? "Salve as alterações antes de confirmar a liberação."
                        : "Conferidos material e operações, a OF pode ser liberada."}
                </p>
                <Button
                  variant="primary"
                  className="w-fit"
                  disabled={ordem.situacaoLiberacao !== "apta" || temAlteracoes}
                  onClick={() => abrirModalLiberacaoOf(projeto.id, ordem)}
                >
                  Confirmar liberação da OF
                </Button>
              </div>
            </>
          )}
        </div>

        <Modal
          open={confirmandoSaidaSemSalvar}
          onClose={() => setConfirmandoSaidaSemSalvar(false)}
          title="Alterações não salvas"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmandoSaidaSemSalvar(false)}>
                Continuar editando
              </Button>
              <Button
                variant="danger-solid"
                onClick={() => {
                  if (ordem) descartarRascunho(ordem);
                  setConfirmandoSaidaSemSalvar(false);
                  setVisao({ tipo: "ofs", projetoId: projetoIdAtual });
                }}
              >
                Descartar e voltar
              </Button>
            </>
          }
        >
          <p>
            Esta cópia operacional tem alterações ainda não salvas. Se você voltar agora, essas alterações serão
            descartadas.
          </p>
        </Modal>

        <Modal
          open={modalMaterial !== null}
          onClose={() => setModalMaterial(null)}
          title={modalMaterial?.modo === "editar" ? "Editar material" : "Adicionar material"}
          size="lg"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalMaterial(null)}>
                Cancelar
              </Button>
              <Button onClick={confirmarModalMaterial}>{modalMaterial?.modo === "editar" ? "Salvar edição" : "Adicionar"}</Button>
            </>
          }
        >
          {/*
            min-h reserva espaço vertical suficiente para a lista de
            resultados do combobox (até ~256px) nunca ser cortada pelo
            overflow-hidden do próprio Modal.
          */}
          <div className="flex min-h-[320px] flex-col gap-3.5 text-left">
            <div className="flex flex-col gap-[7px]">
              <label className="text-[12.5px] font-semibold text-text-primary">
                {modalMaterial?.modo === "editar" ? "Trocar por outro material (opcional)" : "Material do cadastro"}
              </label>
              <DropdownBuscaPaginada<MaterialCatalogoMock>
                busca={buscaMaterial}
                valorSelecionado={materialSelecionado}
                aoSelecionar={(material) => {
                  setMaterialSelecionado(material);
                  setErroModalMaterial("");
                }}
                aoLimparSelecao={() => setMaterialSelecionado(null)}
                obterId={(m) => m.materiaPrimaId}
                obterTextoExibicao={(m) => m.descricao}
                renderItem={(m) => (
                  <div className="flex flex-col">
                    <span className="font-semibold">{m.descricao}</span>
                    <span className="text-[12px] text-text-secondary">
                      {m.codigo} · {m.materialEspecificacao}, {m.formaDimensoes}
                    </span>
                  </div>
                )}
                placeholder={
                  modalMaterial?.modo === "editar"
                    ? "Buscar para trocar o material (deixe em branco para manter o atual)"
                    : "Buscar por código, descrição, forma ou bitola"
                }
                ariaLabel="Material do cadastro"
              />
            </div>

            <div className="flex items-end gap-2">
              <Field
                label="Quantidade"
                value={quantidadeNovoItemMaterial}
                onChange={(event) => setQuantidadeNovoItemMaterial(event.target.value)}
                placeholder="0"
              />
              <Select
                label="Origem do fornecimento"
                value={origemNovoItemMaterial}
                onChange={(event) => setOrigemNovoItemMaterial(event.target.value as OrigemFornecimento)}
                options={[
                  { value: "empresa", label: "Empresa" },
                  { value: "cliente", label: "Cliente" },
                ]}
              />
            </div>
            <Field
              label="Observação técnica (opcional)"
              value={observacaoNovoItemMaterial}
              onChange={(event) => setObservacaoNovoItemMaterial(event.target.value)}
              placeholder="Ex.: motivo da inclusão/edição"
            />

            {erroModalMaterial ? <span className="text-[11.5px] text-status-danger-text">{erroModalMaterial}</span> : null}
          </div>
        </Modal>

        <Modal
          open={modalOperacao !== null}
          onClose={() => setModalOperacao(null)}
          title={modalOperacao?.modo === "editar" ? "Editar operação" : "Adicionar OP"}
          size="lg"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOperacao(null)}>
                Cancelar
              </Button>
              <Button onClick={confirmarModalOperacao}>{modalOperacao?.modo === "editar" ? "Salvar edição" : "Adicionar"}</Button>
            </>
          }
        >
          {(() => {
            const itemEmEdicao =
              modalOperacao?.modo === "editar" ? rascunhoOf?.operacoes.find((op) => op.itemId === modalOperacao.itemId) : undefined;
            const travadaPorExecucao = itemEmEdicao ? operacaoJaExecutada(itemEmEdicao) : false;
            return (
              <div className="flex flex-col gap-3.5 text-left">
                {travadaPorExecucao ? (
                  <div className="rounded-[10px] border border-status-warning-border bg-status-warning-bg px-4 py-2.5 text-[12.5px] font-semibold text-status-warning-text">
                    Operação com execução registrada. Planejamento bloqueado.
                  </div>
                ) : null}

                <Field
                  label="Descrição"
                  value={descricaoNovaOperacao}
                  onChange={(event) => setDescricaoNovaOperacao(event.target.value)}
                  placeholder="Ex.: Fresamento"
                  disabled={travadaPorExecucao}
                />
                <div className="flex items-end gap-2">
                  <Field
                    label="Sequência"
                    value={sequenciaNovaOperacao}
                    onChange={(event) => setSequenciaNovaOperacao(event.target.value)}
                    placeholder="10"
                    disabled={travadaPorExecucao}
                  />
                  <Field
                    label="Recurso"
                    value={recursoNovaOperacao}
                    onChange={(event) => setRecursoNovaOperacao(event.target.value)}
                    placeholder="Ex.: Torno CNC"
                    disabled={travadaPorExecucao}
                  />
                  <Field
                    label="Tempo Y (h)"
                    value={tempoYNovaOperacao}
                    onChange={(event) => setTempoYNovaOperacao(event.target.value)}
                    placeholder="0,5"
                    disabled={travadaPorExecucao}
                  />
                </div>
                <Field
                  label="Depende da(s) OP (sequências separadas por vírgula, opcional)"
                  value={dependeDeNovaOperacao}
                  onChange={(event) => setDependeDeNovaOperacao(event.target.value)}
                  placeholder="Ex.: 10, 20"
                  disabled={travadaPorExecucao}
                />

                <div className="flex flex-col gap-[7px]">
                  <label htmlFor="observacao-nova-operacao" className="text-[12.5px] font-semibold text-text-primary">
                    Observação
                  </label>
                  <textarea
                    id="observacao-nova-operacao"
                    value={observacaoNovaOperacao}
                    onChange={(event) => setObservacaoNovaOperacao(event.target.value)}
                    placeholder="Instrução técnica para a execução desta operação"
                    rows={3}
                    disabled={travadaPorExecucao}
                    className={[
                      "w-full resize-y rounded-[10px] border bg-surface-elevated px-[13px] py-[10px] text-[13.5px] text-text-primary outline-none transition placeholder:text-text-disabled",
                      "focus-visible:border-action-primary focus-visible:ring-[3px] focus-visible:ring-focus-ring",
                      travadaPorExecucao ? "cursor-not-allowed border-border-subtle bg-border-subtle text-text-disabled" : "border-border",
                    ].join(" ")}
                  />
                  {itemEmEdicao?.observacaoRoteiroOriginal ? (
                    <span className="text-[11px] text-text-secondary">
                      Observação original do roteiro: &ldquo;{itemEmEdicao.observacaoRoteiroOriginal}&rdquo; (nunca
                      editável; alterar aqui grava uma observação operacional desta OF, sem modificar o roteiro).
                    </span>
                  ) : null}
                </div>

                {itemEmEdicao ? (
                  <p className="text-[11px] text-text-secondary">
                    X Comercial: {formatarHoras(itemEmEdicao.tempoXComercial)} (referência, nunca editável) · Z
                    Realizado: {formatarHoras(itemEmEdicao.tempoZRealizado)} (nunca editável)
                  </p>
                ) : (
                  <p className="text-[11px] text-text-secondary">
                    Operação nova: sem referência X Comercial do orçamento - o tempo Y informado aqui se torna a única
                    referência desta operação.
                  </p>
                )}

                {erroModalOperacao ? <span className="text-[11.5px] text-status-danger-text">{erroModalOperacao}</span> : null}
              </div>
            );
          })()}
        </Modal>

        {/*
          ACHADO PRÉ-EXISTENTE (não introduzido pelo Momento Y, encontrado em
          teste real no navegador): "Confirmar liberação da OF" nesta tela já
          chamava abrirModalLiberacaoOf antes desta evolução, mas o modal de
          confirmação só existia na view "ofs" (Lista de OFs do Projeto) -
          clicar aqui definia o estado sem nenhum lugar para exibi-lo, então
          a liberação nunca se completava a partir da própria Cópia
          Operacional. Mesmo modal duplicado aqui (mesmo padrão já usado por
          este arquivo para o modal "Alterações não salvas", próprio de cada
          view) - nenhuma mudança de texto/comportamento, só o lugar onde
          aparece.
        */}
        <Modal
          open={pedidoLiberacaoOf !== null}
          onClose={() => setPedidoLiberacaoOf(null)}
          title="Confirmar liberação da OF"
          footer={
            <>
              <Button variant="secondary" onClick={() => setPedidoLiberacaoOf(null)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={confirmarLiberacaoOf}>
                Confirmar liberação
              </Button>
            </>
          }
        >
          {pedidoLiberacaoOf ? (
            <p>
              Confirma a liberação da OF <strong className="text-text-primary">{pedidoLiberacaoOf.of.numero}</strong>{" "}
              ({pedidoLiberacaoOf.of.codigoPeca} — {pedidoLiberacaoOf.of.descricaoPeca}) para fabricação? O responsável
              e o momento da autorização serão registrados automaticamente. (Simulado — nenhuma chamada real.)
            </p>
          ) : null}
        </Modal>
      </main>
    );
  }

  if (visao.tipo === "impressao") {
    const projetoIdAtual = visao.projetoId;
    const projetoLiberado = liberados.find((p) => p.id === visao.projetoId);
    const projetoAguardando = projetoLiberado ? undefined : aguardando.find((p) => p.id === visao.projetoId);
    const projeto = projetoLiberado ?? projetoAguardando;
    // Lê exclusivamente o último estado SALVO (ordem.*) - nunca rascunhoOf,
    // mesmo que seja a mesma OF que está aberta na Cópia Operacional com
    // edições em andamento (regra 5 do pedido).
    const ordem = projeto?.ordensFabricacao.find((of) => of.id === visao.ofId);
    const temAlteracoesNaoSalvas = Boolean(rascunhoOf && rascunhoOf.ofId === visao.ofId && rascunhoTemAlteracoes(rascunhoOf));
    const naoLiberada = ordem ? ordem.situacaoLiberacao !== "liberada" : true;

    return (
      <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <div className="of-impressao-sem-imprimir rounded-[10px] border border-status-warning-border bg-status-warning-bg px-4 py-2.5 text-[12.5px] font-semibold text-status-warning-text">
            Ambiente de demonstração — prévia visual mockada. Nenhuma emissão oficial, geração de PDF ou integração com
            impressora nesta etapa; usar Ctrl+P do navegador só para ver a simulação de página A4.
          </div>

          <div className="of-impressao-sem-imprimir flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setVisao({ tipo: "ops", projetoId: projetoIdAtual, ofId: visao.ofId })}
              className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-action-primary hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus-ring"
            >
              <ChevronLeftIcon />
              Voltar à Cópia Operacional
            </button>

            <div className="flex items-center gap-2">
              <div role="group" aria-label="Modo de apresentação" className="inline-flex overflow-hidden rounded-[8px] border border-border">
                <button
                  type="button"
                  aria-pressed={modoApresentacaoImpressao === "tela"}
                  onClick={() => setModoApresentacaoImpressao("tela")}
                  title="Visualização da OF na tela."
                  className={[
                    "h-9 px-2.5 text-[12.5px] font-semibold transition",
                    modoApresentacaoImpressao === "tela" ? "bg-action-primary text-action-primary-text" : "bg-surface text-text-primary hover:bg-border-subtle",
                  ].join(" ")}
                >
                  Tela
                </button>
                <button
                  type="button"
                  aria-pressed={modoApresentacaoImpressao === "a4"}
                  onClick={() => setModoApresentacaoImpressao("a4")}
                  title="Prévia de impressão A4."
                  className={[
                    "h-9 border-l border-border px-2.5 text-[12.5px] font-semibold transition",
                    modoApresentacaoImpressao === "a4" ? "bg-action-primary text-action-primary-text" : "bg-surface text-text-primary hover:bg-border-subtle",
                  ].join(" ")}
                >
                  Impressa
                </button>
              </div>
              <div role="group" aria-label="Modelo de OF" className="inline-flex overflow-hidden rounded-[8px] border border-border">
                <button
                  type="button"
                  aria-pressed={modeloTempoPlanejado === "com"}
                  onClick={() => setModeloTempoPlanejado("com")}
                  title="OF com tempo planejado."
                  className={[
                    "h-9 px-2.5 text-[12.5px] font-semibold transition",
                    modeloTempoPlanejado === "com" ? "bg-action-primary text-action-primary-text" : "bg-surface text-text-primary hover:bg-border-subtle",
                  ].join(" ")}
                >
                  Mod 1
                </button>
                <button
                  type="button"
                  aria-pressed={modeloTempoPlanejado === "sem"}
                  onClick={() => setModeloTempoPlanejado("sem")}
                  title="OF sem tempo planejado."
                  className={[
                    "h-9 border-l border-border px-2.5 text-[12.5px] font-semibold transition",
                    modeloTempoPlanejado === "sem" ? "bg-action-primary text-action-primary-text" : "bg-surface text-text-primary hover:bg-border-subtle",
                  ].join(" ")}
                >
                  Mod 2
                </button>
              </div>
              <Button
                variant="secondary"
                className="h-9 px-2.5 text-[12.5px]"
                title="Imprimir ou salvar PDF pelo navegador."
                onClick={() => window.print()}
              >
                PDF
              </Button>
            </div>
          </div>

          {!projeto || !ordem ? (
            <EmptyState title="OF não encontrada" description="Esta Ordem de Fabricação de demonstração não existe mais." />
          ) : (
            <>
              {/*
                Os dois modos ficam sempre montados; só a visibilidade em
                tela muda com o toggle (display inline, não unmount). Isso
                permite que a impressão real force sempre o documento A4
                via CSS abaixo, com !important vencendo o display inline -
                não importa qual modo estava selecionado quando o usuário
                clicou em imprimir.
              */}
              <div
                className="of-impressao-tela-wrapper"
                style={modoApresentacaoImpressao === "a4" ? { display: "none" } : undefined}
              >
                <ConteudoOfVirtual
                  projeto={projeto}
                  ordem={ordem}
                  naoLiberada={naoLiberada}
                  temAlteracoesNaoSalvas={temAlteracoesNaoSalvas}
                  comTempoPlanejado={modeloTempoPlanejado === "com"}
                />
              </div>
              <div
                className="of-impressao-a4-wrapper flex justify-center"
                style={modoApresentacaoImpressao === "tela" ? { display: "none" } : undefined}
              >
                <ConteudoImpressaoOfA4
                  projeto={projeto}
                  ordem={ordem}
                  naoLiberada={naoLiberada}
                  temAlteracoesNaoSalvas={temAlteracoesNaoSalvas}
                  comTempoPlanejado={modeloTempoPlanejado === "com"}
                />
              </div>
            </>
          )}
        </div>

        {/*
          Técnica padrão de impressão web: esconde tudo, exceto o conteúdo
          marcado como imprimível, e força tamanho A4 no @page. Escopado por
          classe (.of-impressao-conteudo/.of-impressao-sem-imprimir) para
          nunca vazar para as demais telas do protótipo. Força sempre o
          wrapper A4 visível e o de tela oculto na impressão, independente
          do toggle selecionado (ver comentário acima).
        */}
        <style>{`
          @media print {
            /*
              Correção "folha dentro de folha" (autorizada após diagnóstico):
              1) body mantém o fundo colorido do app mesmo com "body *"
              escondendo os descendentes - só o body em si nunca era
              escondido, então a cor do app pintava a folha física inteira.
              2) .of-impressao-conteudo tem border/padding/shadow pensados
              só para a prévia EM TELA (simular papel flutuando sobre o
              fundo cinza do app); na impressão real isso somava com a
              margem do @page (15mm + 15mm), dobrando o recuo e deixando a
              borda/sombra visíveis sobre o fundo do item 1. As duas juntas
              formavam o efeito relatado. Escopado só a @media print - a
              prévia A4 em tela (fora de impressão) fica como estava.
            */
            body { background: #fff !important; }
            body * { visibility: hidden; }
            .of-impressao-conteudo, .of-impressao-conteudo * { visibility: visible; }
            .of-impressao-conteudo {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              border: none !important;
              padding: 0 !important;
              box-shadow: none !important;
            }
            .of-impressao-sem-imprimir { display: none !important; }
            .of-impressao-tela-wrapper { display: none !important; }
            .of-impressao-a4-wrapper { display: block !important; }
            @page { size: A4; margin: 15mm; }
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="rounded-[10px] border border-status-warning-border bg-status-warning-bg px-4 py-2.5 text-[12.5px] font-semibold text-status-warning-text">
          Ambiente de demonstração — dados fictícios, nenhuma conexão com produção. Nenhuma ação nesta tela chama o Supabase, o Motor ou prioridades reais.
        </div>

        <header className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <ModuleBackButton label="PCP" />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-disabled">PCP · Protótipo</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">Prioridades do PCP</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant={area === "aguardando" ? "primary" : "secondary"} onClick={() => setArea("aguardando")}>
              Aguardando Análise
              <Badge variant="neutral">{aguardando.length}</Badge>
            </Button>
            <Button variant={area === "liberados" ? "primary" : "secondary"} onClick={() => setArea("liberados")}>
              Lista de Prioridades
              <Badge variant="neutral">{liberados.length}</Badge>
            </Button>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-3 sm:grid-cols-[minmax(220px,320px)_minmax(170px,200px)]">
              <Field
                label="Buscar"
                type="search"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Cliente, projeto ou documento"
              />
              {area === "liberados" ? (
                <Select
                  label="Situação do prazo"
                  id={idFiltroPrazo}
                  value={filtroSituacaoPrazo}
                  onChange={(event) => setFiltroSituacaoPrazo(event.target.value)}
                  placeholder="Todas"
                  options={SITUACOES_PRAZO_FILTRO}
                />
              ) : null}
            </div>

            <Button
              variant="secondary"
              className="w-fit self-start lg:self-auto"
              onClick={solicitarCalculoSimulado}
              disabled={calculoSimulado === "calculando"}
            >
              {calculoSimulado === "calculando" ? "Calculando (simulado)..." : "Solicitar Cálculo"}
            </Button>
          </div>

          {calculoSimulado === "concluido" ? (
            <div className="rounded-[10px] border border-status-success-border bg-status-success-bg px-4 py-2.5 text-[12.5px] font-semibold text-status-success-text">
              Cálculo simulado concluído — nenhuma chamada real foi feita ao Motor nem à programação oficial.
            </div>
          ) : null}
        </header>

        {area === "aguardando" ? (
          aguardandoFiltrado.length === 0 ? (
            <EmptyState title="Nenhum projeto aguardando análise" description="Projetos confirmados pelo Comercial aparecem aqui, em ordem de chegada." />
          ) : (
            <Table>
              <TableHead>
                <TableHeaderCell>
                  <span className="whitespace-nowrap">Entrada no PCP</span>
                </TableHeaderCell>
                <TableHeaderCell>Projeto</TableHeaderCell>
                <TableHeaderCell>Cliente</TableHeaderCell>
                <TableHeaderCell>Documento</TableHeaderCell>
                <TableHeaderCell>
                  <span className="whitespace-nowrap">Entrega</span>
                </TableHeaderCell>
                <TableHeaderCell>Pendências</TableHeaderCell>
                <TableHeaderCell>Ações</TableHeaderCell>
              </TableHead>
              <TableBody>
                {aguardandoFiltrado.map((projeto) => (
                  <TableRow key={projeto.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatarDataBr(projeto.dataEntradaPcp)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setVisao({ tipo: "resumo", projetoId: projeto.id })}
                        className="font-semibold text-text-primary outline-none transition hover:text-action-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                      >
                        {projeto.numeroProjeto}
                      </button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{projeto.nomeCliente}</TableCell>
                    <TableCell className="whitespace-nowrap">{projeto.documentoCliente}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatarDataBr(projeto.dataEntregaComprometida)}</TableCell>
                    <TableCell>
                      {projeto.pendencias.length === 0 ? (
                        <span className="text-text-disabled">—</span>
                      ) : (
                        <span className="text-[12.5px] text-text-secondary">
                          {projeto.pendencias[0]}
                          {projeto.pendencias.length > 1 ? ` +${projeto.pendencias.length - 1}` : ""}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Button variant="secondary" onClick={() => setVisao({ tipo: "ofs", projetoId: projeto.id })}>
                        Analisar OFs
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        ) : liberadosFiltrados.length === 0 ? (
          <EmptyState title="Nenhum projeto liberado" description="Libere projetos em Aguardando Análise para que apareçam aqui, ordenados por prioridade." />
        ) : (
          <Table>
            <TableHead>
              <TableHeaderCell>
                <span className="whitespace-nowrap">Prioridade</span>
              </TableHeaderCell>
              <TableHeaderCell>Projeto</TableHeaderCell>
              <TableHeaderCell>Cliente</TableHeaderCell>
              <TableHeaderCell>Documento</TableHeaderCell>
              <TableHeaderCell>
                <span className="whitespace-nowrap">Entrega</span>
              </TableHeaderCell>
              <TableHeaderCell>
                <span className="whitespace-nowrap">Previsão</span>
              </TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
            </TableHead>
            <TableBody>
              {liberadosFiltrados.map((projeto, indice) => {
                const previsao = calcularPrevisaoOperacional(projeto.ordensFabricacao, projeto.dataConclusaoPrevista);
                const status = calcularSituacaoPrazo(previsao, projeto.dataEntregaComprometida);
                return (
                // TableRow (shared/ui) só aceita children/className - sem
                // props de drag. <tr> próprio aqui, com as MESMAS classes
                // de TableRow, nunca tocando o componente compartilhado.
                <tr
                  key={projeto.id}
                  className={[
                    "transition hover:bg-border-subtle",
                    indiceSobrevoado === indice ? "border-t-2 border-t-action-primary" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  draggable
                  onDragStart={() => setArrastandoId(projeto.id)}
                  onDragOver={(event: DragEvent<HTMLTableRowElement>) => {
                    event.preventDefault();
                    if (indiceSobrevoado !== indice) setIndiceSobrevoado(indice);
                  }}
                  onDragLeave={() => setIndiceSobrevoado((atual) => (atual === indice ? null : atual))}
                  onDrop={(event: DragEvent<HTMLTableRowElement>) => {
                    event.preventDefault();
                    onDropNaLinha(indice);
                  }}
                  onDragEnd={() => {
                    setArrastandoId(null);
                    setIndiceSobrevoado(null);
                  }}
                >
                  <TableCell className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="cursor-grab text-text-disabled active:cursor-grabbing" aria-hidden="true">
                        <GripIcon />
                      </span>
                      <span className="inline-flex h-7 w-10 items-center justify-center rounded-[10px] border border-border-subtle bg-border-subtle text-xs font-semibold tabular-nums text-text-primary">
                        {projeto.prioridade}
                      </span>
                      <button
                        type="button"
                        onClick={() => abrirModalMovimentacao(projeto, projeto.prioridade)}
                        aria-label={`Mover projeto ${projeto.numeroProjeto} para outra posição`}
                        title="Mover para outra posição (alternativa ao arrastar, acessível por teclado)"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] text-text-disabled transition hover:bg-border-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus-ring"
                      >
                        <MoveVerticalIcon />
                      </button>
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setVisao({ tipo: "resumo", projetoId: projeto.id })}
                      className="font-semibold text-text-primary outline-none transition hover:text-action-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      {projeto.numeroProjeto}
                    </button>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{projeto.nomeCliente}</TableCell>
                  <TableCell className="whitespace-nowrap">{projeto.documentoCliente}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatarDataBr(projeto.dataEntregaComprometida)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex flex-col items-start gap-1.5">
                      {previsao.confiabilidade === "integral" ? (
                        <span className="tabular-nums">{formatarDataBr(previsao.dataConclusaoPrevista)}</span>
                      ) : null}
                      <BadgeConfiabilidade confiabilidade={previsao.confiabilidade} />
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <BadgeSituacaoPrazo situacao={status} />
                  </TableCell>
                </tr>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Modal
        open={pedidoLiberacao !== null}
        onClose={() => setPedidoLiberacao(null)}
        title="Liberar projeto para programação"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPedidoLiberacao(null)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={confirmarLiberacao}>
              Confirmar liberação
            </Button>
          </>
        }
      >
        {pedidoLiberacao
          ? (() => {
              const cobertura = calcularCoberturaOfs(pedidoLiberacao.ordensFabricacao);
              return (
                <div className="flex flex-col gap-3">
                  <p>
                    Liberar o projeto <strong className="text-text-primary">{pedidoLiberacao.numeroProjeto}</strong> para
                    a Lista de Prioridades? Ele entrará na posição seguinte à última prioridade atual, respeitando a
                    ordem FIFO original salvo ajuste posterior do PCP.
                  </p>
                  <p className="text-[13px] text-text-secondary">
                    <strong className="text-text-primary">{cobertura.liberadas}</strong> de{" "}
                    <strong className="text-text-primary">{cobertura.total}</strong> OF(s) liberada(s)
                    {cobertura.pendentes > 0 ? (
                      <>
                        {" "}
                        — <strong className="text-text-primary">{cobertura.pendentes}</strong> continuarão pendentes e
                        acompanhadas individualmente; a programação resultante será parcial.
                      </>
                    ) : (
                      "."
                    )}
                  </p>
                  <p className="text-[11px] text-text-disabled">Simulado — nenhuma chamada real ao Motor.</p>
                </div>
              );
            })()
          : null}
      </Modal>

      <Modal
        open={pedidoMovimentacao !== null}
        onClose={cancelarMovimentacao}
        title="Confirmar nova prioridade"
        footer={
          <>
            <Button variant="secondary" onClick={cancelarMovimentacao}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={confirmarMovimentacao} disabled={!justificativa.trim()}>
              Confirmar posição
            </Button>
          </>
        }
      >
        {pedidoMovimentacao ? (
          <div className="flex flex-col gap-4">
            <p>
              Deseja mover o projeto <strong className="text-text-primary">{pedidoMovimentacao.projeto.numeroProjeto}</strong>{" "}
              da posição <strong className="text-text-primary">{pedidoMovimentacao.projeto.prioridade}</strong> para a
              posição <strong className="text-text-primary">{posicaoDestinoSelecionada}</strong>?
            </p>
            <Select
              label="Nova posição"
              value={String(posicaoDestinoSelecionada)}
              onChange={(event) => setPosicaoDestinoSelecionada(Number(event.target.value))}
              options={liberados.map((_, indice) => ({ value: String(indice + 1), label: `Posição ${indice + 1}` }))}
            />
            <Field
              label="Justificativa da movimentação"
              value={justificativa}
              onChange={(event) => setJustificativa(event.target.value)}
              placeholder="Ex.: antecipação solicitada pela diretoria"
            />
          </div>
        ) : null}
      </Modal>
    </main>
  );
}
