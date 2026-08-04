"use client";
// Combobox acessível reutilizável, consumindo useBuscaPaginada.ts -
// padrão ARIA "combobox com popup listbox" (input com role=combobox,
// lista com role=listbox, itens com role=option, seleção comunicada via
// aria-activedescendant - o foco do DOM nunca sai do input). Navegação
// por teclado cobre a lista inteira (setas/Enter/Esc), incluindo
// carregar mais páginas ao chegar no fim por teclado - o botão "Carregar
// mais" é um reforço explícito (mouse/leitor de tela), não o único
// caminho.
import { useEffect, useId, useRef, useState } from "react";
import type { EstadoBuscaPaginada } from "../hooks/useBuscaPaginada";
import { proximoIndiceParaBaixo, proximoIndiceParaCima } from "../lib/navegacaoTecladoBusca";

export interface DropdownBuscaPaginadaProps<T> {
  busca: EstadoBuscaPaginada<T>;
  valorSelecionado: T | null;
  aoSelecionar: (item: T) => void;
  aoLimparSelecao: () => void;
  obterId: (item: T) => string;
  obterTextoExibicao: (item: T) => string;
  renderItem: (item: T, ativo: boolean) => React.ReactNode;
  placeholder?: string;
  mensagemVazio?: string;
  ariaLabel?: string;
  /** Itens que satisfazem a busca mas não podem ser selecionados (ex.: produto sem BOM cadastrado) - navegação por teclado pula sobre eles. */
  itemDesabilitado?: (item: T) => boolean;
}

// Distância (px) do fim da lista para disparar carregarMais() por
// rolagem - suficiente para carregar antes do usuário bater no fundo de
// verdade, sem ser tão cedo a ponto de carregar a lista inteira de uma
// vez em telas altas.
const LIMIAR_ROLAGEM_PX = 48;

