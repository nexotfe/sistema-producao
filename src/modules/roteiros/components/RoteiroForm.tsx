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
  processando: boolean;

  materiais: BomItemMateriaPrima[];
  onAdicionarMaterial: (
    input: NovoBomItemInput,
  ) => Promise<ResultadoOperacaoRoteiro>;
  onEditarMaterial: (
    id: string,
    input: NovoBomItemInput,
  ) => Promise<ResultadoOperacaoRoteiro>;
  onRemoverMaterial: (id: string) => Promise<ResultadoExclusao>;

  subconjuntos: BomItemSubconjunto[];
  onAdicionarSubconjunto: (
    input: NovoSubconjuntoInput,
  ) => Promise<ResultadoOperacaoRoteiro>;
  onRemoverSubconjunto: (id: string) => Promise<ResultadoExclusao>;
  onTrocarVinculoSubconjunto: (
    bomItemId: string,
    novaOperacaoId: string | null,
  ) => Promise<ResultadoOperacaoRoteiro>;

  operacoesEngenharia: BomOperacao[];
  operacoesProducao: BomOperacao[];
  recursosDisponiveis: OpcaoSelect[];
  onAdicionarOperacao: (
    input: NovaOperacaoInput,
  ) => Promise<ResultadoOperacaoRoteiro>;
  onEditarOperacao: (
    id: string,
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
  processando,
  materiais,
  onAdicionarMaterial,
  onEditarMaterial,
  onRemoverMaterial,
  subconjuntos,
  onAdicionarSubconjunto,
  onRemoverSubconjunto,
  onTrocarVinculoSubconjunto,
  operacoesEngenharia,
  operacoesProducao,
  recursosDisponiveis,
  onAdicionarOperacao,
  onEditarOperacao,
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
  const [materialEditando, setMaterialEditando] =
    useState<BomItemMateriaPrima | null>(null);
  const [modalSubconjuntoAberto, setModalSubconjuntoAberto] = useState(false);
  const [modalOperacaoAberto, setModalOperacaoAberto] = useState(false);
  const [operacaoEditando, setOperacaoEditando] = useState<BomOperacao | null>(
    null,
  );
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

  function handleEditarMaterial(material: BomItemMateriaPrima) {
    setMaterialEditando(material);
    setModalMaterialAberto(true);
  }

  function handleAbrirModalMaterial() {
    setMaterialEditando(null);
    setModalMaterialAberto(true);
  }

  function handleFecharModalMaterial() {
    setModalMaterialAberto(false);
    setMaterialEditando(null);
  }

  async function handleRemoverSubconjunto(id: string) {
    if (!window.confirm("Remover este subconjunto do roteiro?")) return;
    setErroSubconjunto(null);
    const resultado = await onRemoverSubconjunto(id);
    setErroSubconjunto(mensagemErroExclusao(resultado));
  }

  async function handleTrocarVinculoSubconjunto(
    bomItemId: string,
    valorSelecionado: string,
  ) {
    setErroSubconjunto(null);
    const novaOperacaoId = valorSelecionado === "" ? null : valorSelecionado;
    const resultado = await onTrocarVinculoSubconjunto(bomItemId, novaOperacaoId);
    if (resultado.status === "erro") {
      setErroSubconjunto(resultado.mensagem);
    }
  }

  function handleEditarOperacao(operacao: BomOperacao) {
    setOperacaoEditando(operacao);
    setModalOperacaoAberto(true);
  }

  function handleAbrirModalOperacao() {
    setOperacaoEditando(null);
    setModalOperacaoAberto(true);
  }

  function handleFecharModalOperacao() {
    setModalOperacaoAberto(false);
    setOperacaoEditando(null);
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
          <section className="rounded-md border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <h2 className="text-sm font-bold">Engenharia</h2>
              <button
                type="button"
                onClick={handleAbrirModalOperacao}
                className="h-9 rounded-md border border-border px-3 text-xs font-semibold text-text-primary transition hover:bg-border-subtle"
              >
                Adicionar OP
              </button>
            </div>

            <OperacoesTable
              operacoes={operacoesEngenharia}
              onEditar={handleEditarOperacao}
              onRemover={handleRemoverOperacao}
            />
            {erroOperacao ? (
              <p className="px-4 py-2 text-sm font-medium text-status-danger-text">
                {erroOperacao}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-md border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div>
              <h2 className="text-sm font-bold">Matérias-primas</h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                Consumo por peça. A OF multiplica pela quantidade a fabricar.
              </p>
            </div>

            <button
              type="button"
              onClick={handleAbrirModalMaterial}
              className="h-9 rounded-md border border-border px-3 text-xs font-semibold text-text-primary transition hover:bg-border-subtle"
            >
              Adicionar material
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border-subtle bg-border-subtle text-xs uppercase text-text-secondary">
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
              <tbody className="divide-y divide-border-subtle">
                {materiais.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-sm text-text-secondary"
                    >
                      Nenhuma matéria-prima cadastrada neste roteiro.
                    </td>
                  </tr>
                ) : (
                  materiais.map((item) => (
                    <tr key={item.id} className="hover:bg-border-subtle">
                      <td className="px-4 py-3 font-medium text-text-primary">
                        {item.descricao}
                        {item.dimensoes ? (
                          <p className="mt-1 text-xs text-text-disabled">
                            {item.dimensoes}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-text-primary">
                        {item.quantidade.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {item.unidade}
                      </td>
                      <td className="px-4 py-3 text-text-primary">
                        {item.custoReferencia !== null
                          ? formatarMoeda(item.custoReferencia)
                          : "Sem custo cadastrado"}
                      </td>
                      <td className="px-4 py-3 text-text-primary">
                        {item.custoReferencia !== null
                          ? formatarMoeda(item.quantidade * item.custoReferencia)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {item.observacoes || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleEditarMaterial(item)}
                          className="mr-3 text-xs font-semibold text-action-primary hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoverMaterial(item.id)}
                          className="text-xs font-semibold text-status-danger-text hover:underline"
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
            <p className="px-4 py-2 text-sm font-medium text-status-danger-text">
              {erroMaterial}
            </p>
          ) : null}
        </section>

        <section className="rounded-md border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div>
              <h2 className="text-sm font-bold">Operações</h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                Como fabricar a peça, em linguagem de operador.
              </p>
            </div>

            <button
              type="button"
              onClick={handleAbrirModalOperacao}
              className="h-9 rounded-md border border-border px-3 text-xs font-semibold text-text-primary transition hover:bg-border-subtle"
            >
              Adicionar OP
            </button>
          </div>

          <OperacoesTable
            operacoes={operacoesProducao}
            onEditar={handleEditarOperacao}
            onRemover={handleRemoverOperacao}
          />
          {erroOperacao ? (
            <p className="px-4 py-2 text-sm font-medium text-status-danger-text">
              {erroOperacao}
            </p>
          ) : null}
        </section>

        <section className="rounded-md border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div>
              <h2 className="text-sm font-bold">Estrutura / Subconjuntos</h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                Produtos que entram como componente deste roteiro. &quot;Necessário
                antes de&quot; define qual operação espera este subconjunto ficar
                pronto - sem seleção, todas as operações aguardam (regra
                conservadora).
              </p>
            </div>

            <button
              type="button"
              onClick={() => setModalSubconjuntoAberto(true)}
              className="h-9 rounded-md border border-border px-3 text-xs font-semibold text-text-primary transition hover:bg-border-subtle"
            >
              Montar subconjunto
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border-subtle bg-border-subtle text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-2 font-semibold">Produto</th>
                  <th className="px-4 py-2 font-semibold">Quantidade</th>
                  <th className="px-4 py-2 font-semibold">Unidade</th>
                  <th className="px-4 py-2 font-semibold">Observações</th>
                  <th className="px-4 py-2 font-semibold">Necessário antes de</th>
                  <th className="px-4 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {subconjuntos.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-text-secondary"
                    >
                      Nenhum subconjunto cadastrado neste roteiro.
                    </td>
                  </tr>
                ) : (
                  subconjuntos.map((item) => (
                    <tr key={item.id} className="hover:bg-border-subtle">
                      <td className="px-4 py-3 font-medium text-text-primary">
                        <Link
                          href={`/roteiros/${encodeURIComponent(item.codigo)}`}
                          className="text-action-primary hover:underline"
                        >
                          {item.codigo} — {item.descricao}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-text-primary">
                        {item.quantidade.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {item.unidade}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {item.observacoes || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={item.vinculoOperacaoId ?? ""}
                          onChange={(evento) =>
                            handleTrocarVinculoSubconjunto(item.id, evento.target.value)
                          }
                          disabled={processando}
                          title="Sem seleção: TODAS as operações deste roteiro aguardam este subconjunto terminar (regra conservadora). Selecionar uma operação faz só ela esperar por este subconjunto."
                          className="h-8 rounded-md border border-border bg-surface-elevated px-2 text-xs text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="">— (regra conservadora)</option>
                          {[...operacoesEngenharia, ...operacoesProducao]
                            .filter((operacao) => operacao.ativo)
                            .map((operacao) => (
                              <option key={operacao.id} value={operacao.id}>
                                {operacao.ordem} — {operacao.descricao}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoverSubconjunto(item.id)}
                          className="text-xs font-semibold text-status-danger-text hover:underline"
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
            <p className="px-4 py-2 text-sm font-medium text-status-danger-text">
              {erroSubconjunto}
            </p>
          ) : null}
        </section>

        <section className="rounded-md border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <h2 className="text-sm font-bold">Serviços de Terceiros</h2>
            <button
              type="button"
              onClick={() => setModalServicoAberto(true)}
              className="h-9 rounded-md border border-border px-3 text-xs font-semibold text-text-primary transition hover:bg-border-subtle"
            >
              Adicionar Serviço
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-border-subtle bg-border-subtle text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-2 font-semibold">Serviço</th>
                  <th className="px-4 py-2 font-semibold">Fornecedor</th>
                  <th className="px-4 py-2 font-semibold">Prazo</th>
                  <th className="px-4 py-2 font-semibold">Valor</th>
                  <th className="px-4 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {servicosTerceiros.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-sm text-text-secondary"
                    >
                      Nenhum serviço de terceiro cadastrado neste roteiro.
                    </td>
                  </tr>
                ) : (
                  servicosTerceiros.map((servico) => (
                    <tr key={servico.id} className="hover:bg-border-subtle">
                      <td className="px-4 py-3 font-medium text-text-primary">
                        {servico.descricao}
                      </td>
                      <td className="px-4 py-3 text-text-primary">
                        {servico.fornecedorNome ?? "Não informado"}
                      </td>
                      <td className="px-4 py-3 text-text-primary">
                        {servico.prazoEstimadoDias !== null
                          ? `${servico.prazoEstimadoDias} dia(s)`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-text-primary">
                        {servico.custoEstimado !== null
                          ? formatarMoeda(servico.custoEstimado)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoverServico(servico.id)}
                          className="text-xs font-semibold text-status-danger-text hover:underline"
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
            <p className="px-4 py-2 text-sm font-medium text-status-danger-text">
              {erroServico}
            </p>
          ) : null}
        </section>

        <section className="rounded-md border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <h2 className="text-sm font-bold">Transportes</h2>
            <button
              type="button"
              onClick={() => setModalTransporteAberto(true)}
              className="h-9 rounded-md border border-border px-3 text-xs font-semibold text-text-primary transition hover:bg-border-subtle"
            >
              Adicionar Transporte
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border-subtle bg-border-subtle text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-2 font-semibold">Transporte</th>
                  <th className="px-4 py-2 font-semibold">Transportadora</th>
                  <th className="px-4 py-2 font-semibold">Valor</th>
                  <th className="px-4 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {transportes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-sm text-text-secondary"
                    >
                      Nenhum transporte cadastrado neste roteiro.
                    </td>
                  </tr>
                ) : (
                  transportes.map((transporte) => (
                    <tr key={transporte.id} className="hover:bg-border-subtle">
                      <td className="px-4 py-3 font-medium text-text-primary">
                        {transporte.descricao}
                      </td>
                      <td className="px-4 py-3 text-text-primary">
                        {transporte.fornecedorNome ?? "Não informado"}
                      </td>
                      <td className="px-4 py-3 text-text-primary">
                        {transporte.custoEstimado !== null
                          ? formatarMoeda(transporte.custoEstimado)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoverTransporte(transporte.id)}
                          className="text-xs font-semibold text-status-danger-text hover:underline"
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
            <p className="px-4 py-2 text-sm font-medium text-status-danger-text">
              {erroTransporte}
            </p>
          ) : null}
        </section>
      </div>

      <aside className="space-y-5">
        <section className="rounded-md border border-border bg-surface p-4">
          <h2 className="text-sm font-bold">Resumo de Custos Industriais</h2>
          <p className="mt-2 text-xs leading-5 text-text-secondary">
            Calculado a partir das informações reais deste roteiro.
          </p>
          <div className="mt-3 divide-y divide-border-subtle text-sm">
            <div className="flex justify-between gap-4 py-2">
              <span className="text-text-secondary">Matéria-prima</span>
              <span className="font-semibold text-text-primary">
                {formatarMoeda(custo.materiaPrima + custo.subconjunto)}
              </span>
            </div>
            {custo.subconjunto > 0 ? (
              <div className="flex justify-between gap-4 py-1 pl-3 text-xs text-text-disabled">
                <span>↳ inclui subconjuntos</span>
                <span>{formatarMoeda(custo.subconjunto)}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 py-2">
              <span className="text-text-secondary">Engenharia</span>
              <span className="font-semibold text-text-primary">
                {formatarMoeda(custo.engenharia)}
              </span>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <span className="text-text-secondary">Mão de obra</span>
              <span className="font-semibold text-text-primary">
                {formatarMoeda(custo.maoDeObra)}
              </span>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <span className="text-text-secondary">Terceiros</span>
              <span className="font-semibold text-text-primary">
                {formatarMoeda(custo.terceiros)}
              </span>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <span className="text-text-secondary">Logística</span>
              <span className="font-semibold text-text-primary">
                {formatarMoeda(custo.logistica)}
              </span>
            </div>
            <div className="flex justify-between gap-4 pt-3">
              <span className="font-semibold text-text-primary">Total</span>
              <span className="font-bold text-text-primary">
                {formatarMoeda(custo.total)}
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-border bg-surface p-4">
          <h2 className="text-sm font-bold">PDF técnico</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Fabricar conforme revisão presente no desenho anexado.
          </p>
        </section>

        <section className="rounded-md border border-border bg-surface p-4">
          <h2 className="text-sm font-bold">Regra importante</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Roteiro não possui quantidade de produção. A quantidade pertence à OF.
          </p>
        </section>

        <section className="rounded-md border border-border bg-surface p-4">
          <h2 className="text-sm font-bold">Versão do roteiro</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Versão {bom.versao} — status {bom.status}.
          </p>
        </section>
      </aside>

      <AdicionarMaterialModal
        open={modalMaterialAberto}
        onClose={handleFecharModalMaterial}
        onAdd={onAdicionarMaterial}
        onEdit={onEditarMaterial}
        materialEditando={materialEditando}
      />

      <AdicionarSubconjuntoModal
        open={modalSubconjuntoAberto}
        onClose={() => setModalSubconjuntoAberto(false)}
        onAdd={onAdicionarSubconjunto}
        produtoAtualId={bom.produtoId}
      />

      <AdicionarOperacaoModal
        open={modalOperacaoAberto}
        onClose={handleFecharModalOperacao}
        onAdd={onAdicionarOperacao}
        onEdit={onEditarOperacao}
        recursosDisponiveis={recursosDisponiveis}
        proximaOrdem={proximaOrdemOperacoes()}
        operacaoEditando={operacaoEditando}
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
  onEditar,
  onRemover,
}: {
  operacoes: BomOperacao[];
  onEditar: (operacao: BomOperacao) => void;
  onRemover: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-border-subtle bg-border-subtle text-xs uppercase text-text-secondary">
          <tr>
            <th className="px-4 py-2 font-semibold">OP</th>
            <th className="px-4 py-2 font-semibold">Descrição</th>
            <th className="px-4 py-2 font-semibold">Recurso</th>
            <th className="px-4 py-2 font-semibold">Tempo (min)</th>
            <th className="px-4 py-2 font-semibold">Observações</th>
            <th className="px-4 py-2 font-semibold" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {operacoes.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-secondary">
                Nenhuma operação cadastrada neste roteiro.
              </td>
            </tr>
          ) : (
            operacoes.map((operacao) => (
              <tr key={operacao.id} className="hover:bg-border-subtle">
                <td className="px-4 py-3 font-bold">OP{operacao.ordem}</td>
                <td className="px-4 py-3 text-text-primary">{operacao.descricao}</td>
                <td className="px-4 py-3 text-text-primary">
                  {operacao.recursoNome}
                </td>
                <td className="px-4 py-3 text-text-primary">
                  {operacao.tempoEstimadoMinutos.toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {operacao.observacoes || "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onEditar(operacao)}
                    className="mr-3 text-xs font-semibold text-text-primary hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemover(operacao.id)}
                    className="text-xs font-semibold text-status-danger-text hover:underline"
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
