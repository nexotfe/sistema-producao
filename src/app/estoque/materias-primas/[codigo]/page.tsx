"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { use, useState } from "react";
import { FornecedorSelectionModal } from "@/modules/materias-primas/components/FornecedorSelectionModal";
import { useMateriaPrimaForm } from "@/modules/materias-primas/hooks/useMateriaPrimaForm";
import { useColumnConfig, type ColumnConfigItem } from "@/hooks/useColumnConfig";
import {
  MATERIAS_PRIMAS_COLUNAS_CHAVE,
  materiasPrimasColunasPadrao,
  campoLabel,
  campoVisivel,
} from "@/modules/materias-primas/columnConfig";
import type {
  FornecedorMateriaPrima,
  MateriaPrimaForm,
} from "@/modules/materias-primas/types";

const familiasMateriais = [
  "Aço carbono",
  "Aço inox",
  "Alumínio",
  "Chapas",
  "Polímeros",
  "Consumíveis",
];

const unidadesMateriais = ["kg", "metro", "barra", "chapa", "peça", "litro"];

type Props = {
  params: Promise<{
    codigo: string;
  }>;
};

export default function CadastroMateriaPrimaPage({ params }: Props) {
  const { codigo } = use(params);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [modalFornecedoresAberto, setModalFornecedoresAberto] = useState(
    searchParams.get("fornecedorModal") === "1",
  );
  const {
    form,
    atualizarCampo,
    fornecedoresAssociados,
    adicionarFornecedor,
    loading,
    salvando,
    erro,
    salvarMateriaPrima,
  } = useMateriaPrimaForm({ codigo: decodeURIComponent(codigo) });
  const { getColumn } = useColumnConfig(
    MATERIAS_PRIMAS_COLUNAS_CHAVE,
    materiasPrimasColunasPadrao,
  );

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Header salvando={salvando} onSalvar={salvarMateriaPrima} />

        {loading ? (
          <p className="text-sm text-slate-500">Carregando matéria-prima...</p>
        ) : (
          <FormularioMateriaPrima
            form={form}
            atualizarCampo={atualizarCampo}
            fornecedoresAssociados={fornecedoresAssociados}
            abrirModalFornecedores={() => setModalFornecedoresAberto(true)}
            erro={erro}
            getColumn={getColumn}
          />
        )}
      </div>

      <FornecedorSelectionModal
        open={modalFornecedoresAberto}
        onClose={() => setModalFornecedoresAberto(false)}
        onAdd={adicionarFornecedor}
        returnUrl={`${pathname}?fornecedorModal=1`}
      />
    </main>
  );
}

