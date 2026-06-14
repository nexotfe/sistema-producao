"use client";

import { useState } from "react";

import { FornecedoresHeader } from "@/modules/fornecedores/components/FornecedoresHeader";
import { FornecedoresTable } from "@/modules/fornecedores/components/FornecedoresTable";
import { useFornecedores } from "@/modules/fornecedores/hooks/useFornecedores";

export default function FornecedoresPage() {
  const [colunasVisiveis, setColunasVisiveis] = useState({
    nomeFantasia: true,
    razaoSocial: true,
    cnpj: true,
    cidade: true,
    status: true,
  });

  const {
    fornecedores,
    busca,
    setBusca,
    situacao,
    setSituacao,
    totais,
    loading,
    erro,
    usuario,
  } = useFornecedores();

  function exportarFornecedores() {
    const cabecalho = [
      "Nome fantasia",
      "Razao social",
      "CNPJ",
      "Cidade",
      "Telefone",
      "Email",
      "Telefone comercial",
      "Email comercial",
      "Status",
    ];

    const linhas = fornecedores.map((fornecedor) => [
      fornecedor.empresa ?? "",
      fornecedor.nome ?? "",
      fornecedor.cnpj ?? "",
      fornecedor.cidade ?? "",
      fornecedor.telefone ?? "",
      fornecedor.email ?? "",
      fornecedor.telefone_comercial ?? "",
      fornecedor.email_comercial ?? "",
      fornecedor.ativo ? "Ativo" : "Inativo",
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
    link.download = "fornecedores.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <FornecedoresHeader
          usuario={usuario}
          busca={busca}
          setBusca={setBusca}
          situacao={situacao}
          setSituacao={setSituacao}
          totais={totais}
          colunasVisiveis={colunasVisiveis}
          setColunasVisiveis={setColunasVisiveis}
          onExportar={exportarFornecedores}
        />

        <FornecedoresTable
          fornecedores={fornecedores}
          loading={loading}
          erro={erro}
          busca={busca}
          colunasVisiveis={colunasVisiveis}
        />
      </div>
    </main>
  );
}
