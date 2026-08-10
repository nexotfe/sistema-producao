// Fase 3 do rollout de DEC-006: prepara os 4 campos do Calculador
// Reverso já congelados num snapshot aprovado para exibição - nunca
// recalcula (a leitura do snapshot é sempre sobre o valor persistido no
// momento da aprovação, igual a carregarSnapshotPersistido.ts para o
// restante do resultado). Função pura, sem I/O, testável sem sessão
// real do Supabase.
//
// A migration (202608030001_...sql, constraint
// simulacoes_comerciais_estimativa_coerente_chk) só permite 2 formatos:
// (a) os 4 campos NULL (snapshot legado, anterior a esta ativação) ou
// (b) os 4 campos presentes com estado em viavel/viavel_no_limite/
// janela_insuficiente. Qualquer outra combinação (alguns NULL, outros
// não, ou um estado fora desses 3) não deveria existir num dado que
// passou pela constraint - mas esta função nunca presume isso: trata
// defensivamente como indisponível, nunca inventa um valor para
// preencher o que falta.
export type ExibicaoEstimativaSnapshot =
  | { tipo: "nao_registrada" }
  | { tipo: "indisponivel" }
  | {
      tipo: "disponivel";
      /** ISO (YYYY-MM-DD) - formatação de exibição é responsabilidade de quem renderiza (mesmo padrão de formatarDataBr, sem conversão UTC). */
      dataEstimadaInicioNecessario: string;
      estadoAmigavel: string;
      folgaDiasProdutivos: number;
      metodoVersao: number;
    };

const ESTADO_AMIGAVEL: Record<string, string> = {
  viavel: "Viável",
  viavel_no_limite: "Viável no limite",
  janela_insuficiente: "Janela insuficiente",
};

export interface CamposEstimativaSnapshot {
  estimativaInicioNecessario: string | null;
  estimativaEstado: string | null;
  estimativaMetodoVersao: number | null;
  folgaDiasProdutivos: number | null;
}

export function prepararExibicaoEstimativaSnapshot(
  campos: CamposEstimativaSnapshot,
): ExibicaoEstimativaSnapshot {
  const { estimativaInicioNecessario, estimativaEstado, estimativaMetodoVersao, folgaDiasProdutivos } = campos;

  const todosNulos =
    estimativaInicioNecessario === null &&
    estimativaEstado === null &&
    estimativaMetodoVersao === null &&
    folgaDiasProdutivos === null;

  if (todosNulos) {
    return { tipo: "nao_registrada" };
  }

  const estadoAmigavel = estimativaEstado !== null ? ESTADO_AMIGAVEL[estimativaEstado] : undefined;

  const algumNulo =
    estimativaInicioNecessario === null ||
    estimativaEstado === null ||
    estimativaMetodoVersao === null ||
    folgaDiasProdutivos === null;

  if (algumNulo || estadoAmigavel === undefined) {
    return { tipo: "indisponivel" };
  }

  return {
    tipo: "disponivel",
    dataEstimadaInicioNecessario: estimativaInicioNecessario,
    estadoAmigavel,
    folgaDiasProdutivos,
    metodoVersao: estimativaMetodoVersao,
  };
}
