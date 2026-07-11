"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { proximaRevisao, useProposta } from "@/modules/projetos/hooks/useProposta";

const companyContactInfo = [
  ["Site", "www.nexotfe.com.br"],
  ["E-mail", "comercial@nexotfe.com.br"],
  ["Telefone", "(11) 0000-0000"],
];

const companyLegalInfo = [
  ["CNPJ", "00.000.000/0001-00"],
  ["Inscrição Estadual", "000.000.000.000"],
  ["Inscrição Municipal", "0000000"],
];

const companyAddress = [
  ["Endereço", "Av. Industrial, 1000"],
  ["Cidade", "São Paulo"],
  ["Estado", "SP"],
  ["CEP", "00000-000"],
];

function formatarData(iso: string | null) {
  if (!iso) {
    return "—";
  }

  return new Date(iso).toLocaleDateString("pt-BR");
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CommercialProposalPage() {
  const searchParams = useSearchParams();
  const idProjeto = searchParams.get("projeto");

  const {
    loading,
    erro,
    numeroProposta,
    criadoEm,
    cliente,
    nomeSolicitante,
    responsavelNome,
    itens,
    valorTotalProposta,
    revisao,
    salvandoRevisao,
    avancarRevisao,
    consideracoes,
    salvandoConsideracoes,
    salvarConsideracoes,
  } = useProposta(idProjeto);

  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [isRevisaoModalOpen, setIsRevisaoModalOpen] = useState(false);
  const [textoConsideracoes, setTextoConsideracoes] = useState(consideracoes);

  useEffect(() => {
    setTextoConsideracoes(consideracoes);
  }, [consideracoes]);

  async function handleConfirmarNovaRevisao() {
    setIsRevisaoModalOpen(false);
    await avancarRevisao();
  }

  // "Outras Informações" ainda sem schema proprio - campos visuais e
  // editáveis em tela, SEM persistência real nesta rodada (mesmo
  // tratamento dado a campos equivalentes na tela de Projeto antes de
  // ganharem coluna). Nome do Vendedor tem como sugestão inicial o
  // usuário logado (não existe coluna "responsavel" persistida em
  // projetos - mesma aproximação usada no Orçamento).
  const [nomeVendedor, setNomeVendedor] = useState("");
  const [emailVendedor, setEmailVendedor] = useState("comercial@nexotfe.com.br");
  const [telefoneContato, setTelefoneContato] = useState("(11) 0000-0000");
  const [validadeProposta, setValidadeProposta] = useState("15 dias");
  const [impostosInfo, setImpostosInfo] = useState(
    "Inclusos conforme legislação vigente",
  );
  const [condicaoPagamento, setCondicaoPagamento] = useState("30/45 dias");
  const [frete, setFrete] = useState("A combinar");
  const [observacoesProposta, setObservacoesProposta] = useState(
    "Prazo sujeito à confirmação no aceite da proposta.",
  );

  useEffect(() => {
    if (responsavelNome) {
      setNomeVendedor((atual) => atual || responsavelNome);
    }
  }, [responsavelNome]);

  const outrasInformacoes: [string, string, (valor: string) => void][] = [
    ["Nome do Vendedor", nomeVendedor, setNomeVendedor],
    ["E-mail do Vendedor", emailVendedor, setEmailVendedor],
    ["Telefone de Contato", telefoneContato, setTelefoneContato],
    ["Validade da Proposta", validadeProposta, setValidadeProposta],
    ["Impostos", impostosInfo, setImpostosInfo],
    ["Condição de Pagamento", condicaoPagamento, setCondicaoPagamento],
    ["Frete", frete, setFrete],
    ["Observações", observacoesProposta, setObservacoesProposta],
  ];

  return (
    <main className="min-h-screen bg-app-bg px-5 py-6 text-slate-950 sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        {(erro || loading) && (
          <p className="text-sm text-slate-500">
            {erro ?? (idProjeto ? "Carregando proposta..." : null)}
          </p>
        )}

        <header className="rounded-lg border border-slate-200 bg-app-card px-6 py-6">
          <div className="flex min-w-0 gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
              LOGO
            </div>

            <div className="min-w-0 space-y-3 text-sm text-slate-600">
              <div>
                <p className="text-base font-semibold text-slate-800">
                  Nome da Empresa
                </p>
                <h1 className="mt-1 text-lg font-bold tracking-wide text-slate-950">
                  PROPOSTA COMERCIAL
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <span>
                  <strong className="text-slate-800">Proposta nº:</strong>{" "}
                  {numeroProposta ?? "—"}
                </span>
                <span>
                  <strong className="text-slate-800">Revisão:</strong> Rev.
                  {revisao}
                </span>
                <span>
                  <strong className="text-slate-800">Data:</strong>{" "}
                  {formatarData(criadoEm)}
                </span>
                <button
                  type="button"
                  onClick={() => setIsRevisaoModalOpen(true)}
                  disabled={salvandoRevisao || !numeroProposta}
                  className="h-8 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Nova Revisão
                </button>
              </div>

              <div className="flex flex-wrap gap-x-2 gap-y-1">
                {companyContactInfo.map(([label, value], index) => (
                  <span key={label}>
                    <strong className="text-slate-800">{label}:</strong>{" "}
                    {value}
                    {index < companyContactInfo.length - 1 ? (
                      <span className="px-2 text-slate-300">|</span>
                    ) : null}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-x-2 gap-y-1">
                {companyLegalInfo.map(([label, value], index) => (
                  <span key={label}>
                    <strong className="text-slate-800">{label}:</strong>{" "}
                    {value}
                    {index < companyLegalInfo.length - 1 ? (
                      <span className="px-2 text-slate-300">|</span>
                    ) : null}
                  </span>
                ))}
              </div>

              <p>
                <strong className="text-slate-800">Endereço:</strong>{" "}
                {companyAddress[0][1]} - {companyAddress[1][1]}/
                {companyAddress[2][1]} - CEP {companyAddress[3][1]}
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-app-card px-6 py-5">
          <h2 className="text-sm font-bold text-slate-950">
            Informações do Cliente
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                Nome da Empresa
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                {cliente?.nome || "—"}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                CNPJ
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                {cliente?.cnpj || "—"}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                E-mail
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                {cliente?.email || "—"}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                Nome do Solicitante
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                {nomeSolicitante || "—"}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-app-card px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-bold text-slate-950">Considerações</h2>
            <button
              type="button"
              onClick={() => salvarConsideracoes(textoConsideracoes)}
              disabled={
                salvandoConsideracoes ||
                !numeroProposta ||
                textoConsideracoes === consideracoes
              }
              className="h-8 rounded-md bg-blue-700 px-3 text-xs font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {salvandoConsideracoes ? "Salvando..." : "Salvar"}
            </button>
          </div>
          <textarea
            value={textoConsideracoes}
            onChange={(event) => setTextoConsideracoes(event.target.value)}
            className="mt-4 min-h-32 w-full resize-y rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </section>

        <section className="rounded-lg border border-slate-200 bg-app-card">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-sm font-bold text-slate-950">
              Itens da Proposta
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-semibold">Produto</th>
                  <th className="px-4 py-3 font-semibold">Código</th>
                  <th className="px-4 py-3 font-semibold">NCM</th>
                  <th className="px-4 py-3 text-center font-semibold">Qtd</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Valor Unitário
                  </th>
                  <th className="px-6 py-3 text-right font-semibold">
                    Valor Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itens.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-800">
                      {item.descricao}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-700">{item.codigo}</td>
                    <td className="px-4 py-4 text-slate-700">
                      {item.ncm || "—"}
                    </td>
                    <td className="px-4 py-4 text-center text-slate-700">
                      {item.quantidade}
                    </td>
                    <td className="px-4 py-4 text-right text-slate-700">
                      {formatarMoeda(item.valorUnitario)}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-900">
                      {formatarMoeda(item.valorTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end border-t border-slate-200 px-6 py-4">
            <div className="w-full max-w-sm rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-bold text-slate-700">
                  Valor Total da Proposta
                </span>
                <span className="text-lg font-bold text-slate-950">
                  {formatarMoeda(valorTotalProposta)}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-app-card px-6 py-5">
          <h2 className="text-sm font-bold text-slate-950">
            Outras Informações
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {outrasInformacoes.map(([label, value, setValue]) => (
              <div
                key={label}
                className="flex min-h-10 items-center justify-between gap-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="whitespace-nowrap font-semibold text-slate-600">
                  {label}
                </span>
                <input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  className="w-full bg-transparent text-right font-medium text-slate-800 outline-none"
                />
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-end gap-2">
          {/*
            TODO: permitir anexar documentos técnicos e comerciais à proposta:
            desenhos, especificações, fotos, catálogos, certificados e outros
            documentos de apoio.
          */}
          <button
            type="button"
            className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Anexos
          </button>

          {/*
            TODO: gerar o PDF final da proposta comercial para envio ao cliente.
          */}
          <button
            type="button"
            className="h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
          >
            Gerar PDF
          </button>

          <button
            type="button"
            onClick={() => setIsSendModalOpen(true)}
            className="h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
          >
            Enviar Proposta
          </button>
        </div>

        <footer className="rounded-lg border border-slate-200 bg-app-card px-6 py-4 text-sm text-slate-600">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <span className="font-semibold text-slate-800">Nome da Empresa</span>
            <span>www.nexotfe.com.br</span>
            <span>comercial@nexotfe.com.br</span>
            <span>(11) 0000-0000</span>
            <span>Av. Industrial, 1000 - São Paulo/SP</span>
          </div>
        </footer>
      </div>

      {isSendModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
          <section className="w-full max-w-2xl rounded-lg border border-slate-200 bg-app-card shadow-xl">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-base font-bold text-slate-950">
                Enviar Proposta Comercial
              </h2>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Destinatário
                </h3>
                <div className="mt-3 grid gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Para
                    </label>
                    <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        CC
                      </label>
                      <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        CCO
                      </label>
                      <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Assunto
                </h3>
                <input
                  defaultValue={`Proposta Comercial Nº ${numeroProposta ?? ""}`}
                  className="mt-3 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Mensagem
                </h3>
                <textarea
                  defaultValue={`Prezado(a),

Conforme solicitado, encaminhamos nossa Proposta Comercial para sua análise.

Permanecemos à disposição para quaisquer esclarecimentos.

Atenciosamente,

Nome da Empresa`}
                  className="mt-3 min-h-44 w-full resize-y rounded-md border border-slate-300 px-3 py-3 text-sm leading-6 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Anexos
                </h3>
                <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="h-4 w-4" />
                    Proposta Comercial (PDF)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="h-4 w-4" />
                    Documentos Técnicos
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setIsSendModalOpen(false)}
                className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>

              {/*
                TODO: ao enviar, registrar no histórico da proposta:
                data e hora, usuário, destinatário, número da proposta,
                documentos anexados e status "Proposta Enviada".
              */}
              <button
                type="button"
                className="h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
              >
                Enviar Proposta
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isRevisaoModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
          <section className="w-full max-w-md rounded-lg border border-slate-200 bg-app-card shadow-xl">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-base font-bold text-slate-950">
                Confirmar nova revisão
              </h2>
            </div>

            <div className="px-6 py-5 text-sm text-slate-700">
              Confirma nova revisão da proposta? Isso mudará de Rev.
              {revisao} para Rev.{proximaRevisao(revisao)}.
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setIsRevisaoModalOpen(false)}
                className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleConfirmarNovaRevisao}
                disabled={salvandoRevisao}
                className="h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Confirmar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
