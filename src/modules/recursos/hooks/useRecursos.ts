"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type {
  GrupoRecurso,
  RecursoProdutivo,
  SituacaoRecurso,
} from "../types";

type RecursoRow = Omit<RecursoProdutivo, "grupo">;

export function useRecursos() {
  const [recursos, setRecursos] = useState<RecursoProdutivo[]>([]);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<SituacaoRecurso>("todos");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [usuario, setUsuario] = useState("Usuario");

  useEffect(() => {
    async function carregarDados() {
      setLoading(true);
      setErro(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.email) {
        setUsuario(user.email);
      }

      const [recursosResult, gruposResult] = await Promise.all([
        supabase
          .from("recursos_produtivos")
          .select(
            "id,grupo_recurso_id,codigo,nome,fabricante,modelo,setor,capacidade,ativo,created_at",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("grupos_recursos")
          .select("id,codigo,nome,setor")
          .order("nome", { ascending: true }),
      ]);

      if (recursosResult.error || gruposResult.error) {
        setErro("Nao foi possivel carregar os recursos produtivos.");
        setRecursos([]);
        setLoading(false);
        return;
      }

      const grupos = (gruposResult.data ?? []) as GrupoRecurso[];
      const gruposPorId = new Map(grupos.map((grupo) => [grupo.id, grupo]));

      setRecursos(
        ((recursosResult.data ?? []) as RecursoRow[]).map((recurso) => ({
          ...recurso,
          grupo: recurso.grupo_recurso_id
            ? gruposPorId.get(recurso.grupo_recurso_id) ?? null
            : null,
        })),
      );
      setLoading(false);
    }

    carregarDados();
  }, []);

  const totais = useMemo(
    () => ({
      todos: recursos.length,
      ativos: recursos.filter((recurso) => recurso.ativo === true).length,
      inativos: recursos.filter((recurso) => recurso.ativo === false).length,
    }),
    [recursos],
  );

  const recursosFiltrados = useMemo(() => {
    let resultado = [...recursos];

    if (situacao === "ativos") {
      resultado = resultado.filter((recurso) => recurso.ativo === true);
    }

    if (situacao === "inativos") {
      resultado = resultado.filter((recurso) => recurso.ativo === false);
    }

    const termo = busca.trim().toLowerCase();

    if (termo) {
      resultado = resultado.filter((recurso) =>
        [
          recurso.codigo,
          recurso.nome,
          recurso.fabricante,
          recurso.modelo,
          recurso.setor,
          recurso.grupo?.codigo,
          recurso.grupo?.nome,
          recurso.grupo?.setor,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(termo),
      );
    }

    return resultado;
  }, [busca, recursos, situacao]);

  return {
    recursos: recursosFiltrados,
    busca,
    setBusca,
    situacao,
    setSituacao,
    totais,
    loading,
    erro,
    usuario,
  };
}
