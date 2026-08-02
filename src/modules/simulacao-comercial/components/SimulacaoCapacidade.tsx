// Preview/revalidação (execução inicial, reexecução para o modal de
// divergência/déficit) continuam rodando aqui, no navegador, só para
// feedback rápido de UX - nenhuma dessas chamadas persiste nada. A
// aprovação em si (persistência real) não usa mais aprovarSimulacaoComercial
// direto daqui - vai pela Server Action aprovarSimulacaoComercialAction,
// que recalcula de novo no servidor antes de persistir (PAD-008,
// seções 7-8). aprovarSimulacaoComercial (RPC v1) continua existindo
// só como caminho de rollback, não é chamada por este componente.
// Sem lógica de busca/transformação de dado neste componente: quem
// enriquece o resultado para exibição é prepararResultadoParaExibicao
// (lib/), consumido pronto aqui.
//
// Entrega 1 do PAD-008 v2.0 (seção 17): janelaInicio/janelaFim deixam
// de ser digitadas manualmente - Margem de Segurança e Data Prevista
// de Aprovação do Pedido são as premissas informadas ANTES de simular,
// e a janela produtiva é derivada automaticamente por
// prepararJanelaComercial (lib/), a mesma função usada pelo servidor
// na aprovação autoritativa (nunca confia na janela calculada aqui
// para persistir - ver aprovarSimulacaoComercialAction.ts).
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  simularCapacidadeProjeto,
  type ResultadoSimulacao,
} from "@/modules/simulacao-comercial/lib/executarSimulacao";
import { aprovarSimulacaoComercialAction } from "@/modules/simulacao-comercial/actions/aprovarSimulacaoComercialAction";
import {
  prepararResultadoParaExibicao,
  type OperacaoParaExibicao,
} from "@/modules/simulacao-comercial/lib/prepararResultadoParaExibicao";
import {
  compararResultadosSimulacao,
  type DiferencaSimulacao,
} from "@/modules/simulacao-comercial/lib/compararResultadosSimulacao";
import { contarDiasProdutivosNaJanela } from "@/modules/simulacao-comercial/lib/agregarDiasProdutivos";
import {
  compararJanelaEfetiva,
  prepararJanelaComercial,
  premissasComerciaisMudaram,
  type PremissasJanelaComercial,
  type ResultadoJanelaComercial,
} from "@/modules/simulacao-comercial/lib/prepararJanelaComercial";
import { calcularJanelaComercialParaExibicao } from "@/modules/simulacao-comercial/lib/calcularJanelaComercialParaExibicao";
import {
  ProjetoSemItensError,
  RecursoSemCapacidadeCadastradaError,
  RoteiroNaoEncontradoError,
} from "@/modules/simulacao-comercial/lib/errors";
import { OperacaoSemRecursoError } from "@/modules/bom/lib/errors";

type SimulacaoVigenteInfo = {
  id: string;
  aprovadoEm: string;
} | null;

// Contexto da operacao mais critica (maior deficit) para o bloco
// "Motivo principal do deficit" no modal - ver calcularMotivoPrincipalDeficit.
type MotivoPrincipalDeficit = {
  operacaoDescricao: string;
  necessario: number;
  disponivelNaJanela: number;
  diasProdutivos: number;
};

// Estados do fluxo de aprovacao (DEC-002) - ainda sem UI propria (Item
// 4): "divergente" e "pronta" sao os pontos de decisao que a UI vai
// renderizar como os 4 estados do mockup (dados desatualizados,
// aviso de substituicao, modal de deficit, aprovacao em si).
type StatusAprovacao =
  | { tipo: "revalidando" }
  | { tipo: "divergente"; diferencas: DiferencaSimulacao[] }
  | {
      tipo: "pronta";
      temDeficit: boolean;
      motivoPrincipalDeficit: MotivoPrincipalDeficit | null;
      simulacaoVigente: SimulacaoVigenteInfo;
    }
  | { tipo: "aprovando" }
  | { tipo: "aprovada"; simulacaoComercialId: string }
  | { tipo: "erro"; mensagem: string };

type SimulacaoCapacidadeProps = {
  projetoId: string;
};

// Dados da simulacao vigente (ja aprovada) para a tela em modo leitura
// (Item 4d). aprovadoEm e usado tanto para "Data/hora da aprovacao"
// quanto para "Data/hora da simulacao utilizada" - simulacoes_comerciais
// so persiste um timestamp (aprovado_em); nao existe uma coluna
// separada para "quando o Simular foi clicado". Ver nota no relatorio.
// dataPrevistaAprovacaoPedido/dataChegadaPrevista podem ser null em
// simulacoes aprovadas antes da Entrega 1 do PAD-008 v2.0 - telas
// antigas nao tinham essas premissas.
type SimulacaoAprovadaExistente = {
  aprovadoPorNome: string;
  aprovadoEm: string;
  cenarioDemanda: string;
  modoProducao: string;
  dataNecessidade: string;
  margemSegurancaDias: number;
  dataPrevistaAprovacaoPedido: string | null;
  dataChegadaPrevista: string | null;
  janelaInicio: string;
  janelaFim: string;
  totalOperacoes: number;
  totalEmDeficit: number;
};

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ProjetoSemItensError) {
    return "Este projeto não possui itens ativos. Adicione ao menos um item antes de simular capacidade.";
  }
  if (erro instanceof RoteiroNaoEncontradoError) {
    return "Um dos itens do projeto não tem uma estrutura (BOM) cadastrada. Cadastre o Roteiro antes de simular.";
  }
  if (erro instanceof OperacaoSemRecursoError) {
    return "Uma operação do roteiro não tem Recurso Produtivo vinculado. Vincule um recurso a essa operação antes de simular.";
  }
  if (erro instanceof RecursoSemCapacidadeCadastradaError) {
    return "Um recurso usado no roteiro não tem capacidade diária cadastrada. Configure a capacidade do recurso antes de simular.";
  }
  if (erro instanceof RangeError) {
    return erro.message;
  }
  if (erro instanceof Error) {
    return `Erro ao simular capacidade: ${erro.message}`;
  }
  return "Erro inesperado ao simular capacidade.";
}