function FormularioMateriaPrima({
  form,
  atualizarCampo,
  fornecedoresAssociados,
  abrirModalFornecedores,
  erro,
  getColumn,
}: {
  form: MateriaPrimaForm;
  atualizarCampo: <K extends keyof MateriaPrimaForm>(
    campo: K,
    valor: MateriaPrimaForm[K],
  ) => void;
  fornecedoresAssociados: FornecedorMateriaPrima[];
  abrirModalFornecedores: () => void;
  erro: string | null;
  getColumn: (field: string) => ColumnConfigItem | undefined;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card titulo="Identificação">
          <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
            {campoVisivel(getColumn, "codigo") && (
              <Field
                label={campoLabel(getColumn, "codigo", "Código")}
                value={form.codigo}
                onChange={(value) => atualizarCampo("codigo", value)}
              />
            )}
            {campoVisivel(getColumn, "familia") && (
              <SelectField
                label={campoLabel(getColumn, "familia", "Família")}
                value={form.familia}
                onChange={(value) => atualizarCampo("familia", value)}
                options={familiasMateriais}
              />
            )}
            {campoVisivel(getColumn, "unidade") && (
              <SelectField
                label={campoLabel(getColumn, "unidade", "Unidade")}
                value={form.unidade}
                onChange={(value) => atualizarCampo("unidade", value)}
                options={unidadesMateriais}
              />
            )}
            {campoVisivel(getColumn, "status") && (
              <SelectField
                label={campoLabel(getColumn, "status", "Status")}
                value={form.ativo ? "Ativo" : "Inativo"}
                onChange={(value) => atualizarCampo("ativo", value === "Ativo")}
                options={["Ativo", "Inativo"]}
              />
            )}
            {campoVisivel(getColumn, "descricao") && (
              <div className="md:col-span-2">
                <Field
                  label={campoLabel(getColumn, "descricao", "Descrição")}
                  value={form.descricao}
                  onChange={(value) => atualizarCampo("descricao", value)}
                />
              </div>
            )}
            {campoVisivel(getColumn, "bitola") && (
              <Field
                label={campoLabel(getColumn, "bitola", "Bitola")}
                value={form.bitola}
                onChange={(value) => atualizarCampo("bitola", value)}
              />
            )}
            <Field
              label="Dimensão"
              value={form.dimensao}
              onChange={(value) => atualizarCampo("dimensao", value)}
            />
            <Field
              label="NCM"
              value={form.ncm}
              onChange={(value) => atualizarCampo("ncm", value)}
            />
            {campoVisivel(getColumn, "endereco") && (
              <Field
                label={campoLabel(getColumn, "endereco", "Endereço")}
                value={form.endereco}
                onChange={(value) => atualizarCampo("endereco", value)}
              />
            )}
          </div>
        </Card>

        <Card titulo="Informações Técnicas">
          <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
            <Field
              label="Fabricante"
              value={form.fabricante}
              onChange={(value) => atualizarCampo("fabricante", value)}
            />
            <Field
              label="Marca"
              value={form.marca}
              onChange={(value) => atualizarCampo("marca", value)}
            />
            <div className="md:col-span-2">
              <Field
                label="Material / Especificação"
                value={form.material_especificacao}
                onChange={(value) =>
                  atualizarCampo("material_especificacao", value)
                }
              />
            </div>
            <Field
              label="Norma"
              value={form.norma}
              onChange={(value) => atualizarCampo("norma", value)}
            />
            <Field
              label="Peso Específico"
              value={form.peso_especifico}
              onChange={(value) => atualizarCampo("peso_especifico", value)}
            />
            <div className="md:col-span-2">
              <TextareaField
                label="Observações Técnicas"
                rows={3}
                value={form.observacoes_tecnicas}
                onChange={(value) =>
                  atualizarCampo("observacoes_tecnicas", value)
                }
              />
            </div>
          </div>
        </Card>
      </div>

      <Card titulo="Estoque">
        <div className="grid gap-4 px-4 py-4 md:grid-cols-2 xl:grid-cols-4">
          <ReadOnlyField label="Saldo Atual" value="0" />
          <ReadOnlyField label="Reservado" value="0" />
          <ReadOnlyField label="Disponível" value="0" />
          <ReadOnlyField label="Última Movimentação" value="—" />
        </div>
      </Card>

      <Card titulo="Fornecedores">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={abrirModalFornecedores}
              className="h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
            >
              Adicionar Fornecedor
            </button>
          </div>
        </div>
        <FornecedoresAssociadosTable fornecedores={fornecedoresAssociados} />
      </Card>

      <Card titulo="Observações">
        <div className="px-4 py-4">
          <TextareaField
            label="Observações"
            rows={5}
            value={form.observacoes}
            onChange={(value) => atualizarCampo("observacoes", value)}
          />
        </div>
      </Card>

      {erro && <p className="text-sm font-medium text-red-600">{erro}</p>}
    </section>
  );
}

function FornecedoresAssociadosTable({
  fornecedores,
}: {
  fornecedores: FornecedorMateriaPrima[];
}) {
  if (fornecedores.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-slate-500">
        Nenhum fornecedor cadastrado.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          <tr>
            <th className="px-4 py-3">Fornecedor</th>
            <th className="px-4 py-3">Código</th>
            <th className="px-4 py-3">Moeda</th>
            <th className="px-4 py-3">Preferencial</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {fornecedores.map((fornecedor) => (
            <tr key={fornecedor.id} className="transition hover:bg-slate-50">
              <td className="px-4 py-3">
                <p className="font-semibold text-slate-900">
                  {fornecedor.nome_fantasia ||
                    fornecedor.nome ||
                    "Fornecedor sem nome"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {fornecedor.cnpj || "CNPJ não informado"}
                </p>
              </td>
              <td className="px-4 py-3 text-slate-700">
                {fornecedor.codigo_fornecedor || "—"}
              </td>
              <td className="px-4 py-3 text-slate-700">{fornecedor.moeda}</td>
              <td className="px-4 py-3 text-slate-700">
                {fornecedor.preferencial ? "Sim" : "Não"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Header({
  salvando,
  onSalvar,
}: {
  salvando: boolean;
  onSalvar: () => void;
}) {
  return (
    <header className="rounded-lg border border-slate-200 bg-white px-5 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
            LOGO
          </div>

          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              Matéria-Prima
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Cadastro da matéria-prima
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <span className="whitespace-nowrap text-sm font-medium text-slate-500">
            Nome do usuário
          </span>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/estoque/materias-primas"
              className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Voltar
            </Link>
            <Link
              href="/central"
              className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Início
            </Link>
            <button
              type="button"
              onClick={onSalvar}
              disabled={salvando}
              className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </header>
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
    <div className="rounded-md border border-slate-200 bg-white transition hover:border-blue-700">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-950">{titulo}</h2>
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

      <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800">
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
  options: string[];
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
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
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
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>

      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-md border border-slate-300 px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}
