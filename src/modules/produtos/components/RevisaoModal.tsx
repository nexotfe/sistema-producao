"use client";

import { useState } from "react";
import type {
  NovaRevisaoInput,
  ProductRevisionStatus,
  ResultadoAdicionarRevisao,
} from "../types";

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
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">
            Adicionar Revisão
          </h2>
          <p className="mt-1 text-sm text-slate-500">
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
              <p className="-mt-2 text-xs text-slate-500">
                Ao aprovar esta revisão como vigente, a revisão vigente
                atual (se houver) será encerrada automaticamente.
              </p>
            ) : null}
            <ReadOnlyField
              label="Custo Calculado"
              value="Calculado automaticamente a partir do roteiro"
            />
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Anexo do Desenho Técnico
              </label>
              <input
                type="file"
                onChange={(event) =>
                  setNomeArquivo(event.target.files?.[0]?.name ?? null)
                }
                className="block w-full text-sm text-slate-600 file:mr-3 file:h-9 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-50"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                {nomeArquivo
                  ? nomeArquivo
                  : "O anexo fica vinculado ao produto, não a esta revisão específica."}
              </p>
            </div>

            {erro ? (
              <p className="text-sm font-medium text-red-600">{erro}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={limparEFechar}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleAdicionar}
            disabled={!codigoRevisao.trim() || salvando}
            className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {salvando ? "Adicionando..." : "Adicionar"}
          </button>
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
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </span>

      <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-500">
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
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
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
