// DEC-007 - previsão comercial por capacidade: "base congelada uma vez"
// (mesmo princípio de carregarBaseCenarios.ts/DEC-007 §18) para o
// redesenho `avaliarPrevisaoComercialFlexivel.ts`. Carrega, em UMA
// rodada de I/O, tudo que a previsão precisa - confirmados
// (carregarConfirmadosComerciais.ts), necessidades do orçamento novo
// (carregarNecessidadesOrcamentoNovo.ts), capacidade/produtividade por
// recurso (carregarCapacidadesNormaisPrevisao.ts) e a grade de dias
// (construirGradeCompartilhada.ts) - e devolve um objeto PROFUNDAMENTE
// imutável (congelado em runtime, não só pelo tipo TypeScript - ver
// congelarMapaEmRuntime/congelarCompromisso/congelarNecessidade/
// congelarCapacidade/congelarDiagnostico abaixo) reutilizável por N
// avaliações de cenário (montarPrevisaoComercialProjeto.ts) sem tocar a
// rede de novo. Alterar
// hora extra/temporário entre cenários NUNCA passa por este módulo de
// novo - só compatibilidade (recursosCompativeisPorPrioridade, já
// embutida em cada NecessidadeCapacidadeFlexivel desta base) poderia
// precisar de uma variação por cenário; como esta base já carrega TODAS
// as compatibilidades cadastradas (resolvidas dentro de
// carregarNecessidadesOrcamentoNovo.ts), qualquer recorte por cenário é
// uma transformação em memória sobre `necessidadesOrcamentoNovo`, nunca
// uma nova consulta.
//
// Sessão autenticada normal (nunca service_role) - `client` é recebido
// pronto, mesmo padrão de todo o resto deste módulo. `empresaId` e
// `projetoId` são resolvidos pelo CHAMADOR (sessão do usuário + projeto
// em edição), nunca por parâmetro de navegador.
//
// `janelaInicioGrade`/`prazoInterno` (piso técnico da GRADE e prazo
// interno para dimensionar o buffer) são OBRIGATÓRIOS e resolvidos pelo
// CHAMADOR - este módulo não calcula janela comercial (feature
// separada, prepararJanelaComercial.ts/calcularJanelaComercialParaExibicao.ts,
// do motor antigo - fora de escopo aqui).
//
// CORREÇÃO (achada em teste visual real, projeto 260011, DEC-007):
// `janelaInicioGrade` e `dataReferenciaConfirmados` são dois conceitos
// DIFERENTES, antes indevidamente unificados num único `janelaInicio`:
//  - `janelaInicioGrade` vira o piso de `datasGrade` (construirGradeCompartilhada)
//    E o piso-placeholder de `necessidadesOrcamentoNovo` (sempre
//    SUBSTITUÍDO por cenário em montarPrevisaoComercialProjeto.ts, via
//    `disponibilidadeMaterialOrcamentoNovo`) - precisa ser cedo o
//    bastante (ex.: aprovação prevista) para a grade cobrir tanto a
//    disponibilidade original de material quanto uma data negociada
//    ANTERIOR, sem nunca precisar recarregar a base ao trocar de
//    cenário (Alterar alternativas recalcula em memória).
//  - `dataReferenciaConfirmados` é o piso real de disponibilidade dos
//    CONFIRMADOS (`CompromissoCapacidade.disponivelAPartirDe`) - NUNCA
//    afetado pela disponibilidade de material do orçamento novo (regra
//    de negócio: material restringe só as necessidades do orçamento
//    novo, nunca os projetos já confirmados). Mantém o mesmo valor que
//    `janelaInicio` (único) usava antes desta correção - o
//    comportamento de confirmados fica bit-a-bit idêntico ao anterior.
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarConfirmadosComerciais } from "./carregarConfirmadosComerciais";
import { carregarNecessidadesOrcamentoNovo } from "./carregarNecessidadesOrcamentoNovo";
import { carregarCapacidadesNormaisPrevisao } from "./carregarCapacidadesNormaisPrevisao";
import { construirGradeCompartilhada } from "./construirGradeCompartilhada";
import { carregarContextoCalendario, resolverDiaProdutivoComContexto } from "@/modules/calendario/lib/contextoCalendario";
import type { CompromissoCapacidade } from "./compromissoCapacidade";
import type { CapacidadeNormalRecurso, NecessidadeCapacidadeFlexivel } from "./necessidadeCapacidadeFlexivel";
import { validarDataIso } from "./validacoes";

