// DEC-007 - previsão comercial por capacidade: integra a fila de
// compromissos confirmados (compromissoCapacidade.ts/
// estimativaFifoComercial.ts) com a distribuição flexível de cada OP do
// orçamento novo entre recurso original, compatíveis, adicional e
// temporário (distribuirNecessidadeFlexivel.ts) - ainda com fixtures
// puras, sem carregador Supabase.
//
// POR QUE NÃO REAPROVEITAR estimarFifoComercial() DIRETO: aquela função
// já resolve "confirmados primeiro, FIFO, capacidade fixa" - mas
// modela o orçamento novo como 1 CompromissoCapacidade PRESO A 1
// RECURSO SÓ (sem original/compatível/adicional/temporário). Não serve
// mais para o orçamento novo agora que ele precisa da distribuição em
// camadas. Por isso: os CONFIRMADOS continuam ordenados pela MESMA
// fórmula (compararParaFila, importada, nunca duplicada) e consomem só
// a faixa "normal" (capacidade fixa, sem hora adicional/temporário -
// essas duas ficam reservadas ao orçamento novo, mesma regra de
// elegibilidade já vigente no motor); as OPs do orçamento novo entram
// todas de uma vez em `resolverDistribuicaoConjunta`
// (redeFluxoCapacidadeComercial.ts), recebendo os MESMOS candidatos que
// os confirmados acabaram de reduzir - nunca uma segunda aritmética de
// consumo.
//
// COMPARTILHAMENTO ENTRE OPs DO MESMO ORÇAMENTO: se 2 OPs do orçamento
// novo usam o mesmo recurso (como original de uma e compatível de
// outra, por exemplo), elas disputam a MESMA capacidade já reduzida
// pelos confirmados. Uma versão anterior deste módulo processava as OPs
// numa ordem heurística fixa ("menos alternativas primeiro" - nº de
// recursosCompativeisPorPrioridade ascendente, desempate por
// chaveTrabalho) - CONFIRMADAMENTE não-ótima por 2 contraexemplos
// achados por verificação exata (fast-check, ver
// avaliarPrevisaoComercialFlexivel.exato.test.ts): contar alternativas
// nominalmente ignora tanto recursos com capacidade zero quanto a
// margem real de cada alternativa e a urgência de OUTRAS OPs
// concorrendo pelo mesmo recurso escasso - em ambos os casos, a
// heurística podia entregar 1 dia depois do possível. Substituída por
// `resolverDistribuicaoConjunta` (redeFluxoCapacidadeComercial.ts) -
// rede de fluxo em 2 fases: (1) menor data em que TODA a demanda cabe,
// usando toda capacidade autorizada, sem nenhuma preferência de negócio
// envolvida; (2) só depois, dentro dessa data, a distribuição que mais
// respeita a ordem de preferência (original > compatíveis > adicional >
// temporário) sem NUNCA piorar a data já encontrada na fase 1.
//
// "Previsão comercial por capacidade - não é programação de PCP."
import { alocarOperacaoDiaAdia } from "./alocarOperacaoDiaAdia";
import type { CandidatoComCapacidadeDiaria } from "./alocarOperacaoDiaAdia";
import type { CompromissoCapacidade } from "./compromissoCapacidade";
import type { CapacidadeExtraDia } from "./capacidadeDia";
import type { DecisaoRecursoTemporario } from "./avaliarCenario";
import { criarCandidatoRecursoTemporario } from "./recursoTemporario";
import { compararParaFila, maiorData } from "./estimativaFifoComercial";
import { candidatoSomenteNatureza, criarCandidatoNormalComExtra } from "./distribuirNecessidadeFlexivel";
import { resolverDistribuicaoConjunta } from "./redeFluxoCapacidadeComercial";
import type { CapacidadeNormalRecurso, NecessidadeCapacidadeFlexivel, ResultadoDistribuicaoFlexivel } from "./necessidadeCapacidadeFlexivel";
import { validarDataIso, validarDatasEstritamenteCrescentes, validarHorasFinitasNaoNegativas, validarProdutividade } from "./validacoes";

export interface ResultadoOpOrcamentoNovo {
  readonly chaveTrabalho: string;
  readonly resultado: ResultadoDistribuicaoFlexivel;
}

