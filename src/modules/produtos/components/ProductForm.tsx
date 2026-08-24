"use client";

import Link from "next/link";
import { useState } from "react";
import { RevisaoModal } from "./RevisaoModal";
import { AjustarEstoqueModal } from "./AjustarEstoqueModal";
import { Button, buttonClassName } from "@/modules/shared/ui/Button";
import type {
  EstoqueInfo,
  NovaRevisaoInput,
  ProductFormValues,
  ProductRevision,
  ResultadoAdicionarRevisao,
  ResultadoAjusteEstoque,
} from "../types";

type ProductFormProps = {
  values: ProductFormValues;
  onChange: <K extends keyof ProductFormValues>(
    key: K,
    value: ProductFormValues[K],
  ) => void;
  onAdicionarRevisao: (
    input: NovaRevisaoInput,
  ) => Promise<ResultadoAdicionarRevisao>;
  valorFormatado?: string;
  estoque?: EstoqueInfo | null;
  onAjustarEstoque?: (
    saldoReal: number,
    justificativa: string,
  ) => Promise<ResultadoAjusteEstoque>;
};

// Valores exatos do CHECK itens_industriais_tipo_item_check (remoto real).
const tiposItem = [
  { value: "produto acabado", label: "Produto Acabado" },
  { value: "semiacabado", label: "Semiacabado" },
  { value: "materia-prima", label: "Matéria-Prima" },
  { value: "material consumo", label: "Material de Consumo" },
  { value: "ferramenta", label: "Ferramenta" },
  { value: "servico", label: "Serviço" },
];

// Valores exatos do CHECK itens_industriais_unidade_check (remoto real).
const unidadesProduto = [
  { value: "peca", label: "Peça" },
  { value: "conjunto", label: "Conjunto" },
  { value: "kg", label: "Kg" },
  { value: "metro", label: "Metro" },
  { value: "unidade", label: "Unidade" },
  { value: "litro", label: "Litro" },
  { value: "pacote", label: "Pacote" },
];

export function ProductForm({
  values,
  onChange,
  onAdicionarRevisao,
  valorFormatado,
  estoque,
  onAjustarEstoque,
}: ProductFormProps) {
  const [modalRevisaoAberto, setModalRevisaoAberto] = useState(false);
  const [modalEstoqueAberto, setModalEstoqueAberto] = useState(false);

  return (
    <section className="flex flex-col gap-5">
      <Card titulo="Identificação">
        <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
          <Field
            label="Descrição"
            value={values.description}
            onChange={(value) => onChange("description", value)}
          />
          <Field
            label="Código"
            value={values.code}
            onChange={(value) => onChange("code", value)}
          />
          <SelectField
            label="Tipo"
            value={values.tipoItem}
            onChange={(value) => onChange("tipoItem", value)}
            options={tiposItem}
          />
          <SelectField
            label="UN"
            value={values.unit}
            onChange={(value) => onChange("unit", value)}
            options={unidadesProduto}
          />
          <ReadOnlyField
            label="Valor de Venda"
            value={valorFormatado || "Aguardando roteiro"}
          />
          <Field
            label="NCM"
            value={values.ncm}
            onChange={(value) => onChange("ncm", value)}
          />
          <SelectField
            label="Status"
            value={values.active ? "Ativo" : "Inativo"}
            onChange={(value) => onChange("active", value === "Ativo")}
            options={[
              { value: "Ativo", label: "Ativo" },
              { value: "Inativo", label: "Inativo" },
            ]}
          />
        </div>
      </Card>

      <div className="flex flex-col gap-3 rounded-md border border-border bg-surface px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <ReadOnlyField
            label="Roteiro Vigente"
            value={values.roteiroVigente || "Nenhum roteiro vinculado"}
          />
        </div>

        {values.code ? (
          <Link
            href={`/roteiros/${encodeURIComponent(values.code)}`}
            className={buttonClassName("primary")}
          >
            {values.roteiroVigente ? "Abrir Roteiro" : "Criar Roteiro"}
          </Link>
        ) : (
          <span
            title="Salve o produto antes de abrir o roteiro"
            className="inline-flex h-10 cursor-not-allowed items-center justify-center rounded-md bg-border px-4 text-sm font-semibold text-text-secondary"
          >
            Criar Roteiro
          </span>
        )}
      </div>

      <Card titulo="Estoque">
        {onAjustarEstoque ? (
          <div className="flex items-center justify-end border-b border-border-subtle px-4 py-3">
            <button
              type="button"
              onClick={() => setModalEstoqueAberto(true)}
              className="h-9 rounded-md border border-border px-3 text-xs font-semibold text-text-primary transition hover:bg-border-subtle"
            >
              Ajustar Estoque
            </button>
          </div>
        ) : null}
        <div className="grid gap-4 px-4 py-4 md:grid-cols-2 xl:grid-cols-4">
          <ReadOnlyField
            label="Saldo Atual"
            value={formatarNumero(estoque?.saldoDisponivel)}
          />
          <ReadOnlyField
            label="Reservado"
            value={formatarNumero(estoque?.saldoReservado)}
          />
          <ReadOnlyField
            label="Disponível"
            value={formatarNumero(estoque?.saldoLivre)}
          />
          <ReadOnlyField
            label="Última Movimentação"
            value={formatarUltimaMovimentacao(estoque)}
          />
        </div>
      </Card>

      <Card titulo="Revisões">
        <div className="border-b border-border-subtle px-4 py-3">
          <div className="flex justify-end">
            <Button onClick={() => setModalRevisaoAberto(true)}>
              Adicionar Revisão
            </Button>
          </div>
        </div>
        <RevisoesTable revisoes={values.revisions} />
      </Card>

      <Card titulo="Observações">
        <div className="px-4 py-4">
          <TextareaField
            label="Observações"
            rows={5}
            value={values.notes}
            onChange={(value) => onChange("notes", value)}
          />
        </div>
      </Card>

      <RevisaoModal
        open={modalRevisaoAberto}
        onClose={() => setModalRevisaoAberto(false)}
        onAdd={onAdicionarRevisao}
      />

      {onAjustarEstoque ? (
        <AjustarEstoqueModal
          open={modalEstoqueAberto}
          onClose={() => setModalEstoqueAberto(false)}
          onAjustar={onAjustarEstoque}
          saldoAtual={estoque?.saldoDisponivel ?? 0}
        />
      ) : null}
    </section>
  );
}

