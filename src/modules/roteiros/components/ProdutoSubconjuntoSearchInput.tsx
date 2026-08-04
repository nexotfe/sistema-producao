"use client";
// Autocomplete de Produto/Subconjunto do Roteiro (modal "Montar
// Subconjunto") - mesmo par reutilizável (useBuscaPaginada +
// DropdownBuscaPaginada) de MateriaPrimaSearchInput.tsx, só trocando a
// função de busca e o renderItem; nenhuma lógica de paginação,
// concorrência ou navegação por teclado é duplicada aqui.
//
// Produto sem BOM cadastrado aparece na lista (identificado como "Sem
// roteiro cadastrado"), mas não pode ser selecionado - itemDesabilitado
// barra tanto o teclado quanto o clique/mouse; o servidor (gatilho
// trg_bom_itens_validar_ciclo) também rejeita, então esta é uma UX de
// conveniência, não a proteção de integridade.
//
// Duplicidade permitida de propósito (decisão de negócio confirmada):
// o mesmo subconjunto pode aparecer em várias linhas do roteiro, com
// quantidade/observações diferentes - nunca filtra contra os
// subconjuntos já vinculados.
import { useCallback, useMemo } from "react";
import { useBuscaPaginada } from "@/modules/shared/hooks/useBuscaPaginada";
import { DropdownBuscaPaginada } from "@/modules/shared/components/DropdownBuscaPaginada";
import {
  criarBuscarPaginaProdutosSubconjunto,
  type ProdutoSubconjuntoResumo,
} from "../lib/buscarProdutosSubconjunto";

export type { ProdutoSubconjuntoResumo };

type ProdutoSubconjuntoSearchInputProps = {
  value: ProdutoSubconjuntoResumo | null;
  onChange: (produto: ProdutoSubconjuntoResumo | null) => void;
  produtoAtualId: string;
  placeholder?: string;
};

export function ProdutoSubconjuntoSearchInput({
  value,
  onChange,
  produtoAtualId,
  placeholder = "Buscar produto",
}: ProdutoSubconjuntoSearchInputProps) {
  // Memoizado por produtoAtualId - uma identidade nova a cada render
  // reiniciaria a busca (useBuscaPaginada recebe a função em
  // useCallback/deps e a trataria como "mudou").
  const buscarPagina = useMemo(
    () => criarBuscarPaginaProdutosSubconjunto(produtoAtualId),
    [produtoAtualId],
  );
  const obterId = useCallback((item: ProdutoSubconjuntoResumo) => item.id, []);

  const busca = useBuscaPaginada<ProdutoSubconjuntoResumo>({
    buscarPagina,
    obterId,
  });

  return (
    <DropdownBuscaPaginada
      busca={busca}
      valorSelecionado={value}
      aoSelecionar={onChange}
      aoLimparSelecao={() => onChange(null)}
      obterId={obterId}
      obterTextoExibicao={(item) => item.descricao}
      itemDesabilitado={(item) => !item.temBom}
      placeholder={placeholder}
      mensagemVazio="Nenhum produto encontrado."
      ariaLabel={placeholder}
      renderItem={(item) => (
        <>
          {item.codigo} — {item.descricao}
          {!item.temBom ? (
            <span className="block text-xs text-amber-600">Sem roteiro cadastrado</span>
          ) : null}
        </>
      )}
    />
  );
}
