// DEC-007 - previsão comercial por capacidade: distribui 1
// NecessidadeCapacidadeFlexivel entre recurso original, compatíveis,
// capacidade adicional e recursos temporários.
//
// ORDEM DO LAÇO (corrigida em revisão - ver histórico): a prioridade de
// negócio (normal original -> normal compatíveis -> adicional ->
// temporário) é aplicada DENTRO DE CADA DATA, nunca sobre o horizonte
// inteiro de uma vez. A primeira versão deste módulo rodava 3 chamadas
// GLOBAIS a alocarOperacaoDiaAdia (1 por categoria, cada uma cobrindo
// todo o horizonte) - isso fazia capacidade normal de um dia FUTURO ser
// consumida antes de capacidade adicional já autorizada HOJE, o que
// impedia a hora extra de antecipar a entrega (o horizonte técnico
// estendido quase sempre encontra capacidade normal em algum dia
// posterior antes de a rodada "adicional" sequer começar). Corrigido:
// o laço externo é por DATA, em ordem cronológica; para cada data, até
// 3 sub-chamadas restritas a essa data só (normal, depois adicional,
// depois temporário) - só avança para a próxima data quando as 4
// categorias da data atual já foram esgotadas.
//
// POR QUE 3 sub-chamadas por data, e não 1 só com todos os candidatos
// juntos: alocarOperacaoDiaAdia.ts (lido por completo antes de decidir
// isto) processa, para cada data, cada candidato em ordem de
// prioridade, consumindo TODAS as faixas desse candidato (normal, DEPOIS
// extra) antes de passar ao próximo candidato NA MESMA DATA. Se
// original e compatíveis fossem passados juntos numa lista com faixas
// normais+extras misturadas, a hora extra do ORIGINAL seria consumida
// antes da capacidade normal do COMPATÍVEL (mesma data) - inverte a
// prioridade de negócio exigida (capacidade interna sem custo
// primeiro). Por isso, mesmo restrito a 1 data, ainda são 3 chamadas -
// cada uma só oferece 1 categoria de faixa por vez.
// alocarOperacaoDiaAdia.ts NÃO é alterado - só chamado várias vezes, com
// listas de candidatos "filtradas por natureza" (ver
// candidatoSomenteNatureza) e datasOrdenadas restrita a 1 data por
// chamada. estimativaFifoLegado.ts também não é tocado (não serve a
// este contrato - já registrado quando investigado).
//
// DUAS CAMADAS (desde a integração com a fila de confirmados,
// estimativaFifoComercial.ts): `distribuirNecessidadeSobreCandidatos`
// é o NÚCLEO puro - recebe candidatos JÁ PRONTOS (normal+extra
// combinados por recurso) e roda o laço por data/tier. `distribuirNecessidadeFlexivel`
// (função pública original, comportamento e testes inalterados) é uma
// casca fina que constrói candidatos FRESCOS a partir de
// CapacidadeNormalRecurso/CapacidadeExtraDia/DecisaoRecursoTemporario e
// delega ao núcleo. A camada de integração (avaliarPrevisaoComercialFlexivel.ts)
// usa o MESMO núcleo, mas entrega candidatos que a fila de confirmados
// já consumiu parcialmente - nunca uma segunda implementação do laço
// por data/tier.
import type { CandidatoComCapacidadeDiaria, FaixaCapacidadeDia, NaturezaCapacidade } from "./alocarOperacaoDiaAdia";
import { alocarOperacaoDiaAdia } from "./alocarOperacaoDiaAdia";
import type { CapacidadeExtraDia } from "./capacidadeDia";
import type { DecisaoRecursoTemporario } from "./avaliarCenario";
import { criarCandidatoRecursoTemporario } from "./recursoTemporario";
import { tratarComoZero } from "../constantesNumericas";
import { validarDataIso, validarDatasEstritamenteCrescentes, validarHorasFinitasNaoNegativas, validarHorasFinitasPositivas, validarProdutividade } from "./validacoes";
import type {
  AlocacaoNecessidadeFlexivel,
  CapacidadeNormalRecurso,
  NecessidadeCapacidadeFlexivel,
  ResultadoDistribuicaoFlexivel,
  TipoCapacidadeFlexivel,
} from "./necessidadeCapacidadeFlexivel";

