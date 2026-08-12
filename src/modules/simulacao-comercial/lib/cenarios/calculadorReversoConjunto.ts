// DEC-007 §8 - Fase 3: Calculador Reverso estendido (D* sobre o
// escalonador conjunto). Núcleo puro, sem I/O.
//
// VARREDURA LINEAR REGRESSIVA, NÃO busca binária - decisão registrada
// também no DEC-007 (§8.1). Monotonicidade ("candidata mais tardia
// viável -> candidata mais cedo também viável") NÃO vale neste modelo:
// contraexemplo provado por análise antes desta implementação - raiz do
// orçamento A usa R1; concorrente C (mesmo rank/recurso R1) vem depois de
// A; sucessora D de C usa R2; sucessora B de A também usa R2, mas só tem
// elegibilidade numa ÚNICA data. Antecipar A desloca C mais tarde, o que
// desloca D mais tarde, que pode acabar consumindo justamente a única
// data de R2 elegível para B - piorando o PRÓPRIO orçamento por uma
// cascata concorrente via um recurso diferente do que A usa diretamente.
// Fixar a ordem de processamento (prioridade+chave, sem desempate por
// data) elimina a REORDENAÇÃO direta entre A e C, mas não elimina esse
// efeito indireto via recurso compartilhado a jusante - portanto busca
// binária não tem garantia formal neste modelo completo (recursos
// temporários, disponibilidade restrita, precedência, concorrência).
// Busca binária continua válida e é o mecanismo certo SÓ no motor legado
// agregado (estimarInicioNecessario.ts) - lá a capacidade cresce
// estritamente com o número de dias, sem noção de concorrência por
// data/recurso, e a monotonicidade é uma propriedade real do modelo.
//
// A varredura regressiva testa da candidata mais tardia (mais próxima do
// prazo) para a mais cedo, parando na PRIMEIRA viável (é D*, por
// definição "mais tardia" já é a primeira encontrada nessa direção) -
// termina cedo no caso comum (folga real existe perto do prazo).
//
// Cada tentativa é INDEPENDENTE: `criarRegistroCandidatos()` é chamada
// (fábrica) uma vez por candidata testada, produzindo instâncias de
// capacidade totalmente novas - nenhuma mutação de uma tentativa vaza
// para outra (mesmo mecanismo de isolamento já usado pelo escalonador
// para isolar cenários, DEC-007 §7, aqui aplicado entre CANDIDATAS da
// mesma busca).
//
// Estados (métodoVersao=2) - NUNCA reutiliza "janela_insuficiente": esse
// nome já foi persistido pela RPC v5 (método v1) com outro significado
// (disponibilidade de MATERIAL vs D*, um eixo que este módulo não
// modela). "prazo_inviavel" é o nome novo, exclusivo do método v2,
// significando "a operação tem data-fim real conhecida, só que posterior
// ao prazo" (DEC-007 §8) - nunca confundido com horizonte_tecnico_excedido
// (NENHUMA candidata testada produz conclusão alguma).
//
// A classificação NÃO presume monotonicidade: como a varredura já prova
// que uma candidata mais tarde pode concluir enquanto uma mais cedo não
// conclui (contraexemplo, §8.1), "prazo_inviavel" é decidido pela MELHOR
// conclusão tardia entre TODAS as candidatas testadas (menor dataFimReal
// entre as que concluíram, mesmo que depois do prazo) - nunca só a
// candidata mais cedo (índice 0), que poderia estar entre as PIORES.
// "horizonte_tecnico_excedido" só é reportado quando NENHUMA candidata
// testada concluiu, não quando só a mais cedo falhou.
import { chaveOcorrenciaParaString, type ChaveOcorrencia } from "./chaveOcorrencia";
import {
  escalonarConjuntoComFilaDeProntos,
  type CriterioPrioridadeDeNegocio,
  type OcorrenciaEscalonavel,
} from "./escalonadorConjunto";
import type { DependenciaOcorrencia } from "./grafoPrecedencia";
import type { CandidatoComCapacidadeDiaria } from "./alocarOperacaoDiaAdia";
import { validarDataIso, validarDatasEstritamenteCrescentes } from "./validacoes";

