"use client";

import { useState } from "react";
import Link from "next/link";
import { AdicionarMaterialModal } from "./AdicionarMaterialModal";
import { AdicionarSubconjuntoModal } from "./AdicionarSubconjuntoModal";
import { AdicionarOperacaoModal } from "./AdicionarOperacaoModal";
import { AdicionarServicoTerceiroModal } from "./AdicionarServicoTerceiroModal";
import { AdicionarTransporteModal } from "./AdicionarTransporteModal";
import type { ResultadoExclusao } from "@/modules/shared/data/excluirRegistro";
import type {
  Bom,
  BomItemMateriaPrima,
  BomItemSubconjunto,
  BomOperacao,
  BomServicoTerceiro,
  BomTransporte,
  CustoBom,
  NovaOperacaoInput,
  NovoBomItemInput,
  NovoServicoTerceiroInput,
  NovoSubconjuntoInput,
  NovoTransporteInput,
  OpcaoSelect,
  ResultadoOperacaoRoteiro,
} from "../types";

type RoteiroFormProps = {
  bom: Bom;

  materiais: BomItemMateriaPrima[];
  materiasPrimasDisponiveis: (OpcaoSelect & { unidade: string })[];
  onAdicionarMaterial: (
    input: NovoBomItemInput,
  ) => Promise<ResultadoOperacaoRoteiro>;
  onRemoverMaterial: (id: string) => Promise<ResultadoExclusao>;

  subconjuntos: BomItemSubconjunto[];
  produtosDisponiveis: OpcaoSelect[];
  onAdicionarSubconjunto: (
    input: NovoSubconjuntoInput,
  ) => Promise<ResultadoOperacaoRoteiro>;
  onRemoverSubconjunto: (id: string) => Promise<ResultadoExclusao>;

  operacoesEngenharia: BomOperacao[];
  operacoesProducao: BomOperacao[];
  recursosDisponiveis: OpcaoSelect[];
  onAdicionarOperacao: (
    input: NovaOperacaoInput,
  ) => Promise<ResultadoOperacaoRoteiro>;
  onRemoverOperacao: (id: string) => Promise<ResultadoExclusao>;
  proximaOrdemOperacoes: () => number;

  servicosTerceiros: BomServicoTerceiro[];
  fornecedoresDisponiveis: OpcaoSelect[];
  onAdicionarServicoTerceiro: (
    input: NovoServicoTerceiroInput,
  ) => Promise<ResultadoOperacaoRoteiro>;
  onRemoverServicoTerceiro: (id: string) => Promise<ResultadoExclusao>;

  transportes: BomTransporte[];
  onAdicionarTransporte: (
    input: NovoTransporteInput,
  ) => Promise<ResultadoOperacaoRoteiro>;
  onRemoverTransporte: (id: string) => Promise<ResultadoExclusao>;

  custo: CustoBom;
};

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mensagemErroExclusao(resultado: ResultadoExclusao): string | null {
  if (resultado.status === "sem_permissao") {
    return "Apenas administradores podem excluir registros.";
  }
  if (resultado.status === "vinculado") {
    return "Não é possível excluir - há vínculos com outro cadastro.";
  }
  if (resultado.status === "erro") {
    return resultado.mensagem;
  }
  return null;
}