/**
 * Formato único de diagnóstico desta camada - estruturalmente idêntico
 * ao devolvido por carregarConfirmadosComerciais.ts/
 * carregarNecessidadesOrcamentoNovo.ts (empresaId/projetoId/motivo),
 * fundido aqui sem transformação.
 *
 * `bloqueiaCalculo` é OPCIONAL e este carregador NUNCA o define como
 * `true` hoje: a única origem conhecida de um diagnóstico que deveria
 * invalidar a previsão INTEIRA (não só excluir um projeto/recurso
 * isolado) é "granularidade insuficiente" entre snapshot comercial e
 * PCP real (selecionarFonteVencedora.ts) - e essa disputa só existe
 * quando há uma segunda origem (`pcp_real`) além do snapshot, o que
 * nunca acontece hoje (nenhum adaptador PCP existe ainda;
 * carregarConfirmadosComerciais.ts sempre chama selecionarFonteVencedora
 * com `coberturasIntegrais: []` e só a origem `snapshot_comercial`).
 * O campo existe no TIPO para que montarPrevisaoComercialProjeto.ts
 * já saiba respeitá-lo quando um adaptador PCP futuro vier a produzi-lo -
 * nunca inventado por string-matching sobre o texto de `motivo` aqui.
 */
export interface DiagnosticoPrevisaoComercial {
  readonly empresaId: string;
  readonly projetoId: string;
  readonly motivo: string;
  readonly bloqueiaCalculo?: boolean;
}

/**
 * `Object.freeze(mapa)` NÃO bloqueia `.set()`/`.delete()`/`.clear()` em
 * runtime - pegadinha conhecida do JS: um Map guarda seus dados em
 * slots internos, não em propriedades próprias enumeráveis, então
 * congelar o objeto Map não têm nenhum efeito sobre essas 3 chamadas
 * (o tipo `ReadonlyMap` do TypeScript só esconde os métodos no
 * COMPILADOR - `as any`/JS puro ainda muta a instância de verdade).
 * Proxy é a única forma real de bloquear em runtime: intercepta os 3
 * métodos mutantes e lança; toda leitura (`get`/`has`/`size`/iteração)
 * é encaminhada para o Map original, sempre com `this` religado ao
 * alvo (`.bind(alvo)`) - métodos de Map dependem dos mesmos slots
 * internos e quebram se chamados com `this` = o Proxy.
 */
function congelarMapaEmRuntime<K, V>(origem: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const metodosBloqueados = new Set(["set", "delete", "clear"]);
  return new Proxy(origem as Map<K, V>, {
    get(alvo, propriedade) {
      if (typeof propriedade === "string" && metodosBloqueados.has(propriedade)) {
        return () => {
          throw new TypeError(
            `Tentativa de mutar capacidadesNormais via "${propriedade}" - a base da previsão comercial é congelada em runtime (Proxy), nunca só pelo tipo ReadonlyMap (Object.freeze sozinho não bloqueia Map.set/delete/clear).`,
          );
        };
      }
      const valor = Reflect.get(alvo, propriedade, alvo);
      return typeof valor === "function" ? valor.bind(alvo) : valor;
    },
  });
}

/** Mesmo problema/mesma solução de congelarMapaEmRuntime, para Set: Object.freeze(set) não bloqueia .add()/.delete()/.clear() em runtime. */
function congelarSetEmRuntime(origem: ReadonlySet<string>): ReadonlySet<string> {
  const metodosBloqueados = new Set(["add", "delete", "clear"]);
  return new Proxy(origem as Set<string>, {
    get(alvo, propriedade) {
      if (typeof propriedade === "string" && metodosBloqueados.has(propriedade)) {
        return () => {
          throw new TypeError(
            `Tentativa de mutar diasProdutivos via "${propriedade}" - a base da previsão comercial é congelada em runtime (Proxy), nunca só pelo tipo ReadonlySet (Object.freeze sozinho não bloqueia Set.add/delete/clear).`,
          );
        };
      }
      const valor = Reflect.get(alvo, propriedade, alvo);
      return typeof valor === "function" ? valor.bind(alvo) : valor;
    },
  });
}