/**
 * Validação da própria necessidade - independente de como os candidatos
 * de capacidade foram construídos (fresco, a partir de dado bruto, ou
 * pré-consumido pela fila de confirmados). Usada pelas duas camadas, e
 * também por redeFluxoCapacidadeComercial.ts (mesma validação, nunca uma
 * segunda implementação).
 */
export function validarNecessidade(necessidade: NecessidadeCapacidadeFlexivel, datasOrdenadas: readonly string[]): void {
  validarHorasFinitasPositivas(necessidade.horasNecessariasPadrao, "horasNecessariasPadrao");
  validarDataIso(necessidade.disponivelAPartirDe, "disponivelAPartirDe");
  validarDatasEstritamenteCrescentes([...datasOrdenadas], "datasOrdenadas");

  if (!necessidade.recursoOriginalId) {
    throw new RangeError("recursoOriginalId não pode ser vazio.");
  }

  const compativeisVistos = new Set<string>();
  for (const id of necessidade.recursosCompativeisPorPrioridade) {
    if (id === necessidade.recursoOriginalId) {
      throw new RangeError(
        `recursosCompativeisPorPrioridade contém o próprio recursoOriginalId ("${id}") - o recurso original não pode reaparecer como compatível.`,
      );
    }
    if (compativeisVistos.has(id)) {
      throw new RangeError(`recursosCompativeisPorPrioridade contém "${id}" duplicado.`);
    }
    compativeisVistos.add(id);
  }
}

/** Validações de dado bruto - só a casca (distribuirNecessidadeFlexivel) precisa, porque só ela recebe dado ainda não transformado em candidato. */
function validarDadoBruto(params: {
  necessidade: NecessidadeCapacidadeFlexivel;
  capacidadesNormais: ReadonlyMap<string, CapacidadeNormalRecurso>;
  capacidadeExtraAutorizada: readonly CapacidadeExtraDia[];
  temporariosPorPrioridade: readonly DecisaoRecursoTemporario[];
}): void {
  const { necessidade, capacidadesNormais, capacidadeExtraAutorizada, temporariosPorPrioridade } = params;

  if (!capacidadesNormais.has(necessidade.recursoOriginalId)) {
    throw new RangeError(`capacidadesNormais não tem entrada para o recurso original "${necessidade.recursoOriginalId}".`);
  }
  for (const id of necessidade.recursosCompativeisPorPrioridade) {
    if (!capacidadesNormais.has(id)) {
      throw new RangeError(`capacidadesNormais não tem entrada para o recurso compatível "${id}" - compatível informado sem candidato correspondente.`);
    }
  }

  for (const cap of capacidadesNormais.values()) {
    validarProdutividade(cap.produtividade, `produtividade do recurso "${cap.recursoId}"`);
    validarHorasFinitasNaoNegativas(cap.capacidadeHorasMaquinaDia, `capacidadeHorasMaquinaDia do recurso "${cap.recursoId}"`);
  }

  const chavesExtraVistas = new Set<string>();
  for (const extra of capacidadeExtraAutorizada) {
    validarDataIso(extra.data, `capacidadeExtraAutorizada (recurso "${extra.recursoId}") - data`);
    validarHorasFinitasNaoNegativas(
      extra.horasAdicionaisDisponiveis,
      `capacidadeExtraAutorizada (recurso "${extra.recursoId}", data "${extra.data}") - horasAdicionaisDisponiveis`,
    );
    if (!extra.contratacaoId) {
      throw new RangeError(`capacidadeExtraAutorizada (recurso "${extra.recursoId}", data "${extra.data}"): contratacaoId é obrigatório.`);
    }
    const chaveExtra = `${extra.recursoId}::${extra.data}::${extra.natureza}`;
    if (chavesExtraVistas.has(chaveExtra)) {
      throw new RangeError(
        `capacidadeExtraAutorizada contém entrada duplicada para recurso="${extra.recursoId}", data="${extra.data}", natureza="${extra.natureza}" - candidato de capacidade duplicado.`,
      );
    }
    chavesExtraVistas.add(chaveExtra);
  }

  const temporariosVistos = new Set<string>();
  for (const decisao of temporariosPorPrioridade) {
    const id = decisao.recursoTemporario.idTemporario;
    if (temporariosVistos.has(id)) {
      throw new RangeError(`temporariosPorPrioridade contém idTemporario "${id}" duplicado - candidato de capacidade duplicado.`);
    }
    temporariosVistos.add(id);
    if (!decisao.recursoTemporario.contratacaoId) {
      throw new RangeError(`Recurso temporário "${id}": contratacaoId é obrigatório.`);
    }
  }
}