export function DropdownBuscaPaginada<T>({
  busca,
  valorSelecionado,
  aoSelecionar,
  aoLimparSelecao,
  obterId,
  obterTextoExibicao,
  renderItem,
  placeholder = "Buscar",
  mensagemVazio = "Nenhum resultado encontrado.",
  ariaLabel,
  itemDesabilitado,
}: DropdownBuscaPaginadaProps<T>) {
  const { termo, setTermo, itens, carregando, carregandoMais, erro, temMais, carregarMais } = busca;

  const [aberto, setAberto] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (valorSelecionado) {
      setTermo(obterTextoExibicao(valorSelecionado));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorSelecionado]);

  useEffect(() => {
    function aoClicarFora(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  // Índice ativo "bruto" (setado só pelo teclado/mouse) pode apontar
  // além do fim depois que a lista encolhe (ex.: busca nova) - em vez
  // de corrigir via efeito (setState síncrono dentro de useEffect), o
  // valor exibido é sempre este, derivado no próprio render. -1
  // ("nada em destaque ainda") É PRESERVADO aqui, nunca promovido para
  // 0 - um Math.max(indiceAtivo, 0) ingênuo faria o primeiro ArrowDown
  // pular direto para o segundo item (bug real, encontrado no
  // checkpoint E2E: 3x ArrowDown ativava o item de índice 3, não 2).
  const indiceAtivoClamped =
    itens.length === 0 || indiceAtivo < 0 ? -1 : Math.min(indiceAtivo, itens.length - 1);

  function idOpcao(indice: number): string {
    return `${listboxId}-opcao-${indice}`;
  }

  function selecionar(item: T) {
    aoSelecionar(item);
    setAberto(false);
    setIndiceAtivo(-1);
  }

  function aoRolar() {
    const lista = listaRef.current;
    if (!lista || !temMais || carregando || carregandoMais) return;
    const distanciaAteFim = lista.scrollHeight - lista.scrollTop - lista.clientHeight;
    if (distanciaAteFim <= LIMIAR_ROLAGEM_PX) {
      carregarMais();
    }
  }

  function rolarParaItemAtivo(indice: number) {
    const elemento = document.getElementById(idOpcao(indice));
    elemento?.scrollIntoView({ block: "nearest" });
  }

  function aoTeclarNoInput(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!aberto) {
        setAberto(true);
        return;
      }
      const proximo = proximoIndiceParaBaixo(itens, indiceAtivoClamped, itemDesabilitado);
      if (proximo === -1) {
        // Não há item habilitado daqui até o fim da página carregada -
        // se houver mais páginas, carrega automaticamente antes de
        // tentar avançar mais, cobrindo a lista inteira por teclado
        // (inclusive quando a página inteira está desabilitada).
        if (temMais && !carregando && !carregandoMais) {
          carregarMais();
        }
        return;
      }
      setIndiceAtivo(proximo);
      rolarParaItemAtivo(proximo);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const anterior = proximoIndiceParaCima(itens, indiceAtivoClamped, itemDesabilitado);
      if (anterior === -1) return; // nada habilitado acima - mantém a seleção atual
      setIndiceAtivo(anterior);
      rolarParaItemAtivo(anterior);
      return;
    }

    if (event.key === "Enter") {
      if (
        indiceAtivoClamped >= 0 &&
        indiceAtivoClamped < itens.length &&
        !itemDesabilitado?.(itens[indiceAtivoClamped])
      ) {
        event.preventDefault();
        selecionar(itens[indiceAtivoClamped]);
      }
      return;
    }

    if (event.key === "Escape") {
      setAberto(false);
      setIndiceAtivo(-1);
    }
  }

  const mostrarDropdown = aberto && !valorSelecionado;
  const activedescendant =
    indiceAtivoClamped >= 0 && indiceAtivoClamped < itens.length ? idOpcao(indiceAtivoClamped) : undefined;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={mostrarDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activedescendant}
        aria-label={ariaLabel}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        value={termo}
        onChange={(event) => {
          setTermo(event.target.value);
          setAberto(true);
          setIndiceAtivo(-1);
          if (valorSelecionado) {
            aoLimparSelecao();
          }
        }}
        onFocus={() => setAberto(true)}
        onKeyDown={aoTeclarNoInput}
        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />

      {mostrarDropdown ? (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-app-card shadow-lg">
          <ul
            ref={listaRef}
            role="listbox"
            id={listboxId}
            onScroll={aoRolar}
            className="max-h-64 overflow-y-auto py-1"
          >
            {itens.map((item, indice) => {
              const desabilitado = itemDesabilitado?.(item) ?? false;
              return (
                <li
                  key={obterId(item)}
                  id={idOpcao(indice)}
                  role="option"
                  aria-selected={indice === indiceAtivoClamped}
                  aria-disabled={desabilitado}
                  onMouseEnter={() => !desabilitado && setIndiceAtivo(indice)}
                  onClick={() => !desabilitado && selecionar(item)}
                  className={
                    desabilitado
                      ? "cursor-not-allowed px-3 py-2 text-sm text-slate-400"
                      : indice === indiceAtivoClamped
                        ? "cursor-pointer bg-blue-50 px-3 py-2 text-sm text-blue-900"
                        : "cursor-pointer px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  }
                >
                  {renderItem(item, indice === indiceAtivoClamped)}
                </li>
              );
            })}

            {itens.length === 0 && !carregando ? (
              <li className="px-3 py-2 text-sm text-slate-400" role="presentation">
                {erro ?? mensagemVazio}
              </li>
            ) : null}
          </ul>

          <div className="border-t border-slate-100 px-3 py-2">
            {carregando ? (
              <p className="text-center text-sm text-slate-400">Carregando...</p>
            ) : erro && itens.length > 0 ? (
              <p className="text-center text-xs text-rose-600">{erro}</p>
            ) : temMais ? (
              <button
                type="button"
                onClick={carregarMais}
                disabled={carregandoMais}
                aria-label="Carregar mais resultados"
                className="w-full rounded-md py-1.5 text-center text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {carregandoMais ? "Carregando mais..." : "Carregar mais"}
              </button>
            ) : itens.length > 0 ? (
              <p className="text-center text-xs text-slate-400">Fim da lista.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