function formatarNumero(value: number | undefined) {
  return (value ?? 0).toLocaleString("pt-BR");
}

const rotulosMovimento: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  reserva: "Reserva",
  liberacao_reserva: "Liberação de reserva",
  ajuste: "Ajuste",
  producao: "Produção",
};

function formatarUltimaMovimentacao(estoque: EstoqueInfo | null | undefined) {
  if (!estoque?.ultimaMovimentacao) {
    return "—";
  }

  const { tipoMovimento, criadaEm } = estoque.ultimaMovimentacao;
  const rotulo = rotulosMovimento[tipoMovimento] ?? tipoMovimento;
  const data = new Date(criadaEm).toLocaleString("pt-BR");

  return `${rotulo} em ${data}`;
}

function RevisoesTable({ revisoes }: { revisoes: ProductRevision[] }) {
  if (revisoes.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-text-secondary">
        Nenhuma revisão cadastrada
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-border-subtle bg-border-subtle text-xs font-semibold uppercase tracking-[0.14em] text-text-disabled">
          <tr>
            <th className="px-4 py-3">Revisão</th>
            <th className="px-4 py-3">Situação</th>
            <th className="px-4 py-3">Roteiro Vinculado</th>
            <th className="px-4 py-3">Custo Calculado</th>
            <th className="px-4 py-3">Desenho Técnico</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {revisoes.map((revisao) => (
            <tr key={revisao.id} className="transition hover:bg-border-subtle">
              <td className="px-4 py-3 font-semibold text-text-primary">
                {revisao.codigoRevisao}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                    revisao.situacao === "vigente"
                      ? "bg-status-success-bg text-status-success-text"
                      : "bg-border-subtle text-text-secondary"
                  }`}
                >
                  {revisao.situacao === "vigente" ? "Vigente" : "Anterior"}
                </span>
              </td>
              <td className="px-4 py-3 text-text-primary">
                {revisao.roteiroVinculado}
              </td>
              <td className="px-4 py-3 text-text-primary">
                {revisao.custoCalculado > 0
                  ? revisao.custoCalculado.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })
                  : "Aguardando roteiro"}
              </td>
              <td className="px-4 py-3 text-text-primary">
                {revisao.anexoDesenho ?? "Sem anexo"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-surface transition hover:border-action-primary-hover">
      <div className="border-b border-border-subtle px-4 py-3">
        <h2 className="text-sm font-bold text-text-primary">{titulo}</h2>
      </div>

      {children}
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

function TextareaField({
  label,
  rows,
  value,
  onChange,
}: {
  label: string;
  rows: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
        {label}
      </label>

      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-md border border-border bg-surface-elevated px-3 py-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
      />
    </div>
  );
}