export function RoteiroForm({
  bom,
  materiais,
  materiasPrimasDisponiveis,
  onAdicionarMaterial,
  onRemoverMaterial,
  subconjuntos,
  produtosDisponiveis,
  onAdicionarSubconjunto,
  onRemoverSubconjunto,
  operacoesEngenharia,
  operacoesProducao,
  recursosDisponiveis,
  onAdicionarOperacao,
  onRemoverOperacao,
  proximaOrdemOperacoes,
  servicosTerceiros,
  fornecedoresDisponiveis,
  onAdicionarServicoTerceiro,
  onRemoverServicoTerceiro,
  transportes,
  onAdicionarTransporte,
  onRemoverTransporte,
  custo,
}: RoteiroFormProps) {
  const [modalMaterialAberto, setModalMaterialAberto] = useState(false);
  const [modalSubconjuntoAberto, setModalSubconjuntoAberto] = useState(false);
  const [modalOperacaoAberto, setModalOperacaoAberto] = useState(false);
  const [modalServicoAberto, setModalServicoAberto] = useState(false);
  const [modalTransporteAberto, setModalTransporteAberto] = useState(false);

  const [erroMaterial, setErroMaterial] = useState<string | null>(null);
  const [erroSubconjunto, setErroSubconjunto] = useState<string | null>(null);
  const [erroOperacao, setErroOperacao] = useState<string | null>(null);
  const [erroServico, setErroServico] = useState<string | null>(null);
  const [erroTransporte, setErroTransporte] = useState<string | null>(null);

  async function handleRemoverMaterial(id: string) {
    if (!window.confirm("Remover esta matéria-prima do roteiro?")) return;
    setErroMaterial(null);
    const resultado = await onRemoverMaterial(id);
    setErroMaterial(mensagemErroExclusao(resultado));
  }

  async function handleRemoverSubconjunto(id: string) {
    if (!window.confirm("Remover este subconjunto do roteiro?")) return;
    setErroSubconjunto(null);
    const resultado = await onRemoverSubconjunto(id);
    setErroSubconjunto(mensagemErroExclusao(resultado));
  }

  async function handleRemoverOperacao(id: string) {
    if (!window.confirm("Remover esta operação do roteiro?")) return;
    setErroOperacao(null);
    const resultado = await onRemoverOperacao(id);
    setErroOperacao(mensagemErroExclusao(resultado));
  }

  async function handleRemoverServico(id: string) {
    if (!window.confirm("Remover este serviço de terceiro do roteiro?")) return;
    setErroServico(null);
    const resultado = await onRemoverServicoTerceiro(id);
    setErroServico(mensagemErroExclusao(resultado));
  }

  async function handleRemoverTransporte(id: string) {
    if (!window.confirm("Remover este transporte do roteiro?")) return;
    setErroTransporte(null);
    const resultado = await onRemoverTransporte(id);
    setErroTransporte(mensagemErroExclusao(resultado));
  }

  return (
    <section className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {operacoesEngenharia.length > 0 ? (
          <section className="rounded-md border border-slate-200 bg-app-card">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-bold">Engenharia</h2>
              <button
                type="button"
                onClick={() => setModalOperacaoAberto(true)}
                className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Adicionar OP
              </button>
            </div>

            <OperacoesTable
              operacoes={operacoesEngenharia}
              onRemover={handleRemoverOperacao}
            />
            {erroOperacao ? (
              <p className="px-4 py-2 text-sm font-medium text-red-600">
                {erroOperacao}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-md border border-slate-200 bg-app-card">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold">Matérias-primas</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Consumo por peça. A OF multiplica pela quantidade a fabricar.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setModalMaterialAberto(true)}
              className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Adicionar material
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Material</th>
                  <th className="px-4 py-2 font-semibold">Quantidade</th>
                  <th className="px-4 py-2 font-semibold">Unidade</th>
                  <th className="px-4 py-2 font-semibold">Custo unit.</th>
                  <th className="px-4 py-2 font-semibold">Total</th>
                  <th className="px-4 py-2 font-semibold">Observações</th>
                  <th className="px-4 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {materiais.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      Nenhuma matéria-prima cadastrada neste roteiro.
                    </td>
                  </tr>
                ) : (
                  materiais.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {item.descricao}
                        {item.dimensoes ? (
                          <p className="mt-1 text-xs text-slate-400">
                            {item.dimensoes}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {item.quantidade.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {item.unidade}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {item.custoReferencia !== null
                          ? formatarMoeda(item.custoReferencia)
                          : "Sem custo cadastrado"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {item.custoReferencia !== null
                          ? formatarMoeda(item.quantidade * item.custoReferencia)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {item.observacoes || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoverMaterial(item.id)}
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {erroMaterial ? (
            <p className="px-4 py-2 text-sm font-medium text-red-600">
              {erroMaterial}
            </p>
          ) : null}
        </section>

        <section className="rounded-md border border-slate-200 bg-app-card">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold">Operações</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Como fabricar a peça, em linguagem de operador.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setModalOperacaoAberto(true)}
              className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Adicionar OP
            </button>
          </div>

          <OperacoesTable
            operacoes={operacoesProducao}
            onRemover={handleRemoverOperacao}
          />
          {erroOperacao ? (
            <p className="px-4 py-2 text-sm font-medium text-red-600">
              {erroOperacao}
            </p>
          ) : null}
        </section>

        <section className="rounded-md border border-slate-200 bg-app-card">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold">Estrutura / Subconjuntos</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Produtos que entram como componente deste roteiro.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setModalSubconjuntoAberto(true)}
              className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Adicionar subconjunto
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Produto</th>
                  <th className="px-4 py-2 font-semibold">Quantidade</th>
                  <th className="px-4 py-2 font-semibold">Unidade</th>
                  <th className="px-4 py-2 font-semibold">Observações</th>
                  <th className="px-4 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subconjuntos.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      Nenhum subconjunto cadastrado neste roteiro.
                    </td>
                  </tr>
                ) : (
                  subconjuntos.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        <Link
                          href={`/roteiros/${encodeURIComponent(item.codigo)}`}
                          className="text-blue-700 hover:underline"
                        >
                          {item.codigo} — {item.descricao}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {item.quantidade.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {item.unidade}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {item.observacoes || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoverSubconjunto(item.id)}
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {erroSubconjunto ? (
            <p className="px-4 py-2 text-sm font-medium text-red-600">
              {erroSubconjunto}
            </p>
          ) : null}
        </section>

        <section className="rounded-md border border-slate-200 bg-app-card">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-bold">Serviços de Terceiros</h2>
            <button
              type="button"
              onClick={() => setModalServicoAberto(true)}
              className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Adicionar Serviço
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Serviço</th>
                  <th className="px-4 py-2 font-semibold">Fornecedor</th>
                  <th className="px-4 py-2 font-semibold">Prazo</th>
                  <th className="px-4 py-2 font-semibold">Valor</th>
                  <th className="px-4 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {servicosTerceiros.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      Nenhum serviço de terceiro cadastrado neste roteiro.
                    </td>
                  </tr>
                ) : (
                  servicosTerceiros.map((servico) => (
                    <tr key={servico.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {servico.descricao}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {servico.fornecedorNome ?? "Não informado"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {servico.prazoEstimadoDias !== null
                          ? `${servico.prazoEstimadoDias} dia(s)`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {servico.custoEstimado !== null
                          ? formatarMoeda(servico.custoEstimado)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoverServico(servico.id)}
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {erroServico ? (
            <p className="px-4 py-2 text-sm font-medium text-red-600">
              {erroServico}
            </p>
          ) : null}
        </section>

        <section className="rounded-md border border-slate-200 bg-app-card">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-bold">Transportes</h2>
            <button
              type="button"
              onClick={() => setModalTransporteAberto(true)}
              className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Adicionar Transporte
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Transporte</th>
                  <th className="px-4 py-2 font-semibold">Transportadora</th>
                  <th className="px-4 py-2 font-semibold">Valor</th>
                  <th className="px-4 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transportes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      Nenhum transporte cadastrado neste roteiro.
                    </td>
                  </tr>
                ) : (
                  transportes.map((transporte) => (
                    <tr key={transporte.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {transporte.descricao}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {transporte.fornecedorNome ?? "Não informado"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {transporte.custoEstimado !== null
                          ? formatarMoeda(transporte.custoEstimado)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoverTransporte(transporte.id)}
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {erroTransporte ? (
            <p className="px-4 py-2 text-sm font-medium text-red-600">
              {erroTransporte}
            </p>
          ) : null}
        </section>
      </div>

      <aside className="space-y-5">
        <section className="rounded-md border border-slate-200 bg-app-card p-4">
          <h2 className="text-sm font-bold">Resumo de Custos Industriais</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Calculado a partir das informações reais deste roteiro.
          </p>
          <div className="mt-3 divide-y divide-slate-100 text-sm">
            <div className="flex justify-between gap-4 py-2">
              <span className="text-slate-500">Matéria-prima</span>
              <span className="font-semibold text-slate-800">
                {formatarMoeda(custo.materiaPrima + custo.subconjunto)}
              </span>
            </div>
            {custo.subconjunto > 0 ? (
              <div className="flex justify-between gap-4 py-1 pl-3 text-xs text-slate-400">
                <span>↳ inclui subconjuntos</span>
                <span>{formatarMoeda(custo.subconjunto)}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 py-2">
              <span className="text-slate-500">Engenharia</span>
              <span className="font-semibold text-slate-800">
                {formatarMoeda(custo.engenharia)}
              </span>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <span className="text-slate-500">Mão de obra</span>
              <span className="font-semibold text-slate-800">
                {formatarMoeda(custo.maoDeObra)}
              </span>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <span className="text-slate-500">Terceiros</span>
              <span className="font-semibold text-slate-800">
                {formatarMoeda(custo.terceiros)}
              </span>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <span className="text-slate-500">Logística</span>
              <span className="font-semibold text-slate-800">
                {formatarMoeda(custo.logistica)}
              </span>
            </div>
            <div className="flex justify-between gap-4 pt-3">
              <span className="font-semibold text-slate-700">Total</span>
              <span className="font-bold text-slate-950">
                {formatarMoeda(custo.total)}
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-app-card p-4">
          <h2 className="text-sm font-bold">PDF técnico</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Fabricar conforme revisão presente no desenho anexado.
          </p>
        </section>

        <section className="rounded-md border border-slate-200 bg-app-card p-4">
          <h2 className="text-sm font-bold">Regra importante</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Roteiro não possui quantidade de produção. A quantidade pertence à OF.
          </p>
        </section>

        <section className="rounded-md border border-slate-200 bg-app-card p-4">
          <h2 className="text-sm font-bold">Versão do roteiro</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Versão {bom.versao} — status {bom.status}.
          </p>
        </section>
      </aside>

      <AdicionarMaterialModal
        open={modalMaterialAberto}
        onClose={() => setModalMaterialAberto(false)}
        onAdd={onAdicionarMaterial}
        materiasPrimasDisponiveis={materiasPrimasDisponiveis}
      />

      <AdicionarSubconjuntoModal
        open={modalSubconjuntoAberto}
        onClose={() => setModalSubconjuntoAberto(false)}
        onAdd={onAdicionarSubconjunto}
        produtosDisponiveis={produtosDisponiveis}
      />

      <AdicionarOperacaoModal
        open={modalOperacaoAberto}
        onClose={() => setModalOperacaoAberto(false)}
        onAdd={onAdicionarOperacao}
        recursosDisponiveis={recursosDisponiveis}
        proximaOrdem={proximaOrdemOperacoes()}
      />

      <AdicionarServicoTerceiroModal
        open={modalServicoAberto}
        onClose={() => setModalServicoAberto(false)}
        onAdd={onAdicionarServicoTerceiro}
        fornecedoresDisponiveis={fornecedoresDisponiveis}
      />

      <AdicionarTransporteModal
        open={modalTransporteAberto}
        onClose={() => setModalTransporteAberto(false)}
        onAdd={onAdicionarTransporte}
        fornecedoresDisponiveis={fornecedoresDisponiveis}
      />
    </section>
  );
}

function OperacoesTable({
  operacoes,
  onRemover,
}: {
  operacoes: BomOperacao[];
  onRemover: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-2 font-semibold">OP</th>
            <th className="px-4 py-2 font-semibold">Descrição</th>
            <th className="px-4 py-2 font-semibold">Recurso</th>
            <th className="px-4 py-2 font-semibold">Tempo (min)</th>
            <th className="px-4 py-2 font-semibold">Observações</th>
            <th className="px-4 py-2 font-semibold" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {operacoes.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                Nenhuma operação cadastrada neste roteiro.
              </td>
            </tr>
          ) : (
            operacoes.map((operacao) => (
              <tr key={operacao.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-bold">OP{operacao.ordem}</td>
                <td className="px-4 py-3 text-slate-700">{operacao.descricao}</td>
                <td className="px-4 py-3 text-slate-700">
                  {operacao.recursoNome}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {operacao.tempoEstimadoMinutos.toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {operacao.observacoes || "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onRemover(operacao.id)}
                    className="text-xs font-semibold text-red-600 hover:underline"
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