export const METODO_VERSAO_CALCULADOR_REVERSO_CONJUNTO = 2;

export type ResultadoBuscaDStar =
  | {
      estado: "viavel" | "viavel_no_limite";
      metodoVersao: 2;
      /** D* - a candidata mais tardia (mais próxima do prazo) que ainda cumpre o prazo interno. */
      dataEstimadaInicioNecessario: string;
      /** Separado formalmente de D*: quando a cadeia do orçamento novo REALMENTE termina, começando em D*. Sempre <= prazoInterno neste estado. */
      dataFimReal: string;
      /** prazoInterno - dataFimReal, em dias civis. 0 quando viavel_no_limite. */
      folgaDiasCivis: number;
    }
  | {
      estado: "prazo_inviavel";
      metodoVersao: 2;
      /** Nenhuma candidata testada cumpre o prazo, mas PELO MENOS UMA conclui de verdade - a MELHOR (menor) data-fim real entre todas as que concluíram, mesmo que depois do prazo (nunca presume que a candidata mais cedo é a melhor - ver DEC-007 §8.1). Sempre > prazoInterno. */
      dataFimReal: string;
      /** dataFimReal - prazoInterno, em dias civis (sempre > 0 neste estado). */
      diasCivisDeAtraso: number;
    }
  | {
      estado: "dados_insuficientes";
      metodoVersao: 2;
      /** Ocorrência do orçamento novo sem nenhum candidato (recurso) elegível - gap de cadastro, não de tempo. */
      chave: ChaveOcorrencia;
    }
  | {
      estado: "horizonte_tecnico_excedido";
      metodoVersao: 2;
      /** NENHUMA candidata testada produz conclusão (não só a mais cedo) - quantidade de candidatas examinadas antes de desistir. */
      candidatosExaminados: number;
    };

function diasCivisEntreDatas(dataInicio: string, dataFim: string): number {
  const [anoA, mesA, diaA] = dataInicio.split("-").map(Number);
  const [anoB, mesB, diaB] = dataFim.split("-").map(Number);
  const utcInicio = Date.UTC(anoA, mesA - 1, diaA);
  const utcFim = Date.UTC(anoB, mesB - 1, diaB);
  return Math.round((utcFim - utcInicio) / 86_400_000);
}

/**
 * Rejeita chave duplicada dentro do MESMO array - uma duplicata aqui
 * nunca é dado legítimo (uma ocorrência só pode ser raiz uma vez, só
 * pode ser final uma vez, só pertence ao orçamento uma vez); é sinal de
 * bug em quem montou a lista (ex.: percorreu a árvore do BOM duas vezes).
 * Um `Set` absorveria a duplicata silenciosamente - mascararia
 * exatamente esse tipo de erro estrutural, em vez de sinalizá-lo.
 */
function validarSemChaveDuplicada(chaves: ChaveOcorrencia[], nomeParametro: string): void {
  const vistas = new Set<string>();
  for (const chave of chaves) {
    const chaveStr = chaveOcorrenciaParaString(chave);
    if (vistas.has(chaveStr)) {
      throw new RangeError(`${nomeParametro} contém a chave "${chaveStr}" duplicada.`);
    }
    vistas.add(chaveStr);
  }
}

interface AvaliacaoCandidato {
  concluida: boolean;
  /** Não-nulo quando `concluida` é true (invariante de ResultadoOcorrenciaEscalonada: concluida implica dataFimReal != null). */
  dataFimReal: string | null;
}