function formatarDataBr(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function mensagemAusenciaJanela(janela: Extract<ResultadoJanelaComercial, { valida: false }>): string {
  if (janela.motivo === "disponibilidade_apos_prazo_interno") {
    return `A disponibilidade prevista do material (${formatarDataBr(janela.dataDisponibilidadeProducao)}) é posterior ao Prazo Interno (${formatarDataBr(janela.prazoInterno)}). Não existe janela produtiva viável para esta simulação.`;
  }
  return `Não há nenhum dia produtivo entre a disponibilidade do material (${formatarDataBr(janela.dataDisponibilidadeProducao)}) e o Prazo Interno (${formatarDataBr(janela.prazoInterno)}). Não existe janela produtiva viável para esta simulação.`;
}

// Rotulos legiveis para os campos comparados por compararResultadosSimulacao
// (mesmos campos que aprovar_projeto_com_simulacao_v3 persiste - DEC-002)
// e por compararJanelaEfetiva (PAD-008 v2.0 secao 17).
const ROTULOS_CAMPO_DIFERENCA: Record<string, string> = {
  recursoConsideradoId: "Recurso considerado (ID)",
  motivoConsideracao: "Motivo de consideração",
  deficit: "Déficit (h)",
  necessario: "Necessário (h)",
  capacidadeBruta: "Capacidade bruta (h)",
  capacidadeEfetiva: "Capacidade efetiva (h)",
  capacidadeDisponivel: "Capacidade disponível (h)",
  comprometido: "Comprometido (h)",
  livre: "Livre (h)",
  presenca: "Presença da operação",
  janelaInicio: "Data de Disponibilidade para Produção",
  janelaFim: "Prazo Interno",
};

function formatarValorDiferenca(valor: unknown): string {
  if (valor === null || valor === undefined) {
    return "—";
  }
  if (typeof valor === "number") {
    return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
  return String(valor);
}

export function SimulacaoCapacidade({ projetoId }: SimulacaoCapacidadeProps) {
  // Premissas comerciais (PAD-008 v2.0 §17, DEC-004 v1.1) - informadas
  // ANTES de qualquer execução do Motor. dataNecessidade é carregada
  // automaticamente de projetos.data_objetivo (efeito abaixo) e também
  // editável mais adiante, junto de Cenário de Demanda/Modo de Produção.
  const [dataPrevistaAprovacaoPedido, setDataPrevistaAprovacaoPedido] = useState("");
  const [margemSegurancaDiasTexto, setMargemSegurancaDiasTexto] = useState("0");
  const [dataNecessidade, setDataNecessidade] = useState("");

  const [janelaComercial, setJanelaComercial] = useState<ResultadoJanelaComercial | null>(null);
  const [calculandoJanela, setCalculandoJanela] = useState(false);
  const [erroJanela, setErroJanela] = useState<string | null>(null);

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<OperacaoParaExibicao[] | null>(null);
  // Resultado cru do Motor, guardado a parte do de exibicao - e o que
  // sera usado na revalidacao/aprovacao (DEC-002), ja que o resultado
  // de exibicao nao tem os campos que aprovar_projeto_com_simulacao_v3
  // exige (recursoOriginalId/recursoConsideradoId como UUID, e os 5
  // campos de capacidade).
  const [resultadoBruto, setResultadoBruto] = useState<ResultadoSimulacao | null>(
    null,
  );
  const [statusAprovacao, setStatusAprovacao] = useState<StatusAprovacao | null>(
    null,
  );
  // Data/hora do clique em "Simular" - exibida no resumo do estado
  // "pronta" (mockup), para o usuario saber quando o resultado que
  // esta prestes a aprovar foi calculado.
  const [simuladoEm, setSimuladoEm] = useState<Date | null>(null);

  // Chave de idempotencia da tentativa de aprovacao em andamento -
  // gerada uma vez quando o fluxo entra em "pronta" (iniciarAprovacao),
  // reaproveitada em toda chamada de confirmarAprovacao dessa mesma
  // tentativa (inclusive retries de rede). useRef, nao state: nao
  // precisa re-renderizar quando muda, e precisa sobreviver a troca de
  // outros estados no mesmo ciclo.
  const chaveIdempotenciaRef = useRef<string | null>(null);

  // Premissas da última simulação já exibida - usado só para detectar
  // alteração posterior (DEC-004 v1.1: "Qualquer alteração posterior
  // invalida o resultado apresentado"). null enquanto não há resultado.
  const premissasDoResultadoRef = useRef<PremissasJanelaComercial | null>(null);

  // Parametros exigidos por aprovar_projeto_com_simulacao_v3 (NOT NULL
  // em simulacoes_comerciais) que não são premissas de janela - abordagem
  // minima combinada (sem tabela nova, sem premissa nova): cenarioDemanda/
  // modoProducao texto livre.
  const [cenarioDemanda, setCenarioDemanda] = useState("");
  const [modoProducao, setModoProducao] = useState("");

  // Item 4d: checagem na montagem da tela - se ja existe simulacao
  // vigente aprovada para este projeto, a tela vai direto para o modo
  // leitura, sem exigir "Simular"/"Aprovar" nesta sessao do navegador.
  const [verificandoAprovacaoExistente, setVerificandoAprovacaoExistente] =
    useState(true);
  const [simulacaoAprovadaExistente, setSimulacaoAprovadaExistente] =
    useState<SimulacaoAprovadaExistente | null>(null);

  const carregarSimulacaoVigente = useCallback(async () => {
    const { data: vigente } = await supabase
      .from("simulacoes_comerciais")
      .select(
        "id,cenario_demanda,modo_producao,data_necessidade,margem_seguranca_dias,data_prevista_aprovacao_pedido,data_chegada_prevista,janela_inicio,janela_fim,aprovado_em,aprovado_por",
      )
      .eq("projeto_id", projetoId)
      .eq("vigente", true)
      .maybeSingle();

    if (!vigente) {
      setSimulacaoAprovadaExistente(null);
      return;
    }

    const { data: itens } = await supabase
      .from("simulacao_comercial_itens")
      .select("deficit")
      .eq("simulacao_comercial_id", vigente.id);

    const itensLista = (itens ?? []) as { deficit: number }[];

    // Lookup do aprovador: se falhar, nao bloqueia a tela - fica o
    // fallback com o ID.
    let aprovadoPorNome = `ID ${vigente.aprovado_por}`;

    const { data: usuarioAprovador } = await supabase
      .from("usuarios")
      .select("nome")
      .eq("id", vigente.aprovado_por)
      .maybeSingle();

    if (usuarioAprovador?.nome) {
      aprovadoPorNome = usuarioAprovador.nome;
    }

    setSimulacaoAprovadaExistente({
      aprovadoPorNome,
      aprovadoEm: vigente.aprovado_em,
      cenarioDemanda: vigente.cenario_demanda,
      modoProducao: vigente.modo_producao,
      dataNecessidade: vigente.data_necessidade,
      margemSegurancaDias: Number(vigente.margem_seguranca_dias),
      dataPrevistaAprovacaoPedido: vigente.data_prevista_aprovacao_pedido,
      dataChegadaPrevista: vigente.data_chegada_prevista,
      janelaInicio: vigente.janela_inicio,
      janelaFim: vigente.janela_fim,
      totalOperacoes: itensLista.length,
      totalEmDeficit: itensLista.filter((item) => Number(item.deficit) > 0).length,
    });
  }, [projetoId]);

  useEffect(() => {
    let cancelado = false;

    async function verificar() {
      setVerificandoAprovacaoExistente(true);
      await carregarSimulacaoVigente();

      if (!cancelado) {
        setVerificandoAprovacaoExistente(false);
      }
    }

    verificar();

    return () => {
      cancelado = true;
    };
  }, [carregarSimulacaoVigente]);

  useEffect(() => {
    let cancelado = false;

    async function carregarDataObjetivo() {
      const { data } = await supabase
        .from("projetos")
        .select("data_objetivo")
        .eq("id", projetoId)
        .maybeSingle();

      if (!cancelado && data?.data_objetivo) {
        setDataNecessidade(data.data_objetivo);
      }
    }

    carregarDataObjetivo();

    return () => {
      cancelado = true;
    };
  }, [projetoId]);

  const margemSegurancaDias = Number(margemSegurancaDiasTexto.replace(",", "."));
  const margemSegurancaValida = Number.isInteger(margemSegurancaDias) && margemSegurancaDias >= 0;

  // Camada de preparação comercial (PAD-008 v2.0 §17) - recalcula a
  // janela produtiva sempre que qualquer premissa muda, ANTES de
  // qualquer execução do núcleo do Motor. Roda no navegador só para
  // preview/gate do botão Simular - o servidor recalcula tudo de novo
  // na aprovação (aprovarSimulacaoComercialAction.ts), nunca confia
  // neste resultado para persistir.
  useEffect(() => {
    let cancelado = false;

    calcularJanelaComercialParaExibicao(
      { dataNecessidade, margemSegurancaDiasProdutivos: margemSegurancaDias, dataPrevistaAprovacaoPedido },
      margemSegurancaValida,
      {
        buscarEmpresaId: async () => {
          const { data: userData } = await supabase.auth.getUser();
          if (!userData.user) {
            return null;
          }

          const { data: usuario } = await supabase
            .from("usuarios")
            .select("empresa_id")
            .eq("id", userData.user.id)
            .single();

          return usuario?.empresa_id ?? null;
        },
        prepararJanela: (empresaId, premissas) =>
          prepararJanelaComercial(supabase, empresaId, premissas),
      },
      {
        setErro: setErroJanela,
        setJanela: setJanelaComercial,
        setCalculando: setCalculandoJanela,
        foiCancelado: () => cancelado,
      },
    );

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataPrevistaAprovacaoPedido, dataNecessidade, margemSegurancaDias]);

  // Invalidação por alteração de premissa (DEC-004 v1.1, "Papel do
  // orçamentista"): se qualquer premissa muda depois de já existir um
  // resultado exibido, o resultado anterior deixa de valer - exige
  // nova simulação antes de qualquer aprovação.
  useEffect(() => {
    const premissasAtuais: PremissasJanelaComercial = {
      dataNecessidade,
      margemSegurancaDiasProdutivos: margemSegurancaDias,
      dataPrevistaAprovacaoPedido,
    };

    const premissasAnteriores = premissasDoResultadoRef.current;

    if (
      premissasAnteriores !== null &&
      resultado !== null &&
      premissasComerciaisMudaram(premissasAnteriores, premissasAtuais)
    ) {
      setResultado(null);
      setResultadoBruto(null);
      setStatusAprovacao(null);
      setSimuladoEm(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataNecessidade, margemSegurancaDias, dataPrevistaAprovacaoPedido]);

  async function handleSimular() {
    if (!janelaComercial?.valida) {
      return;
    }

    setCarregando(true);
    setErro(null);
    setResultado(null);
    setResultadoBruto(null);
    setStatusAprovacao(null);
    setSimuladoEm(null);

    try {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        throw new Error("Usuário não autenticado.");
      }

      const { data: usuario, error: usuarioError } = await supabase
        .from("usuarios")
        .select("empresa_id")
        .eq("id", userData.user.id)
        .single();

      if (usuarioError || !usuario?.empresa_id) {
        throw new Error("Empresa do usuário não encontrada.");
      }

      const resultadoSimulacao = await simularCapacidadeProjeto(
        supabase,
        usuario.empresa_id,
        projetoId,
        janelaComercial.janelaInicio,
        janelaComercial.janelaFim,
      );

      const resultadoExibicao = await prepararResultadoParaExibicao(
        supabase,
        resultadoSimulacao,
      );
      setResultadoBruto(resultadoSimulacao);
      setResultado(resultadoExibicao);
      setSimuladoEm(new Date());
      premissasDoResultadoRef.current = {
        dataNecessidade,
        margemSegurancaDiasProdutivos: margemSegurancaDias,
        dataPrevistaAprovacaoPedido,
      };
    } catch (erroCapturado) {
      setErro(mensagemDeErro(erroCapturado));
    } finally {
      setCarregando(false);
    }
  }

  // Bloco "Motivo principal do deficit" do modal: pega a operacao de
  // maior deficit e mostra o que ela realmente precisava vs. o que o
  // recurso original tinha disponivel na janela. capacidadeDisponivel
  // do resultado do Motor NAO serve aqui - em deficit total ela vem
  // NULL de proposito (o recurso foi recusado, nao "considerado"), ver
  // executarSimulacao.ts. Por isso esta funcao recalcula, para o
  // recurso ORIGINAL, com as mesmas 3 consultas que prepararEntradasMotor.ts
  // ja usa (capacidade_horas_dia, calcular_produtividade_efetiva,
  // contarDiasProdutivosNaJanela).
  async function calcularMotivoPrincipalDeficit(
    empresaId: string,
  ): Promise<MotivoPrincipalDeficit | null> {
    if (!resultadoBruto || !janelaComercial?.valida) {
      return null;
    }

    const itensDeficit = resultadoBruto.itensPorOperacao.filter(
      (item) => item.recursoConsideradoId === null,
    );

    if (itensDeficit.length === 0) {
      return null;
    }

    const itemCritico = itensDeficit.reduce((atual, candidato) =>
      candidato.deficit > atual.deficit ? candidato : atual,
    );

    const { data: recurso } = await supabase
      .from("recursos_produtivos")
      .select("capacidade_horas_dia")
      .eq("id", itemCritico.recursoOriginalId)
      .maybeSingle();

    const capacidadeHorasDia = recurso?.capacidade_horas_dia
      ? Number(recurso.capacidade_horas_dia)
      : 0;

    const { data: produtividadeEfetiva } = await supabase.rpc(
      "calcular_produtividade_efetiva",
      { p_recurso_id: itemCritico.recursoOriginalId },
    );

    const { diasProdutivos } = await contarDiasProdutivosNaJanela(
      supabase,
      empresaId,
      janelaComercial.janelaInicio,
      janelaComercial.janelaFim,
    );

    const disponivelNaJanela =
      diasProdutivos * capacidadeHorasDia * Number(produtividadeEfetiva ?? 0);

    const operacaoDescricao =
      resultado?.find((op) => op.bomOperacaoId === itemCritico.bomOperacaoId)
        ?.operacaoDescricao ?? itemCritico.bomOperacaoId;

    return {
      operacaoDescricao,
      necessario: itemCritico.necessario,
      disponivelNaJanela,
      diasProdutivos,
    };
  }

  // Passo 1 do fluxo de aprovacao (DEC-002): busca simulacao vigente,
  // revalida rodando o Motor de novo (sobre a janela recalculada a
  // partir das premissas ATUAIS) e compara com resultadoBruto (o que
  // foi exibido) + a janela usada then vs agora (PAD-008 v2.0 §17). So
  // decide o proximo estado - nao aprova nada aqui.
  async function iniciarAprovacao() {
    if (!resultadoBruto || !janelaComercial?.valida) {
      return;
    }

    setStatusAprovacao({ tipo: "revalidando" });

    try {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        throw new Error("Usuário não autenticado.");
      }

      const { data: usuario, error: usuarioError } = await supabase
        .from("usuarios")
        .select("empresa_id")
        .eq("id", userData.user.id)
        .single();

      if (usuarioError || !usuario?.empresa_id) {
        throw new Error("Empresa do usuário não encontrada.");
      }

      const { data: vigente } = await supabase
        .from("simulacoes_comerciais")
        .select("id,aprovado_em")
        .eq("projeto_id", projetoId)
        .eq("vigente", true)
        .maybeSingle();

      const janelaRevalidada = await prepararJanelaComercial(supabase, usuario.empresa_id, {
        dataNecessidade,
        margemSegurancaDiasProdutivos: margemSegurancaDias,
        dataPrevistaAprovacaoPedido,
      });

      if (!janelaRevalidada.valida) {
        setStatusAprovacao({
          tipo: "erro",
          mensagem: mensagemAusenciaJanela(janelaRevalidada),
        });
        return;
      }

      const diferencasJanela = compararJanelaEfetiva(
        { janelaInicio: janelaComercial.janelaInicio, janelaFim: janelaComercial.janelaFim },
        { janelaInicio: janelaRevalidada.janelaInicio, janelaFim: janelaRevalidada.janelaFim },
      );

      const revalidacao = await simularCapacidadeProjeto(
        supabase,
        usuario.empresa_id,
        projetoId,
        janelaRevalidada.janelaInicio,
        janelaRevalidada.janelaFim,
      );

      const comparacaoItens = compararResultadosSimulacao(resultadoBruto, revalidacao);
      const diferencas = [...diferencasJanela, ...comparacaoItens.diferencas];

      if (diferencas.length > 0) {
        setStatusAprovacao({ tipo: "divergente", diferencas });
        return;
      }

      const temDeficit = resultadoBruto.itensPorOperacao.some(
        (item) => item.recursoConsideradoId === null,
      );

      const motivoPrincipalDeficit = temDeficit
        ? await calcularMotivoPrincipalDeficit(usuario.empresa_id)
        : null;

      // Nova tentativa de aprovacao: chave nova. Reaproveitada por
      // confirmarAprovacao enquanto o usuario nao voltar para ca (ex:
      // depois de "Executar nova simulacao" no estado divergente).
      chaveIdempotenciaRef.current = crypto.randomUUID();

      setStatusAprovacao({
        tipo: "pronta",
        temDeficit,
        motivoPrincipalDeficit,
        simulacaoVigente: vigente
          ? { id: vigente.id, aprovadoEm: vigente.aprovado_em }
          : null,
      });
    } catch (erroCapturado) {
      setStatusAprovacao({ tipo: "erro", mensagem: mensagemDeErro(erroCapturado) });
    }
  }

  // Passo 2: so chamado depois que o usuario confirmar (UI do Item 4,
  // inclusive a confirmacao extra quando ha deficit). resultadoBruto e
  // a janela exibida sao enviados so para a Server Action COMPARAR -
  // quem decide o que persistir e a reexecucao/repreparacao
  // autoritativa dela no servidor (PAD-008, secoes 7-8, 17), nunca
  // este resultado do cliente, mesmo que bata.
  async function confirmarAprovacao(params: {
    cenarioDemanda: string;
    modoProducao: string;
  }) {
    if (!resultadoBruto || !janelaComercial?.valida) {
      return;
    }

    if (!chaveIdempotenciaRef.current) {
      setStatusAprovacao({
        tipo: "erro",
        mensagem: "Solicitação de aprovação sem chave de idempotência - inicie a aprovação novamente.",
      });
      return;
    }

    setStatusAprovacao({ tipo: "aprovando" });

    try {
      const resultadoAcao = await aprovarSimulacaoComercialAction({
        projetoId,
        resultado: resultadoBruto,
        cenarioDemanda: params.cenarioDemanda,
        modoProducao: params.modoProducao,
        dataNecessidade,
        margemSegurancaDias,
        dataPrevistaAprovacaoPedido,
        janelaInicio: janelaComercial.janelaInicio,
        janelaFim: janelaComercial.janelaFim,
        chaveIdempotencia: chaveIdempotenciaRef.current,
      });

      if (!resultadoAcao.ok) {
        if (resultadoAcao.motivo === "divergente") {
          // Mesma UX do estado "divergente" do passo 1 - agora
          // detectado autoritativamente no servidor, nao so no
          // preview do cliente.
          setStatusAprovacao({ tipo: "divergente", diferencas: resultadoAcao.diferencas });
          return;
        }

        if (resultadoAcao.motivo === "sem_janela_produtiva") {
          setStatusAprovacao({
            tipo: "erro",
            mensagem: mensagemAusenciaJanela(resultadoAcao.detalhe),
          });
          return;
        }

        const mensagem =
          resultadoAcao.motivo === "nao_autenticado"
            ? "Usuário não autenticado."
            : resultadoAcao.mensagem;
        setStatusAprovacao({ tipo: "erro", mensagem });
        return;
      }

      chaveIdempotenciaRef.current = null;
      setStatusAprovacao({
        tipo: "aprovada",
        simulacaoComercialId: resultadoAcao.simulacaoComercialId,
      });
      // Recarrega a simulacao vigente (a que acabou de ser inserida)
      // para a tela cair no mesmo modo leitura do Item 4d, sem
      // duplicar a renderizacao "aprovada" separadamente.
      await carregarSimulacaoVigente();
    } catch (erroCapturado) {
      setStatusAprovacao({ tipo: "erro", mensagem: mensagemDeErro(erroCapturado) });
    }
  }

  // Estatisticas derivadas para o resumo do estado "pronta" (mockup) -
  // calculadas a partir do resultado de exibicao, que ja tem os nomes
  // legiveis dos recursos.
  const operacoesEmDeficit = resultado?.filter((op) => op.recursoConsideradoNome === null) ?? [];
  const totalOperacoes = resultado?.length ?? 0;
  const totalComCompatibilidade =
    resultado?.filter((op) => op.motivoConsideracao === "COMPATIBILIDADE").length ?? 0;
  const deficitTotalHoras = operacoesEmDeficit.reduce((acc, op) => acc + op.deficit, 0);
  const recursosIndisponiveis = Array.from(
    new Set(operacoesEmDeficit.map((op) => op.recursoOriginalNome)),
  );
  // Para o estado "divergente" (4c): resolve bomOperacaoId (o que
  // compararResultadosSimulacao usa como chave) para a descricao
  // legivel da operacao. Operacao "adicionada" na revalidacao nao
  // esta em `resultado` (que reflete o resultado original exibido) -
  // cai no fallback (o proprio id, ou o rotulo fixo "janela-comercial"
  // quando a diferenca vem de compararJanelaEfetiva).
  const operacaoDescricaoPorId = new Map(
    (resultado ?? []).map((op) => [op.bomOperacaoId, op.operacaoDescricao]),
  );

  function handleConfirmarAprovacao() {
    confirmarAprovacao({
      cenarioDemanda,
      modoProducao,
    });
  }

  if (verificandoAprovacaoExistente) {
    return (
      <section className="rounded-md border border-slate-200 bg-app-card p-4">
        <p className="text-sm text-slate-500">Verificando simulação...</p>
      </section>
    );
  }

  if (simulacaoAprovadaExistente) {
    return (
      <section className="rounded-md border border-emerald-200 bg-app-card p-4">
        <div className="mb-4">
          <h2 className="text-sm font-bold text-emerald-900">
            Simulação Comercial Aprovada
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Situação: Simulação Comercial Aprovada. A aprovação vigente é o
            estado oficial deste projeto - não há ação de aprovação
            disponível nesta tela.
          </p>
        </div>

        <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
          <span>
            Aprovado por: <strong>{simulacaoAprovadaExistente.aprovadoPorNome}</strong>
          </span>
          <span>
            Data/hora da aprovação:{" "}
            <strong>
              {new Date(simulacaoAprovadaExistente.aprovadoEm).toLocaleString(
                "pt-BR",
              )}
            </strong>
          </span>
          <span>
            Data/hora da simulação utilizada:{" "}
            <strong>
              {new Date(simulacaoAprovadaExistente.aprovadoEm).toLocaleString(
                "pt-BR",
              )}
            </strong>
          </span>
          <span>
            Cenário de Demanda:{" "}
            <strong>{simulacaoAprovadaExistente.cenarioDemanda}</strong>
          </span>
          <span>
            Modo de Produção:{" "}
            <strong>{simulacaoAprovadaExistente.modoProducao}</strong>
          </span>
          <span>
            Data de Necessidade:{" "}
            <strong>
              {new Date(
                simulacaoAprovadaExistente.dataNecessidade,
              ).toLocaleDateString("pt-BR")}
            </strong>
          </span>
          <span>
            Margem de Segurança:{" "}
            <strong>{simulacaoAprovadaExistente.margemSegurancaDias} dias produtivos</strong>
          </span>
          <span>
            Data Prevista de Aprovação do Pedido:{" "}
            <strong>
              {simulacaoAprovadaExistente.dataPrevistaAprovacaoPedido
                ? formatarDataBr(simulacaoAprovadaExistente.dataPrevistaAprovacaoPedido)
                : "— (simulação anterior à Entrega 1)"}
            </strong>
          </span>
          <span>
            Data de Chegada Prevista do Material:{" "}
            <strong>
              {simulacaoAprovadaExistente.dataChegadaPrevista
                ? formatarDataBr(simulacaoAprovadaExistente.dataChegadaPrevista)
                : "— (simulação anterior à Entrega 1)"}
            </strong>
          </span>
          <span>
            Data de Disponibilidade para Produção:{" "}
            <strong>{formatarDataBr(simulacaoAprovadaExistente.janelaInicio)}</strong>
          </span>
          <span>
            Prazo Interno:{" "}
            <strong>{formatarDataBr(simulacaoAprovadaExistente.janelaFim)}</strong>
          </span>
          <span>
            Operações analisadas:{" "}
            <strong>{simulacaoAprovadaExistente.totalOperacoes}</strong>
          </span>
          <span>
            Em déficit:{" "}
            <strong>{simulacaoAprovadaExistente.totalEmDeficit}</strong>
          </span>
        </div>

        <Link
          href={`/projetos/${projetoId}`}
          className="mt-4 inline-flex h-10 items-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Voltar ao Projeto
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-slate-200 bg-app-card p-4">
      <div className="mb-4">
        <h2 className="text-sm font-bold">Simulação de Capacidade</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Avalia se os Recursos Produtivos comportam o roteiro do projeto na
          janela produtiva derivada das premissas abaixo. Não altera nem
          aprova o projeto.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Data Prevista de Aprovação do Pedido
          </label>
          <input
            type="date"
            value={dataPrevistaAprovacaoPedido}
            onChange={(event) => setDataPrevistaAprovacaoPedido(event.target.value)}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Margem de Segurança (dias produtivos)
          </label>
          <input
            inputMode="numeric"
            value={margemSegurancaDiasTexto}
            onChange={(event) => setMargemSegurancaDiasTexto(event.target.value)}
            className="h-10 w-40 rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <button
          type="button"
          onClick={handleSimular}
          disabled={carregando || calculandoJanela || !janelaComercial?.valida}
          className="h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {carregando ? "Simulando..." : "Simular"}
        </button>
      </div>

      {calculandoJanela ? (
        <p className="mt-2 text-sm text-slate-500">Calculando janela produtiva...</p>
      ) : erroJanela ? (
        <p className="mt-2 text-sm text-rose-600">{erroJanela}</p>
      ) : janelaComercial ? (
        janelaComercial.valida ? (
          <div className="mt-3 grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 sm:grid-cols-3">
            <span>
              Data de Chegada Prevista:{" "}
              <strong>{formatarDataBr(janelaComercial.dataChegadaPrevista)}</strong>
            </span>
            <span>
              Data de Disponibilidade para Produção:{" "}
              <strong>{formatarDataBr(janelaComercial.dataDisponibilidadeProducao)}</strong>
            </span>
            <span>
              Prazo Interno: <strong>{formatarDataBr(janelaComercial.prazoInterno)}</strong>
            </span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-rose-600">{mensagemAusenciaJanela(janelaComercial)}</p>
        )
      ) : null}

      {erro ? <p className="mt-3 text-sm text-rose-600">{erro}</p> : null}

      {resultado ? (
        resultado.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Nenhuma operação encontrada no roteiro deste projeto.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-bold">Operação</th>
                  <th className="px-4 py-3 font-bold">Recurso original</th>
                  <th className="px-4 py-3 font-bold">Recurso considerado</th>
                  <th className="px-4 py-3 text-center font-bold">Motivo</th>
                  <th className="px-4 py-3 text-center font-bold">Necessário (h)</th>
                  <th className="px-4 py-3 text-center font-bold">Déficit (h)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resultado.map((operacao) => (
                  <tr
                    key={operacao.bomOperacaoId}
                    className={operacao.deficit > 0 ? "bg-rose-50" : undefined}
                  >
                    <td className="px-4 py-3 align-middle text-slate-700">
                      {operacao.operacaoDescricao}
                    </td>
                    <td className="px-4 py-3 align-middle text-slate-700">
                      {operacao.recursoOriginalNome}
                    </td>
                    <td className="px-4 py-3 align-middle text-slate-700">
                      {operacao.recursoConsideradoNome ?? (
                        <span className="font-semibold text-rose-700">Déficit</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center align-middle text-slate-700">
                      {operacao.motivoConsideracao ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center align-middle text-slate-700">
                      {operacao.necessario.toLocaleString("pt-BR", {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td
                      className={
                        operacao.deficit > 0
                          ? "px-4 py-3 text-center align-middle font-semibold text-rose-700"
                          : "px-4 py-3 text-center align-middle text-slate-700"
                      }
                    >
                      {operacao.deficit > 0
                        ? operacao.deficit.toLocaleString("pt-BR", {
                            maximumFractionDigits: 2,
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {resultado ? (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-bold">Parâmetros da Aprovação</h3>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Cenário de Demanda
              </label>
              <input
                value={cenarioDemanda}
                onChange={(event) => setCenarioDemanda(event.target.value)}
                className="h-10 w-48 rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Modo de Produção
              </label>
              <input
                value={modoProducao}
                onChange={(event) => setModoProducao(event.target.value)}
                className="h-10 w-48 rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Data de Necessidade
              </label>
              <input
                type="date"
                value={dataNecessidade}
                onChange={(event) => setDataNecessidade(event.target.value)}
                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <button
              type="button"
              onClick={iniciarAprovacao}
              disabled={
                cenarioDemanda.trim() === "" ||
                modoProducao.trim() === "" ||
                statusAprovacao?.tipo === "revalidando" ||
                statusAprovacao?.tipo === "aprovando"
              }
              className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {statusAprovacao?.tipo === "revalidando"
                ? "Revalidando..."
                : "Aprovar simulação"}
            </button>
          </div>

          {statusAprovacao?.tipo === "erro" ? (
            <p className="mt-2 text-sm text-rose-600">{statusAprovacao.mensagem}</p>
          ) : null}
        </div>
      ) : null}

      {statusAprovacao?.tipo === "divergente" ? (
        <div className="mt-5 rounded-md border border-amber-300 bg-amber-50 p-4">
          <h3 className="text-sm font-bold text-amber-900">
            Dados desatualizados
          </h3>
          <p className="mt-1 text-xs text-amber-800">
            Algo mudou desde a simulação exibida. Revise as mudanças abaixo e
            execute uma nova simulação antes de aprovar.
          </p>

          <ul className="mt-3 space-y-1 text-sm text-amber-900">
            {statusAprovacao.diferencas.map((diferenca, indice) => (
              <li key={`${diferenca.operacao}-${diferenca.campo}-${indice}`}>
                <strong>
                  {operacaoDescricaoPorId.get(diferenca.operacao) ??
                    diferenca.operacao}
                </strong>{" "}
                — {ROTULOS_CAMPO_DIFERENCA[diferenca.campo] ?? diferenca.campo}
                : {formatarValorDiferenca(diferenca.valorAnterior)} →{" "}
                {formatarValorDiferenca(diferenca.valorNovo)}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={handleSimular}
            className="mt-3 h-10 rounded-md bg-amber-700 px-4 text-sm font-semibold text-white transition hover:bg-amber-800"
          >
            Executar nova simulação
          </button>
        </div>
      ) : null}

      {statusAprovacao?.tipo === "pronta" && !statusAprovacao.temDeficit ? (
        <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4">
          {statusAprovacao.simulacaoVigente ? (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Já existe uma simulação comercial aprovada para este projeto (em{" "}
              {new Date(
                statusAprovacao.simulacaoVigente.aprovadoEm,
              ).toLocaleString("pt-BR")}
              ). A nova aprovação substituirá a simulação vigente, preservando
              o histórico das anteriores.
            </p>
          ) : null}

          <h3 className="text-sm font-bold text-emerald-900">
            Simulação pronta para aprovação
          </h3>

          <div className="mt-2 grid gap-2 text-sm text-emerald-900 sm:grid-cols-2 lg:grid-cols-3">
            <span>
              Operações analisadas: <strong>{totalOperacoes}</strong>
            </span>
            <span>
              Com compatibilidade: <strong>{totalComCompatibilidade}</strong>
            </span>
            <span>
              Em déficit: <strong>{operacoesEmDeficit.length}</strong>
            </span>
            <span>
              Janela:{" "}
              <strong>
                {janelaComercial?.valida
                  ? `${formatarDataBr(janelaComercial.janelaInicio)} a ${formatarDataBr(janelaComercial.janelaFim)}`
                  : "—"}
              </strong>
            </span>
            <span>
              Simulado em:{" "}
              <strong>
                {simuladoEm ? simuladoEm.toLocaleString("pt-BR") : "—"}
              </strong>
            </span>
          </div>

          <button
            type="button"
            onClick={handleConfirmarAprovacao}
            className="mt-3 h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            Aprovar simulação
          </button>
        </div>
      ) : null}

      {statusAprovacao?.tipo === "pronta" && statusAprovacao.temDeficit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
          <div className="w-full max-w-lg rounded-lg border border-rose-200 bg-app-card shadow-xl">
            <div className="border-b border-rose-200 px-6 py-4">
              <h3 className="text-base font-bold text-rose-700">
                Déficit de capacidade identificado
              </h3>
            </div>

            <div className="space-y-3 px-6 py-5 text-sm text-slate-700">
              {statusAprovacao.simulacaoVigente ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                  Já existe uma simulação comercial aprovada para este projeto
                  (em{" "}
                  {new Date(
                    statusAprovacao.simulacaoVigente.aprovadoEm,
                  ).toLocaleString("pt-BR")}
                  ). A nova aprovação substituirá a simulação vigente,
                  preservando o histórico das anteriores.
                </p>
              ) : null}

              <p>
                <strong>{operacoesEmDeficit.length}</strong> operação(ões) em
                déficit, totalizando{" "}
                <strong>
                  {deficitTotalHoras.toLocaleString("pt-BR", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  h
                </strong>{" "}
                de capacidade faltante.
              </p>

              <div>
                <p className="font-semibold text-slate-800">
                  Recurso restritivo:
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {recursosIndisponiveis.map((nome) => (
                    <li key={nome}>{nome}</li>
                  ))}
                </ul>
              </div>

              {statusAprovacao.motivoPrincipalDeficit ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="font-semibold text-slate-800">
                    Motivo principal do déficit
                  </p>
                  <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                    <dt className="text-slate-500">Operação</dt>
                    <dd>{statusAprovacao.motivoPrincipalDeficit.operacaoDescricao}</dd>
                    <dt className="text-slate-500">Necessário</dt>
                    <dd>
                      {statusAprovacao.motivoPrincipalDeficit.necessario.toLocaleString(
                        "pt-BR",
                        { maximumFractionDigits: 2 },
                      )}{" "}
                      h
                    </dd>
                    <dt className="text-slate-500">Disponível na janela</dt>
                    <dd>
                      {statusAprovacao.motivoPrincipalDeficit.disponivelNaJanela.toLocaleString(
                        "pt-BR",
                        { maximumFractionDigits: 2 },
                      )}{" "}
                      h
                    </dd>
                    <dt className="text-slate-500">Janela produtiva</dt>
                    <dd>
                      {statusAprovacao.motivoPrincipalDeficit.diasProdutivos} dia(s)
                    </dd>
                  </dl>
                </div>
              ) : null}

              <p className="text-slate-600">
                A aprovação poderá prosseguir, porém esta simulação indica que
                não existe capacidade produtiva suficiente para cumprir o
                prazo nas condições atuais. Ao continuar, a empresa assume
                conscientemente esse risco (DEC-002).
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-rose-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setStatusAprovacao(null)}
                className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() =>
                  window.alert(
                    "O módulo Cenários de Viabilidade Comercial será disponibilizado em uma próxima versão.",
                  )
                }
                className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Nova Simulação
              </button>

              <button
                type="button"
                onClick={handleConfirmarAprovacao}
                className="h-10 rounded-md bg-rose-700 px-4 text-sm font-semibold text-white transition hover:bg-rose-800"
              >
                Aprovar com risco assumido
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