function congelarCompromisso(c: CompromissoCapacidade): CompromissoCapacidade {
  return Object.freeze({ ...c, chavesTrabalhoOrigem: Object.freeze([...c.chavesTrabalhoOrigem]) });
}

function congelarNecessidade(n: NecessidadeCapacidadeFlexivel): NecessidadeCapacidadeFlexivel {
  return Object.freeze({ ...n, recursosCompativeisPorPrioridade: Object.freeze([...n.recursosCompativeisPorPrioridade]) });
}

function congelarCapacidade(c: CapacidadeNormalRecurso): CapacidadeNormalRecurso {
  return Object.freeze({ ...c });
}

function congelarDiagnostico(d: DiagnosticoPrevisaoComercial): DiagnosticoPrevisaoComercial {
  return Object.freeze({ ...d });
}

export interface BasePrevisaoComercial {
  readonly empresaId: string;
  readonly projetoId: string;
  readonly dataSolicitadaCliente: string;
  /** classeFila="confirmado" - já resolvidos/agregados (selecionarFonteVencedora + agregarCompromissosPorRecurso), prontos para avaliarPrevisaoComercialFlexivel. */
  readonly compromissosConfirmados: readonly CompromissoCapacidade[];
  /** 1 por OP do orçamento novo (o projetoId sendo avaliado) - [] quando o projeto não tem simulação vigente ou nenhum item (ver diagnosticos). */
  readonly necessidadesOrcamentoNovo: readonly NecessidadeCapacidadeFlexivel[];
  /**
   * Cobre a união de todo recursoId referenciado por
   * compromissosConfirmados ou necessidadesOrcamentoNovo (original ou
   * compatível). SEMPRE um Proxy bloqueado em runtime
   * (congelarMapaEmRuntime) - `.set()`/`.delete()`/`.clear()` lançam,
   * mesmo via `as any`/JS puro (Object.freeze sozinho não bloqueia
   * essas chamadas em um Map, ver comentário da função).
   */
  readonly capacidadesNormais: ReadonlyMap<string, CapacidadeNormalRecurso>;
  /** Grade de dias civis, do piso técnico (janelaInicio) até prazoInterno + buffer (construirGradeCompartilhada.ts) - estendida além da data solicitada de propósito (horizonte técnico). TODA data civil, produtiva ou não (ver diasProdutivos). */
  readonly datasGrade: readonly string[];
  /**
   * Subconjunto de `datasGrade` em que a capacidade NORMAL existe (Etapa
   * A - correção de calendário): sábado/domingo/feriado ficam de fora,
   * salvo evento "dia_trabalhado_excepcional" (resolverDiaProdutivoComContexto,
   * mesma regra de precedência do resto do sistema - Calendário
   * Operacional -> Calendário Oficial -> Eventos da Empresa). Carregado
   * para o intervalo INTEIRO de `datasGrade` (não só até prazoInterno),
   * porque o Calculador Reverso/horizonte técnico pode precisar de dias
   * além do prazo pedido. Capacidade adicional/temporário NÃO usa este
   * campo - continuam disponíveis em qualquer data autorizada pelo
   * cenário, calendário à parte (é assim que hora extra num
   * sábado/feriado funciona). SEMPRE um Proxy bloqueado em runtime, mesmo
   * motivo de capacidadesNormais.
   */
  readonly diasProdutivos: ReadonlySet<string>;
  readonly diagnosticos: readonly DiagnosticoPrevisaoComercial[];
}