/**
 * Candidato "normal + extra" de 1 recurso real (original ou compatível) -
 * mesmo formato de criarCandidatoRecurso (avaliarCenario.ts, privado,
 * não exportado - reescrito aqui com a mesma disciplina, nunca
 * importado por não ser exportado). Estado mutável PRÓPRIO da chamada
 * que o cria - nunca compartilhado entre execuções.
 *
 * Exportada para a camada de integração (fila de confirmados +
 * distribuição flexível) construir o MESMO tipo de candidato, consumir
 * os confirmados nele primeiro (via candidatoSomenteNatureza, também
 * exportada), e só depois entregar essa mesma instância já reduzida a
 * distribuirNecessidadeSobreCandidatos - nunca uma segunda
 * implementação do candidato normal+extra.
 */
/**
 * `ehDiaProdutivo` decide se a faixa "normal" existe naquela data (Etapa
 * A - correção de calendário): sábado/domingo/feriado sem exceção
 * cadastrada devolvem 0h de capacidade NORMAL, mas a faixa "extra"
 * (capacidadeExtraAutorizada) continua funcionando em QUALQUER data,
 * calendário à parte - é o mecanismo que autoriza hora extra justamente
 * num sábado/feriado normalmente não produtivo. Opcional (default =
 * sempre produtivo) para não quebrar chamadores/testes que não têm
 * calendário disponível - o chamador de produção
 * (avaliarPrevisaoComercialFlexivel.ts, via BasePrevisaoComercial.diasProdutivos)
 * sempre passa o conjunto real.
 */
export function criarCandidatoNormalComExtra(
  recursoId: string,
  capacidadeHorasMaquinaDia: number,
  produtividade: number,
  extrasDoRecurso: readonly CapacidadeExtraDia[],
  ehDiaProdutivo: (data: string) => boolean = () => true,
): CandidatoComCapacidadeDiaria {
  const restanteNormalPorDia = new Map<string, number>();
  const restanteExtraPorChave = new Map<string, number>();
  const extraPorDia = new Map<string, CapacidadeExtraDia[]>();
  for (const extra of extrasDoRecurso) {
    if (!extraPorDia.has(extra.data)) extraPorDia.set(extra.data, []);
    extraPorDia.get(extra.data)!.push(extra);
  }

  function restanteNormal(data: string): number {
    if (!ehDiaProdutivo(data)) return 0;
    if (!restanteNormalPorDia.has(data)) restanteNormalPorDia.set(data, capacidadeHorasMaquinaDia);
    return restanteNormalPorDia.get(data)!;
  }
  function restanteExtra(data: string, extra: CapacidadeExtraDia): number {
    const chave = `${data}::${extra.natureza}`;
    if (!restanteExtraPorChave.has(chave)) restanteExtraPorChave.set(chave, extra.horasAdicionaisDisponiveis);
    return restanteExtraPorChave.get(chave)!;
  }

  return {
    id: recursoId,
    produtividade,
    faixasDoDia(data: string): FaixaCapacidadeDia[] {
      const faixas: FaixaCapacidadeDia[] = [
        { natureza: "normal", horasDisponiveis: restanteNormal(data), contratacaoId: null, elegibilidade: null },
      ];
      for (const extra of extraPorDia.get(data) ?? []) {
        faixas.push({
          natureza: extra.natureza,
          horasDisponiveis: restanteExtra(data, extra),
          contratacaoId: extra.contratacaoId,
          elegibilidade: extra.elegibilidade,
        });
      }
      return faixas;
    },
    consumir(data: string, natureza: NaturezaCapacidade, horasMaquina: number): void {
      if (natureza === "normal") {
        restanteNormalPorDia.set(data, Math.max(0, restanteNormal(data) - horasMaquina));
      } else {
        const chave = `${data}::${natureza}`;
        restanteExtraPorChave.set(chave, Math.max(0, (restanteExtraPorChave.get(chave) ?? 0) - horasMaquina));
      }
    },
  };
}

