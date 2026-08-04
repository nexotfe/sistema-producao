"use client";
// Hook genérico de busca com paginação incremental, para autocomplete
// reutilizável (Matéria-prima → Roteiro hoje; Produto/Subconjunto no
// futuro, mesma interface). Envelope fino de React (useState/useRef)
// em volta de duas peças puras, testáveis sem infraestrutura de teste
// de hook/componente (este projeto não tem nenhuma ainda):
//   - ControladorConcorrenciaBusca (controladorConcorrenciaBusca.ts) -
//     decide quando uma requisição pode disparar e quando uma resposta
//     deve ser descartada/aplicada.
//   - acumularPaginaBusca (acumularPaginaBusca.ts) - decide o próximo
//     itens/offset/temMais a partir de uma página recebida.
// Nenhuma decisão de concorrência ou paginação mora neste arquivo -
// só orquestra as chamadas e liga o resultado ao estado do React.
import { useCallback, useEffect, useRef, useState } from "react";
import { acumularPaginaBusca } from "../lib/acumularPaginaBusca";
import {
  ControladorConcorrenciaBusca,
  type IdentidadeRequisicaoBusca,
} from "../lib/controladorConcorrenciaBusca";

export type BuscarPagina<T> = (params: {
  termo: string;
  offset: number;
  limite: number;
}) => Promise<T[]>;

export interface OpcoesBuscaPaginada<T> {
  buscarPagina: BuscarPagina<T>;
  /** Identifica um item de forma única - usado só para o dedupe defensivo entre páginas. */
  obterId: (item: T) => string;
  tamanhoPagina?: number;
  debounceMs?: number;
}

export interface EstadoBuscaPaginada<T> {
  termo: string;
  setTermo: (termo: string) => void;
  itens: T[];
  carregando: boolean;
  carregandoMais: boolean;
  erro: string | null;
  temMais: boolean;
  carregarMais: () => void;
}

const TAMANHO_PAGINA_PADRAO = 20;
const DEBOUNCE_PADRAO_MS = 300;

export function useBuscaPaginada<T>({
  buscarPagina,
  obterId,
  tamanhoPagina = TAMANHO_PAGINA_PADRAO,
  debounceMs = DEBOUNCE_PADRAO_MS,
}: OpcoesBuscaPaginada<T>): EstadoBuscaPaginada<T> {
  const [termo, setTermo] = useState("");
  const [itens, setItens] = useState<T[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [temMais, setTemMais] = useState(true);
  const offsetRef = useRef(0);
  const itensRef = useRef<T[]>([]);

  const [controlador] = useState(() => new ControladorConcorrenciaBusca());

  const executarBusca = useCallback(
    async (termoBusca: string, offsetBusca: number, id: IdentidadeRequisicaoBusca, primeiraPagina: boolean) => {
      try {
        const pagina = await buscarPagina({ termo: termoBusca, offset: offsetBusca, limite: tamanhoPagina });

        if (!controlador.ehGeracaoAtual(id)) return; // termo mudou - resposta descartada

        const resultado = acumularPaginaBusca({
          itensAtuais: itensRef.current,
          pagina,
          offsetAnterior: offsetBusca,
          tamanhoPagina,
          obterId,
          primeiraPagina,
        });

        itensRef.current = resultado.itens;
        offsetRef.current = resultado.offset;
        setItens(resultado.itens);
        setTemMais(resultado.temMais);
        setErro(null);
      } catch (erroCapturado) {
        if (!controlador.ehGeracaoAtual(id)) return;
        setErro(erroCapturado instanceof Error ? erroCapturado.message : "Não foi possível buscar.");
      } finally {
        if (controlador.finalizar(id)) {
          setCarregando(false);
          setCarregandoMais(false);
        }
      }
    },
    [buscarPagina, tamanhoPagina, obterId, controlador],
  );

  // Debounce da digitação - dispara uma geração nova (página 0) só
  // depois do intervalo sem novas teclas. A invalidação de respostas
  // antigas (por geração, via ControladorConcorrenciaBusca) continua
  // valendo independentemente do debounce, para qualquer requisição que
  // já tenha saído antes do termo mudar de novo.
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const id = controlador.novaGeracao(); // nunca bloqueada
      itensRef.current = [];
      offsetRef.current = 0;
      setItens([]);
      setTemMais(true);
      setErro(null);
      setCarregando(true);
      executarBusca(termo, 0, id, true);
    }, debounceMs);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo, debounceMs]);

  const carregarMais = useCallback(() => {
    if (!temMais || carregando || carregandoMais) return;

    const id = controlador.novaPagina();
    if (!id) return; // já existe uma página desta mesma geração em voo

    setCarregandoMais(true);
    executarBusca(termo, offsetRef.current, id, false);
  }, [temMais, carregando, carregandoMais, termo, executarBusca, controlador]);

  return {
    termo,
    setTermo,
    itens,
    carregando,
    carregandoMais,
    erro,
    temMais,
    carregarMais,
  };
}
