"use client";

import { useState } from "react";
import { Button } from "@/modules/shared/ui/Button";

export type ItemCustoParaEditar = {
  id: string;
  pn: string;
  descricao: string;
  custoUnitario: number;
};

type ResultadoEditarCusto =
  | { status: "ok" }
  | { status: "erro"; mensagem: string };

type Props = {
  item: ItemCustoParaEditar | null;
  onClose: () => void;
  onSave: (id: string, custo: number) => Promise<ResultadoEditarCusto>;
};

export function EditarCustoItemModal({ item, onClose, onSave }: Props) {
  if (!item) {
    return null;
  }

  return (
    <EditarCustoItemModalConteudo
      key={`${item.id}:${item.custoUnitario}`}
      item={item}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

type ConteudoProps = {
  item: ItemCustoParaEditar;
  onClose: () => void;
  onSave: Props["onSave"];
};

function EditarCustoItemModalConteudo({ item, onClose, onSave }: ConteudoProps) {
  const [custo, setCusto] = useState(String(item.custoUnitario));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function limparEFechar() {
    setErro(null);
    onClose();
  }

  async function handleSalvar() {
    const custoNumerico = Number(custo.replace(",", "."));

    if (!Number.isFinite(custoNumerico) || custoNumerico < 0) {
      setErro("Informe um custo numérico maior ou igual a zero.");
      return;
    }

    setSalvando(true);
    setErro(null);

    const resultado = await onSave(item.id, custoNumerico);

    setSalvando(false);

    if (resultado.status === "erro") {
      setErro(resultado.mensagem);
      return;
    }

    limparEFechar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-md border border-border bg-surface shadow-xl">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 className="text-lg font-semibold text-text-primary">
            Editar Custo Congelado
          </h2>
        </div>

        <div className="px-5 py-4">
          <div className="grid gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                Item
              </label>
              <div className="rounded-md border border-border-subtle bg-border-subtle px-3 py-2 text-sm text-text-primary">
                <span className="font-semibold">{item.pn}</span> —{" "}
                {item.descricao}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                Custo Unitário
              </label>
              <input
                value={custo}
                onChange={(event) => setCusto(event.target.value)}
                inputMode="decimal"
                autoFocus
                className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
              />
              <p className="mt-1.5 text-xs text-text-secondary">
                Este item já está com o custo congelado (não recalcula mais
                pelo catálogo de matéria-prima). Alterar aqui sobrescreve
                manualmente só esta linha.
              </p>
            </div>

            {erro ? (
              <p className="text-sm font-medium text-status-danger-text">{erro}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-4">
          <Button variant="secondary" onClick={limparEFechar}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