/**
 * "View" do mesmo candidato base, só oferecendo a categoria de faixa
 * desta rodada - o estado mutável (consumir) é o mesmo do base, nunca
 * clonado. Exportada pelo mesmo motivo de criarCandidatoNormalComExtra.
 */
export function candidatoSomenteNatureza(base: CandidatoComCapacidadeDiaria, somenteNormal: boolean): CandidatoComCapacidadeDiaria {
  return {
    id: base.id,
    produtividade: base.produtividade,
    faixasDoDia: (data) => base.faixasDoDia(data).filter((f) => (f.natureza === "normal") === somenteNormal),
    consumir: base.consumir,
  };
}

/**
 * NÚCLEO puro do laço por data/tier - recebe candidatos JÁ CONSTRUÍDOS
 * (normal+extra combinados por recurso, temporários já prontos), nunca
 * os constrói a partir de dado bruto. Isso permite à camada de
 * integração (fila de confirmados + distribuição flexível) entregar
 * candidatos que a fila de confirmados já consumiu parcialmente - o
 * MESMO laço, sem uma segunda implementação. `distribuirNecessidadeFlexivel`
 * (casca pública, abaixo) é o único outro chamador hoje, com candidatos
 * frescos.
 */
export function distribuirNecessidadeSobreCandidatos(params: {
  necessidade: NecessidadeCapacidadeFlexivel;
  ehOrcamentoNovo: boolean;
  /** 1 candidato "normal+extra" por recurso (recursoOriginalId e cada recursosCompativeisPorPrioridade) - já reduzido pelo que quer que tenha consumido antes (ex.: fila de confirmados). */
  candidatosNormaisPorRecurso: ReadonlyMap<string, CandidatoComCapacidadeDiaria>;
  /** Candidatos temporários já prontos, na ordem de prioridade. */
  candidatosTemporariosPorPrioridade: readonly CandidatoComCapacidadeDiaria[];
  /** recursoId (=idTemporario) -> contratacaoId real - candidatoTemporario nunca carrega isso na própria faixa (ver criarCandidatoRecursoTemporario). */
  contratacaoIdPorTemporario: ReadonlyMap<string, string>;
  datasOrdenadas: readonly string[];
}): ResultadoDistribuicaoFlexivel {
  const { necessidade, ehOrcamentoNovo, candidatosNormaisPorRecurso, candidatosTemporariosPorPrioridade, contratacaoIdPorTemporario, datasOrdenadas } = params;

  validarNecessidade(necessidade, datasOrdenadas);

  if (!candidatosNormaisPorRecurso.has(necessidade.recursoOriginalId)) {
    throw new RangeError(`candidatosNormaisPorRecurso não tem entrada para o recurso original "${necessidade.recursoOriginalId}".`);
  }
  for (const id of necessidade.recursosCompativeisPorPrioridade) {
    if (!candidatosNormaisPorRecurso.has(id)) {
      throw new RangeError(`candidatosNormaisPorRecurso não tem entrada para o recurso compatível "${id}" - compatível informado sem candidato correspondente.`);
    }
  }

  const datasDisponiveis = datasOrdenadas.filter((d) => d >= necessidade.disponivelAPartirDe);
  const ordemRecursos = [necessidade.recursoOriginalId, ...necessidade.recursosCompativeisPorPrioridade];

  const alocacoes: AlocacaoNecessidadeFlexivel[] = [];

  function registrarAlocacoes(
    origem: { recursoId: string; data: string; horasPadrao: number; horasMaquina: number; contratacaoId: string | null }[],
    classificar: (recursoId: string) => TipoCapacidadeFlexivel,
    resolverContratacaoId: (recursoId: string, contratacaoIdDaFaixa: string | null) => string | null = (_r, c) => c,
  ): void {
    for (const a of origem) {
      alocacoes.push({
        chaveTrabalho: necessidade.chaveTrabalho,
        recursoId: a.recursoId,
        tipoCapacidade: classificar(a.recursoId),
        data: a.data,
        horasPadrao: a.horasPadrao,
        horasMaquina: a.horasMaquina,
        contratacaoId: resolverContratacaoId(a.recursoId, a.contratacaoId),
      });
    }
  }

  let restante = necessidade.horasNecessariasPadrao;

  // A prioridade de negócio (normal original -> normal compatíveis ->
  // adicional -> temporário) é aplicada DENTRO DE CADA DATA, nunca sobre
  // o horizonte inteiro de uma vez - senão capacidade normal de um dia
  // FUTURO seria consumida antes de capacidade adicional já autorizada
  // HOJE, o que impediria a hora extra de antecipar a entrega (bug
  // encontrado em revisão: 3 chamadas globais a alocarOperacaoDiaAdia,
  // uma por categoria, cada uma cobrindo o horizonte inteiro, produzia
  // exatamente essa inversão). Por isso o laço externo é por DATA, em
  // ordem cronológica, e cada data faz até 3 sub-chamadas (normal,
  // adicional, temporário) restritas a `datasOrdenadas: [data]` -
  // alocarOperacaoDiaAdia.ts não muda, só é chamado com uma data de
  // cada vez.
  for (const data of datasDisponiveis) {
    if (tratarComoZero(restante) || restante <= 0) break;

    // Tier 1+2 desta data: normal (original, depois compatíveis, na prioridade).
    const candidatosNormal = ordemRecursos.map((id) => candidatoSomenteNatureza(candidatosNormaisPorRecurso.get(id) as CandidatoComCapacidadeDiaria, true));
    const resultadoNormal = alocarOperacaoDiaAdia({
      necessarioHorasPadrao: restante,
      candidatosPorPrioridade: candidatosNormal,
      datasOrdenadas: [data],
      projetoId: necessidade.projetoId,
      ehOrcamentoNovo,
    });
    registrarAlocacoes(resultadoNormal.alocacoes, (recursoId) => (recursoId === necessidade.recursoOriginalId ? "normal_original" : "normal_compativel"));
    restante = resultadoNormal.deficitResidualHorasPadrao;

    // Tier 3 desta mesma data: adicional autorizada - só depois de esgotar a normal desta data.
    if (restante > 0) {
      const candidatosAdicional = ordemRecursos.map((id) => candidatoSomenteNatureza(candidatosNormaisPorRecurso.get(id) as CandidatoComCapacidadeDiaria, false));
      const resultadoAdicional = alocarOperacaoDiaAdia({
        necessarioHorasPadrao: restante,
        candidatosPorPrioridade: candidatosAdicional,
        datasOrdenadas: [data],
        projetoId: necessidade.projetoId,
        ehOrcamentoNovo,
      });
      registrarAlocacoes(resultadoAdicional.alocacoes, () => "adicional");
      restante = resultadoAdicional.deficitResidualHorasPadrao;
    }

    // Tier 4 desta mesma data: recursos temporários - só depois de esgotar a adicional desta data.
    if (restante > 0 && candidatosTemporariosPorPrioridade.length > 0) {
      const resultadoTemporario = alocarOperacaoDiaAdia({
        necessarioHorasPadrao: restante,
        candidatosPorPrioridade: [...candidatosTemporariosPorPrioridade],
        datasOrdenadas: [data],
        projetoId: necessidade.projetoId,
        ehOrcamentoNovo,
      });
      registrarAlocacoes(
        resultadoTemporario.alocacoes,
        () => "temporario",
        (recursoId) => contratacaoIdPorTemporario.get(recursoId) ?? null,
      );
      restante = resultadoTemporario.deficitResidualHorasPadrao;
    }
  }

  const deficitResidualHorasPadrao = tratarComoZero(restante) ? 0 : Math.max(0, restante);
  const horasAlocadasPadrao = alocacoes.reduce((soma, a) => soma + a.horasPadrao, 0);
  const recursosEfetivamenteUsados = Array.from(new Set(alocacoes.map((a) => a.recursoId)));

  return {
    status: deficitResidualHorasPadrao > 0 ? "capacidade_insuficiente" : "concluida",
    horasNecessariasPadrao: necessidade.horasNecessariasPadrao,
    horasAlocadasPadrao,
    deficitResidualHorasPadrao,
    alocacoes: Object.freeze(alocacoes),
    recursosEfetivamenteUsados: Object.freeze(recursosEfetivamenteUsados),
  };
}

