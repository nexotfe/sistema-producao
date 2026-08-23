"use client";
// Autocomplete de matéria-prima do Roteiro - wrapper fino: monta a
// busca paginada específica de matéria-prima (buscarMateriasPrimas.ts)
// e delega toda a lógica de paginação/concorrência (useBuscaPaginada) e
// toda a apresentação/acessibilidade (DropdownBuscaPaginada) para os
// componentes genéricos e reutilizáveis de src/modules/shared - o mesmo
// par (hook + dropdown) pode ser reaproveitado por um autocomplete de
// Produto/Subconjunto futuro, só trocando a função de busca e o
// renderItem.
//
// Duplicidade permitida de propósito (decisão de negócio confirmada):
// o mesmo material pode aparecer em várias linhas do roteiro, com
// dimensões/quantidades/observações diferentes - este componente nunca
// filtra a lista contra os materiais já vinculados.
import { useBuscaPaginada } from "@/modules/shared/hooks/useBuscaPaginada";
import { DropdownBuscaPaginada } from "@/modules/shared/components/DropdownBuscaPaginada";
import { buscarPaginaMateriasPrimas, type MateriaPrimaResumo } from "../lib/buscarMateriasPrimas";

export type { MateriaPrimaResumo };

type MateriaPrimaSearchInputProps = {
  value: MateriaPrimaResumo | null;
  onChange: (materiaPrima: MateriaPrimaResumo | null) => void;
  placeholder?: string;
};

export function MateriaPrimaSearchInput({
  value,
  onChange,
  placeholder = "Buscar matéria-prima",
}: MateriaPrimaSearchInputProps) {
  const busca = useBuscaPaginada<MateriaPrimaResumo>({
    buscarPagina: buscarPaginaMateriasPrimas,
    obterId: (item) => item.id,
  });

  return (
    <DropdownBuscaPaginada
      busca={busca}
      valorSelecionado={value}
      aoSelecionar={onChange}
      aoLimparSelecao={() => onChange(null)}
      obterId={(item) => item.id}
      obterTextoExibicao={(item) => item.descricao}
      placeholder={placeholder}
      mensagemVazio="Nenhuma matéria-prima encontrada."
      ariaLabel={placeholder}
      renderItem={(item) => (
        <>
          {item.descricao}
          {item.codigo ? (
            <span className="block text-xs text-text-disabled">{item.codigo}</span>
          ) : null}
        </>
      )}
    />
  );
}
