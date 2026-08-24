"use client";

import { useState } from "react";
import type {
  NovaRevisaoInput,
  ProductRevisionStatus,
  ResultadoAdicionarRevisao,
} from "../types";
import { Button } from "@/modules/shared/ui/Button";

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (input: NovaRevisaoInput) => Promise<ResultadoAdicionarRevisao>;
};

const situacoes: { value: ProductRevisionStatus; label: string }[] = [
  { value: "vigente", label: "Vigente" },
  { value: "anterior", label: "Anterior" },
];

export function RevisaoModal({ open, onClose, onAdd }: Props) {
  const [codigoRevisao, setCodigoRevisao] = useState("");
  const [situacao, setSituacao] = useState<ProductRevisionStatus>("vigente");
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  function limparEFechar() {
    setCodigoRevisao("");
    setSituacao("vigente");
    setNomeArquivo(null);
    setErro(null);
    onClose();
  }

  async function handleAdicionar() {
    if (!codigoRevisao.trim()) {
      return;
    }

    setSalvando(true);
    setErro(null);

    const resultado = await onAdd({
      codigoRevisao: codigoRevisao.trim(),
      aprovarVigente: situacao === "vigente",
      anexoNomeArquivo: nomeArquivo,
    });

    setSalvando(false);

    if (resultado.status === "erro") {
      setErro(resultado.mensagem);
      return;
    }

    limparEFechar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-border bg-surface shadow-xl">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 className="text-lg font-semibold text-text-primary">
            Adicionar Revisão
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Registre uma nova revisão técnica do produto.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4">
            <Field
              label="Código da Revisão"
              value={codigoRevisao}
              onChange={setCodigoRevisao}
            />
            <SelectField
              label="Situação"
              value={situacao}
              onChange={(value) =>
                setSituacao(value as ProductRevisionStatus)
              }
              options={situacoes}
            />
            {situacao === "vigente" ? (
              <p className="-mt-2 text-xs text-text-secondary">
                Ao aprovar esta revisão como vigente, a revisão vigente
                atual (se houver) será encerrada automaticamente.
              </p>
            ) : null}
            <ReadOnlyField
              label="Custo Calculado"
              value="Calculado automaticamente a partir do roteiro"
            />
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                Anexo do Desenho Técnico
              </label>
              <input
                type="file"
                onChange={(event) =>
                  setNomeArquivo(event.target.files?.[0]?.name ?? null)
                }
                className="block w-full text-sm text-text-secondary file:mr-3 file:h-9 file:rounded-md file:border file:border-border file:bg-surface-elevated file:px-3 file:text-sm file:font-semibold file:text-text-primary hover:file:bg-border-subtle"
              />
              <p className="mt-1.5 text-xs text-text-secondary">
                {nomeArquivo
                  ? nomeArquivo
                  : "O anexo fica vinculado ao produto, não a esta revisão específica."}
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
          <Button onClick={handleAdicionar} disabled={!codigoRevisao.trim() || salvando}>
            {salvando ? "Adicionando..." : "Adicionar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
        {label}
      </label>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
      />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-text-secondary">
        {label}
      </span>

      <div className="flex h-10 items-center rounded-md border border-border-subtle bg-border-subtle px-3 text-sm font-medium text-text-disabled">
        {value}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none transition focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
