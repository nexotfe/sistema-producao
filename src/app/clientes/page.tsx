"use client";

import { useState } from "react";

import { ClientesHeader } from "@/modules/clientes/components/ClientesHeader";
import { ClientesTable } from "@/modules/clientes/components/ClientesTable";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { useClientes } from "@/modules/clientes/hooks/useClientes";

export default function ClientesPage() {
  const [colunasVisiveis, setColunasVisiveis] = useState({
    nomeFantasia: true,
    razaoSocial: true,
    cnpj: true,
    cidade: true,
    status: true,
  });

  const {
    clientes,
    busca,
    setBusca,
    situacao,
    setSituacao,
    totais,
    loading,
    erro,
    usuario,
  } = useClientes();

  function exportarClientes() {
    const cabecalho = [
      "Nome fantasia",
      "Razao social",
      "CNPJ",
      "Cidade",
      "Telefone",
      "Email",
      "Status",
    ];

    const linhas = clientes.map((cliente) => [
      cliente.empresa ?? "",
      cliente.nome ?? "",
      cliente.cnpj ?? "",
      cliente.cidade ?? "",
      cliente.telefone ?? "",
      cliente.email ?? "",
      cliente.ativo ? "Ativo" : "Inativo",
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
    link.download = "clientes.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <ModuleBackLink href="/central" label="Clientes" />

        <ClientesHeader
          usuario={usuario}
          busca={busca}
          setBusca={setBusca}
          situacao={situacao}
          setSituacao={setSituacao}
          totais={totais}
          colunasVisiveis={colunasVisiveis}
          setColunasVisiveis={setColunasVisiveis}
          onExportar={exportarClientes}
        />

        <ClientesTable
          clientes={clientes}
          loading={loading}
          erro={erro}
          busca={busca}
          colunasVisiveis={colunasVisiveis}
        />
      </div>
    </main>
  );
}
