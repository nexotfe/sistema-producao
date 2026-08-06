"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [versaoRecarga, setVersaoRecarga] = useState(0);

  useEffect(() => {
    let cancelado = false;

    async function carregarDados() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelado) return;
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
      if (cancelado) return;

      if (error) {
        setErro("Nao foi possivel carregar os colaboradores.");
        setColaboradores([]);
      } else {
        setErro(null);
        setColaboradores(data ?? []);
      }
      setLoading(false);
    }

    carregarDados();

    return () => {
      cancelado = true;
    };
  }, [versaoRecarga]);

  async function alternarAtivoColaborador(id: string, ativoAtual: boolean) {
    const { error } = await supabase
      .from("funcionarios")
      .update({ ativo: !ativoAtual })
      .eq("id", id);

    if (error) {
      setErro("Nao foi possivel atualizar o status do colaborador.");
      return;
    }

    setLoading(true);
    setVersaoRecarga((v) => v + 1);
  }

  async function excluirColaborador(id: string): Promise<ResultadoExclusao> {
    const resultado = await excluirRegistro("funcionarios", id);

    if (resultado.status === "excluido") {
      setLoading(true);
      setVersaoRecarga((v) => v + 1);
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
