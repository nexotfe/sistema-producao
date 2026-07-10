"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  excluirRegistro,
  type ResultadoExclusao,
} from "@/modules/shared/data/excluirRegistro";
import type {
  GrupoRecursoProdutivo,
  SituacaoGrupoRecurso,
} from "../types";

export function useGruposRecursos() {
  const [grupos, setGrupos] = useState<GrupoRecursoProdutivo[]>([]);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<SituacaoGrupoRecurso>("todos");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [usuario, setUsuario] = useState("Usuario");

  const carregarDados = useCallback(async () => {
    setLoading(true);
    setErro(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.email) {
      setUsuario(user.email);
    }

    const { data, error } = await supabase
      .from("grupos_recursos")
      .select(
        "id,codigo,nome,descricao,setor,unidade_capacidade,ativo,created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      setErro("Nao foi possivel carregar os grupos de recursos.");
      setGrupos([]);
    } else {
      setGrupos((data ?? []) as GrupoRecursoProdutivo[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  async function alternarAtivoGrupo(id: string, ativoAtual: boolean) {
    const { error } = await supabase
      .from("grupos_recursos")
      .update({ ativo: !ativoAtual })
      .eq("id", id);

    if (error) {
      setErro("Nao foi possivel atualizar o status do grupo de recursos.");
      return;
    }

    await carregarDados();
  }

  async function excluirGrupo(id: string): Promise<ResultadoExclusao> {
    const resultado = await excluirRegistro("grupos_recursos", id);

    if (resultado.status === "excluido") {
      await carregarDados();
    }

    return resultado;
  }

  const totais = useMemo(
    () => ({
      todos: grupos.length,
      ativos: grupos.filter((grupo) => grupo.ativo === true).length,
      inativos: grupos.filter((grupo) => grupo.ativo === false).length,
    }),
    [grupos],
  );

  const gruposFiltrados = useMemo(() => {
    let resultado = [...grupos];

    if (situacao === "ativos") {
      resultado = resultado.filter((grupo) => grupo.ativo === true);
    }

    if (situacao === "inativos") {
      resultado = resultado.filter((grupo) => grupo.ativo === false);
    }

    const termo = busca.trim().toLowerCase();

    if (termo) {
      resultado = resultado.filter((grupo) =>
        [
          grupo.codigo,
          grupo.nome,
          grupo.descricao,
          grupo.setor,
          grupo.unidade_capacidade,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(termo),
      );
    }

    return resultado;
  }, [busca, grupos, situacao]);

  return {
    grupos: gruposFiltrados,
    busca,
    setBusca,
    situacao,
    setSituacao,
    totais,
    loading,
    erro,
    usuario,
    alternarAtivoGrupo,
    excluirGrupo,
  };
}