export interface AvaliacaoPrevisaoComercialFlexivel {
  readonly dataSolicitadaCliente: string;
  readonly atendeDataSolicitada: boolean;
  /** Maior data entre TODAS as alocações de TODAS as OPs do orçamento novo - null quando horizonteTecnico="insuficiente". */
  readonly primeiraEntregaPossivel: string | null;
  /** Todos os recursos cuja última alocação coincide com primeiraEntregaPossivel - nunca escolhe um arbitrariamente em empate. [] quando horizonteTecnico="insuficiente". */
  readonly recursosQueDeterminamTermino: readonly string[];
  readonly horizonteTecnico: "suficiente" | "insuficiente";
  /** Detalhe por OP - auditoria, "Ver detalhes" futuro. */
  readonly resultadosPorOp: readonly ResultadoOpOrcamentoNovo[];
}

function validarEntrada(params: {
  dataSolicitadaCliente: string;
  compromissosConfirmados: readonly CompromissoCapacidade[];
  necessidadesOrcamentoNovo: readonly NecessidadeCapacidadeFlexivel[];
  capacidadesNormais: ReadonlyMap<string, CapacidadeNormalRecurso>;
  datasGrade: readonly string[];
}): void {
  const { dataSolicitadaCliente, compromissosConfirmados, necessidadesOrcamentoNovo, capacidadesNormais, datasGrade } = params;

  validarDataIso(dataSolicitadaCliente, "dataSolicitadaCliente");
  validarDatasEstritamenteCrescentes([...datasGrade], "datasGrade");

  if (necessidadesOrcamentoNovo.length === 0) {
    throw new RangeError("necessidadesOrcamentoNovo está vazio - não há como determinar a previsão comercial sem nenhuma OP do orçamento novo.");
  }

  const chavesTrabalhoVistas = new Set<string>();
  for (const n of necessidadesOrcamentoNovo) {
    if (chavesTrabalhoVistas.has(n.chaveTrabalho)) {
      throw new RangeError(`necessidadesOrcamentoNovo contém chaveTrabalho "${n.chaveTrabalho}" duplicada - cada OP precisa de uma identidade única.`);
    }
    chavesTrabalhoVistas.add(n.chaveTrabalho);
  }

  for (const c of compromissosConfirmados) {
    if (c.classeFila !== "confirmado") {
      throw new RangeError(
        `compromissosConfirmados contém um compromisso com classeFila="${c.classeFila}" (recursoId="${c.recursoId}") - este parâmetro é só para compromissos confirmados; o orçamento novo entra via necessidadesOrcamentoNovo, nunca misturado aqui.`,
      );
    }
    if (c.dataEntradaFila === null) {
      throw new RangeError(`Compromisso confirmado (recursoId="${c.recursoId}") sem dataEntradaFila - nunca fabricada, precisa vir real da fonte.`);
    }
  }

  const recursosEnvolvidos = new Set<string>();
  for (const c of compromissosConfirmados) recursosEnvolvidos.add(c.recursoId);
  for (const n of necessidadesOrcamentoNovo) {
    recursosEnvolvidos.add(n.recursoOriginalId);
    for (const id of n.recursosCompativeisPorPrioridade) recursosEnvolvidos.add(id);
  }

  for (const recursoId of recursosEnvolvidos) {
    const cap = capacidadesNormais.get(recursoId);
    if (!cap) {
      throw new RangeError(`capacidadesNormais não tem entrada para o recurso "${recursoId}" (referenciado por confirmados ou por uma OP do orçamento novo).`);
    }
    validarProdutividade(cap.produtividade, `produtividade do recurso "${recursoId}"`);
    validarHorasFinitasNaoNegativas(cap.capacidadeHorasMaquinaDia, `capacidadeHorasMaquinaDia do recurso "${recursoId}"`);
  }
}