export function buscarDataInicioMaisTardiaViavel(params: {
  /** TEMPLATE fixo (base comprometida + orçamento novo) - as ocorrências-raiz do orçamento têm `dataInicioJanela` SOBRESCRITA por candidata a cada tentativa; todo o resto é reaproveitado como veio. */
  ocorrencias: OcorrenciaEscalonavel[];
  dependencias: DependenciaOcorrencia[];
  /** projetoId do orçamento novo - toda chave em chavesOrcamentoNovo precisa resolver para uma ocorrência com este projetoId e ehOrcamentoNovo=true (nunca uma ocorrência de outro projeto confundida com a que está sendo avaliada). */
  projetoIdOrcamentoNovo: string;
  /** TODAS as ocorrências do orçamento novo (raiz + intermediárias + finais) - pré-checagem de dados_insuficientes e universo válido para raiz/finais abaixo. */
  chavesOrcamentoNovo: ChaveOcorrencia[];
  /** Ocorrências do orçamento SEM predecessora - recebem a data candidata como dataInicioJanela a cada tentativa. Precisa ser subconjunto de chavesOrcamentoNovo. */
  chavesRaizOrcamentoNovo: ChaveOcorrencia[];
  /** Ocorrências do orçamento cuja conclusão determina viabilidade (tipicamente as últimas da cadeia). Precisa ser subconjunto de chavesOrcamentoNovo. */
  chavesFinaisOrcamentoNovo: ChaveOcorrencia[];
  /** Fábrica de capacidade - chamada UMA VEZ POR CANDIDATA testada, sempre produzindo instâncias novas (isolamento entre tentativas). */
  criarRegistroCandidatos: () => ReadonlyMap<string, CandidatoComCapacidadeDiaria>;
  /** Grade única, compartilhada entre TODAS as tentativas - dado imutável (sem `consumir`), seguro reaproveitar a mesma referência. */
  datasGradeCompartilhada: string[];
  /** Candidatas de dataInicioJanela, ASCENDENTES, do piso técnico até o prazo interno (inclusive) - varridas de trás para frente. */
  datasCandidatas: string[];
  criterioPrioridadeDeNegocio: CriterioPrioridadeDeNegocio;
  prazoInterno: string;
}): ResultadoBuscaDStar {
  const {
    ocorrencias,
    dependencias,
    projetoIdOrcamentoNovo,
    chavesOrcamentoNovo,
    chavesRaizOrcamentoNovo,
    chavesFinaisOrcamentoNovo,
    criarRegistroCandidatos,
    datasGradeCompartilhada,
    datasCandidatas,
    criterioPrioridadeDeNegocio,
    prazoInterno,
  } = params;

  validarDataIso(prazoInterno, "prazoInterno");
  validarDatasEstritamenteCrescentes(datasCandidatas, "datasCandidatas");
  if (datasCandidatas.length === 0) {
    throw new RangeError("datasCandidatas está vazia - a busca precisa de pelo menos 1 candidata para examinar.");
  }
  if (datasCandidatas[datasCandidatas.length - 1] > prazoInterno) {
    throw new RangeError(
      `datasCandidatas[${datasCandidatas.length - 1}] = "${datasCandidatas[datasCandidatas.length - 1]}" é posterior a prazoInterno = "${prazoInterno}" - ` +
        `o intervalo prometido é [piso técnico, prazoInterno]; nenhuma candidata pode estar além do próprio prazo.`,
    );
  }
  if (chavesFinaisOrcamentoNovo.length === 0) {
    throw new RangeError("chavesFinaisOrcamentoNovo está vazia - não há como determinar viabilidade sem nenhuma ocorrência final.");
  }
  if (chavesRaizOrcamentoNovo.length === 0) {
    throw new RangeError("chavesRaizOrcamentoNovo está vazia - não há nenhuma ocorrência-raiz para receber a data candidata.");
  }
  validarSemChaveDuplicada(chavesOrcamentoNovo, "chavesOrcamentoNovo");
  validarSemChaveDuplicada(chavesRaizOrcamentoNovo, "chavesRaizOrcamentoNovo");
  validarSemChaveDuplicada(chavesFinaisOrcamentoNovo, "chavesFinaisOrcamentoNovo");
  // Precisa rodar ANTES de montar porChaveStr - um Map sobrescreveria uma
  // ocorrência duplicada silenciosamente, e a pré-checagem de
  // dados_insuficientes (que lê porChaveStr) nunca chegaria a ver a
  // duplicata - a validação de chave duplicada do próprio escalonador
  // (Fase 2) só dispara dentro de escalonarConjuntoComFilaDeProntos,
  // tarde demais para este precheck.
  validarSemChaveDuplicada(
    ocorrencias.map((oc) => oc.chave),
    "ocorrencias",
  );

  const porChaveStr = new Map(ocorrencias.map((oc) => [chaveOcorrenciaParaString(oc.chave), oc]));

  // Toda chave de chavesOrcamentoNovo precisa existir E pertencer
  // genuinamente ao orçamento novo (projetoId + ehOrcamentoNovo) - nunca
  // uma ocorrência de outro projeto (base comprometida) confundida com a
  // que está sendo avaliada, o que corromperia tanto a pré-checagem de
  // dados_insuficientes quanto (via raiz/finais abaixo) a própria busca.
  const chavesOrcamentoNovoStr = new Set<string>();
  for (const chave of chavesOrcamentoNovo) {
    const chaveStr = chaveOcorrenciaParaString(chave);
    const oc = porChaveStr.get(chaveStr);
    if (!oc) {
      throw new RangeError(`chavesOrcamentoNovo referencia uma ocorrência ausente de "ocorrencias": "${chaveStr}".`);
    }
    if (oc.projetoId !== projetoIdOrcamentoNovo || !oc.ehOrcamentoNovo) {
      throw new RangeError(
        `Ocorrência "${chaveStr}" está em chavesOrcamentoNovo mas não pertence ao orçamento novo ` +
          `(projetoId="${oc.projetoId}", ehOrcamentoNovo=${oc.ehOrcamentoNovo} - esperado projetoId="${projetoIdOrcamentoNovo}" e ehOrcamentoNovo=true).`,
      );
    }
    chavesOrcamentoNovoStr.add(chaveStr);
  }

  // Raiz/finais precisam ser subconjunto de chavesOrcamentoNovo (nunca
  // apontar para uma ocorrência de outro projeto que só por coincidência
  // exista em "ocorrencias" - a checagem acima garante que TUDO em
  // chavesOrcamentoNovo já é do orçamento; esta garante que raiz/finais
  // não escapam desse universo).
  for (const chave of chavesRaizOrcamentoNovo) {
    const chaveStr = chaveOcorrenciaParaString(chave);
    if (!chavesOrcamentoNovoStr.has(chaveStr)) {
      throw new RangeError(`Ocorrência-raiz "${chaveStr}" não está em chavesOrcamentoNovo - toda raiz precisa pertencer ao conjunto completo do orçamento novo.`);
    }
  }
  for (const chave of chavesFinaisOrcamentoNovo) {
    const chaveStr = chaveOcorrenciaParaString(chave);
    if (!chavesOrcamentoNovoStr.has(chaveStr)) {
      throw new RangeError(`Ocorrência final "${chaveStr}" não está em chavesOrcamentoNovo - toda ocorrência final precisa pertencer ao conjunto completo do orçamento novo.`);
    }
  }

  const chavesRaizStr = new Set(chavesRaizOrcamentoNovo.map(chaveOcorrenciaParaString));
  for (const dependencia of dependencias) {
    const sucStr = chaveOcorrenciaParaString(dependencia.sucessora);
    if (chavesRaizStr.has(sucStr)) {
      throw new RangeError(
        `Ocorrência "${sucStr}" está em chavesRaizOrcamentoNovo mas tem uma predecessora em "dependencias" - ` +
          `raízes precisam ser genuinamente sem predecessora, senão a sobrescrita de dataInicioJanela por candidata seria ignorada pelo escalonador (que usa max(dataInicioJanela, fim da predecessora + 1 dia)).`,
      );
    }
  }

  // Pré-checagem estrutural (gap de cadastro, não de tempo) - roda ANTES
  // de qualquer tentativa, mesmo padrão do antigo verificarCapacidadeCadastralSuficiente.
  for (const chave of chavesOrcamentoNovo) {
    const oc = porChaveStr.get(chaveOcorrenciaParaString(chave))!;
    if (oc.candidatoIdsPorPrioridade.length === 0) {
      return { estado: "dados_insuficientes", metodoVersao: 2, chave };
    }
  }

  function montarOcorrenciasParaCandidato(dataCandidata: string): OcorrenciaEscalonavel[] {
    return ocorrencias.map((oc) =>
      chavesRaizStr.has(chaveOcorrenciaParaString(oc.chave)) ? { ...oc, dataInicioJanela: dataCandidata } : oc,
    );
  }

  function avaliarCandidato(dataCandidata: string): AvaliacaoCandidato {
    const resultados = escalonarConjuntoComFilaDeProntos({
      ocorrencias: montarOcorrenciasParaCandidato(dataCandidata),
      dependencias,
      registroCandidatos: criarRegistroCandidatos(), // FRESH - nunca reaproveitada entre candidatas
      datasGradeCompartilhada,
      criterioPrioridadeDeNegocio,
    });

    let todasConcluidas = true;
    let maiorDataFim: string | null = null;
    for (const chave of chavesFinaisOrcamentoNovo) {
      const resultado = resultados.get(chaveOcorrenciaParaString(chave))!;
      if (resultado.status !== "concluida") todasConcluidas = false;
      if (resultado.dataFimReal !== null && (maiorDataFim === null || resultado.dataFimReal > maiorDataFim)) {
        maiorDataFim = resultado.dataFimReal;
      }
    }
    return { concluida: todasConcluidas, dataFimReal: todasConcluidas ? maiorDataFim : null };
  }

  // Melhor conclusão TARDIA vista até agora (menor dataFimReal entre as
  // candidatas que concluíram além do prazo) - acumulada por TODAS as
  // candidatas testadas, nunca só a mais cedo (índice 0). Não-monotonicidade
  // comprovada (DEC-007 §8.1, contraexemplo): uma candidata do MEIO da
  // varredura pode concluir enquanto a mais cedo não conclui de jeito
  // nenhum - presumir que a mais cedo é sempre a "mais generosa" é
  // exatamente a falha corrigida aqui.
  let melhorConclusaoTardia: { dataFimReal: string } | null = null;

  for (let indice = datasCandidatas.length - 1; indice >= 0; indice--) {
    const dataCandidata = datasCandidatas[indice];
    const avaliacao = avaliarCandidato(dataCandidata);

    if (!avaliacao.concluida || avaliacao.dataFimReal === null) continue;

    if (avaliacao.dataFimReal <= prazoInterno) {
      const folgaDiasCivis = diasCivisEntreDatas(avaliacao.dataFimReal, prazoInterno);
      return {
        estado: folgaDiasCivis === 0 ? "viavel_no_limite" : "viavel",
        metodoVersao: 2,
        dataEstimadaInicioNecessario: dataCandidata,
        dataFimReal: avaliacao.dataFimReal,
        folgaDiasCivis,
      };
    }

    if (melhorConclusaoTardia === null || avaliacao.dataFimReal < melhorConclusaoTardia.dataFimReal) {
      melhorConclusaoTardia = { dataFimReal: avaliacao.dataFimReal };
    }
  }

  if (melhorConclusaoTardia !== null) {
    return {
      estado: "prazo_inviavel",
      metodoVersao: 2,
      dataFimReal: melhorConclusaoTardia.dataFimReal,
      diasCivisDeAtraso: diasCivisEntreDatas(prazoInterno, melhorConclusaoTardia.dataFimReal),
    };
  }

  return {
    estado: "horizonte_tecnico_excedido",
    metodoVersao: 2,
    candidatosExaminados: datasCandidatas.length,
  };
}
