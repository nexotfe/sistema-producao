"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type ColumnConfigItem = {
  field: string;
  label: string;
  visible: boolean;
  order: number;
};

function ordenar(colunas: ColumnConfigItem[]) {
  return [...colunas].sort((a, b) => a.order - b.order);
}

function isColumnConfigItem(value: unknown): value is ColumnConfigItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    typeof item.field === "string" &&
    typeof item.label === "string" &&
    typeof item.visible === "boolean" &&
    typeof item.order === "number"
  );
}

/**
 * Busca a configuração de colunas (label, visibilidade, ordem) da empresa
 * do usuário logado em `configuracoes_empresa` (chave = tableKey). Se não
 * houver linha configurada ou o formato vier inválido, cai em defaultColumns
 * silenciosamente — a tela nunca quebra por falta de config.
 */
export function useColumnConfig(
  tableKey: string,
  defaultColumns: ColumnConfigItem[],
) {
  const [columns, setColumns] = useState<ColumnConfigItem[]>(
    ordenar(defaultColumns),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ativo = true;

    async function carregarConfiguracao() {
      setLoading(true);

      const { data, error } = await supabase
        .from("configuracoes_empresa")
        .select("valor")
        .eq("chave", tableKey)
        .maybeSingle();

      if (!ativo) {
        return;
      }

      if (error || !data || !Array.isArray(data.valor)) {
        setColumns(ordenar(defaultColumns));
        setLoading(false);
        return;
      }

      const configuradas = (data.valor as unknown[]).filter(
        isColumnConfigItem,
      );

      setColumns(
        configuradas.length > 0
          ? ordenar(configuradas)
          : ordenar(defaultColumns),
      );
      setLoading(false);
    }

    void carregarConfiguracao();

    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey]);

  function getColumn(field: string): ColumnConfigItem | undefined {
    return columns.find((coluna) => coluna.field === field);
  }

  return { columns, loading, getColumn };
}
