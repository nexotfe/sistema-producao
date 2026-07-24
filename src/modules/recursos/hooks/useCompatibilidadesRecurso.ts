"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type CompatibilidadeItem = {
  id: string;
  destinoId: string;
  destinoCodigo: string;
  destinoNome: string;
  prioridade: number;
};

type RecursoOpcao = {
  id: string;
  codigo: string;
  nome: string;
};

const PRIORIDADE_TEMPORARIA = 1000000;

/**
 * Dados da secao de Compatibilidade entre Recursos Produtivos (Fase 5,
 * Item 11). Leitura segue exatamente o formato ja usado pelo Motor de
 * Simulacao (prepararEntradasMotor.ts): ativo=true, deleted_at is null,
 * ordenado por prioridade. UPDATE (reordenar/remover) e restrito a
 * admin pela RLS - 0 linhas afetadas sem erro explicito e tratado como
 * falta de permissao, nao sucesso silencioso.
 */
export function useCompatibilidadesRecurso(recursoOrigemId: string) {
  const [origemCodigo, setOrigemCodigo] = useState("");
  const [origemNome, setOrigemNome] = useState("");
  const [compatibilidades, setCompatibilidades] = useState<
    CompatibilidadeItem[]
  >([]);
  const [recursosAtivos, setRecursosAtivos] = useState<RecursoOpcao[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!recursoOrigemId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErro(null);

    const [origemResult, compatResult, recursosResult] = await Promise.all([
      supabase
        .from("recursos_produtivos")
        .select("id,codigo,nome")
        .eq("id", recursoOrigemId)
        .single(),
      supabase
        .from("recurso_produtivo_compatibilidades")
        .select("id,recurso_destino_id,prioridade")
        .eq("recurso_origem_id", recursoOrigemId)
        .eq("ativo", true)
        .is("deleted_at", null)
        .order("prioridade", { ascending: true }),
      supabase
        .from("recursos_produtivos")
        .select("id,codigo,nome")
        .eq("ativo", true)
        .order("nome", { ascending: true }),
    ]);

    if (origemResult.error || !origemResult.data) {
      setErro("Nao foi possivel carregar o recurso de origem.");
      setLoading(false);
      return;
    }

    if (compatResult.error) {
      setErro(
        `Nao foi possivel carregar as compatibilidades. ${compatResult.error.message}`,
      );
      setLoading(false);
      return;
    }

    const recursos = (recursosResult.data ?? []) as RecursoOpcao[];
    const recursosPorId = new Map(recursos.map((r) => [r.id, r]));

    setOrigemCodigo(origemResult.data.codigo ?? "");
    setOrigemNome(origemResult.data.nome ?? "");
    setRecursosAtivos(recursos);
    setCompatibilidades(
      (compatResult.data ?? []).map((linha) => {
        const destino = recursosPorId.get(linha.recurso_destino_id);
        return {
          id: linha.id,
          destinoId: linha.recurso_destino_id,
          destinoCodigo: destino?.codigo ?? "",
          destinoNome: destino?.nome ?? "Recurso nao encontrado",
          prioridade: linha.prioridade,
        };
      }),
    );
    setLoading(false);
  }, [recursoOrigemId]);

  useEffect(() => {
    // Busca de dados ao montar (padrao ja usado, sem supressao, em
    // useRecursos.ts/useRecurso.ts/useNovoRecurso.ts - nao ha camada de
    // data-fetching mais sofisticada neste projeto). useSyncExternalStore
    // nao se aplica aqui: nao existe valor sincrono correto para ler no
    // primeiro render, e sim uma consulta assincrona ao banco.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  const idsJaAdicionados = new Set(compatibilidades.map((c) => c.destinoId));
  const opcoesDisponiveis = recursosAtivos.filter(
    (r) => r.id !== recursoOrigemId && !idsJaAdicionados.has(r.id),
  );

  async function adicionar(destinoId: string) {
    if (!destinoId) {
      return false;
    }

    setProcessando(true);
    setErro(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErro("Usuario nao autenticado.");
        return false;
      }

      const { data: usuario, error: usuarioError } = await supabase
        .from("usuarios")
        .select("empresa_id")
        .eq("id", user.id)
        .single();

      if (usuarioError || !usuario?.empresa_id) {
        setErro("Empresa do usuario nao encontrada.");
        return false;
      }

      const proximaPrioridade =
        compatibilidades.length > 0
          ? Math.max(...compatibilidades.map((c) => c.prioridade)) + 1
          : 1;

      const { error } = await supabase
        .from("recurso_produtivo_compatibilidades")
        .insert({
          empresa_id: usuario.empresa_id,
          recurso_origem_id: recursoOrigemId,
          recurso_destino_id: destinoId,
          prioridade: proximaPrioridade,
          ativo: true,
          created_by: user.id,
        });

      if (error) {
        setErro(`Nao foi possivel adicionar. ${error.message}`);
        return false;
      }

      await carregar();
      return true;
    } finally {
      setProcessando(false);
    }
  }

  async function mover(id: string, direcao: "cima" | "baixo") {
    const index = compatibilidades.findIndex((c) => c.id === id);
    if (index === -1) {
      return false;
    }

    const alvoIndex = direcao === "cima" ? index - 1 : index + 1;
    if (alvoIndex < 0 || alvoIndex >= compatibilidades.length) {
      return false;
    }

    setProcessando(true);
    setErro(null);

    try {
      const atual = compatibilidades[index];
      const alvo = compatibilidades[alvoIndex];

      // Troca em 3 passos (valor temporario alto no meio) - necessaria
      // porque existe indice unico parcial em (recurso_origem_id,
      // prioridade) entre linhas ativas; 2 updates diretos colidiriam
      // com esse indice no meio do caminho.
      const passo1 = await supabase
        .from("recurso_produtivo_compatibilidades")
        .update({ prioridade: PRIORIDADE_TEMPORARIA })
        .eq("id", atual.id)
        .select("id");

      if (passo1.error || !passo1.data || passo1.data.length === 0) {
        setErro(
          "Nao foi possivel reordenar - verifique se voce tem permissao de administrador.",
        );
        return false;
      }

      const passo2 = await supabase
        .from("recurso_produtivo_compatibilidades")
        .update({ prioridade: atual.prioridade })
        .eq("id", alvo.id)
        .select("id");

      if (passo2.error || !passo2.data || passo2.data.length === 0) {
        await supabase
          .from("recurso_produtivo_compatibilidades")
          .update({ prioridade: atual.prioridade })
          .eq("id", atual.id);
        setErro(
          "Nao foi possivel reordenar - verifique se voce tem permissao de administrador.",
        );
        return false;
      }

      await supabase
        .from("recurso_produtivo_compatibilidades")
        .update({ prioridade: alvo.prioridade })
        .eq("id", atual.id);

      await carregar();
      return true;
    } finally {
      setProcessando(false);
    }
  }

  async function remover(id: string) {
    setProcessando(true);
    setErro(null);

    try {
      const { data, error } = await supabase
        .from("recurso_produtivo_compatibilidades")
        .update({ ativo: false })
        .eq("id", id)
        .select("id");

      if (error) {
        setErro(`Nao foi possivel remover. ${error.message}`);
        return false;
      }

      if (!data || data.length === 0) {
        setErro(
          "Nao foi possivel remover - verifique se voce tem permissao de administrador.",
        );
        return false;
      }

      await carregar();
      return true;
    } finally {
      setProcessando(false);
    }
  }

  return {
    origemLabel: [origemCodigo, origemNome].filter(Boolean).join(" - "),
    compatibilidades,
    opcoesDisponiveis,
    loading,
    processando,
    erro,
    adicionar,
    mover,
    remover,
  };
}
