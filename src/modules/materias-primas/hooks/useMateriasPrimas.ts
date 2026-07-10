"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { MateriaPrima, MateriaPrimaLista } from "../types";

type EstoqueSaldo = {
  materia_prima_id: string;
  saldo_disponivel: number | null;
};

export function useMateriasPrimas() {
  const [materiais, setMateriais] = useState<MateriaPrimaLista[]>([]);
  const [busca, setBusca] = useState("");
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  async function carregarMateriais() {
    setLoading(true);
    setErro(null);

    const { data, error } = await supabase
      .from("materias_primas")
      .select(
        "id,empresa_id,codigo,descricao,familia,unidade,bitola,ncm,endereco,fabricante,marca,material_especificacao,norma,peso_especifico,observacoes_tecnicas,observacoes,custo_referencia,custo_origem,custo_justificativa,ativo,created_at,updated_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      setErro("Não foi possível carregar as matérias-primas.");
      setMateriais([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as MateriaPrima[];
    const ids = rows.map((material) => material.id);
    const quantidades = new Map<string, number>();

    if (ids.length > 0) {
      const { data: saldos } = await supabase
        .from("estoque_saldos")
        .select("materia_prima_id,saldo_disponivel")
        .in("materia_prima_id", ids);

      ((saldos ?? []) as EstoqueSaldo[]).forEach((saldo) => {
        quantidades.set(
          saldo.materia_prima_id,
          (quantidades.get(saldo.materia_prima_id) ?? 0) +
            Number(saldo.saldo_disponivel ?? 0),
        );
      });
    }

    setMateriais(
      rows.map((material) => ({
        ...material,
        quantidade: quantidades.get(material.id) ?? 0,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void carregarMateriais();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const materiaisFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) {
      return materiais;
    }

    return materiais.filter((material) =>
      [
        material.codigo,
        material.descricao,
        material.familia,
        material.bitola,
        material.unidade,
        material.endereco,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(termo),
    );
  }, [busca, materiais]);

  async function inativarMaterial(id: string) {
    const { error } = await supabase
      .from("materias_primas")
      .update({ ativo: false })
      .eq("id", id);

    if (error) {
      setErro("Não foi possível inativar a matéria-prima.");
      return;
    }

    setMenuAberto(null);
    await carregarMateriais();
  }

  return {
    materiais: materiaisFiltrados,
    busca,
    setBusca,
    menuAberto,
    setMenuAberto,
    loading,
    erro,
    inativarMaterial,
  };
}
