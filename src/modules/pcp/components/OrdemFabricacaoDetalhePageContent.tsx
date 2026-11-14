"use client";
// NEXOTFE — Etapa 58/58A/58B: documento real da OF (rota /ordens/[id]).
//
// "Momento Y" é só nome interno do projeto - NUNCA aparece nesta tela.
// O rótulo visível da seção/ação é "Matérias-primas"/"Salvar".
//
// Etapa 58A/58B — achado central da auditoria: vw_of_fluxo_operacional/
// vw_of_consumo_detalhado NÃO são código obsoleto - continuam escritas
// por decidir_ci_ce_de_of dentro de aprovar_of hoje, e representam dado
// real/correto para toda OF em regime "legado" (hoje, praticamente
// todas as OFs reais, já que nenhuma empresa tem o interruptor do
// Momento Y ligado). A Etapa 58 removia essa leitura sem substituto -
// esta etapa recupera, com o client de SESSÃO (nunca o client de
// navegador que a versão antiga usava, nunca service_role).
//
// 3 regimes oficiais, nunca misturados:
//   - "legado": resumo + CI/CE das views legadas (mecanismo intocado).
//   - "pendente_momento_y": proposta inicial (propostaOriginal), só leitura.
//   - "confirmado_momento_y": necessidades JÁ oficiais (necessidades_of_material,
//     origem_logica='momento_y', versao_atual=true) - nunca confundidas com a
//     proposta inicial. Sem necessidade real confirmada hoje para testar (nenhuma
//     empresa já confirmou via Momento Y) - função correta por construção, não
//     validada com resultado não-vazio real (limitação registrada no relatório).
//
// Nenhuma ação de escrita existe aqui: o botão "Salvar" fica sempre
// desabilitado nesta etapa, mas já calcula a elegibilidade real.
import { useEffect, useRef, useState } from "react";
import { ModuleHeader } from "@/modules/shared/ui/ModuleHeader";
import { ModuleBackButton } from "@/modules/shared/navigation/ModuleBackButton";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";
import { Card } from "@/modules/shared/ui/Card";
import { Badge } from "@/modules/shared/ui/Badge";
import { Button } from "@/modules/shared/ui/Button";
import { Field } from "@/modules/shared/ui/Field";
import { Select } from "@/modules/shared/ui/Select";
import { Modal } from "@/modules/shared/ui/Modal";
import { EmptyState } from "@/modules/shared/ui/EmptyState";
import { Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell } from "@/modules/shared/ui/Table";
import { consultarOfsPcpAction } from "@/modules/pcp/actions/consultarOfsPcpAction";
import { consultarCargaInicialOfPcpAction } from "@/modules/pcp/actions/consultarCargaInicialOfPcpAction";
import { consultarOperacoesOfPcpAction } from "@/modules/pcp/actions/consultarOperacoesOfPcpAction";
import { consultarDependenciasOperacoesOfPcpAction } from "@/modules/pcp/actions/consultarDependenciasOperacoesOfPcpAction";
import { consultarPermissoesOperacoesOfPcpAction } from "@/modules/pcp/actions/consultarPermissoesOperacoesOfPcpAction";
import { consultarPropostaMomentoYAction } from "@/modules/pcp/actions/consultarPropostaMomentoYAction";
import { consultarResumoLegadoOfPcpAction } from "@/modules/pcp/actions/consultarResumoLegadoOfPcpAction";
import { consultarNecessidadesConfirmadasOfPcpAction } from "@/modules/pcp/actions/consultarNecessidadesConfirmadasOfPcpAction";
import { consultarSaldoLivreMateriasPrimasPcpAction } from "@/modules/pcp/actions/consultarSaldoLivreMateriasPrimasPcpAction";
import { confirmarNecessidadesMomentoYPcpAction } from "@/modules/pcp/actions/confirmarNecessidadesMomentoYPcpAction";
import { consultarRecursosProdutivosPcpAction } from "@/modules/pcp/actions/consultarRecursosProdutivosPcpAction";
import { adicionarOperacaoOfPcpAction } from "@/modules/pcp/actions/adicionarOperacaoOfPcpAction";
import { alterarOperacaoOfPcpAction } from "@/modules/pcp/actions/alterarOperacaoOfPcpAction";
import { removerOperacaoOfPcpAction } from "@/modules/pcp/actions/removerOperacaoOfPcpAction";
import { adicionarDependenciaOperacaoOfPcpAction } from "@/modules/pcp/actions/adicionarDependenciaOperacaoOfPcpAction";
import { removerDependenciaOperacaoOfPcpAction } from "@/modules/pcp/actions/removerDependenciaOperacaoOfPcpAction";
import { consultarPermissoesDependenciasOperacoesOfPcpAction } from "@/modules/pcp/actions/consultarPermissoesDependenciasOperacoesOfPcpAction";
import { liberarOfCombinadoPcpAction } from "@/modules/pcp/actions/liberarOfCombinadoPcpAction";
import type { RecursoProdutivoOpcaoPcp } from "@/modules/pcp/lib/buscarRecursosProdutivosPcp";
import { rotuloSimplificadoOf, detalheTecnicoStatusOf } from "@/modules/pcp/lib/buscarOfsPcp";
import type { OperacaoOfPcp } from "@/modules/pcp/lib/buscarOperacoesOfPcp";
import type { DependenciaRelacionadaOfPcp } from "@/modules/pcp/lib/buscarDependenciasOperacoesOfPcp";
import {
  ConferenciaMateriasPrimasPcp,
  type ItemConferenciaConfirmavel,
  type ResumoConferenciaMateriasPrimas,
} from "@/modules/pcp/components/ConferenciaMateriasPrimasPcp";

const REGIME_LABEL: Record<string, string> = {
  confirmado_momento_y: "Necessidades já confirmadas",
  legado: "Fluxo anterior (sem conferência estruturada)",
  pendente_momento_y: "Aguardando conferência das matérias-primas",
};

const SITUACAO_OPERACAO_LABEL: Record<string, string> = {
  nao_aplicavel: "Não aplicável",
  concluida: "Concluída",
  pendente: "Pendente",
};

const SITUACAO_OPERACAO_TOOLTIP: Record<string, string> = {
  nao_aplicavel: "Esta operação foi marcada como não aplicável a esta OF.",
  concluida: "Operação resolvida (apontamento real de finalização).",
  pendente: "Ainda não resolvida — pode já estar iniciada. A distinção entre não iniciada/em andamento/pausada será apresentada numa fase posterior.",
};

const ORIGEM_OPERACAO_LABEL: Record<string, string> = {
  roteiro: "Do roteiro",
  y: "Adicionada pelo PCP",
};

// Operações ficam congeladas nestes 3 estados finais da OF (confirmado
// contra produção: impedir_escrita_operacao_of_encerrada bloqueia os 3,
// não só "concluida").
const ESTADOS_EXECUCAO_FINAIS_OF = ["concluida", "cancelada", "desdobrada"] as const;

const MOTIVO_MENSAGEM: Record<string, string> = {
  nao_autenticado: "Sessão não autenticada — faça login novamente.",
  empresa_nao_encontrada: "Não foi possível resolver a empresa da sessão atual.",
  of_nao_encontrada: "Nenhuma OF com esse número foi encontrada para a empresa atual.",
  of_nao_aprovada: "Esta OF ainda não está aprovada — a conferência de matérias-primas só existe para OFs aprovadas.",
  nao_autorizado: "Seu usuário não tem papel PCP ou administrador para esta conferência.",
  erro_desconhecido: "Falha técnica inesperada ao consultar. Tente novamente mais tarde.",
};

function formatarDataBr(data: string | null): string {
  if (!data) return "—";
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return String(valor);
}

function DadoOf({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-secondary">{rotulo}</span>
      <span className="text-[13px] text-text-primary">{valor}</span>
    </div>
  );
}

// Etapa 59A (refinamento) — Código/Descrição no modal Editar operação:
// imutáveis para sempre (nenhuma RPC os altera, em nenhuma origem), não
// é o mesmo estado de um campo "desabilitado" comum (que sugere que
// PODERIA ficar editável). Reforça o padrão já usado em
// recursos/[id]/editar/page.tsx (border-border-subtle/bg-border-subtle)
// com uma borda mais visível (border-border) e um selo textual explícito
// — nunca só a cor para comunicar o estado.
function CampoSomenteLeitura({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex flex-col gap-[7px]">
      <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text-primary">
        {label}
        <span className="rounded-full border border-border bg-border-subtle px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-[0.04em] text-text-secondary">
          Somente leitura
        </span>
      </span>
      <div className="flex h-[42px] w-full items-center rounded-[10px] border border-border bg-border-subtle px-[13px] text-[13.5px] text-text-secondary">
        {valor}
      </div>
    </div>
  );
}

