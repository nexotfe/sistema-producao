"use client";

import { useState } from "react";

import { ColaboradoresHeader } from "@/modules/colaboradores/components/ColaboradoresHeader";
import { ColaboradoresTable } from "@/modules/colaboradores/components/ColaboradoresTable";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { useColaboradores } from "@/modules/colaboradores/hooks/useColaboradores";

export default function ColaboradoresPage() {
  const [colunasVisiveis, setColunasVisiveis] = useState({
    codigo: true,
    nome: true,
    setor: true,
    funcao: true,
    disponibilidade: true,
    status: true,
  });

  const {
    colaboradores,
    busca,
    setBusca,
    situacao,
    setSituacao,
    totais,
    loading,
    erro,
    usuario,
  } = useColaboradores();

  function exportarColaboradores() {
    const cabecalho = [
      "Codigo",
      "Nome",
      "Apelido",
      "Setor",
      "Funcao",
      "Disponibilidade",
      "Telefone",
      "Email",
      "Status",
    ];

    const linhas = colaboradores.map((colaborador) => [
      colaborador.codigo ?? "",
      colaborador.nome ?? "",
      colaborador.apelido ?? "",
      colaborador.setor ?? "",
      colaborador.funcao ?? "",
      colaborador.disponibilidade_atual ?? "",
      colaborador.telefone ?? "",
      colaborador.email ?? "",
      colaborador.ativo ? "Ativo" : "Inativo",
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
    link.download = "colaboradores.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <ModuleBackLink href="/central" label="Colaboradores" />

        <ColaboradoresHeader
          usuario={usuario}
          busca={busca}
          setBusca={setBusca}
          situacao={situacao}
          setSituacao={setSituacao}
          totais={totais}
          colunasVisiveis={colunasVisiveis}
          setColunasVisiveis={setColunasVisiveis}
          onExportar={exportarColaboradores}
        />

        <ColaboradoresTable
          colaboradores={colaboradores}
          loading={loading}
          erro={erro}
          busca={busca}
          colunasVisiveis={colunasVisiveis}
        />
      </div>
    </main>
  );
}
