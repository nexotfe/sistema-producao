"use client";

import { useState } from "react";

import { GruposRecursosHeader } from "@/modules/grupos-recursos/components/GruposRecursosHeader";
import { GruposRecursosTable } from "@/modules/grupos-recursos/components/GruposRecursosTable";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { useGruposRecursos } from "@/modules/grupos-recursos/hooks/useGruposRecursos";

export default function GruposRecursosPage() {
  const [colunasVisiveis, setColunasVisiveis] = useState({
    codigo: true,
    nome: true,
    unidade: true,
    status: true,
  });

  const {
    grupos,
    busca,
    setBusca,
    situacao,
    setSituacao,
    totais,
    loading,
    erro,
    usuario,
  } = useGruposRecursos();

  function exportarGrupos() {
    const cabecalho = [
      "Codigo",
      "Nome",
      "Descricao",
      "Unidade de capacidade",
      "Status",
    ];

    const linhas = grupos.map((grupo) => [
      grupo.codigo ?? "",
      grupo.nome ?? "",
      grupo.descricao ?? "",
      grupo.unidade_capacidade ?? "",
      grupo.ativo ? "Ativo" : "Inativo",
    ]);

    const conteudo = [cabecalho, ...linhas]
      .map((linha) =>
        linha
          .map((valor) => `"${String(valor).replaceAll('"', '""')}"`)
          .join(";"),
      )
      .join("\n");

    const arquivo = new Blob([conteudo], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");

    link.href = url;
    link.download = "grupos-recursos.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <ModuleBackLink href="/central" label="Grupos de Recursos" />

        <GruposRecursosHeader
          usuario={usuario}
          busca={busca}
          setBusca={setBusca}
          situacao={situacao}
          setSituacao={setSituacao}
          totais={totais}
          colunasVisiveis={colunasVisiveis}
          setColunasVisiveis={setColunasVisiveis}
          onExportar={exportarGrupos}
        />

        <GruposRecursosTable
          grupos={grupos}
          loading={loading}
          erro={erro}
          busca={busca}
          colunasVisiveis={colunasVisiveis}
        />
      </div>
    </main>
  );
}
