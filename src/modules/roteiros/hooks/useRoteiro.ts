"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  excluirRegistro,
  type ResultadoExclusao,
} from "@/modules/shared/data/excluirRegistro";
import type {
  Bom,
  BomItemMateriaPrima,
  BomItemSubconjunto,
  BomOperacao,
  BomServicoTerceiro,
  BomStatus,
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

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const CODIGO_FK_VIOLATION = "23503";
const CODIGO_UNIQUE_VIOLATION = "23505";

function resultadoErro(
  err: unknown,
  mensagemPadrao: string,
): ResultadoOperacaoRoteiro {
  const error = err as SupabaseErrorLike;

  if (error?.code === CODIGO_FK_VIOLATION) {
    return {
      status: "erro",
      mensagem:
        "Não é possível concluir - o registro selecionado está vinculado a outro cadastro ou não existe mais.",
    };
  }

  if (error?.code === CODIGO_UNIQUE_VIOLATION) {
    return {
      status: "erro",
      mensagem: "Já existe um registro com essa ordem neste roteiro.",
    };
  }

  return {
    status: "erro",
    mensagem: error?.message || mensagemPadrao,
  };
}

type BomRow = {
  id: string;
  produto_id: string;
  versao: string;
  descricao: string | null;
  status: string;
  data_validade: string | null;
};

type BomItemRow = {
  id: string;
  materia_prima_id: string | null;
  componente_produto_id: string | null;
  quantidade: number;
  unidade: string;
  dimensoes: string | null;
  ordem: number;
  observacoes: string | null;
};

type MateriaPrimaRow = {
  id: string;
  descricao: string;
  custo_referencia: number | null;
};

type MateriaPrimaDisponivelRow = {
  id: string;
  descricao: string;
  unidade: string;
};

type ItemIndustrialRow = {
  id: string;
  codigo: string;
  descricao: string;
};

type BomOperacaoRow = {
  id: string;
  ordem: number;
  descricao: string;
  recurso_produtivo_id: string | null;
  tipo: "engenharia" | "producao";
  tempo_estimado_minutos: number;
  observacoes: string | null;
};

type RecursoProdutivoRow = {
  id: string;
  codigo: string | null;
  nome: string | null;
};

type BomServicoRow = {
  id: string;
  ordem: number;
  descricao: string;
  fornecedor_id: string | null;
  custo_estimado: number | null;
  prazo_estimado_dias: number | null;
  observacoes: string | null;
};

type BomTransporteRow = {
  id: string;
  ordem: number;
  descricao: string;
  fornecedor_id: string | null;
  custo_estimado: number | null;
  observacoes: string | null;
};

type FornecedorRow = {
  id: string;
  nome_fantasia: string | null;
  nome: string | null;
};

type CustoRow = {
  categoria: string;
  valor: number;
};

const custoVazio: CustoBom = {
  materiaPrima: 0,
  subconjunto: 0,
  engenharia: 0,
  maoDeObra: 0,
  terceiros: 0,
  logistica: 0,
  total: 0,
};

export function useRoteiro(pn: string) {
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [produtoDescricao, setProdutoDescricao] = useState("");
  const [bom, setBom] = useState<Bom | null>(null);

  const [materiais, setMateriais] = useState<BomItemMateriaPrima[]>([]);
  const [subconjuntos, setSubconjuntos] = useState<BomItemSubconjunto[]>([]);
  const [operacoesEngenharia, setOperacoesEngenharia] = useState<BomOperacao[]>([]);
  const [operacoesProducao, setOperacoesProducao] = useState<BomOperacao[]>([]);
  const [servicosTerceiros, setServicosTerceiros] = useState<BomServicoTerceiro[]>([]);
  const [transportes, setTransportes] = useState<BomTransporte[]>([]);
  const [custo, setCusto] = useState<CustoBom>(custoVazio);

  const [materiasPrimasDisponiveis, setMateriasPrimasDisponiveis] = useState<
    (OpcaoSelect & { unidade: string })[]
  >([]);
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<OpcaoSelect[]>(
    [],
  );
  const [recursosDisponiveis, setRecursosDisponiveis] = useState<
    OpcaoSelect[]
  >([]);
  const [fornecedoresDisponiveis, setFornecedoresDisponiveis] = useState<
    OpcaoSelect[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregarMateriais = useCallback(async (bomId: string) => {
    const { data, error } = await supabase
      .from("bom_itens")
      .select("id,materia_prima_id,quantidade,unidade,dimensoes,ordem,observacoes")
      .eq("bom_id", bomId)
      .eq("componente_tipo", "materia_prima")
      .is("deleted_at", null)
      .order("ordem", { ascending: true });

    if (error) {
      return;
    }

    const linhas = (data ?? []) as BomItemRow[];
    const ids = linhas.map((linha) => linha.materia_prima_id).filter(Boolean) as string[];
    const porId = new Map<string, { descricao: string; custo: number | null }>();

    if (ids.length > 0) {
      const { data: materiasData } = await supabase
        .from("materias_primas")
        .select("id,descricao,custo_referencia")
        .in("id", ids);

      ((materiasData ?? []) as MateriaPrimaRow[]).forEach((materia) => {
        porId.set(materia.id, {
          descricao: materia.descricao,
          custo:
            materia.custo_referencia !== null
              ? Number(materia.custo_referencia)
              : null,
        });
      });
    }

    setMateriais(
      linhas.map((linha) => ({
        id: linha.id,
        materiaPrimaId: linha.materia_prima_id ?? "",
        descricao: porId.get(linha.materia_prima_id ?? "")?.descricao ?? "—",
        custoReferencia: porId.get(linha.materia_prima_id ?? "")?.custo ?? null,
        quantidade: Number(linha.quantidade),
        unidade: linha.unidade,
        dimensoes: linha.dimensoes,
        ordem: linha.ordem,
        observacoes: linha.observacoes,
      })),
    );
  }, []);

  const carregarSubconjuntos = useCallback(async (bomId: string) => {
    const { data, error } = await supabase
      .from("bom_itens")
      .select("id,componente_produto_id,quantidade,unidade,ordem,observacoes")
      .eq("bom_id", bomId)
      .eq("componente_tipo", "subconjunto")
      .is("deleted_at", null)
      .order("ordem", { ascending: true });

    if (error) {
      return;
    }

    const linhas = (data ?? []) as BomItemRow[];
    const ids = linhas
      .map((linha) => linha.componente_produto_id)
      .filter(Boolean) as string[];
    const porId = new Map<string, { codigo: string; descricao: string }>();

    if (ids.length > 0) {
      const { data: itensData } = await supabase
        .from("itens_industriais")
        .select("id,codigo,descricao")
        .in("id", ids);

      ((itensData ?? []) as ItemIndustrialRow[]).forEach((item) => {
        porId.set(item.id, { codigo: item.codigo, descricao: item.descricao });
      });
    }

    setSubconjuntos(
      linhas.map((linha) => ({
        id: linha.id,
        componenteProdutoId: linha.componente_produto_id ?? "",
        codigo: porId.get(linha.componente_produto_id ?? "")?.codigo ?? "—",
        descricao:
          porId.get(linha.componente_produto_id ?? "")?.descricao ?? "—",
        quantidade: Number(linha.quantidade),
        unidade: linha.unidade,
        ordem: linha.ordem,
        observacoes: linha.observacoes,
      })),
    );
  }, []);

  const carregarOperacoes = useCallback(async (bomId: string) => {
    const { data, error } = await supabase
      .from("bom_operacoes")
      .select(
        "id,ordem,descricao,recurso_produtivo_id,tipo,tempo_estimado_minutos,observacoes",
      )
      .eq("bom_id", bomId)
      .is("deleted_at", null)
      .order("ordem", { ascending: true });

    if (error) {
      return;
    }

    const linhas = (data ?? []) as BomOperacaoRow[];
    const ids = linhas
      .map((linha) => linha.recurso_produtivo_id)
      .filter((id): id is string => Boolean(id));
    const porId = new Map<string, string>();

    if (ids.length > 0) {
      const { data: recData } = await supabase
        .from("recursos_produtivos")
        .select("id,codigo,nome")
        .in("id", ids);

      ((recData ?? []) as RecursoProdutivoRow[]).forEach((recurso) => {
        porId.set(
          recurso.id,
          [recurso.codigo, recurso.nome].filter(Boolean).join(" — ") || "—",
        );
      });
    }

    const mapeadas: BomOperacao[] = linhas.map((linha) => ({
      id: linha.id,
      ordem: linha.ordem,
      descricao: linha.descricao,
      recursoProdutivoId: linha.recurso_produtivo_id,
      recursoNome: linha.recurso_produtivo_id
        ? porId.get(linha.recurso_produtivo_id) ?? "—"
        : "Sem recurso vinculado",
      tipo: linha.tipo,
      tempoEstimadoMinutos: Number(linha.tempo_estimado_minutos),
      observacoes: linha.observacoes,
    }));

    setOperacoesEngenharia(
      mapeadas.filter((op) => op.tipo === "engenharia"),
    );
    setOperacoesProducao(
      mapeadas.filter((op) => op.tipo !== "engenharia"),
    );
  }, []);

  const carregarServicosTerceiros = useCallback(async (bomId: string) => {
    const { data, error } = await supabase
      .from("bom_servicos_terceiros")
      .select(
        "id,ordem,descricao,fornecedor_id,custo_estimado,prazo_estimado_dias,observacoes",
      )
      .eq("bom_id", bomId)
      .is("deleted_at", null)
      .order("ordem", { ascending: true });

    if (error) {
      return;
    }

    const linhas = (data ?? []) as BomServicoRow[];
    const ids = linhas.map((linha) => linha.fornecedor_id).filter(Boolean) as string[];
    const porId = new Map<string, string>();

    if (ids.length > 0) {
      const { data: fornData } = await supabase
        .from("fornecedores")
        .select("id,nome_fantasia,nome")
        .in("id", ids);

      ((fornData ?? []) as FornecedorRow[]).forEach((fornecedor) => {
        porId.set(
          fornecedor.id,
          fornecedor.nome_fantasia || fornecedor.nome || "—",
        );
      });
    }

    setServicosTerceiros(
      linhas.map((linha) => ({
        id: linha.id,
        ordem: linha.ordem,
        descricao: linha.descricao,
        fornecedorId: linha.fornecedor_id,
        fornecedorNome: linha.fornecedor_id
          ? porId.get(linha.fornecedor_id) ?? "—"
          : null,
        custoEstimado:
          linha.custo_estimado !== null ? Number(linha.custo_estimado) : null,
        prazoEstimadoDias: linha.prazo_estimado_dias,
        observacoes: linha.observacoes,
      })),
    );
  }, []);

  const carregarTransportes = useCallback(async (bomId: string) => {
    const { data, error } = await supabase
      .from("bom_transportes")
      .select("id,ordem,descricao,fornecedor_id,custo_estimado,observacoes")
      .eq("bom_id", bomId)
      .is("deleted_at", null)
      .order("ordem", { ascending: true });

    if (error) {
      return;
    }

    const linhas = (data ?? []) as BomTransporteRow[];
    const ids = linhas.map((linha) => linha.fornecedor_id).filter(Boolean) as string[];
    const porId = new Map<string, string>();

    if (ids.length > 0) {
      const { data: fornData } = await supabase
        .from("fornecedores")
        .select("id,nome_fantasia,nome")
        .in("id", ids);

      ((fornData ?? []) as FornecedorRow[]).forEach((fornecedor) => {
        porId.set(
          fornecedor.id,
          fornecedor.nome_fantasia || fornecedor.nome || "—",
        );
      });
    }

    setTransportes(
      linhas.map((linha) => ({
        id: linha.id,
        ordem: linha.ordem,
        descricao: linha.descricao,
        fornecedorId: linha.fornecedor_id,
        fornecedorNome: linha.fornecedor_id
          ? porId.get(linha.fornecedor_id) ?? "—"
          : null,
        custoEstimado:
          linha.custo_estimado !== null ? Number(linha.custo_estimado) : null,
        observacoes: linha.observacoes,
      })),
    );
  }, []);

  const carregarCusto = useCallback(async (bomId: string) => {
    const { data, error } = await supabase.rpc("calcular_custo_bom", {
      p_bom_id: bomId,
    });

    if (error) {
      return;
    }

    const porCategoria = new Map<string, number>();
    ((data ?? []) as CustoRow[]).forEach((linha) => {
      porCategoria.set(linha.categoria, Number(linha.valor));
    });

    setCusto({
      materiaPrima: porCategoria.get("materia_prima") ?? 0,
      subconjunto: porCategoria.get("subconjunto") ?? 0,
      engenharia: porCategoria.get("engenharia") ?? 0,
      maoDeObra: porCategoria.get("mao_de_obra") ?? 0,
      terceiros: porCategoria.get("terceiros") ?? 0,
      logistica: porCategoria.get("logistica") ?? 0,
      total: porCategoria.get("total") ?? 0,
    });
  }, []);

  const carregarTudoDoBom = useCallback(
    async (bomId: string) => {
      await Promise.all([
        carregarMateriais(bomId),
        carregarSubconjuntos(bomId),
        carregarOperacoes(bomId),
        carregarServicosTerceiros(bomId),
        carregarTransportes(bomId),
      ]);
      await carregarCusto(bomId);
    },
    [
      carregarMateriais,
      carregarSubconjuntos,
      carregarOperacoes,
      carregarServicosTerceiros,
      carregarTransportes,
      carregarCusto,
    ],
  );

  const carregarBom = useCallback(
    async (idProduto: string) => {
      const { data, error } = await supabase
        .from("boms")
        .select("id,produto_id,versao,descricao,status,data_validade")
        .eq("produto_id", idProduto)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        setErro("Não foi possível carregar o roteiro.");
        return;
      }

      const boms = (data ?? []) as BomRow[];
      const escolhido = boms.find((item) => item.status === "ativo") ?? boms[0] ?? null;

      if (!escolhido) {
        setBom(null);
        setMateriais([]);
        setSubconjuntos([]);
        setOperacoesEngenharia([]);
        setOperacoesProducao([]);
        setServicosTerceiros([]);
        setTransportes([]);
        setCusto(custoVazio);
        return;
      }

      setBom({
        id: escolhido.id,
        produtoId: escolhido.produto_id,
        versao: escolhido.versao,
        descricao: escolhido.descricao,
        status: escolhido.status as BomStatus,
        dataValidade: escolhido.data_validade,
      });

      await carregarTudoDoBom(escolhido.id);
    },
    [carregarTudoDoBom],
  );

  useEffect(() => {
    async function carregar() {
      if (!pn) {
        setErro("Produto não informado.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErro(null);

      const [produtoResult, materiasResult, itensResult, recResult, fornResult] =
        await Promise.all([
          supabase
            .from("itens_industriais")
            .select("id,codigo,descricao")
            .eq("codigo", pn)
            .single(),
          supabase
            .from("materias_primas")
            .select("id,descricao,unidade")
            .order("descricao", { ascending: true }),
          supabase
            .from("itens_industriais")
            .select("id,codigo,descricao")
            .order("descricao", { ascending: true }),
          supabase
            .from("recursos_produtivos")
            .select("id,codigo,nome")
            .eq("ativo", true)
            .order("nome", { ascending: true }),
          supabase
            .from("fornecedores")
            .select("id,nome_fantasia,nome")
            .order("nome_fantasia", { ascending: true }),
        ]);

      setMateriasPrimasDisponiveis(
        ((materiasResult.data ?? []) as MateriaPrimaDisponivelRow[]).map(
          (materia) => ({
            id: materia.id,
            label: materia.descricao,
            unidade: materia.unidade,
          }),
        ),
      );

      setRecursosDisponiveis(
        ((recResult.data ?? []) as RecursoProdutivoRow[]).map((recurso) => ({
          id: recurso.id,
          label:
            [recurso.codigo, recurso.nome].filter(Boolean).join(" — ") || "—",
        })),
      );

      setFornecedoresDisponiveis(
        ((fornResult.data ?? []) as FornecedorRow[]).map((fornecedor) => ({
          id: fornecedor.id,
          label: fornecedor.nome_fantasia || fornecedor.nome || "—",
        })),
      );

      if (produtoResult.error || !produtoResult.data) {
        setErro("Produto não encontrado.");
        setLoading(false);
        return;
      }

      setProdutoId(produtoResult.data.id);
      setProdutoDescricao(produtoResult.data.descricao ?? "");

      setProdutosDisponiveis(
        ((itensResult.data ?? []) as ItemIndustrialRow[])
          .filter((item) => item.id !== produtoResult.data.id)
          .map((item) => ({ id: item.id, label: `${item.codigo} — ${item.descricao}` })),
      );

      await carregarBom(produtoResult.data.id);
      setLoading(false);
    }

    carregar();
  }, [pn, carregarBom]);

  async function criarPrimeiroRoteiro(): Promise<ResultadoOperacaoRoteiro> {
    if (!produtoId) {
      return { status: "erro", mensagem: "Produto não informado." };
    }

    setProcessando(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setProcessando(false);
      return { status: "erro", mensagem: "Usuário não autenticado." };
    }

    const { error } = await supabase.from("boms").insert({
      produto_id: produtoId,
      versao: "A",
      status: "rascunho",
      created_by: user.id,
    });

    if (error) {
      setProcessando(false);
      return resultadoErro(error, "Não foi possível criar o roteiro.");
    }

    await carregarBom(produtoId);
    setProcessando(false);
    return { status: "ok" };
  }

  function proximaOrdemBomItens() {
    const ordens = [...materiais, ...subconjuntos].map((item) => item.ordem);
    return ordens.length > 0 ? Math.max(...ordens) + 1 : 1;
  }

  function proximaOrdemOperacoes() {
    const ordens = [...operacoesEngenharia, ...operacoesProducao].map(
      (op) => op.ordem,
    );
    return ordens.length > 0 ? Math.max(...ordens) + 1 : 1;
  }

  function proximaOrdemServicosTerceiros() {
    const ordens = servicosTerceiros.map((item) => item.ordem);
    return ordens.length > 0 ? Math.max(...ordens) + 1 : 1;
  }

  function proximaOrdemTransportes() {
    const ordens = transportes.map((item) => item.ordem);
    return ordens.length > 0 ? Math.max(...ordens) + 1 : 1;
  }

  async function obterUsuarioAtual(): Promise<string | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  }

  async function adicionarMaterial(
    input: NovoBomItemInput,
  ): Promise<ResultadoOperacaoRoteiro> {
    if (!bom) {
      return { status: "erro", mensagem: "Roteiro não encontrado." };
    }

    setProcessando(true);
    const userId = await obterUsuarioAtual();

    if (!userId) {
      setProcessando(false);
      return { status: "erro", mensagem: "Usuário não autenticado." };
    }

    const { error } = await supabase.from("bom_itens").insert({
      bom_id: bom.id,
      componente_tipo: "materia_prima",
      materia_prima_id: input.materiaPrimaId,
      quantidade: input.quantidade,
      unidade: input.unidade,
      dimensoes: input.dimensoes.trim() || null,
      ordem: proximaOrdemBomItens(),
      observacoes: input.observacoes.trim() || null,
      created_by: userId,
    });

    if (error) {
      setProcessando(false);
      return resultadoErro(error, "Não foi possível adicionar o material.");
    }

    await Promise.all([
      carregarMateriais(bom.id),
      carregarCusto(bom.id),
    ]);
    setProcessando(false);
    return { status: "ok" };
  }

  async function removerMaterial(id: string): Promise<ResultadoExclusao> {
    const resultado = await excluirRegistro("bom_itens", id);
    if (resultado.status === "excluido" && bom) {
      await Promise.all([carregarMateriais(bom.id), carregarCusto(bom.id)]);
    }
    return resultado;
  }

  async function adicionarSubconjunto(
    input: NovoSubconjuntoInput,
  ): Promise<ResultadoOperacaoRoteiro> {
    if (!bom) {
      return { status: "erro", mensagem: "Roteiro não encontrado." };
    }

    setProcessando(true);
    const userId = await obterUsuarioAtual();

    if (!userId) {
      setProcessando(false);
      return { status: "erro", mensagem: "Usuário não autenticado." };
    }

    const { error } = await supabase.from("bom_itens").insert({
      bom_id: bom.id,
      componente_tipo: "subconjunto",
      componente_produto_id: input.componenteProdutoId,
      quantidade: input.quantidade,
      unidade: input.unidade,
      ordem: proximaOrdemBomItens(),
      observacoes: input.observacoes.trim() || null,
      created_by: userId,
    });

    if (error) {
      setProcessando(false);
      return resultadoErro(error, "Não foi possível adicionar o subconjunto.");
    }

    await Promise.all([
      carregarSubconjuntos(bom.id),
      carregarCusto(bom.id),
    ]);
    setProcessando(false);
    return { status: "ok" };
  }

  async function removerSubconjunto(id: string): Promise<ResultadoExclusao> {
    const resultado = await excluirRegistro("bom_itens", id);
    if (resultado.status === "excluido" && bom) {
      await Promise.all([carregarSubconjuntos(bom.id), carregarCusto(bom.id)]);
    }
    return resultado;
  }

  function ordemOperacaoJaExiste(ordemNumero: number, idIgnorar?: string) {
    return [...operacoesEngenharia, ...operacoesProducao].some(
      (op) => op.ordem === ordemNumero && op.id !== idIgnorar,
    );
  }

  async function adicionarOperacao(
    input: NovaOperacaoInput,
  ): Promise<ResultadoOperacaoRoteiro> {
    if (!bom) {
      return { status: "erro", mensagem: "Roteiro não encontrado." };
    }

    if (ordemOperacaoJaExiste(input.ordem)) {
      return {
        status: "erro",
        mensagem:
          "Essa ordem já está em uso neste roteiro (Engenharia e Operações compartilham a mesma numeração).",
      };
    }

    setProcessando(true);
    const userId = await obterUsuarioAtual();

    if (!userId) {
      setProcessando(false);
      return { status: "erro", mensagem: "Usuário não autenticado." };
    }

    const { error } = await supabase.from("bom_operacoes").insert({
      bom_id: bom.id,
      ordem: input.ordem,
      descricao: input.descricao.trim(),
      recurso_produtivo_id: input.recursoProdutivoId,
      tipo: input.tipo,
      tempo_estimado_minutos: input.tempoEstimadoMinutos,
      observacoes: input.observacoes.trim() || null,
      created_by: userId,
    });

    if (error) {
      setProcessando(false);
      return resultadoErro(error, "Não foi possível adicionar a operação.");
    }

    await Promise.all([carregarOperacoes(bom.id), carregarCusto(bom.id)]);
    setProcessando(false);
    return { status: "ok" };
  }

  async function editarOperacao(
    id: string,
    input: NovaOperacaoInput,
  ): Promise<ResultadoOperacaoRoteiro> {
    if (!bom) {
      return { status: "erro", mensagem: "Roteiro não encontrado." };
    }

    if (ordemOperacaoJaExiste(input.ordem, id)) {
      return {
        status: "erro",
        mensagem:
          "Essa ordem já está em uso neste roteiro (Engenharia e Operações compartilham a mesma numeração).",
      };
    }

    setProcessando(true);

    const { error } = await supabase
      .from("bom_operacoes")
      .update({
        ordem: input.ordem,
        descricao: input.descricao.trim(),
        recurso_produtivo_id: input.recursoProdutivoId,
        tipo: input.tipo,
        tempo_estimado_minutos: input.tempoEstimadoMinutos,
        observacoes: input.observacoes.trim() || null,
      })
      .eq("id", id);

    if (error) {
      setProcessando(false);
      return resultadoErro(error, "Não foi possível atualizar a operação.");
    }

    await Promise.all([carregarOperacoes(bom.id), carregarCusto(bom.id)]);
    setProcessando(false);
    return { status: "ok" };
  }

  async function removerOperacao(id: string): Promise<ResultadoExclusao> {
    const resultado = await excluirRegistro("bom_operacoes", id);
    if (resultado.status === "excluido" && bom) {
      await Promise.all([carregarOperacoes(bom.id), carregarCusto(bom.id)]);
    }
    return resultado;
  }

  async function adicionarServicoTerceiro(
    input: NovoServicoTerceiroInput,
  ): Promise<ResultadoOperacaoRoteiro> {
    if (!bom) {
      return { status: "erro", mensagem: "Roteiro não encontrado." };
    }

    setProcessando(true);
    const userId = await obterUsuarioAtual();

    if (!userId) {
      setProcessando(false);
      return { status: "erro", mensagem: "Usuário não autenticado." };
    }

    const { error } = await supabase.from("bom_servicos_terceiros").insert({
      bom_id: bom.id,
      ordem: proximaOrdemServicosTerceiros(),
      descricao: input.descricao.trim(),
      fornecedor_id: input.fornecedorId,
      custo_estimado: input.custoEstimado,
      prazo_estimado_dias: input.prazoEstimadoDias,
      observacoes: input.observacoes.trim() || null,
      created_by: userId,
    });

    if (error) {
      setProcessando(false);
      return resultadoErro(error, "Não foi possível adicionar o serviço.");
    }

    await Promise.all([
      carregarServicosTerceiros(bom.id),
      carregarCusto(bom.id),
    ]);
    setProcessando(false);
    return { status: "ok" };
  }

  async function removerServicoTerceiro(id: string): Promise<ResultadoExclusao> {
    const resultado = await excluirRegistro("bom_servicos_terceiros", id);
    if (resultado.status === "excluido" && bom) {
      await Promise.all([
        carregarServicosTerceiros(bom.id),
        carregarCusto(bom.id),
      ]);
    }
    return resultado;
  }

  async function adicionarTransporte(
    input: NovoTransporteInput,
  ): Promise<ResultadoOperacaoRoteiro> {
    if (!bom) {
      return { status: "erro", mensagem: "Roteiro não encontrado." };
    }

    setProcessando(true);
    const userId = await obterUsuarioAtual();

    if (!userId) {
      setProcessando(false);
      return { status: "erro", mensagem: "Usuário não autenticado." };
    }

    const { error } = await supabase.from("bom_transportes").insert({
      bom_id: bom.id,
      ordem: proximaOrdemTransportes(),
      descricao: input.descricao.trim(),
      fornecedor_id: input.fornecedorId,
      custo_estimado: input.custoEstimado,
      observacoes: input.observacoes.trim() || null,
      created_by: userId,
    });

    if (error) {
      setProcessando(false);
      return resultadoErro(error, "Não foi possível adicionar o transporte.");
    }

    await Promise.all([carregarTransportes(bom.id), carregarCusto(bom.id)]);
    setProcessando(false);
    return { status: "ok" };
  }

  async function removerTransporte(id: string): Promise<ResultadoExclusao> {
    const resultado = await excluirRegistro("bom_transportes", id);
    if (resultado.status === "excluido" && bom) {
      await Promise.all([carregarTransportes(bom.id), carregarCusto(bom.id)]);
    }
    return resultado;
  }

  return {
    produtoId,
    produtoDescricao,
    bom,
    loading,
    processando,
    erro,
    criarPrimeiroRoteiro,

    materiais,
    materiasPrimasDisponiveis,
    adicionarMaterial,
    removerMaterial,

    subconjuntos,
    produtosDisponiveis,
    adicionarSubconjunto,
    removerSubconjunto,

    operacoesEngenharia,
    operacoesProducao,
    recursosDisponiveis,
    adicionarOperacao,
    editarOperacao,
    removerOperacao,
    proximaOrdemOperacoes,

    servicosTerceiros,
    fornecedoresDisponiveis,
    adicionarServicoTerceiro,
    removerServicoTerceiro,

    transportes,
    adicionarTransporte,
    removerTransporte,

    custo,
  };
}