/**
 * "Base congelada uma vez" - carrega confirmados, necessidades do
 * orçamento novo, capacidade/produtividade por recurso e a grade de
 * dias em UMA rodada de I/O (2 consultas em paralelo dos carregadores +
 * 1 consulta em lote de capacidades, nunca 1 chamada por cenário
 * avaliado depois). `montarPrevisaoComercialProjeto.ts` reavalia
 * quantos cenários quiser (hora extra/temporário diferentes) sobre o
 * MESMO objeto devolvido aqui, sem tocar a rede de novo.
 */
export async function carregarBasePrevisaoComercial(
  client: SupabaseClient,
  empresaId: string,
  projetoId: string,
  dataSolicitadaCliente: string,
  janelaInicioGrade: string,
  dataReferenciaConfirmados: string,
  prazoInterno: string,
): Promise<BasePrevisaoComercial> {
  validarDataIso(dataSolicitadaCliente, "dataSolicitadaCliente");
  validarDataIso(janelaInicioGrade, "janelaInicioGrade");
  validarDataIso(dataReferenciaConfirmados, "dataReferenciaConfirmados");
  validarDataIso(prazoInterno, "prazoInterno");

  const { datasGradeCompartilhada: datasGrade } = construirGradeCompartilhada(janelaInicioGrade, prazoInterno);

  // Calendário carregado para o intervalo INTEIRO de datasGrade (até o
  // fim real do horizonte técnico, prazoInterno + buffer - nunca só até
  // prazoInterno) - correção Etapa A: antes deste incremento, nenhum
  // arquivo de lib/cenarios/ consultava calendário, então sábado/domingo/
  // feriado recebiam capacidade normal como se fossem dia útil comum.
  const [confirmadosResultado, orcamentoNovoResultado, contextoCalendario] = await Promise.all([
    carregarConfirmadosComerciais(client, empresaId, projetoId, dataReferenciaConfirmados),
    carregarNecessidadesOrcamentoNovo(client, empresaId, projetoId, janelaInicioGrade),
    carregarContextoCalendario(client, empresaId, janelaInicioGrade, datasGrade[datasGrade.length - 1]),
  ]);

  const diasProdutivos = new Set<string>();
  for (const data of datasGrade) {
    if (resolverDiaProdutivoComContexto(contextoCalendario, data).produtivo) {
      diasProdutivos.add(data);
    }
  }

  const recursoIds = new Set<string>();
  for (const compromisso of confirmadosResultado.compromissos) recursoIds.add(compromisso.recursoId);
  for (const necessidade of orcamentoNovoResultado.necessidades) {
    recursoIds.add(necessidade.recursoOriginalId);
    for (const id of necessidade.recursosCompativeisPorPrioridade) recursoIds.add(id);
  }

  const capacidadesNormaisCarregadas = await carregarCapacidadesNormaisPrevisao(client, [...recursoIds]);

  // --- Congelamento PROFUNDO, real em runtime - nunca só o objeto
  // externo (ver cabeçalho do módulo). Cada nível copia antes de
  // congelar: nunca reaproveita (e portanto nunca arrisca compartilhar
  // referência com) o array/objeto mutável devolvido pelos carregadores
  // internos - um `push`/mutação acidental em outro lugar do código
  // nunca vaza para esta base. ---
  const compromissosConfirmados = Object.freeze(confirmadosResultado.compromissos.map(congelarCompromisso));
  const necessidadesOrcamentoNovo = Object.freeze(orcamentoNovoResultado.necessidades.map(congelarNecessidade));
  const capacidadesNormais = congelarMapaEmRuntime(
    new Map([...capacidadesNormaisCarregadas].map(([recursoId, capacidade]) => [recursoId, congelarCapacidade(capacidade)])),
  );
  const datasGradeCongelada = Object.freeze([...datasGrade]);
  const diagnosticos = Object.freeze(
    [...confirmadosResultado.diagnosticos, ...orcamentoNovoResultado.diagnosticos].map(congelarDiagnostico),
  );

  return Object.freeze({
    empresaId,
    projetoId,
    dataSolicitadaCliente,
    compromissosConfirmados,
    necessidadesOrcamentoNovo,
    capacidadesNormais,
    datasGrade: datasGradeCongelada,
    diasProdutivos: congelarSetEmRuntime(diasProdutivos),
    diagnosticos,
  });
}