export function avaliarPrevisaoComercialFlexivel(params: {
  dataSolicitadaCliente: string;
  /** Só classeFila="confirmado" - já resolvidos/agregados pela Etapa 1 (selecionarFonteVencedora + agregarCompromissosPorRecurso). */
  compromissosConfirmados: readonly CompromissoCapacidade[];
  /** 1 por OP do orçamento novo, na ordem em que devem disputar capacidade compartilhada com outras OPs do mesmo orçamento (ver cabeçalho do módulo). */
  necessidadesOrcamentoNovo: readonly NecessidadeCapacidadeFlexivel[];
  /** Precisa cobrir todo recurso citado por compromissosConfirmados OU por qualquer necessidadesOrcamentoNovo (original ou compatível). */
  capacidadesNormais: ReadonlyMap<string, CapacidadeNormalRecurso>;
  /** Reaproveitado de capacidadeDia.ts - disponível só para as OPs do orçamento novo (confirmados nunca consomem hora adicional, mesma regra de elegibilidade já vigente). */
  capacidadeExtraAutorizada: readonly CapacidadeExtraDia[];
  /** Reaproveitado de avaliarCenario.ts/recursoTemporario.ts - compartilhados entre todas as OPs do orçamento novo. */
  temporariosPorPrioridade: readonly DecisaoRecursoTemporario[];
  /** Estritamente crescente, estendida além de dataSolicitadaCliente (horizonte técnico) - inclui TODA data civil do horizonte, produtiva ou não (ver diasProdutivos). */
  datasGrade: readonly string[];
  /**
   * Datas de `datasGrade` em que a capacidade NORMAL existe (Etapa A -
   * correção de calendário: sábado/domingo/feriado sem exceção
   * cadastrada ficam de fora, salvo evento "dia_trabalhado_excepcional").
   * Não afeta capacidade adicional/temporário, que continuam disponíveis
   * em qualquer data autorizada, calendário à parte - é o mecanismo que
   * viabiliza hora extra num sábado/feriado. Opcional (default = toda
   * data de `datasGrade` é produtiva) para não quebrar chamadores/testes
   * sem calendário; o chamador de produção
   * (montarPrevisaoComercialProjeto.ts, via BasePrevisaoComercial.diasProdutivos)
   * sempre passa o conjunto real, carregado uma vez por
   * carregarBasePrevisaoComercial.ts.
   */
  diasProdutivos?: ReadonlySet<string>;
}): AvaliacaoPrevisaoComercialFlexivel {
  validarEntrada(params);
  const { dataSolicitadaCliente, compromissosConfirmados, necessidadesOrcamentoNovo, capacidadesNormais, capacidadeExtraAutorizada, temporariosPorPrioridade, datasGrade } = params;
  const diasProdutivos = params.diasProdutivos ?? new Set(datasGrade);
  const ehDiaProdutivo = (data: string) => diasProdutivos.has(data);

  const recursosEnvolvidos = new Set<string>();
  for (const c of compromissosConfirmados) recursosEnvolvidos.add(c.recursoId);
  for (const n of necessidadesOrcamentoNovo) {
    recursosEnvolvidos.add(n.recursoOriginalId);
    for (const id of n.recursosCompativeisPorPrioridade) recursosEnvolvidos.add(id);
  }

  const extraPorRecurso = new Map<string, CapacidadeExtraDia[]>();
  for (const extra of capacidadeExtraAutorizada) {
    if (!extraPorRecurso.has(extra.recursoId)) extraPorRecurso.set(extra.recursoId, []);
    extraPorRecurso.get(extra.recursoId)!.push(extra);
  }

  // 1 candidato "normal+extra" por recurso envolvido - instância NOVA a
  // cada chamada desta função (nunca reaproveitada de uma avaliação
  // anterior), é isso que garante "cenários avaliados sobre bases
  // independentes" (bullet final do incremento).
  const candidatosNormaisPorRecurso = new Map<string, CandidatoComCapacidadeDiaria>();
  for (const recursoId of recursosEnvolvidos) {
    const cap = capacidadesNormais.get(recursoId) as CapacidadeNormalRecurso;
    candidatosNormaisPorRecurso.set(recursoId, criarCandidatoNormalComExtra(recursoId, cap.capacidadeHorasMaquinaDia, cap.produtividade, extraPorRecurso.get(recursoId) ?? [], ehDiaProdutivo));
  }

  // Confirmados consomem PRIMEIRO, em ordem FIFO (mesma fórmula de
  // estimativaFifoComercial.ts), só a faixa "normal" - nunca hora
  // adicional/temporário, reservadas ao orçamento novo. Cada confirmado
  // roda 1 chamada sobre o horizonte inteiro (sem risco de inversão de
  // prioridade: só existe 1 categoria de faixa aqui, o problema
  // resolvido no incremento anterior era entre categorias diferentes).
  // O déficit eventual de um confirmado (capacidade já sobrecarregada
  // antes do orçamento novo entrar) não é reportado por esta função -
  // mesma fronteira de escopo já estabelecida em estimarFifoComercial().
  const confirmadosOrdenados = [...compromissosConfirmados].sort(compararParaFila);
  for (const confirmado of confirmadosOrdenados) {
    const candidatoNormal = candidatoSomenteNatureza(candidatosNormaisPorRecurso.get(confirmado.recursoId) as CandidatoComCapacidadeDiaria, true);
    const datasDisponiveis = datasGrade.filter((d) => d >= confirmado.disponivelAPartirDe);
    alocarOperacaoDiaAdia({
      necessarioHorasPadrao: confirmado.horasRestantesPadrao,
      candidatosPorPrioridade: [candidatoNormal],
      datasOrdenadas: datasDisponiveis,
      projetoId: confirmado.projetoId,
      ehOrcamentoNovo: false,
    });
  }

  // Temporários compartilhados por todas as OPs do orçamento novo -
  // nunca tocados pelos confirmados (tier reservado ao orçamento novo).
  const candidatosTemporariosPorPrioridade = temporariosPorPrioridade.map((d) => criarCandidatoRecursoTemporario(d.recursoTemporario, d.produtividadeReferencia));
  const contratacaoIdPorTemporario = new Map(temporariosPorPrioridade.map((d) => [d.recursoTemporario.idTemporario, d.recursoTemporario.contratacaoId]));

  // Distribuição conjunta EXATA (ver cabeçalho do módulo) - nunca mais
  // um laço "1 OP de cada vez" sobre uma ordem heurística. Os MESMOS
  // candidatos (já reduzidos pelos confirmados) entram como saldo
  // disputado; a rede decide, para TODAS as OPs ao mesmo tempo, a menor
  // data de entrega e a distribuição que mais respeita a preferência de
  // negócio dentro dela.
  const recursoReferenciaPorTemporario = new Map(temporariosPorPrioridade.map((d) => [d.recursoTemporario.idTemporario, d.recursoTemporario.recursoReferenciaId]));
  const { resultadosPorChaveTrabalho: resultadoDistribuicaoPorChaveTrabalho, horizonteTecnico: horizonteTecnicoConjunto } = resolverDistribuicaoConjunta({
    necessidades: necessidadesOrcamentoNovo,
    candidatosNormaisPorRecurso,
    candidatosTemporariosPorPrioridade,
    recursoReferenciaPorTemporario,
    contratacaoIdPorTemporario,
    datasGrade,
  });

  const resultadosPorOp: ResultadoOpOrcamentoNovo[] = necessidadesOrcamentoNovo.map((n) => ({
    chaveTrabalho: n.chaveTrabalho,
    resultado: resultadoDistribuicaoPorChaveTrabalho.get(n.chaveTrabalho) as ResultadoDistribuicaoFlexivel,
  }));

  if (horizonteTecnicoConjunto === "insuficiente") {
    return {
      dataSolicitadaCliente,
      atendeDataSolicitada: false,
      primeiraEntregaPossivel: null,
      recursosQueDeterminamTermino: [],
      horizonteTecnico: "insuficiente",
      resultadosPorOp,
    };
  }

  const todasAlocacoes = resultadosPorOp.flatMap((r) => r.resultado.alocacoes);
  const termino = maiorData(todasAlocacoes.map((a) => a.data)) as string; // não-nula: nenhuma OP insuficiente e necessidadesOrcamentoNovo não está vazio, então há ao menos 1 alocação
  const recursosQueDeterminamTermino = Array.from(new Set(todasAlocacoes.filter((a) => a.data === termino).map((a) => a.recursoId)));

  return {
    dataSolicitadaCliente,
    atendeDataSolicitada: termino <= dataSolicitadaCliente,
    primeiraEntregaPossivel: termino,
    recursosQueDeterminamTermino,
    horizonteTecnico: "suficiente",
    resultadosPorOp,
  };
}