/**
 * Casca pública original - comportamento e testes inalterados desde
 * antes da extração do núcleo acima: constrói candidatos FRESCOS a
 * partir de dado bruto (CapacidadeNormalRecurso/CapacidadeExtraDia/
 * DecisaoRecursoTemporario) e delega a distribuirNecessidadeSobreCandidatos.
 * Continua sendo a forma certa de chamar este módulo quando NÃO há fila
 * de confirmados por cima (ex.: testes isolados, ou uma necessidade sem
 * nenhum compromisso anterior no recurso).
 */
export function distribuirNecessidadeFlexivel(params: {
  necessidade: NecessidadeCapacidadeFlexivel;
  ehOrcamentoNovo: boolean;
  /** Precisa conter uma entrada para recursoOriginalId e para cada id de recursosCompativeisPorPrioridade. */
  capacidadesNormais: ReadonlyMap<string, CapacidadeNormalRecurso>;
  /** Reaproveitado de capacidadeDia.ts - já filtrado pelo chamador (quais recursos/datas o cenário autorizou). */
  capacidadeExtraAutorizada: readonly CapacidadeExtraDia[];
  /** Reaproveitado de avaliarCenario.ts/recursoTemporario.ts - em ordem de prioridade. */
  temporariosPorPrioridade: readonly DecisaoRecursoTemporario[];
  datasOrdenadas: readonly string[];
}): ResultadoDistribuicaoFlexivel {
  const { necessidade, ehOrcamentoNovo, capacidadesNormais, capacidadeExtraAutorizada, temporariosPorPrioridade, datasOrdenadas } = params;

  validarNecessidade(necessidade, datasOrdenadas);
  validarDadoBruto({ necessidade, capacidadesNormais, capacidadeExtraAutorizada, temporariosPorPrioridade });

  const extraPorRecurso = new Map<string, CapacidadeExtraDia[]>();
  for (const extra of capacidadeExtraAutorizada) {
    if (!extraPorRecurso.has(extra.recursoId)) extraPorRecurso.set(extra.recursoId, []);
    extraPorRecurso.get(extra.recursoId)!.push(extra);
  }

  // Ordem fixa: original primeiro, depois compatíveis na prioridade
  // recebida - nunca reordenada por capacidade/data/término.
  const ordemRecursos = [necessidade.recursoOriginalId, ...necessidade.recursosCompativeisPorPrioridade];
  const candidatosNormaisPorRecurso = new Map<string, CandidatoComCapacidadeDiaria>();
  for (const recursoId of ordemRecursos) {
    const cap = capacidadesNormais.get(recursoId) as CapacidadeNormalRecurso;
    candidatosNormaisPorRecurso.set(recursoId, criarCandidatoNormalComExtra(recursoId, cap.capacidadeHorasMaquinaDia, cap.produtividade, extraPorRecurso.get(recursoId) ?? []));
  }

  // criarCandidatoRecursoTemporario (recursoTemporario.ts) devolve
  // faixas natureza="normal" (contratacaoId sempre null na própria
  // faixa, por design - o vínculo com o custo é feito por FORA,
  // cruzando recursoId=idTemporario com RecursoTemporarioCenario.
  // contratacaoId, documentado no próprio módulo). Resolvido aqui para
  // que AlocacaoNecessidadeFlexivel já saia com o contratacaoId certo.
  const candidatosTemporariosPorPrioridade = temporariosPorPrioridade.map((d) => criarCandidatoRecursoTemporario(d.recursoTemporario, d.produtividadeReferencia));
  const contratacaoIdPorTemporario = new Map(temporariosPorPrioridade.map((d) => [d.recursoTemporario.idTemporario, d.recursoTemporario.contratacaoId]));

  return distribuirNecessidadeSobreCandidatos({
    necessidade,
    ehOrcamentoNovo,
    candidatosNormaisPorRecurso,
    candidatosTemporariosPorPrioridade,
    contratacaoIdPorTemporario,
    datasOrdenadas,
  });
}
