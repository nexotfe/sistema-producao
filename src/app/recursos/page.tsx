"use client";

import { useState } from "react";

import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { RecursosHeader } from "@/modules/recursos/components/RecursosHeader";
import { RecursosTable } from "@/modules/recursos/components/RecursosTable";
import { useRecursos } from "@/modules/recursos/hooks/useRecursos";

export default function RecursosPage() {
  const [colunasVisiveis, setColunasVisiveis] = useState({
    codigo: true,
    nome: true,
    grupo: true,
    setor: true,
    capacidade: true,
    status: true,
  });

  const {
    recursos,
    busca,
    setBusca,
    situacao,
    setSituacao,
    totais,
    loading,
    erro,
    usuario,
  } = useRecursos();

  function exportarRecursos() {
    const cabecalho = [
      "Codigo",
      "Nome",
      "Grupo",
      "Setor",
      "Fabricante",
      "Modelo",
      "Capacidade",
      "Status",
    ];

    const linhas = recursos.map((recurso) => [
      recurso.codigo ?? "",
      recurso.nome ?? "",
      recurso.grupo?.nome ?? "",
      recurso.setor ?? recurso.grupo?.setor ?? "",
      recurso.fabricante ?? "",
      recurso.modelo ?? "",
      recurso.capacidade ?? "",
      recurso.ativo ? "Ativo" : "Inativo",
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
    link.download = "recursos-produtivos.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <ModuleBackLink href="/central" label="Recursos" />

        <RecursosHeader
          usuario={usuario}
          busca={busca}
          setBusca={setBusca}
          situacao={situacao}
          setSituacao={setSituacao}
          totais={totais}
          colunasVisiveis={colunasVisiveis}
          setColunasVisiveis={setColunasVisiveis}
          onExportar={exportarRecursos}
        />

        <RecursosTable
          recursos={recursos}
          loading={loading}
          erro={erro}
          busca={busca}
          colunasVisiveis={colunasVisiveis}
        />
      </div>
    </main>
  );
}