export function OrdemFabricacaoDetalhePageContent({ ofId }: { ofId: string }) {
  const [carregandoOf, setCarregandoOf] = useState(true);
  const [resultadoOf, setResultadoOf] = useState<Awaited<ReturnType<typeof consultarOfsPcpAction>> | null>(null);

  const [carregandoMateriais, setCarregandoMateriais] = useState(true);
  const [resultadoMateriais, setResultadoMateriais] = useState<Awaited<ReturnType<typeof consultarPropostaMomentoYAction>> | null>(
    null,
  );

  // Operações de Produção (Fase 1, leitura) - independente do
  // carregamento de materiais, nenhum setState síncrono no corpo do efeito.
  const [carregandoOperacoes, setCarregandoOperacoes] = useState(true);
  const [resultadoOperacoes, setResultadoOperacoes] = useState<Awaited<ReturnType<typeof consultarOperacoesOfPcpAction>> | null>(
    null,
  );

  // Etapa 59A — dependências entre OPs (para o impedimento de Remover) e
  // permissões candidatas dos 3 controles. Nenhum dos dois atrasa a
  // leitura das operações em si - só condiciona o que fica habilitado.
  //
  // "operacoes_indisponiveis" (Etapa 64E) existe só aqui, no estado da
  // página - a Server Action individual preservada
  // (consultarDependenciasOperacoesOfPcpAction) nunca o devolve, pois
  // ela não sabe se seus opIds vieram de uma leitura de operações
  // bem-sucedida ou não. Dispara quando a carga inicial consolidada não
  // tinha operações válidas para calcular dependências - nunca tratado
  // como "sem dependências" (a ausência de informação bloqueia Remover,
  // não libera por omissão).
  type ResultadoDependenciasEstado =
    | Awaited<ReturnType<typeof consultarDependenciasOperacoesOfPcpAction>>
    | { ok: false; motivo: "operacoes_indisponiveis" };
  const [resultadoDependencias, setResultadoDependencias] = useState<ResultadoDependenciasEstado | null>(null);
  const [resultadoPermissoesOperacoes, setResultadoPermissoesOperacoes] = useState<Awaited<
    ReturnType<typeof consultarPermissoesOperacoesOfPcpAction>
  > | null>(null);

  // Etapa 58B: detalhe específico do regime - só um dos dois é buscado,
  // conforme o regime real já resolvido por resultadoMateriais.
  const [carregandoDetalheRegime, setCarregandoDetalheRegime] = useState(true);
  const [resultadoLegado, setResultadoLegado] = useState<Awaited<ReturnType<typeof consultarResumoLegadoOfPcpAction>> | null>(null);
  const [resultadoConfirmadas, setResultadoConfirmadas] = useState<Awaited<
    ReturnType<typeof consultarNecessidadesConfirmadasOfPcpAction>
  > | null>(null);

  // Etapa 61 — saldo livre real (preview) para a conferência rica de
  // matérias-primas, só no regime pendente_momento_y. Leitura em lote
  // (um único IN), nunca uma consulta por material.
  const [resultadoSaldoLivre, setResultadoSaldoLivre] = useState<Awaited<
    ReturnType<typeof consultarSaldoLivreMateriasPrimasPcpAction>
  > | null>(null);

  // Etapa 64E — carga inicial consolidada (consultarCargaInicialOfPcpAction):
  // substitui as 7 chamadas de montagem que antes eram Server Actions
  // separadas (medido na Etapa 64D: 48-59% menos tempo de carregamento,
  // por eliminar o enfileiramento serializado dessas chamadas e a
  // repetição de auth.getUser()). Nenhuma Server Action original foi
  // excluída - todas continuam importadas/usadas pelas funções de
  // releitura abaixo (recarregarOperacoes, recarregarDependencias,
  // recarregarPermissoesOperacoes, recarregarSaldoLivre,
  // recarregarPropostaMomentoY) e por outros consumidores fora desta
  // página (DetalheOfPcp.tsx, ListaOfsPcp.tsx).
  useEffect(() => {
    let cancelado = false;
    consultarCargaInicialOfPcpAction(ofId).then((resposta) => {
      if (cancelado) return;
      if (!resposta.ok) {
        setResultadoOf(resposta);
        setCarregandoOf(false);
        setResultadoOperacoes(resposta);
        setCarregandoOperacoes(false);
        setResultadoMateriais(resposta);
        setCarregandoMateriais(false);
        setResultadoPermissoesOperacoes(resposta);
        setResultadoDependencias(resposta);
        setCarregandoDetalheRegime(false);
        return;
      }
      setResultadoOf(resposta.resultadoOf);
      setCarregandoOf(false);
      setResultadoOperacoes(resposta.resultadoOperacoes);
      setCarregandoOperacoes(false);
      setResultadoMateriais(resposta.resultadoMateriais);
      setCarregandoMateriais(false);
      setResultadoDependencias(resposta.resultadoDependencias);
      setResultadoPermissoesOperacoes(resposta.resultadoPermissoesOperacoes);
      setResultadoSaldoLivre(resposta.resultadoSaldoLivre);
      setResultadoLegado(resposta.resultadoLegado);
      setResultadoConfirmadas(resposta.resultadoConfirmadas);
      setCarregandoDetalheRegime(false);
    });
    return () => {
      cancelado = true;
    };
  }, [ofId]);

  // Releituras pontuais (Etapa 64E, item 3 do pedido) — cada uma chama
  // de volta a Server Action ORIGINAL preservada daquela seção
  // específica, nunca a carga inicial inteira: uma falha isolada nunca
  // precisa reler as outras seções que já carregaram com sucesso. Sem
  // gravação nenhuma - só releitura.
  async function recarregarDadosOf() {
    setCarregandoOf(true);
    const resposta = await consultarOfsPcpAction({ ofId }, 1, 1);
    setResultadoOf(resposta);
    setCarregandoOf(false);
    return resposta;
  }

  async function recarregarDependencias(opIdsForcados?: readonly string[]) {
    const opIds = opIdsForcados ?? (resultadoOperacoes?.ok ? resultadoOperacoes.operacoes.map((o) => o.opId) : null);
    if (opIds === null) return null; // sem operações conhecidas, nada a consultar ainda
    const resposta = await consultarDependenciasOperacoesOfPcpAction(opIds);
    setResultadoDependencias(resposta);
    return resposta;
  }

  async function recarregarOperacoes() {
    setCarregandoOperacoes(true);
    const resposta = await consultarOperacoesOfPcpAction(ofId);
    setResultadoOperacoes(resposta);
    setCarregandoOperacoes(false);
    if (resposta.ok) {
      await recarregarDependencias(resposta.operacoes.map((o) => o.opId));
    }
    return resposta;
  }

  async function recarregarPermissoesOperacoes() {
    const resposta = await consultarPermissoesOperacoesOfPcpAction();
    setResultadoPermissoesOperacoes(resposta);
  }

  async function recarregarSaldoLivre() {
    if (!resultadoMateriais?.ok || resultadoMateriais.leitura.regime !== "pendente_momento_y") return;
    const ids = resultadoMateriais.leitura.propostaOriginal.map((item) => item.materia_prima_id);
    if (ids.length === 0) return;
    const resposta = await consultarSaldoLivreMateriasPrimasPcpAction(ids);
    setResultadoSaldoLivre(resposta);
  }

  // Etapa 59A — formulários mockados de Adicionar/Editar operação
  // (protótipo visual: nenhuma RPC de escrita é chamada por eles).
  type ModoModalOperacao = { modo: "adicionar" } | { modo: "editar"; operacao: OperacaoOfPcp };
  const [modalOperacao, setModalOperacao] = useState<ModoModalOperacao | null>(null);
  const [campoCodigo, setCampoCodigo] = useState("");
  const [campoDescricao, setCampoDescricao] = useState("");
  // Etapa 65C — substitui o antigo campoRecurso (texto livre, nunca
  // ligado a nenhum id real) por um seletor com o UUID real de
  // recursos_produtivos, exatamente o que alterar_y_operacao/
  // criar_op_no_y exigem em p_recurso_vigente_id. "" = nenhum recurso
  // selecionado - nunca um identificador arbitrário digitado.
  const [campoRecursoId, setCampoRecursoId] = useState("");
  const [campoTempo, setCampoTempo] = useState("");
  const [campoSequencia, setCampoSequencia] = useState("");
  const [campoMotivo, setCampoMotivo] = useState("");
  const [errosFormOperacao, setErrosFormOperacao] = useState<Record<string, string>>({});
  const [notaFormOperacao, setNotaFormOperacao] = useState<string | null>(null);
  // Etapa 65F — trava contra duplo clique (mesmo padrão já aprovado em
  // enviandoConfirmacaoMateriais). A própria RPC também se protege
  // (locks/checagens atômicas), mas a trava de UX evita uma segunda
  // chamada de rede desnecessária enquanto a primeira ainda está em voo.
  const [enviandoFormOperacao, setEnviandoFormOperacao] = useState(false);

  // Etapa 65C — catálogo de recursos produtivos para o seletor dos
  // modais Adicionar/Editar OP. Carregado só quando um dos dois modais
  // abre pela primeira vez (nunca no mount da página) - releituras
  // seguintes reaproveitam o que já carregou, sem nova chamada.
  const [recursosDisponiveis, setRecursosDisponiveis] = useState<readonly RecursoProdutivoOpcaoPcp[] | null>(null);
  const [carregandoRecursos, setCarregandoRecursos] = useState(false);
  const [erroRecursos, setErroRecursos] = useState<string | null>(null);

  async function garantirRecursosCarregados() {
    if (recursosDisponiveis !== null || carregandoRecursos) return;
    setCarregandoRecursos(true);
    setErroRecursos(null);
    const resposta = await consultarRecursosProdutivosPcpAction();
    setCarregandoRecursos(false);
    if (!resposta.ok) {
      setErroRecursos("Falha técnica ao consultar os recursos produtivos.");
      return;
    }
    setRecursosDisponiveis(resposta.recursos);
  }

  // Etapa 59A — confirmação mockada de Remover (= marcar não aplicável).
  const [operacaoParaRemover, setOperacaoParaRemover] = useState<OperacaoOfPcp | null>(null);
  const [campoMotivoRemover, setCampoMotivoRemover] = useState("");
  const [erroMotivoRemover, setErroMotivoRemover] = useState<string | null>(null);
  const [notaRemoverOperacao, setNotaRemoverOperacao] = useState<string | null>(null);
  const [enviandoRemocaoOperacao, setEnviandoRemocaoOperacao] = useState(false);

  // Etapa 66F — controle "Dependências", separado da edição de
  // tempo/recurso/sequência e de Remover (Etapa 66A item 5 — "manter a
  // alteração de dependências separada da edição"). subAcaoDependencia
  // distingue: null = só visualizando; {tipo:"adicionar"} = formulário
  // de novo pré-requisito aberto; {tipo:"remover", dependencia} = uma
  // remoção específica em confirmação. Nunca dois ao mesmo tempo.
  const [operacaoParaDependencias, setOperacaoParaDependencias] = useState<OperacaoOfPcp | null>(null);
  type SubAcaoDependencia = { tipo: "adicionar" } | { tipo: "remover"; dependencia: DependenciaRelacionadaOfPcp };
  const [subAcaoDependencia, setSubAcaoDependencia] = useState<SubAcaoDependencia | null>(null);
  const [campoOpPreRequisito, setCampoOpPreRequisito] = useState("");
  const [campoMotivoDependencia, setCampoMotivoDependencia] = useState("");
  const [erroMotivoDependencia, setErroMotivoDependencia] = useState<string | null>(null);
  const [notaDependencia, setNotaDependencia] = useState<string | null>(null);
  const [enviandoDependencia, setEnviandoDependencia] = useState(false);
  // Etapa 66H — achado real da Etapa 66G: se a chamada de rede nunca
  // resolve (nem sucesso, nem erro - ex.: conexão caindo de um jeito
  // que o navegador nunca detecta), enviandoDependencia ficava preso em
  // true para sempre, e até o botão "Cancelar" ficava desabilitado por
  // isso - o usuário não tinha NENHUMA saída a não ser recarregar a
  // página inteira (perdendo o motivo já digitado). Este contador de
  // geração permite ignorar, com segurança, a resposta de uma chamada
  // que já ficou obsoleta (porque o usuário cancelou ou verificou o
  // estado manualmente) - nunca decide por tempo (nenhum timeout em
  // lugar nenhum), só por uma ação explícita do usuário.
  const tentativaDependenciaRef = useRef(0);
  // Permissões + "ambiente habilitado" (Etapa 66F) carregadas sob
  // demanda, só quando o modal de Dependências abre pela primeira vez -
  // mesmo padrão lazy de garantirRecursosCarregados. ambienteHabilitado
  // é um PROBE REAL (nunca simulado) de que a migration candidata já
  // foi aplicada neste ambiente - a interface só o usa para desabilitar
  // com uma explicação clara; a garantia real contra escrita vem das
  // próprias Server Actions, que fazem o mesmo probe de novo.
  const [resultadoPermissoesDependencias, setResultadoPermissoesDependencias] = useState<Awaited<
    ReturnType<typeof consultarPermissoesDependenciasOperacoesOfPcpAction>
  > | null>(null);

  async function garantirPermissoesDependenciasCarregadas() {
    if (resultadoPermissoesDependencias !== null) return;
    const resposta = await consultarPermissoesDependenciasOperacoesOfPcpAction();
    setResultadoPermissoesDependencias(resposta);
  }

  function abrirModalDependencias(operacao: OperacaoOfPcp) {
    setSubAcaoDependencia(null);
    setCampoOpPreRequisito("");
    setCampoMotivoDependencia("");
    setErroMotivoDependencia(null);
    setNotaDependencia(null);
    setOperacaoParaDependencias(operacao);
    void garantirPermissoesDependenciasCarregadas();
  }

  const MOTIVO_REJEICAO_DEPENDENCIA: Record<string, string> = {
    nao_autenticado: "Sessão expirada — faça login novamente.",
    empresa_nao_encontrada: "Não foi possível resolver a empresa da sessão atual.",
    op_nao_encontrada: "Uma das operações não foi encontrada — pode ter sido alterada por outra pessoa.",
    ambiente_nao_habilitado: "Esta funcionalidade ainda não está disponível neste ambiente — a estrutura de banco necessária não foi aplicada.",
    nao_autorizado: "Seu usuário não tem a permissão necessária para esta ação.",
    dados_invalidos: "Dados inválidos — revise os campos.",
    empresas_diferentes: "As duas operações pertencem a empresas diferentes — isso nunca deveria acontecer; avise o suporte.",
    of_diferente: "As duas operações precisam estar na mesma OF.",
    of_estado_final: "Esta OF está concluída, cancelada ou desdobrada. Não é permitido alterar dependências.",
    apontamento_bloqueado: "Uma das operações já tem apontamento real registrado — a ação foi bloqueada.",
    ciclo_detectado: "Essa dependência criaria um ciclo (uma depender da outra nos dois sentidos) — rejeitada.",
    motivo_obrigatorio: "Informe o motivo desta ação.",
    implantacao_bloqueada: "Esta funcionalidade ainda não foi liberada neste ambiente.",
    erro_desconhecido: "Falha técnica inesperada. Tente novamente mais tarde.",
  };
  const MOTIVOS_DEPENDENCIA_QUE_EXIGEM_RELEITURA = new Set(["apontamento_bloqueado", "of_estado_final", "op_nao_encontrada"]);

  // Etapa 65F — mensagens compartilhadas pelas 3 Server Actions reais
  // (Adicionar/Editar/Remover) - os motivos se repetem bastante entre
  // elas, nenhuma razão para 3 dicionários quase idênticos.
  const MOTIVO_REJEICAO_OPERACAO: Record<string, string> = {
    nao_autenticado: "Sessão expirada — faça login novamente.",
    empresa_nao_encontrada: "Não foi possível resolver a empresa da sessão atual.",
    of_nao_encontrada: "Esta OF não foi encontrada.",
    op_nao_encontrada: "Esta operação não foi encontrada — pode ter sido alterada por outra pessoa.",
    nao_autorizado: "Seu usuário não tem a permissão necessária para esta ação.",
    codigo_duplicado: "Já existe uma operação com este código nesta OF.",
    of_estado_final: "Esta OF está concluída, cancelada ou desdobrada. Não é permitido alterar suas operações.",
    apontamento_bloqueado: "Esta OP já tem apontamento real registrado — a ação foi bloqueada.",
    dependencias_pendentes: "Esta OP tem dependências relacionadas — revise-as antes de remover.",
    motivo_obrigatorio: "Informe o motivo desta ação.",
    dados_invalidos: "Dados inválidos — revise os campos.",
    implantacao_bloqueada: "Esta funcionalidade ainda não foi liberada neste ambiente.",
    erro_desconhecido: "Falha técnica inesperada. Tente novamente mais tarde.",
  };
  // Motivos de rejeição que indicam que o estado pode ter mudado por
  // fora (concorrência real) - vale a pena reler Operações/Dependências
  // para a tabela refletir o estado atual; nunca para erros de validação
  // simples (dados_invalidos/motivo_obrigatorio/nao_autorizado), onde
  // reler não mudaria nada.
  const MOTIVOS_QUE_EXIGEM_RELEITURA = new Set([
    "apontamento_bloqueado",
    "dependencias_pendentes",
    "of_estado_final",
    "op_nao_encontrada",
  ]);

  // Etapa 63 — confirmação REAL (confirmar_necessidades_momento_y, já
  // auditada nas Etapas 61/62). "enviando" trava o botão contra duplo
  // clique (defesa de UX - a própria RPC já se protege sozinha via
  // advisory lock + UPDATE condicional). "releituraContagem" força o
  // remonte da conferência (key) só quando o PCP pede explicitamente
  // para reler a proposta - nunca troca o rascunho dele sozinha.
  const [notaSalvarMateriaisPendente, setNotaSalvarMateriaisPendente] = useState<string | null>(null);
  const [erroConfirmacaoMateriais, setErroConfirmacaoMateriais] = useState<string | null>(null);
  const [enviandoConfirmacaoMateriais, setEnviandoConfirmacaoMateriais] = useState(false);
  const [propostaPodeEstarDesatualizada, setPropostaPodeEstarDesatualizada] = useState(false);
  const [releituraContagem, setReleituraContagem] = useState(0);

  // Etapa 64E — ao mudar o regime real (ex.: após confirmação bem-
  // sucedida, pendente -> confirmado), o detalhe específico do NOVO
  // regime precisa ser relido - antes isso acontecia sozinho via um
  // useEffect ligado a resultadoMateriais; agora, como a carga inicial
  // só roda uma vez na montagem, esta função (ponto único onde
  // resultadoMateriais muda depois da montagem) assume essa releitura
  // explicitamente, preservando o mesmo comportamento observável.
  async function recarregarPropostaMomentoY() {
    setCarregandoMateriais(true);
    const resposta = await consultarPropostaMomentoYAction(ofId);
    setResultadoMateriais(resposta);
    setCarregandoMateriais(false);

    if (!resposta.ok) return resposta;

    setCarregandoDetalheRegime(true);
    if (resposta.leitura.regime === "legado") {
      setResultadoLegado(await consultarResumoLegadoOfPcpAction(ofId));
    } else if (resposta.leitura.regime === "confirmado_momento_y") {
      setResultadoConfirmadas(await consultarNecessidadesConfirmadasOfPcpAction(ofId));
    } else if (resposta.leitura.regime === "pendente_momento_y") {
      const ids = resposta.leitura.propostaOriginal.map((item) => item.materia_prima_id);
      setResultadoSaldoLivre(ids.length > 0 ? await consultarSaldoLivreMateriasPrimasPcpAction(ids) : null);
    }
    setCarregandoDetalheRegime(false);

    return resposta;
  }

  const MOTIVO_REJEICAO_SALVAR: Record<string, string> = {
    nao_autenticado: "Sessão expirada — faça login novamente.",
    empresa_nao_encontrada: "Não foi possível resolver a empresa da sessão atual.",
    interruptor_desligado: "A confirmação real de matérias-primas ainda não está habilitada para esta empresa.",
    nao_autorizado: "Seu usuário não tem papel PCP ou administrador para confirmar.",
    of_nao_encontrada: "Esta OF não foi encontrada.",
    of_estado_final: "Esta OF está em estado final — não é mais possível confirmar necessidades.",
    of_nao_aprovada: "Esta OF não está mais aprovada.",
    ja_confirmado: "Esta OF já teve as necessidades confirmadas (por outra operação).",
    proposta_desatualizada: "O roteiro mudou desde que esta proposta foi lida — releia a proposta antes de confirmar.",
    observacoes_divergentes: "O servidor encontrou observações técnicas divergentes num material consolidado — revise antes de confirmar.",
    dados_invalidos: "Dados inválidos encontrados na confirmação — revise os materiais antes de tentar novamente.",
    saldo_insuficiente: "Saldo livre insuficiente no momento da confirmação (pode ter mudado desde a consulta) — ajuste o CI e tente novamente.",
    confirmacao_concorrente: "Esta OF acabou de ser confirmada por outra operação.",
    erro_desconhecido: "Falha técnica inesperada ao confirmar. Tente novamente mais tarde.",
  };

  async function confirmarConferenciaMateriaisPendente(resultado: {
    itens: readonly ItemConferenciaConfirmavel[];
    resumo: ResumoConferenciaMateriasPrimas;
  }) {
    if (!resultadoMateriais?.ok || resultadoMateriais.leitura.regime !== "pendente_momento_y") return;
    setEnviandoConfirmacaoMateriais(true);
    setErroConfirmacaoMateriais(null);
    setPropostaPodeEstarDesatualizada(false);

    const payload = resultado.itens.map((item) => ({
      materiaPrimaId: item.materiaPrimaId,
      origemFornecimento: item.origemFornecimento,
      quantidadeConfirmada: item.quantidadeConfirmada,
      quantidadeCi: item.quantidadeCi,
      observacaoTecnica: item.observacaoTecnica,
    }));

    const resposta = await confirmarNecessidadesMomentoYPcpAction(ofId, resultadoMateriais.leitura.propostaOriginal, payload);
    setEnviandoConfirmacaoMateriais(false);

    if (resposta.ok) {
      setNotaSalvarMateriaisPendente("Necessidades confirmadas com sucesso.");
      await recarregarPropostaMomentoY();
      return;
    }

    // Gravação incerta (Etapa 63): a chamada de rede em si falhou - nunca
    // sabemos se a RPC chegou a gravar antes da conexão cair. Nunca
    // decide sozinho: reconsulta o estado oficial da OF antes de dizer
    // qualquer coisa ao usuário, e nunca libera nova tentativa automática.
    if (resposta.motivo === "gravacao_incerta") {
      setErroConfirmacaoMateriais("Não foi possível confirmar se a gravação foi concluída. Verificando o estado atual da OF…");
      const verificacao = await recarregarPropostaMomentoY();
      if (verificacao.ok && verificacao.leitura.regime === "confirmado_momento_y") {
        setErroConfirmacaoMateriais(null);
        setNotaSalvarMateriaisPendente("A confirmação FOI registrada (verificado agora, após uma falha de conexão).");
      } else {
        setErroConfirmacaoMateriais(
          "A conexão caiu antes de confirmar a gravação. Verificamos e nada foi registrado — seus dados continuam aqui, pode tentar novamente com segurança.",
        );
      }
      return;
    }

    setErroConfirmacaoMateriais(MOTIVO_REJEICAO_SALVAR[resposta.motivo] ?? "Falha ao confirmar.");
    // Nunca recarrega sozinho (Regra do pedido: "não executar
    // recarregamento destrutivo sem confirmação do usuário") - só
    // sinaliza que a OF pode ter mudado por fora; o PCP decide quando
    // reler, através do botão "Reler OF", preservando o rascunho até lá.
    if (
      ["proposta_desatualizada", "ja_confirmado", "of_estado_final", "of_nao_aprovada", "of_nao_encontrada", "confirmacao_concorrente"].includes(
        resposta.motivo,
      )
    ) {
      setPropostaPodeEstarDesatualizada(true);
    }
  }

  // Liberação de OF — botão único "Liberar OF" (liberarOfCombinadoPcpAction).
  // Decisão de negócio: o PCP vê um único botão, mesmo quando a OF
  // ainda depende de aprovação - a RPC candidata aprovar_e_liberar_of
  // orquestra as duas transições internamente, na mesma transação.
  // Nunca reimplementa as checagens de estado/permissão/concorrência:
  // só chama a Action e nomeia o motivo que a RPC já decidiu. Portão
  // de implantação reaproveitado de Liberação de OF (decisão explícita
  // do usuário) - ainda desligado neste ambiente.
  const [modalLiberacaoAberto, setModalLiberacaoAberto] = useState(false);
  const [enviandoLiberacao, setEnviandoLiberacao] = useState(false);
  const [erroLiberacao, setErroLiberacao] = useState<string | null>(null);
  const [notaLiberacao, setNotaLiberacao] = useState<string | null>(null);

  const MOTIVO_REJEICAO_LIBERACAO: Record<string, string> = {
    nao_autenticado: "Sessão expirada — faça login novamente.",
    empresa_nao_encontrada: "Não foi possível resolver a empresa da sessão atual.",
    of_nao_encontrada: "Esta OF não foi encontrada.",
    implantacao_bloqueada: "Esta funcionalidade ainda não foi liberada neste ambiente.",
    nao_autorizado_aprovar: "Seu usuário não tem a permissão necessária para aprovar esta OF.",
    nao_autorizado_liberar: "Seu usuário não tem a permissão necessária para liberar esta OF.",
    liberado_por_invalido: "Não foi possível validar seu usuário para esta liberação.",
    estado_incompativel: "Esta OF não está em um estado que permita a liberação.",
    momento_y_pendente: "Esta OF ainda não teve as matérias-primas conferidas — confirme a conferência antes de liberar.",
    conflito_concorrencia: "O estado desta OF mudou durante a operação — releia a OF e tente novamente.",
    erro_desconhecido: "Falha técnica inesperada ao liberar. Tente novamente mais tarde.",
  };

  async function confirmarLiberacaoOf() {
    setEnviandoLiberacao(true);
    setErroLiberacao(null);
    setNotaLiberacao(null);

    const resposta = await liberarOfCombinadoPcpAction(ofId);
    setEnviandoLiberacao(false);

    if (resposta.ok) {
      setModalLiberacaoAberto(false);
      setNotaLiberacao(
        resposta.jaLiberada
          ? "Esta OF já estava liberada."
          : resposta.aprovacaoRealizada
            ? "OF aprovada e liberada para produção com sucesso."
            : "OF liberada para produção com sucesso.",
      );
      await recarregarDadosOf();
      // A liberação pode ter aprovado a OF também (ação combinada) - a
      // seção de Matérias-primas tem sua própria leitura, nunca
      // atualizada por recarregarDadosOf(); sem isto, ela continuaria
      // mostrando o motivo antigo "OF ainda não aprovada".
      await recarregarPropostaMomentoY();
      return;
    }

    // Gravação incerta: a chamada de rede em si falhou - nunca sabemos
    // se a RPC chegou a gravar antes da conexão cair. Nunca decide
    // sozinho: reconsulta o estado oficial da OF antes de dizer
    // qualquer coisa ao usuário (mesmo princípio de
    // confirmarConferenciaMateriaisPendente/confirmarRemocaoOperacao).
    if (resposta.motivo === "gravacao_incerta") {
      setErroLiberacao("Não foi possível confirmar se a gravação foi concluída. Verificando o estado atual…");
      const verificacao = await recarregarDadosOf();
      const linhaAtual = verificacao.ok ? verificacao.resultado.linhas[0] ?? null : null;
      if (linhaAtual?.estadoExecucao === "liberada") {
        setErroLiberacao(null);
        setModalLiberacaoAberto(false);
        setNotaLiberacao("A OF FOI liberada (verificado agora, após uma falha de conexão).");
        await recarregarPropostaMomentoY();
      } else {
        setErroLiberacao(
          "A conexão caiu antes de confirmar a gravação. Verificamos e a OF NÃO foi liberada — pode tentar novamente com segurança.",
        );
      }
      return;
    }

    setErroLiberacao(MOTIVO_REJEICAO_LIBERACAO[resposta.motivo] ?? "Falha ao liberar a OF.");
  }

  // Etapa 64E — dados da OF, materiais e o detalhe condicional ao
  // regime (legado/confirmadas) vêm da carga inicial consolidada
  // (useEffect perto do topo do componente); releituras posteriores
  // passam por recarregarDadosOf/recarregarPropostaMomentoY.
  const linha = resultadoOf?.ok ? resultadoOf.resultado.linhas[0] ?? null : null;
  const prazoDivergente = linha && linha.prazoComercialVigente !== null && linha.prazoComercialVigente !== linha.dataObjetivo;
  const statusRotulo = linha ? rotuloSimplificadoOf(linha.estadoAprovacao, linha.estadoExecucao) : null;
  const statusDetalhe = linha ? detalheTecnicoStatusOf(linha.estadoAprovacao, linha.estadoExecucao) : "";

  // Elegibilidade real do "Salvar" - calculada de verdade, mas o botão
  // fica sempre desabilitado nesta etapa (nenhuma gravação real autorizada).
  const elegivelParaSalvar =
    resultadoMateriais?.ok === true &&
    resultadoMateriais.leitura.regime === "pendente_momento_y" &&
    resultadoMateriais.leitura.interruptorAtivo;

  const motivoSalvarDesabilitado = !resultadoMateriais?.ok
    ? "Consultando elegibilidade..."
    : resultadoMateriais.leitura.regime !== "pendente_momento_y"
      ? "Esta OF não está aguardando conferência de matérias-primas."
      : !resultadoMateriais.leitura.interruptorAtivo
        ? "A conferência de matérias-primas ainda não está habilitada para esta empresa."
        : "Esta OF está elegível para confirmação real.";

  // Etapa 59A — bloqueios reais dos 3 controles de Operações de Produção.
  // "pendente" NUNCA é usado aqui como prova de que a OP não foi
  // iniciada - o sinal real é operacao.temApontamento (existência crua
  // em of_apontamentos), o mesmo que alterar_y_operacao/
  // marcar_op_nao_aplicavel já checam em produção.
  const ofEmEstadoFinal = linha ? (ESTADOS_EXECUCAO_FINAIS_OF as readonly string[]).includes(linha.estadoExecucao) : false;
  const motivoOfEmEstadoFinal = linha ? `Esta OF está em estado final (${linha.estadoExecucao}) — operações ficam congeladas.` : "";

  function motivoBloqueioAdicionar(): string | null {
    if (ofEmEstadoFinal) return motivoOfEmEstadoFinal;
    if (!resultadoPermissoesOperacoes) return "Consultando permissões…";
    if (!resultadoPermissoesOperacoes.ok) return "Falha técnica ao consultar permissões.";
    if (!resultadoPermissoesOperacoes.podeCriarOperacao) return "Seu usuário não tem a permissão pcp.criar_operacao_of.";
    return null;
  }

  function motivoBloqueioEditar(operacao: OperacaoOfPcp): string | null {
    if (ofEmEstadoFinal) return motivoOfEmEstadoFinal;
    if (operacao.temApontamento) return "Esta OP já tem apontamento real registrado — planejamento (Y) bloqueado após início.";
    if (!resultadoPermissoesOperacoes) return "Consultando permissões…";
    if (!resultadoPermissoesOperacoes.ok) return "Falha técnica ao consultar permissões.";
    if (!resultadoPermissoesOperacoes.podeEditarOperacao) return "Seu usuário não tem a permissão pcp.editar_operacao_of.";
    return null;
  }

  function motivoBloqueioRemover(operacao: OperacaoOfPcp): string | null {
    if (ofEmEstadoFinal) return motivoOfEmEstadoFinal;
    if (operacao.temApontamento) return "Esta OP já tem apontamento real registrado — remoção bloqueada após início.";
    if (!resultadoPermissoesOperacoes) return "Consultando permissões…";
    if (!resultadoPermissoesOperacoes.ok) return "Falha técnica ao consultar permissões.";
    if (!resultadoPermissoesOperacoes.podeRemoverOperacao) return "Seu usuário não tem a permissão pcp.remover_operacao_of.";
    // Etapa 64E — ausência de informação sobre dependências bloqueia
    // Remover; nunca libera por omissão (achado real: antes desta
    // etapa, uma falha aqui não impedia o clique em Remover, só a
    // confirmação dentro do modal já aberto).
    if (!resultadoDependencias) return "Consultando dependências…";
    if (!resultadoDependencias.ok) return "Falha técnica ao consultar dependências — remoção bloqueada até confirmar que não há dependências.";
    return null;
  }

  function abrirModalAdicionar() {
    setCampoCodigo("");
    setCampoDescricao("");
    setCampoRecursoId("");
    setCampoTempo("");
    setCampoSequencia("");
    setCampoMotivo("");
    setErrosFormOperacao({});
    setNotaFormOperacao(null);
    setModalOperacao({ modo: "adicionar" });
    void garantirRecursosCarregados();
  }

  function abrirModalEditar(operacao: OperacaoOfPcp) {
    setCampoCodigo(operacao.codigoOperacional);
    setCampoDescricao(operacao.descricao);
    setCampoRecursoId(operacao.recursoId ?? "");
    setCampoTempo(operacao.tempoPlanejadoMinutos !== null ? String(operacao.tempoPlanejadoMinutos) : "");
    setCampoSequencia(String(operacao.sequencia));
    setCampoMotivo("");
    setErrosFormOperacao({});
    setNotaFormOperacao(null);
    setModalOperacao({ modo: "editar", operacao });
    void garantirRecursosCarregados();
  }

  // Etapa 65F — integração real de Adicionar/Editar. "Simulado" (Etapa
  // 59A) substituído pelas Server Actions preparadas na Etapa 65A. Em
  // Editar, sequência/tempo/recurso seguem o mesmo contrato opcional de
  // alterar_y_operacao (campo vazio = não altera, nunca "limpa") - só
  // código/descrição são imutáveis (CampoSomenteLeitura) e motivo é
  // sempre obrigatório. Em Adicionar, código/descrição/sequência
  // continuam obrigatórios (nova OP sempre precisa de um valor inicial).
  async function confirmarModalOperacao() {
    const erros: Record<string, string> = {};

    if (modalOperacao?.modo === "adicionar") {
      const codigoNormalizado = campoCodigo.trim();
      if (!codigoNormalizado) {
        erros.codigo = "Informe o código da OP.";
      } else if (
        resultadoOperacoes?.ok &&
        resultadoOperacoes.operacoes.some((o) => o.codigoOperacional.trim().toLowerCase() === codigoNormalizado.toLowerCase())
      ) {
        // ordens_fabricacao_operacoes_codigo_uniq unique(of_id, codigo_operacional) - restrição real do banco.
        erros.codigo = "Já existe uma operação com este código nesta OF.";
      }
      if (!campoDescricao.trim()) erros.descricao = "Informe a descrição da OP.";
      if (!campoSequencia.trim() || Number.isNaN(Number(campoSequencia))) erros.sequencia = "Informe a sequência (número).";
    } else if (modalOperacao?.modo === "editar" && campoSequencia.trim() && Number.isNaN(Number(campoSequencia))) {
      erros.sequencia = "A sequência precisa ser um número.";
    }

    if (campoTempo.trim() && (Number.isNaN(Number(campoTempo)) || Number(campoTempo) < 0)) {
      // ordens_fabricacao_operacoes_tempo_chk: tempo_vigente_minutos >= 0.
      erros.tempo = "O tempo planejado precisa ser um número maior ou igual a zero.";
    }

    if (!campoMotivo.trim()) erros.motivo = "Informe o motivo desta alteração.";

    setErrosFormOperacao(erros);
    if (Object.keys(erros).length > 0) {
      setNotaFormOperacao(null);
      return;
    }

    if (!modalOperacao) return;
    setEnviandoFormOperacao(true);
    setNotaFormOperacao(null);

    if (modalOperacao.modo === "adicionar") {
      const codigoNormalizado = campoCodigo.trim();
      const resposta = await adicionarOperacaoOfPcpAction(ofId, {
        codigoOperacional: codigoNormalizado,
        descricao: campoDescricao.trim(),
        sequenciaVigente: Number(campoSequencia),
        recursoVigenteId: campoRecursoId || null,
        tempoVigenteMinutos: campoTempo.trim() ? Number(campoTempo) : null,
        motivo: campoMotivo.trim(),
      });
      setEnviandoFormOperacao(false);

      if (resposta.ok) {
        setModalOperacao(null);
        await recarregarOperacoes();
        return;
      }

      if (resposta.motivo === "gravacao_incerta") {
        setNotaFormOperacao("Não foi possível confirmar se a gravação foi concluída. Verificando o estado atual…");
        const atualizado = await recarregarOperacoes();
        const foiCriada =
          atualizado.ok && atualizado.operacoes.some((o) => o.codigoOperacional.trim().toLowerCase() === codigoNormalizado.toLowerCase());
        if (foiCriada) {
          // Nunca fecha o modal na mesma atualização que mostra a nota -
          // fechar e setar a nota juntos faz React tratar como um só
          // commit, e a nota some antes do usuário conseguir vê-la
          // (achado real, Etapa 65F). O usuário fecha quando quiser,
          // depois de ler.
          setNotaFormOperacao("A operação FOI criada (verificado agora, após uma falha de conexão).");
        } else {
          setNotaFormOperacao(
            "A conexão caiu antes de confirmar a gravação. Verificamos e a operação NÃO foi criada — seus dados continuam aqui, pode tentar novamente com segurança.",
          );
        }
        return;
      }

      if (resposta.motivo === "dados_invalidos" && resposta.campo) {
        setErrosFormOperacao({ [resposta.campo]: "Dado inválido — revise este campo." });
        return;
      }

      if (MOTIVOS_QUE_EXIGEM_RELEITURA.has(resposta.motivo)) {
        await recarregarOperacoes();
      }
      setNotaFormOperacao(MOTIVO_REJEICAO_OPERACAO[resposta.motivo] ?? "Falha ao adicionar a operação.");
      return;
    }

    // modo === "editar"
    const opOriginal = modalOperacao.operacao;
    const alteracoes = {
      recursoVigenteId: campoRecursoId || null,
      tempoVigenteMinutos: campoTempo.trim() ? Number(campoTempo) : null,
      sequenciaVigente: campoSequencia.trim() ? Number(campoSequencia) : null,
      motivo: campoMotivo.trim(),
    };
    const resposta = await alterarOperacaoOfPcpAction(opOriginal.opId, alteracoes);
    setEnviandoFormOperacao(false);

    if (resposta.ok) {
      setModalOperacao(null);
      await recarregarOperacoes();
      return;
    }

    if (resposta.motivo === "gravacao_incerta") {
      setNotaFormOperacao("Não foi possível confirmar se a gravação foi concluída. Verificando o estado atual…");
      const atualizado = await recarregarOperacoes();
      const opAtual = atualizado.ok ? atualizado.operacoes.find((o) => o.opId === opOriginal.opId) : null;
      const correspondeTempo = alteracoes.tempoVigenteMinutos === null || opAtual?.tempoPlanejadoMinutos === alteracoes.tempoVigenteMinutos;
      const correspondeSequencia = alteracoes.sequenciaVigente === null || opAtual?.sequencia === alteracoes.sequenciaVigente;
      const correspondeRecurso = alteracoes.recursoVigenteId === null || opAtual?.recursoId === alteracoes.recursoVigenteId;
      if (opAtual && correspondeTempo && correspondeSequencia && correspondeRecurso) {
        // Nunca fecha o modal junto com a nota - ver comentário análogo
        // no ramo "adicionar" acima (achado real, Etapa 65F).
        setNotaFormOperacao("A alteração FOI aplicada (verificado agora, após uma falha de conexão).");
      } else {
        setNotaFormOperacao(
          "A conexão caiu antes de confirmar a gravação. Não foi possível garantir se a alteração foi aplicada — revise os valores atuais da OP na tabela antes de tentar de novo.",
        );
      }
      return;
    }

    if (resposta.motivo === "dados_invalidos" && resposta.campo) {
      setErrosFormOperacao({ [resposta.campo]: "Dado inválido — revise este campo." });
      return;
    }

    if (MOTIVOS_QUE_EXIGEM_RELEITURA.has(resposta.motivo)) {
      await recarregarOperacoes();
    }
    setNotaFormOperacao(MOTIVO_REJEICAO_OPERACAO[resposta.motivo] ?? "Falha ao salvar a edição.");
  }

  function abrirModalRemover(operacao: OperacaoOfPcp) {
    setCampoMotivoRemover("");
    setErroMotivoRemover(null);
    setNotaRemoverOperacao(null);
    setOperacaoParaRemover(operacao);
  }

  // Defesa em profundidade: o botão "Remover" já fica desabilitado via
  // motivoBloqueioRemover quando resultadoDependencias não é {ok:true}
  // - mas o modal confirma de novo aqui, para o caso de o estado mudar
  // enquanto o modal já está aberto.
  const dependenciasConhecidas = resultadoDependencias?.ok === true;
  const dependenciasDaOperacaoParaRemover =
    operacaoParaRemover && dependenciasConhecidas ? (resultadoDependencias.dependenciasPorOpId[operacaoParaRemover.opId] ?? []) : [];

  // Etapa 65F — integração real de Remover ("Simulado" da Etapa 59A
  // substituído pela Server Action preparada na Etapa 65A). Nunca
  // exclusão física - a RPC só marca nao_aplicavel=true.
  async function confirmarRemocaoOperacao() {
    if (!dependenciasConhecidas) return;
    if (dependenciasDaOperacaoParaRemover.length > 0) return;
    if (!campoMotivoRemover.trim()) {
      setErroMotivoRemover("Informe o motivo da remoção.");
      return;
    }
    if (!operacaoParaRemover) return;
    setErroMotivoRemover(null);
    setNotaRemoverOperacao(null);
    setEnviandoRemocaoOperacao(true);

    const opId = operacaoParaRemover.opId;
    const resposta = await removerOperacaoOfPcpAction(opId, campoMotivoRemover.trim());
    setEnviandoRemocaoOperacao(false);

    if (resposta.ok) {
      setOperacaoParaRemover(null);
      await recarregarOperacoes();
      return;
    }

    if (resposta.motivo === "gravacao_incerta") {
      setNotaRemoverOperacao("Não foi possível confirmar se a gravação foi concluída. Verificando o estado atual…");
      const atualizado = await recarregarOperacoes();
      const opAtual = atualizado.ok ? atualizado.operacoes.find((o) => o.opId === opId) : null;
      if (opAtual?.situacao === "nao_aplicavel") {
        // Nunca fecha o modal junto com a nota - mesmo achado real do
        // ramo de Adicionar/Editar (Etapa 65F).
        setNotaRemoverOperacao("A operação FOI marcada como não aplicável (verificado agora, após uma falha de conexão).");
      } else {
        setNotaRemoverOperacao(
          "A conexão caiu antes de confirmar a gravação. Verificamos e a operação NÃO foi removida — pode tentar novamente com segurança.",
        );
      }
      return;
    }

    if (MOTIVOS_QUE_EXIGEM_RELEITURA.has(resposta.motivo)) {
      await recarregarOperacoes();
    }
    setNotaRemoverOperacao(MOTIVO_REJEICAO_OPERACAO[resposta.motivo] ?? "Falha ao remover a operação.");
  }

  // Etapa 66F — controle "Dependências". Outras OPs da mesma OF
  // disponíveis como pré-requisito (nunca a própria OP selecionada -
  // item 2 da Etapa 66F, "Não permitir selecionar a própria OP").
  const outrasOperacoesDaOf =
    resultadoOperacoes?.ok && operacaoParaDependencias
      ? resultadoOperacoes.operacoes.filter((o) => o.opId !== operacaoParaDependencias.opId)
      : [];
  const dependenciasDaOperacaoAtual =
    operacaoParaDependencias && dependenciasConhecidas ? (resultadoDependencias.dependenciasPorOpId[operacaoParaDependencias.opId] ?? []) : [];
  const dependeDe = dependenciasDaOperacaoAtual.filter((d) => d.papel === "dependente");
  const ehPreRequisitoDe = dependenciasDaOperacaoAtual.filter((d) => d.papel === "origem");

  function iniciarRemocaoDependencia(dependencia: DependenciaRelacionadaOfPcp) {
    setCampoMotivoDependencia("");
    setErroMotivoDependencia(null);
    setNotaDependencia(null);
    setSubAcaoDependencia({ tipo: "remover", dependencia });
  }

  // Etapa 66H — cancelamento SEMPRE permitido, mesmo com uma chamada
  // ainda pendente (nunca mais desabilitado por enviandoDependencia).
  // Incrementa a geração: se a chamada antiga eventualmente resolver
  // depois disso, sua resposta é descartada (ver os `if` de geração
  // obsoleta abaixo) - nunca sobrescreve o que o usuário já decidiu.
  function cancelarAcaoDependencia() {
    tentativaDependenciaRef.current += 1;
    setSubAcaoDependencia(null);
    setEnviandoDependencia(false);
    setCampoOpPreRequisito("");
    setCampoMotivoDependencia("");
    setErroMotivoDependencia(null);
    setNotaDependencia(null);
  }

  // Etapa 66H — recuperação segura de gravação incerta "travada" (achado
  // real da Etapa 66G: se o fetch nunca resolve, nem sucesso nem erro,
  // o usuário ficava preso sem nenhuma saída). Disponível a qualquer
  // momento enquanto enviandoDependencia=true, acionada só por clique
  // explícito do usuário - nunca por um timeout/tempo arbitrário.
  // Nunca repete a escrita sozinha, nunca declara sucesso sem reler o
  // estado oficial, nunca limpa o que foi digitado.
  async function verificarEstadoAtualDependenciaAgora() {
    if (!operacaoParaDependencias) return;
    // Etapa 66H.1 — achado real: sem isto, se a chamada original
    // (travada) resolvesse DEPOIS desta consulta manual, sua resposta
    // tardia sobrescrevia a nota que o usuário acabou de ler aqui.
    // Invalida a tentativa em andamento - a partir deste clique, só uma
    // NOVA tentativa (um novo Confirmar) ou este botão de novo contam.
    // "Estado atual do vínculo" (o que esta função reporta, podendo
    // inclusive refletir uma mudança feita por OUTRA sessão) nunca é
    // confundido com "confirmação definitiva desta chamada específica"
    // - só a própria resolução dela, se chegasse a tempo, diria isso.
    tentativaDependenciaRef.current += 1;
    const opAtualId = operacaoParaDependencias.opId;
    setNotaDependencia("Consultando o estado atual…");
    const atualizado = await recarregarDependencias();
    if (!atualizado?.ok) {
      setNotaDependencia("Não foi possível consultar o estado atual agora — tente de novo.");
      return;
    }
    if (subAcaoDependencia?.tipo === "adicionar" && campoOpPreRequisito) {
      const existe = (atualizado.dependenciasPorOpId[opAtualId] ?? []).some(
        (d) => d.opRelacionadaId === campoOpPreRequisito && d.papel === "dependente",
      );
      setNotaDependencia(
        existe
          ? "Consultamos agora: a dependência JÁ EXISTE no banco — pode fechar com segurança, nada a fazer."
          : "Consultamos agora: a dependência AINDA NÃO existe no banco — seus dados continuam aqui, pode tentar novamente quando quiser.",
      );
      return;
    }
    if (subAcaoDependencia?.tipo === "remover") {
      const dependencia = subAcaoDependencia.dependencia;
      const existe = (atualizado.dependenciasPorOpId[opAtualId] ?? []).some(
        (d) => d.opRelacionadaId === dependencia.opRelacionadaId && d.papel === dependencia.papel,
      );
      setNotaDependencia(
        existe
          ? "Consultamos agora: a dependência AINDA EXISTE no banco — a remoção não foi confirmada, pode tentar novamente quando quiser."
          : "Consultamos agora: a dependência JÁ FOI REMOVIDA — pode fechar com segurança, nada a fazer.",
      );
      return;
    }
    setNotaDependencia("Estado atual consultado.");
  }

  async function confirmarAdicionarDependencia() {
    if (!operacaoParaDependencias) return;
    if (!campoOpPreRequisito) {
      setErroMotivoDependencia("Selecione a operação pré-requisito.");
      return;
    }
    if (!campoMotivoDependencia.trim()) {
      setErroMotivoDependencia("Informe o motivo.");
      return;
    }
    setErroMotivoDependencia(null);
    setNotaDependencia(null);
    setEnviandoDependencia(true);
    tentativaDependenciaRef.current += 1;
    const minhaTentativa = tentativaDependenciaRef.current;

    const opAtualId = operacaoParaDependencias.opId;
    const opPreRequisitoId = campoOpPreRequisito;
    const motivo = campoMotivoDependencia.trim();
    // opPreRequisitoId é o pré-requisito (origem); a OP sendo vista no
    // modal é a dependente - exatamente o contrato de
    // alterar_dependencia_operacao (p_op_origem_id, p_op_dependente_id).
    const resposta = await adicionarDependenciaOperacaoOfPcpAction(opPreRequisitoId, opAtualId, motivo);
    // Geração obsoleta (Etapa 66H): o usuário já cancelou ou verificou
    // manualmente enquanto esta chamada ainda estava em voo - a
    // resposta tardia nunca mais sobrescreve o que ele já viu/decidiu.
    if (tentativaDependenciaRef.current !== minhaTentativa) return;
    setEnviandoDependencia(false);

    if (resposta.ok) {
      setSubAcaoDependencia(null);
      setCampoOpPreRequisito("");
      setCampoMotivoDependencia("");
      await recarregarDependencias();
      return;
    }

    if (resposta.motivo === "gravacao_incerta") {
      setNotaDependencia("Não foi possível confirmar se a gravação foi concluída. Verificando o estado atual…");
      const atualizado = await recarregarDependencias();
      if (tentativaDependenciaRef.current !== minhaTentativa) return;
      const foiCriada = atualizado?.ok
        ? (atualizado.dependenciasPorOpId[opAtualId] ?? []).some((d) => d.opRelacionadaId === opPreRequisitoId && d.papel === "dependente")
        : null;
      if (foiCriada) {
        // Nunca fecha o formulário junto com a nota - mesmo achado real
        // já documentado em confirmarModalOperacao (Etapa 65F).
        setNotaDependencia("A dependência FOI criada (verificado agora, após uma falha de conexão).");
      } else {
        setNotaDependencia(
          "A conexão caiu antes de confirmar a gravação. Verificamos e a dependência NÃO foi criada — seus dados continuam aqui, pode tentar novamente com segurança.",
        );
      }
      return;
    }

    if (MOTIVOS_DEPENDENCIA_QUE_EXIGEM_RELEITURA.has(resposta.motivo)) {
      await recarregarDependencias();
    }
    setNotaDependencia(MOTIVO_REJEICAO_DEPENDENCIA[resposta.motivo] ?? "Falha ao adicionar a dependência.");
  }

  async function confirmarRemoverDependencia() {
    if (subAcaoDependencia?.tipo !== "remover" || !operacaoParaDependencias) return;
    if (!campoMotivoDependencia.trim()) {
      setErroMotivoDependencia("Informe o motivo.");
      return;
    }
    setErroMotivoDependencia(null);
    setNotaDependencia(null);
    setEnviandoDependencia(true);
    tentativaDependenciaRef.current += 1;
    const minhaTentativa = tentativaDependenciaRef.current;

    const dependencia = subAcaoDependencia.dependencia;
    const opAtualId = operacaoParaDependencias.opId;
    // papel "origem": a OP atual é o pré-requisito da relacionada ->
    // origem=opAtual, dependente=relacionada. papel "dependente": o
    // inverso.
    const opOrigemId = dependencia.papel === "origem" ? opAtualId : dependencia.opRelacionadaId;
    const opDependenteId = dependencia.papel === "origem" ? dependencia.opRelacionadaId : opAtualId;
    const motivo = campoMotivoDependencia.trim();

    const resposta = await removerDependenciaOperacaoOfPcpAction(opOrigemId, opDependenteId, motivo);
    if (tentativaDependenciaRef.current !== minhaTentativa) return;
    setEnviandoDependencia(false);

    if (resposta.ok) {
      setSubAcaoDependencia(null);
      setCampoMotivoDependencia("");
      await recarregarDependencias();
      return;
    }

    if (resposta.motivo === "gravacao_incerta") {
      setNotaDependencia("Não foi possível confirmar se a gravação foi concluída. Verificando o estado atual…");
      const atualizado = await recarregarDependencias();
      if (tentativaDependenciaRef.current !== minhaTentativa) return;
      const aindaExiste = atualizado?.ok
        ? (atualizado.dependenciasPorOpId[opAtualId] ?? []).some(
            (d) => d.opRelacionadaId === dependencia.opRelacionadaId && d.papel === dependencia.papel,
          )
        : null;
      if (aindaExiste === false) {
        setNotaDependencia("A dependência FOI removida (verificado agora, após uma falha de conexão).");
      } else {
        setNotaDependencia(
          "A conexão caiu antes de confirmar a gravação. Não foi possível garantir se a remoção foi aplicada — revise a lista antes de tentar de novo.",
        );
      }
      return;
    }

    if (MOTIVOS_DEPENDENCIA_QUE_EXIGEM_RELEITURA.has(resposta.motivo)) {
      await recarregarDependencias();
    }
    setNotaDependencia(MOTIVO_REJEICAO_DEPENDENCIA[resposta.motivo] ?? "Falha ao remover a dependência.");
  }

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <ModuleHeader
          backButton={<ModuleBackButton fallbackHref="/design/pcp-momento-y-preview" />}
          title={linha ? `OF ${linha.numeroOf}` : "OF"}
          subtitle="Dados, operações de produção e matérias-primas desta ordem de fabricação."
        />

        {carregandoOf ? <p className="text-[12.5px] text-text-secondary">Carregando dados da OF…</p> : null}

        {!carregandoOf && resultadoOf && !resultadoOf.ok ? (
          <div className="rounded-[10px] border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-[12.5px] text-status-danger-text">
            <p>{resultadoOf.motivo === "nao_autenticado" ? "Sessão não autenticada." : "Falha técnica ao consultar esta OF."}</p>
            {resultadoOf.motivo !== "nao_autenticado" ? (
              <Button variant="secondary" onClick={recarregarDadosOf} className="mt-2">
                Tentar novamente
              </Button>
            ) : null}
          </div>
        ) : null}

        {!carregandoOf && resultadoOf?.ok && !linha ? (
          <EmptyState title="OF não encontrada" description="Nenhuma OF com este identificador foi encontrada para a empresa atual." />
        ) : null}

        {!carregandoOf && linha ? (
          <>
            {/* Seção 1 — Dados da OF (sem título; cabeçalho hospeda só a ação de liberação) */}
            <Card>
              {/* Liberação de OF — decisão do PCP, nunca automática. Sempre
                  chama a RPC real (via liberarOfPcpAction); as checagens de
                  estado/Momento Y/concorrência pertencem a ela, nunca são
                  refeitas aqui. Botão compacto no cabeçalho do cartão
                  (mesmo padrão de tamanho de src/app/design/pcp-prioridades-preview/page.tsx). */}
              <div className="mb-4 flex items-center justify-end gap-2 border-b border-border-subtle pb-4">
                {linha.estadoExecucao !== "liberada" ? (
                  <Button
                    variant="primary"
                    className="h-8 px-3 text-[12px]"
                    onClick={() => setModalLiberacaoAberto(true)}
                    disabled={ofEmEstadoFinal}
                  >
                    Liberar OF
                  </Button>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <DadoOf
                  rotulo="Projeto"
                  valor={<EntityLink type="projeto" id={linha.projetoId}>{linha.numeroProjeto ?? linha.projetoId}</EntityLink>}
                />
                <DadoOf
                  rotulo="Produto"
                  valor={
                    linha.produtoCodigo ? (
                      <EntityLink type="item" id={linha.produtoCodigo}>
                        {linha.produtoCodigo}
                      </EntityLink>
                    ) : (
                      "Código indisponível"
                    )
                  }
                />
                <DadoOf rotulo="Cliente" valor={linha.cliente ?? "—"} />
                <DadoOf
                  rotulo="Status"
                  valor={<span title={statusDetalhe}>{statusRotulo ?? `${linha.estadoAprovacao} / ${linha.estadoExecucao}`}</span>}
                />
                <DadoOf rotulo="Descrição" valor={linha.descricao ?? "—"} />
                <DadoOf rotulo="Quantidade" valor={`${linha.quantidadePlanejada} ${linha.unidade}`} />
                <DadoOf rotulo="Entrega" valor={formatarDataBr(linha.dataObjetivo)} />
                {prazoDivergente ? (
                  <DadoOf rotulo="Compromisso comercial vigente" valor={formatarDataBr(linha.prazoComercialVigente)} />
                ) : null}
                {resultadoLegado?.ok && resultadoLegado.resumo?.bomVersao ? (
                  <DadoOf rotulo="Versão do BOM" valor={resultadoLegado.resumo.bomVersao} />
                ) : null}
              </div>

              {notaLiberacao ? (
                <div className="mt-4 rounded-[10px] border border-status-success-border bg-status-success-bg px-4 py-2.5 text-[12.5px] text-status-success-text">
                  {notaLiberacao}
                </div>
              ) : null}
            </Card>

            {/* Seção 2 — Matérias-primas (nome interno "Momento Y", nunca exibido). */}
            <Card title="Matérias-primas">
              <div className="flex flex-col gap-3">
                <div className="rounded-[10px] border border-status-info-border bg-status-info-bg px-4 py-2.5 text-[12.5px] text-status-info-text">
                  Consulta real, somente leitura nesta etapa — nenhuma ação de adicionar, editar, remover ou salvar grava
                  dado real ainda.
                </div>

                {carregandoMateriais ? (
                  <p className="text-[12.5px] text-text-secondary">Consultando a conferência de matérias-primas…</p>
                ) : null}

                {!carregandoMateriais && resultadoMateriais && !resultadoMateriais.ok ? (
                  <div className="rounded-[10px] border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-[12.5px] text-status-danger-text">
                    <p>{MOTIVO_MENSAGEM[resultadoMateriais.motivo] ?? "Erro desconhecido."}</p>
                    {resultadoMateriais.motivo !== "nao_autenticado" ? (
                      <Button variant="secondary" onClick={recarregarPropostaMomentoY} className="mt-2">
                        Tentar novamente
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {!carregandoMateriais && resultadoMateriais?.ok ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Badge variant={resultadoMateriais.leitura.regime === "confirmado_momento_y" ? "success" : "neutral"}>
                        {REGIME_LABEL[resultadoMateriais.leitura.regime]}
                      </Badge>
                    </div>

                    {carregandoDetalheRegime ? (
                      <p className="text-[12.5px] text-text-secondary">Consultando os materiais…</p>
                    ) : null}

                    {/* Regime LEGADO: resumo + CI/CE das views legadas, mecanismo intocado. */}
                    {!carregandoDetalheRegime && resultadoMateriais.leitura.regime === "legado" ? (
                      resultadoLegado && !resultadoLegado.ok ? (
                        <div className="rounded-[10px] border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-[12.5px] text-status-danger-text">
                          Falha técnica ao consultar o resumo de materiais desta OF.
                        </div>
                      ) : resultadoLegado?.ok ? (
                        <>
                          {resultadoLegado.resumo ? (
                            <div className="grid grid-cols-2 gap-3 rounded-[10px] border border-border-subtle bg-surface-elevated p-3 sm:grid-cols-4">
                              <DadoOf rotulo="Demanda total (BOM)" valor={formatarNumero(resultadoLegado.resumo.totalDemandaBom)} />
                              <DadoOf rotulo="Estoque livre" valor={formatarNumero(resultadoLegado.resumo.totalEstoqueLivre)} />
                              <DadoOf rotulo="Consumo interno" valor={formatarNumero(resultadoLegado.resumo.totalConsumoInterno)} />
                              <DadoOf rotulo="Compra externa" valor={formatarNumero(resultadoLegado.resumo.totalCompraExterna)} />
                            </div>
                          ) : null}
                          {resultadoLegado.itens.length === 0 ? (
                            <EmptyState title="Nada a mostrar" description="Nenhum material encontrado para esta OF no fluxo anterior." />
                          ) : (
                            <Table>
                              <TableHead>
                                <TableHeaderCell>Material</TableHeaderCell>
                                <TableHeaderCell>Tipo</TableHeaderCell>
                                <TableHeaderCell>Qtd. BOM</TableHeaderCell>
                                <TableHeaderCell>Estoque livre</TableHeaderCell>
                                <TableHeaderCell>Consumo interno</TableHeaderCell>
                                <TableHeaderCell>Compra externa</TableHeaderCell>
                                <TableHeaderCell>Status</TableHeaderCell>
                              </TableHead>
                              <TableBody>
                                {resultadoLegado.itens.map((item, indice) => (
                                  <TableRow key={`${item.materiaPrimaCodigo ?? indice}-${indice}`}>
                                    <TableCell>{item.materiaPrimaDescricao ?? item.componenteTipo ?? "—"}</TableCell>
                                    <TableCell>{item.componenteTipo ?? "—"}</TableCell>
                                    <TableCell className="tabular-nums">
                                      {formatarNumero(item.bomQuantidade)} {item.bomUnidade ?? ""}
                                    </TableCell>
                                    <TableCell className="tabular-nums">{formatarNumero(item.estoqueSaldoLivre)}</TableCell>
                                    <TableCell className="tabular-nums">{formatarNumero(item.quantidadeConsumoInterno)}</TableCell>
                                    <TableCell className="tabular-nums">{formatarNumero(item.quantidadeCompraExterna)}</TableCell>
                                    <TableCell>{item.statusFluxo ?? "—"}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </>
                      ) : null
                    ) : null}

                    {/* Regime PENDENTE: conferência rica (Etapa 61) ligada à
                        confirmação REAL (Etapa 63, confirmar_necessidades_momento_y,
                        já auditada nas Etapas 61/62). O botão Salvar só fica
                        habilitado quando elegivelParaSalvar for true - hoje,
                        nenhuma empresa real tem o interruptor
                        pcp.ci_ce_momento_y.ativo ligado, então fica sempre
                        desabilitado em produção por essa regra de negócio,
                        não por nenhuma trava artificial desta etapa. */}
                    {resultadoMateriais.leitura.regime === "pendente_momento_y" ? (
                      resultadoMateriais.leitura.propostaOriginal.length === 0 ? (
                        <EmptyState title="Nada a conferir" description="OF pendente, mas a proposta do roteiro está vazia." />
                      ) : (
                        <>
                          {resultadoSaldoLivre && !resultadoSaldoLivre.ok ? (
                            <div className="rounded-[10px] border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-[12.5px] text-status-danger-text">
                              <p>
                                Falha técnica ao consultar o saldo livre — os valores sugeridos abaixo não refletem o
                                saldo real (a confirmação em si sempre valida o saldo oficial no servidor no momento
                                de salvar, nunca usa este valor como verdade).
                              </p>
                              <Button variant="secondary" onClick={recarregarSaldoLivre} className="mt-2">
                                Tentar novamente
                              </Button>
                            </div>
                          ) : null}
                          <ConferenciaMateriasPrimasPcp
                            key={`${ofId}-${releituraContagem}`}
                            itensIniciais={resultadoMateriais.leitura.propostaOriginal.map((item) => ({
                              materiaPrimaId: item.materia_prima_id,
                              descricao: item.descricao,
                              materialEspecificacao: item.especificacao ?? undefined,
                              unidade: item.unidade,
                              quantidade: item.quantidade_sugerida,
                            }))}
                            catalogo={{ modo: "busca" }}
                            mostrarTitulo={false}
                            saldoLivrePorMaterial={resultadoSaldoLivre?.ok ? resultadoSaldoLivre.saldoLivrePorMaterial : undefined}
                            notaSaldoLivre="Saldo livre consultado agora — revalidado de verdade só no momento da confirmação real."
                            textoBotaoConfirmar={enviandoConfirmacaoMateriais ? "Confirmando…" : "Salvar"}
                            confirmarDesabilitado={!elegivelParaSalvar || enviandoConfirmacaoMateriais}
                            onConfirmar={confirmarConferenciaMateriaisPendente}
                          />
                          {!elegivelParaSalvar ? (
                            <p className="text-[11px] text-text-secondary">{motivoSalvarDesabilitado}</p>
                          ) : null}
                          {erroConfirmacaoMateriais ? (
                            <div className="rounded-[10px] border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-[12.5px] text-status-danger-text">
                              {erroConfirmacaoMateriais}
                            </div>
                          ) : null}
                          {propostaPodeEstarDesatualizada ? (
                            <div>
                              <Button
                                variant="secondary"
                                onClick={async () => {
                                  await recarregarPropostaMomentoY();
                                  setReleituraContagem((c) => c + 1);
                                  setPropostaPodeEstarDesatualizada(false);
                                  setErroConfirmacaoMateriais(null);
                                }}
                              >
                                Reler OF
                              </Button>
                              <p className="mt-1.5 text-[11px] text-text-secondary">
                                Isso descarta a conferência não confirmada em memória e recarrega o estado atual da OF.
                              </p>
                            </div>
                          ) : null}
                        </>
                      )
                    ) : null}

                    {/* Fora do bloco "pendente": uma confirmação bem-sucedida
                        troca o regime para "confirmado_momento_y" (releitura
                        em confirmarConferenciaMateriaisPendente), então esta
                        nota precisa sobreviver à troca de bloco. */}
                    {notaSalvarMateriaisPendente ? (
                      <div className="rounded-[10px] border border-status-info-border bg-status-info-bg px-4 py-2.5 text-[12.5px] text-status-info-text">
                        {notaSalvarMateriaisPendente}
                      </div>
                    ) : null}

                    {/* Regime CONFIRMADO: necessidades OFICIAIS, nunca a proposta inicial. */}
                    {!carregandoDetalheRegime && resultadoMateriais.leitura.regime === "confirmado_momento_y" ? (
                      resultadoConfirmadas && !resultadoConfirmadas.ok ? (
                        <div className="rounded-[10px] border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-[12.5px] text-status-danger-text">
                          Falha técnica ao consultar as necessidades confirmadas desta OF.
                        </div>
                      ) : resultadoConfirmadas?.ok ? (
                        resultadoConfirmadas.itens.length === 0 ? (
                          <EmptyState
                            title="Nenhuma necessidade confirmada via esta conferência"
                            description="Esta OF está em regime confirmado, mas nenhuma necessidade com esta origem foi encontrada."
                          />
                        ) : (
                          <Table>
                            <TableHead>
                              <TableHeaderCell>Material</TableHeaderCell>
                              <TableHeaderCell>Especificação</TableHeaderCell>
                              <TableHeaderCell>Quantidade</TableHeaderCell>
                              <TableHeaderCell>Origem</TableHeaderCell>
                            </TableHead>
                            <TableBody>
                              {resultadoConfirmadas.itens.map((item) => (
                                <TableRow key={item.materiaPrimaId}>
                                  <TableCell>
                                    {item.descricao ?? "—"}
                                    {item.observacaoTecnica ? (
                                      <p className="mt-0.5 text-[11px] text-text-secondary">{item.observacaoTecnica}</p>
                                    ) : null}
                                  </TableCell>
                                  <TableCell>{item.especificacao ?? "—"}</TableCell>
                                  <TableCell className="tabular-nums">{item.quantidadeNecessaria}</TableCell>
                                  <TableCell>{item.origemFornecimento ?? "—"}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )
                      ) : null
                    ) : null}

                    {resultadoMateriais.leitura.regime !== "pendente_momento_y" ? (
                    <div>
                      <Button disabled title={motivoSalvarDesabilitado}>
                        Salvar
                      </Button>
                      <p className="mt-1.5 text-[11px] text-text-secondary">
                        {elegivelParaSalvar
                          ? "Esta OF está elegível — gravação real ainda não habilitada nesta etapa."
                          : motivoSalvarDesabilitado}
                      </p>
                    </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Card>

            {/* Seção 3 — Operações de Produção (Fase 1, só leitura). Lê o
                planejamento vigente (Y) real da OP - nunca o roteiro
                original (X) nem a execução (Z). Nenhuma edição habilitada
                aqui: Adicionar/Editar/Remover ficam para fase posterior. */}
            <Card title="Operações de Produção">
              <div className="flex flex-col gap-3">
                <div className="rounded-[10px] border border-status-info-border bg-status-info-bg px-4 py-2.5 text-[12.5px] text-status-info-text">
                  Adicionar, Editar e Remover gravam de verdade (Etapa 65F) — os bloqueios mostrados refletem as
                  regras reais do banco.
                </div>

                {carregandoOperacoes ? (
                  <p className="text-[12.5px] text-text-secondary">Consultando as operações desta OF…</p>
                ) : null}

                {!carregandoOperacoes && resultadoOperacoes && !resultadoOperacoes.ok ? (
                  <div className="rounded-[10px] border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-[12.5px] text-status-danger-text">
                    <p>
                      {resultadoOperacoes.motivo === "nao_autenticado"
                        ? "Sessão não autenticada."
                        : "Falha técnica ao consultar as operações desta OF."}
                    </p>
                    {resultadoOperacoes.motivo !== "nao_autenticado" ? (
                      <Button variant="secondary" onClick={recarregarOperacoes} className="mt-2">
                        Tentar novamente
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {!carregandoOperacoes && resultadoOperacoes?.ok && resultadoPermissoesOperacoes && !resultadoPermissoesOperacoes.ok ? (
                  <div className="rounded-[10px] border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-[12.5px] text-status-danger-text">
                    <p>
                      Falha técnica ao consultar permissões — Adicionar, Editar e Remover ficam bloqueados até a
                      releitura ter sucesso.
                    </p>
                    <Button variant="secondary" onClick={recarregarPermissoesOperacoes} className="mt-2">
                      Tentar novamente
                    </Button>
                  </div>
                ) : null}

                {!carregandoOperacoes && resultadoOperacoes?.ok ? (
                  <>
                    <div className="flex items-center justify-end">
                      <Button
                        variant="secondary"
                        onClick={abrirModalAdicionar}
                        disabled={motivoBloqueioAdicionar() !== null}
                        title={motivoBloqueioAdicionar() ?? undefined}
                      >
                        Adicionar operação
                      </Button>
                    </div>

                    {resultadoOperacoes.operacoes.length === 0 ? (
                      <EmptyState title="Nenhuma operação cadastrada" description="Esta OF não possui nenhuma operação de produção registrada." />
                    ) : (
                      <Table>
                        <TableHead>
                          <TableHeaderCell>Operação</TableHeaderCell>
                          <TableHeaderCell>Descrição</TableHeaderCell>
                          <TableHeaderCell>Recurso</TableHeaderCell>
                          <TableHeaderCell>Sequência</TableHeaderCell>
                          <TableHeaderCell>Tempo</TableHeaderCell>
                          <TableHeaderCell>Situação</TableHeaderCell>
                          <TableHeaderCell>Origem</TableHeaderCell>
                          <TableHeaderCell>{null}</TableHeaderCell>
                        </TableHead>
                        <TableBody>
                          {resultadoOperacoes.operacoes.map((operacao) => {
                            const motivoEditar = motivoBloqueioEditar(operacao);
                            const motivoRemover = motivoBloqueioRemover(operacao);
                            return (
                              <TableRow key={operacao.opId}>
                                <TableCell className="font-semibold">{operacao.codigoOperacional}</TableCell>
                                <TableCell>{operacao.descricao}</TableCell>
                                <TableCell>{operacao.recursoNome ?? "Recurso não definido"}</TableCell>
                                <TableCell className="tabular-nums">{operacao.sequencia}</TableCell>
                                <TableCell className="whitespace-nowrap tabular-nums">
                                  {operacao.tempoPlanejadoMinutos !== null ? `${operacao.tempoPlanejadoMinutos} min` : "Tempo não definido"}
                                </TableCell>
                                <TableCell>
                                  <span title={SITUACAO_OPERACAO_TOOLTIP[operacao.situacao]}>
                                    <Badge variant={operacao.situacao === "concluida" ? "success" : "neutral"}>
                                      {SITUACAO_OPERACAO_LABEL[operacao.situacao]}
                                    </Badge>
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="neutral">{ORIGEM_OPERACAO_LABEL[operacao.origem]}</Badge>
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-right">
                                  <button
                                    type="button"
                                    onClick={() => abrirModalEditar(operacao)}
                                    disabled={motivoEditar !== null}
                                    title={motivoEditar ?? undefined}
                                    className="mr-3 text-[12.5px] font-semibold text-action-primary hover:underline disabled:cursor-not-allowed disabled:text-text-disabled disabled:no-underline"
                                  >
                                    Editar
                                  </button>
                                  {/* Etapa 66F — controle próprio "Dependências", nunca misturado
                                      com o formulário de Editar (tempo/recurso/sequência). Sempre
                                      clicável: visualizar dependências não exige nenhuma permissão
                                      de escrita - só os controles de adicionar/remover DENTRO do
                                      modal ficam condicionados. */}
                                  <button
                                    type="button"
                                    onClick={() => abrirModalDependencias(operacao)}
                                    className="mr-3 text-[12.5px] font-semibold text-action-primary hover:underline"
                                  >
                                    Dependências
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => abrirModalRemover(operacao)}
                                    disabled={motivoRemover !== null}
                                    title={motivoRemover ?? undefined}
                                    className="text-[12.5px] font-semibold text-status-danger-text hover:underline disabled:cursor-not-allowed disabled:text-text-disabled disabled:no-underline"
                                  >
                                    Remover
                                  </button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </>
                ) : null}
              </div>
            </Card>
          </>
        ) : null}
      </div>

      <Modal
        open={modalOperacao !== null}
        onClose={() => setModalOperacao(null)}
        title={modalOperacao?.modo === "editar" ? "Editar operação" : "Adicionar operação"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOperacao(null)} disabled={enviandoFormOperacao}>
              Cancelar
            </Button>
            <Button onClick={confirmarModalOperacao} disabled={enviandoFormOperacao}>
              {modalOperacao?.modo === "editar"
                ? enviandoFormOperacao
                  ? "Salvando…"
                  : "Salvar edição"
                : enviandoFormOperacao
                  ? "Adicionando…"
                  : "Adicionar"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {modalOperacao?.modo === "editar" ? (
            <div className="grid grid-cols-2 gap-4">
              <CampoSomenteLeitura label="Código da OP" valor={campoCodigo} />
              <CampoSomenteLeitura label="Descrição" valor={campoDescricao} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Código da OP"
                value={campoCodigo}
                onChange={(e) => setCampoCodigo(e.target.value)}
                error={errosFormOperacao.codigo}
                placeholder="Ex.: OP70"
                disabled={enviandoFormOperacao}
              />
              <Field
                label="Descrição"
                value={campoDescricao}
                onChange={(e) => setCampoDescricao(e.target.value)}
                error={errosFormOperacao.descricao}
                disabled={enviandoFormOperacao}
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {(() => {
              // Etapa 65C — alterar_y_operacao trata NULL como "não
              // altera este campo", nunca como "limpar" (confirmado
              // contra produção) - então, ao editar uma OP que JÁ tem
              // recurso vinculado, a opção "Nenhum" não é oferecida
              // (selecioná-la pareceria desvincular, mas na prática não
              // mudaria nada). Só aparece ao adicionar, ou ao editar uma
              // OP que ainda não tem recurso - estados onde "Nenhum" é
              // uma escolha real, não uma falsa promessa de limpeza.
              const operacaoAtual = modalOperacao?.modo === "editar" ? modalOperacao.operacao : null;
              const permiteNenhumRecurso = !operacaoAtual || operacaoAtual.recursoId === null;

              const opcoesAtivas = (recursosDisponiveis ?? []).map((recurso) => ({ value: recurso.id, label: recurso.label }));
              // Etapa 65D — achado real: o recurso ATUAL de uma OP pode ter
              // sido desativado depois da OP ser criada/editada. A lista de
              // opções só traz recursos ativos (buscarRecursosProdutivosPcp
              // filtra ativo=true, de propósito - inativos nunca devem
              // aparecer como NOVA escolha). Sem isto, um <select>
              // controlado com value apontando para um id ausente das
              // opções perde a seleção visualmente (o navegador não tem
              // <option> correspondente) - o estado React (campoRecursoId)
              // continua correto e é o que de fato é enviado à Server
              // Action, mas a tela mentiria sobre qual recurso está
              // vinculado. Corrigido injetando SÓ o próprio recurso atual
              // da OP, rotulado como inativo - nunca os demais recursos
              // inativos da empresa, que nunca devem ficar disponíveis
              // para atribuição nova.
              const recursoAtualInativo =
                operacaoAtual?.recursoId && !opcoesAtivas.some((o) => o.value === operacaoAtual.recursoId)
                  ? { value: operacaoAtual.recursoId, label: `${operacaoAtual.recursoNome ?? "Recurso"} (inativo — recurso atual desta OP)` }
                  : null;
              const opcoes = recursoAtualInativo ? [recursoAtualInativo, ...opcoesAtivas] : opcoesAtivas;

              return (
                <Select
                  label="Recurso"
                  value={campoRecursoId}
                  onChange={(e) => setCampoRecursoId(e.target.value)}
                  options={opcoes}
                  placeholder={
                    carregandoRecursos ? "Carregando recursos…" : permiteNenhumRecurso ? "Nenhum" : undefined
                  }
                  disabled={carregandoRecursos || enviandoFormOperacao}
                />
              );
            })()}
            <Field
              label="Tempo planejado (min)"
              type="number"
              value={campoTempo}
              onChange={(e) => setCampoTempo(e.target.value)}
              error={errosFormOperacao.tempo}
              placeholder="Opcional"
              disabled={enviandoFormOperacao}
            />
            <Field
              label="Sequência"
              type="number"
              value={campoSequencia}
              onChange={(e) => setCampoSequencia(e.target.value)}
              error={errosFormOperacao.sequencia}
              disabled={enviandoFormOperacao}
            />
          </div>

          {erroRecursos ? (
            <div className="rounded-[10px] border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-[12.5px] text-status-danger-text">
              <p>{erroRecursos}</p>
              <Button variant="secondary" onClick={garantirRecursosCarregados} className="mt-2">
                Tentar novamente
              </Button>
            </div>
          ) : null}

          <Field
            label="Motivo"
            value={campoMotivo}
            onChange={(e) => setCampoMotivo(e.target.value)}
            error={errosFormOperacao.motivo}
            hint="Obrigatório — toda alteração de Operações de Produção exige justificativa."
            disabled={enviandoFormOperacao}
          />

          {notaFormOperacao ? (
            <div className="rounded-[10px] border border-status-info-border bg-status-info-bg px-4 py-2.5 text-[12.5px] text-status-info-text">
              {notaFormOperacao}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={modalLiberacaoAberto}
        onClose={() => (enviandoLiberacao ? null : setModalLiberacaoAberto(false))}
        title="Liberar para Produção"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalLiberacaoAberto(false)} disabled={enviandoLiberacao}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={confirmarLiberacaoOf} disabled={enviandoLiberacao}>
              {enviandoLiberacao ? "Liberando…" : "Confirmar liberação"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p>
            A OF <strong>{linha?.numeroOf}</strong> será liberada para produção. Esta decisão é sua — confirme só depois de avaliar as
            condições reais (matéria-prima disponível, documentação, ferramentas) fora desta tela.
          </p>

          {erroLiberacao ? (
            <div className="rounded-[10px] border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-[12.5px] text-status-danger-text">
              {erroLiberacao}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={operacaoParaRemover !== null}
        onClose={() => setOperacaoParaRemover(null)}
        title="Remover operação"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOperacaoParaRemover(null)} disabled={enviandoRemocaoOperacao}>
              Cancelar
            </Button>
            <Button
              variant="danger-solid"
              onClick={confirmarRemocaoOperacao}
              disabled={!dependenciasConhecidas || dependenciasDaOperacaoParaRemover.length > 0 || enviandoRemocaoOperacao}
            >
              {enviandoRemocaoOperacao ? "Removendo…" : "Confirmar remoção"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p>
            A operação <strong>{operacaoParaRemover?.codigoOperacional}</strong> será marcada como{" "}
            <strong>Não aplicável</strong> — ela nunca é excluída fisicamente, e esta ação fica registrada no
            histórico da OP.
          </p>

          {dependenciasDaOperacaoParaRemover.length > 0 ? (
            <div className="rounded-[10px] border border-status-danger-border bg-status-danger-bg px-4 py-2.5 text-[12.5px] text-status-danger-text">
              Esta OP tem dependências relacionadas — revise-as antes de remover:
              <ul className="mt-1.5 list-disc pl-4">
                {dependenciasDaOperacaoParaRemover.map((dep) => (
                  <li key={dep.opRelacionadaId}>
                    {dep.papel === "origem"
                      ? `É pré-requisito de ${dep.codigoOperacionalRelacionada}`
                      : `Depende de ${dep.codigoOperacionalRelacionada}`}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Field
              label="Motivo"
              value={campoMotivoRemover}
              onChange={(e) => setCampoMotivoRemover(e.target.value)}
              error={erroMotivoRemover ?? undefined}
              hint="Obrigatório para marcar a operação como não aplicável."
              disabled={enviandoRemocaoOperacao}
            />
          )}

          {notaRemoverOperacao ? (
            <div className="rounded-[10px] border border-status-info-border bg-status-info-bg px-4 py-2.5 text-[12.5px] text-status-info-text">
              {notaRemoverOperacao}
            </div>
          ) : null}
        </div>
      </Modal>

      {/* Etapa 66F — controle próprio "Dependências": visualização
          bidirecional + adicionar/remover vínculo, sempre separado da
          edição de tempo/recurso/sequência. */}
      <Modal
        open={operacaoParaDependencias !== null}
        onClose={() => setOperacaoParaDependencias(null)}
        title="Dependências"
        size="lg"
        footer={
          subAcaoDependencia?.tipo === "adicionar" ? (
            <>
              {/* Etapa 66H — Cancelar NUNCA mais fica desabilitado por
                  enviandoDependencia: se a chamada ficar travada sem
                  nunca resolver (achado real da Etapa 66G), o usuário
                  precisa de uma saída sempre disponível. */}
              <Button variant="secondary" onClick={cancelarAcaoDependencia}>
                Cancelar
              </Button>
              {enviandoDependencia ? (
                <Button variant="secondary" onClick={verificarEstadoAtualDependenciaAgora}>
                  Verificar estado atual
                </Button>
              ) : null}
              <Button onClick={confirmarAdicionarDependencia} disabled={enviandoDependencia}>
                {enviandoDependencia ? "Adicionando…" : "Confirmar"}
              </Button>
            </>
          ) : subAcaoDependencia?.tipo === "remover" ? (
            <>
              <Button variant="secondary" onClick={cancelarAcaoDependencia}>
                Cancelar
              </Button>
              {enviandoDependencia ? (
                <Button variant="secondary" onClick={verificarEstadoAtualDependenciaAgora}>
                  Verificar estado atual
                </Button>
              ) : null}
              <Button variant="danger-solid" onClick={confirmarRemoverDependencia} disabled={enviandoDependencia}>
                {enviandoDependencia ? "Removendo…" : "Confirmar remoção"}
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setOperacaoParaDependencias(null)}>
              Fechar
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-4">
          <p>
            Operação <strong>{operacaoParaDependencias?.codigoOperacional}</strong> — {operacaoParaDependencias?.descricao}
          </p>

          {resultadoPermissoesDependencias?.ok && !resultadoPermissoesDependencias.ambienteHabilitado ? (
            <div className="rounded-[10px] border border-status-warning-border bg-status-warning-bg px-4 py-2.5 text-[12.5px] text-status-warning-text">
              Esta funcionalidade ainda não está disponível neste ambiente — a estrutura de banco necessária não foi aplicada em
              produção. As ações abaixo estão bloqueadas, inclusive se tentadas diretamente (a Server Action também rejeita).
            </div>
          ) : null}

          {subAcaoDependencia === null ? (
            <>
              <div className="flex flex-col gap-2">
                <h3 className="text-[12.5px] font-semibold uppercase tracking-[0.05em] text-text-secondary">Depende de</h3>
                {!dependenciasConhecidas ? (
                  <p className="text-[12.5px] text-text-secondary">Consultando dependências…</p>
                ) : dependeDe.length === 0 ? (
                  <p className="text-[12.5px] text-text-secondary">Nenhuma — esta operação não depende de nenhuma outra.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {dependeDe.map((dep) => (
                      <li key={dep.opRelacionadaId} className="flex items-center justify-between text-[12.5px]">
                        <span>{dep.codigoOperacionalRelacionada}</span>
                        <button
                          type="button"
                          onClick={() => iniciarRemocaoDependencia(dep)}
                          disabled={
                            !resultadoPermissoesDependencias?.ok ||
                            !resultadoPermissoesDependencias.podeRemoverDependencia ||
                            !resultadoPermissoesDependencias.ambienteHabilitado
                          }
                          title={
                            resultadoPermissoesDependencias?.ok && !resultadoPermissoesDependencias.ambienteHabilitado
                              ? "Funcionalidade não habilitada neste ambiente."
                              : resultadoPermissoesDependencias?.ok && !resultadoPermissoesDependencias.podeRemoverDependencia
                                ? "Seu usuário não tem a permissão pcp.remover_dependencia_operacao."
                                : undefined
                          }
                          className="font-semibold text-status-danger-text hover:underline disabled:cursor-not-allowed disabled:text-text-disabled disabled:no-underline"
                        >
                          Remover
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-[12.5px] font-semibold uppercase tracking-[0.05em] text-text-secondary">É pré-requisito de</h3>
                {!dependenciasConhecidas ? (
                  <p className="text-[12.5px] text-text-secondary">Consultando dependências…</p>
                ) : ehPreRequisitoDe.length === 0 ? (
                  <p className="text-[12.5px] text-text-secondary">Nenhuma — nenhuma outra operação depende desta.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {ehPreRequisitoDe.map((dep) => (
                      <li key={dep.opRelacionadaId} className="flex items-center justify-between text-[12.5px]">
                        <span>{dep.codigoOperacionalRelacionada}</span>
                        <button
                          type="button"
                          onClick={() => iniciarRemocaoDependencia(dep)}
                          disabled={
                            !resultadoPermissoesDependencias?.ok ||
                            !resultadoPermissoesDependencias.podeRemoverDependencia ||
                            !resultadoPermissoesDependencias.ambienteHabilitado
                          }
                          title={
                            resultadoPermissoesDependencias?.ok && !resultadoPermissoesDependencias.ambienteHabilitado
                              ? "Funcionalidade não habilitada neste ambiente."
                              : resultadoPermissoesDependencias?.ok && !resultadoPermissoesDependencias.podeRemoverDependencia
                                ? "Seu usuário não tem a permissão pcp.remover_dependencia_operacao."
                                : undefined
                          }
                          className="font-semibold text-status-danger-text hover:underline disabled:cursor-not-allowed disabled:text-text-disabled disabled:no-underline"
                        >
                          Remover
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCampoOpPreRequisito("");
                    setCampoMotivoDependencia("");
                    setErroMotivoDependencia(null);
                    setNotaDependencia(null);
                    setSubAcaoDependencia({ tipo: "adicionar" });
                  }}
                  disabled={
                    !resultadoPermissoesDependencias?.ok ||
                    !resultadoPermissoesDependencias.podeCriarDependencia ||
                    !resultadoPermissoesDependencias.ambienteHabilitado ||
                    outrasOperacoesDaOf.length === 0
                  }
                  title={
                    resultadoPermissoesDependencias?.ok && !resultadoPermissoesDependencias.ambienteHabilitado
                      ? "Funcionalidade não habilitada neste ambiente."
                      : resultadoPermissoesDependencias?.ok && !resultadoPermissoesDependencias.podeCriarDependencia
                        ? "Seu usuário não tem a permissão pcp.criar_dependencia_operacao."
                        : outrasOperacoesDaOf.length === 0
                          ? "Não há outra operação nesta OF para ser pré-requisito."
                          : undefined
                  }
                >
                  Adicionar pré-requisito
                </Button>
              </div>
            </>
          ) : subAcaoDependencia.tipo === "adicionar" ? (
            <div className="flex flex-col gap-4">
              <Select
                label="Operação pré-requisito"
                value={campoOpPreRequisito}
                onChange={(e) => setCampoOpPreRequisito(e.target.value)}
                options={outrasOperacoesDaOf.map((o) => ({ value: o.opId, label: `${o.codigoOperacional} — ${o.descricao}` }))}
                placeholder="Selecione a operação"
                disabled={enviandoDependencia}
              />
              <div className="rounded-[10px] border border-status-warning-border bg-status-warning-bg px-4 py-2.5 text-[12.5px] text-status-warning-text">
                Esta alteração poderá deixar a programação vigente da empresa desatualizada — um novo cálculo não é solicitado
                automaticamente.
              </div>
              <Field
                label="Motivo"
                value={campoMotivoDependencia}
                onChange={(e) => setCampoMotivoDependencia(e.target.value)}
                error={erroMotivoDependencia ?? undefined}
                hint="Obrigatório — toda criação de dependência exige justificativa."
                disabled={enviandoDependencia}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="rounded-[10px] border border-border bg-border-subtle px-4 py-2.5 text-[12.5px]">
                <p>
                  <strong>OP origem:</strong>{" "}
                  {subAcaoDependencia.dependencia.papel === "origem"
                    ? operacaoParaDependencias?.codigoOperacional
                    : subAcaoDependencia.dependencia.codigoOperacionalRelacionada}
                </p>
                <p>
                  <strong>OP dependente:</strong>{" "}
                  {subAcaoDependencia.dependencia.papel === "origem"
                    ? subAcaoDependencia.dependencia.codigoOperacionalRelacionada
                    : operacaoParaDependencias?.codigoOperacional}
                </p>
                <p>
                  <strong>Sentido:</strong>{" "}
                  {subAcaoDependencia.dependencia.papel === "origem"
                    ? `${operacaoParaDependencias?.codigoOperacional} é pré-requisito de ${subAcaoDependencia.dependencia.codigoOperacionalRelacionada}`
                    : `${subAcaoDependencia.dependencia.codigoOperacionalRelacionada} é pré-requisito de ${operacaoParaDependencias?.codigoOperacional}`}
                </p>
              </div>
              <div className="rounded-[10px] border border-status-warning-border bg-status-warning-bg px-4 py-2.5 text-[12.5px] text-status-warning-text">
                Esta alteração poderá deixar a programação vigente da empresa desatualizada — um novo cálculo não é solicitado
                automaticamente.
              </div>
              <Field
                label="Motivo"
                value={campoMotivoDependencia}
                onChange={(e) => setCampoMotivoDependencia(e.target.value)}
                error={erroMotivoDependencia ?? undefined}
                hint="Obrigatório — toda remoção de dependência exige justificativa."
                disabled={enviandoDependencia}
              />
            </div>
          )}

          {notaDependencia ? (
            <div className="rounded-[10px] border border-status-info-border bg-status-info-bg px-4 py-2.5 text-[12.5px] text-status-info-text">
              {notaDependencia}
            </div>
          ) : null}
        </div>
      </Modal>
    </main>
  );
}
