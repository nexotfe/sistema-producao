"use client";

import { useState } from "react";

const proposalItems = [
  {
    product: "Base soldada",
    code: "1243-01",
    ncm: "7326.90.90",
    quantity: "1",
    unitValue: "R$ 713,29",
    totalValue: "R$ 713,29",
  },
  {
    product: "Eixo usinado",
    code: "1244-01",
    ncm: "8483.10.90",
    quantity: "2",
    unitValue: "R$ 282,10",
    totalValue: "R$ 564,20",
  },
];

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

const commercialInfo = [
  ["Nome do Vendedor", "Nome do usuário"],
  ["E-mail do Vendedor", "comercial@nexotfe.com.br"],
  ["Telefone de Contato", "(11) 0000-0000"],
  ["Validade da Proposta", "15 dias"],
  ["Impostos", "Inclusos conforme legislação vigente"],
  ["Condição de Pagamento", "30/45 dias"],
  ["Frete", "A combinar"],
  ["Observações", "Prazo sujeito à confirmação no aceite da proposta."],
];

export default function CommercialProposalPage() {
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-6 text-slate-950 sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <header className="rounded-lg border border-slate-200 bg-white px-6 py-6">
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

              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <span>
                  <strong className="text-slate-800">Proposta nº:</strong>{" "}
                  PC-0001
                </span>
                <span>
                  <strong className="text-slate-800">Revisão:</strong> Rev.00
                </span>
                <span>
                  <strong className="text-slate-800">Data:</strong> 03/07/2026
                </span>
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

        <section className="rounded-lg border border-slate-200 bg-white px-6 py-5">
          <h2 className="text-sm font-bold text-slate-950">
            Informações do Cliente
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                Nome da Empresa
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                EMBRAER
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                CNPJ
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                00.000.000/0001-00
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                E-mail
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                compras@cliente.com.br
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                Nome do Solicitante
              </span>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                João Pereira
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white px-6 py-5">
          <h2 className="text-sm font-bold text-slate-950">Considerações</h2>
          <div className="mt-4 min-h-32 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
            Apresentamos nossa proposta comercial para fornecimento dos itens
            relacionados abaixo, conforme escopo técnico recebido e condições
            comerciais indicadas neste documento.
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
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
                {proposalItems.map((item) => (
                  <tr key={item.code} className="transition hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-800">
                      {item.product}
                    </td>
                    <td className="px-4 py-4 text-slate-700">{item.code}</td>
                    <td className="px-4 py-4 text-slate-700">{item.ncm}</td>
                    <td className="px-4 py-4 text-center text-slate-700">
                      {item.quantity}
                    </td>
                    <td className="px-4 py-4 text-right text-slate-700">
                      {item.unitValue}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-900">
                      {item.totalValue}
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
                  R$ 1.277,49
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white px-6 py-5">
          <h2 className="text-sm font-bold text-slate-950">
            Outras Informações
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {commercialInfo.map(([label, value]) => (
              <div
                key={label}
                className="flex min-h-10 items-center justify-between gap-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="font-semibold text-slate-600">{label}</span>
                <span className="text-right font-medium text-slate-800">
                  {value}
                </span>
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

        <footer className="rounded-lg border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600">
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
          <section className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-xl">
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
                  defaultValue="Proposta Comercial Nº PC-0001"
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
    </main>
  );
}
