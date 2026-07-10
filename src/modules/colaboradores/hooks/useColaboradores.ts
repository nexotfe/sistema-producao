"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  excluirRegistro,
  type ResultadoExclusao,
} from "@/modules/shared/data/excluirRegistro";
import type { Colaborador, SituacaoColaborador } from "../types";

export function useColaboradores() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<SituacaoColaborador>("todos");
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
      .from("funcionarios")
      .select(
        "id,codigo,nome,apelido,setor,funcao,habilidades,carga_produtiva,telefone,email,data_admissao,observacoes,ativo,created_at,tecnologia_aplicada_id",
      )
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      setErro("Nao foi possivel carregar os colaboradores.");
      setColaboradores([]);
    } else {
      setColaboradores(data ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  async function alternarAtivoColaborador(id: string, ativoAtual: boolean) {
    const { error } = await supabase
      .from("funcionarios")
      .update({ ativo: !ativoAtual })
      .eq("id", id);

    if (error) {
      setErro("Nao foi possivel atualizar o status do colaborador.");
      return;
    }

    await carregarDados();
  }

  async function excluirColaborador(id: string): Promise<ResultadoExclusao> {
    const resultado = await excluirRegistro("funcionarios", id);

    if (resultado.status === "excluido") {
      await carregarDados();
    }

    return resultado;
  }

  const totais = useMemo(
    () => ({
      todos: colaboradores.length,
      ativos: colaboradores.filter((colaborador) => colaborador.ativo === true)
        .length,
      inativos: colaboradores.filter(
        (colaborador) => colaborador.ativo === false,
      ).length,
    }),
    [colaboradores],
  );

  const colaboradoresFiltrados = useMemo(() => {
    let resultado = [...colaboradores];

    if (situacao === "ativos") {
      resultado = resultado.filter((colaborador) => colaborador.ativo === true);
    }

    if (situacao === "inativos") {
      resultado = resultado.filter(
        (colaborador) => colaborador.ativo === false,
      );
    }

    const termo = busca.trim().toLowerCase();

    if (termo) {
      resultado = resultado.filter((colaborador) =>
        [
          colaborador.codigo,
          colaborador.nome,
          colaborador.apelido,
          colaborador.setor,
          colaborador.funcao,
          colaborador.telefone,
          colaborador.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(termo),
      );
    }

    return resultado;
  }, [busca, colaboradores, situacao]);

  return {
    colaboradores: colaboradoresFiltrados,
    busca,
    setBusca,
    situacao,
    setSituacao,
    totais,
    loading,
    erro,
    usuario,
    alternarAtivoColaborador,
    excluirColaborador,
  };
}
