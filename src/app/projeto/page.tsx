"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  ClienteSearchInput,
} from "@/modules/clientes/components/ClienteSearchInput";
import {
  ContatoSearchInput,
  type ContatoSugestao,
  type PrefixoContatoColuna,
} from "@/modules/projetos/components/ContatoSearchInput";
import { ProjetoSearchInput } from "@/modules/projetos/components/ProjetoSearchInput";
import { useProjeto, type ContatoProjeto } from "@/modules/projetos/hooks/useProjeto";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
} from "@/modules/projetos/constants";

const cards = [
  "Identificação do Projeto",
  "Dados do Cliente",
  "Observações",
  "Resumo Operacional",
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

export default function ProjetoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idProjeto = searchParams.get("id");
  const duplicarDeId = searchParams.get("duplicar");

  const {
    projetoId,
    numeroProjeto,
    nome,
    setNome,
    tipoProjeto,
    setTipoProjeto,
    status,
    setStatus,
    cliente,
    setCliente,
    dataObjetivo,
    setDataObjetivo,
    observacoes,
    setObservacoes,
    responsavelNome,
    setResponsavelNome,
    criadoEm,
    pedidoCompraCliente,
    setPedidoCompraCliente,
    documentoCliente,
    setDocumentoCliente,
    contatoComercial,
    setContatoComercial,
    contatoTecnico,
    setContatoTecnico,
    contatoTecnico2,
    setContatoTecnico2,
    resumoOperacional,
    salvando,
    erro,
    salvar,
  } = useProjeto(idProjeto, duplicarDeId);

  const [mensagemSalvar, setMensagemSalvar] = useState<string | null>(null);

  const contatos: {
    label: string;
    prefixo: PrefixoContatoColuna;
    contato: ContatoProjeto;
    setContato: (contato: ContatoProjeto) => void;
  }[] = [
    {
      label: "Contato Comercial",
      prefixo: "contato_comercial",
      contato: contatoComercial,
      setContato: setContatoComercial,
    },
    {
      label: "Contato Técnico",
      prefixo: "contato_tecnico",
      contato: contatoTecnico,
      setContato: setContatoTecnico,
    },
    {
      label: "Contato Técnico 2",
      prefixo: "contato_tecnico_2",
      contato: contatoTecnico2,
      setContato: setContatoTecnico2,
    },
  ];
  const projetoAprovado = status === "aprovado";

  function selecionarContatoSugerido(
    contatoAtual: ContatoProjeto,
    setContato: (contato: ContatoProjeto) => void,
    sugestao: ContatoSugestao,
  ) {
    setContato({
      nome: sugestao.nome,
      email: sugestao.email || contatoAtual.email,
      telefone: sugestao.telefone || contatoAtual.telefone,
      setor: sugestao.setor || contatoAtual.setor,
    });
  }

  async function handleSalvar() {
    setMensagemSalvar(null);
    const resultado = await salvar();

    if (resultado.status === "erro") {
      setMensagemSalvar(resultado.mensagem);
      return;
    }

    setMensagemSalvar("Projeto salvo com sucesso.");

    if (!idProjeto) {
      router.replace(`/projeto?id=${resultado.id}`);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-lg border border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                LOGO
              </div>

              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                Projeto
              </h1>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <ProjetoSearchInput />

              <span className="whitespace-nowrap text-sm font-medium text-slate-500">
                Nome do usuário
              </span>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Voltar
                </button>
                <Link
                  href="/central"
                  className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Início
                </Link>
                <button
                  type="button"
                  onClick={handleSalvar}
                  disabled={salvando}
                  className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
                >
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="flex justify-start gap-2">
          {projetoId ? (
            <Link
              href={`/projetos/novo?id=${projetoId}`}
              className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Orçamento
            </Link>
          ) : (
            <span
              title="Salve o projeto antes de abrir o orçamento."
              className="inline-flex h-10 cursor-not-allowed items-center rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-400"
            >
              Orçamento
            </span>
          )}
        </div>

        {(erro || mensagemSalvar) && (
          <p
            className={`text-sm ${erro ? "text-rose-600" : "text-emerald-600"}`}
          >
            {erro ?? mensagemSalvar}
          </p>
        )}

        <section className="grid gap-6 lg:grid-cols-2">
          {cards.map((card, index) => (
            <article
              key={card}
              className={`min-h-40 rounded-lg border border-slate-200 bg-white px-5 py-5 ${
                index < 2 ? "lg:col-span-2" : ""
              }`}
            >
              <h2 className="text-sm font-bold text-slate-950">{card}</h2>
              {index === 0 ? (
                <div className="mt-5 space-y-5">
                  <div className="grid gap-x-4 gap-y-5 lg:grid-cols-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Projeto
                      </label>
                      <input
                        value={numeroProjeto ?? "Gerado automaticamente"}
                        readOnly
                        className="h-10 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Descrição do Projeto
                      </label>
                      <input
                        value={nome}
                        onChange={(event) => setNome(event.target.value)}
                        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Natureza
                      </label>
                      <select
                        value={tipoProjeto}
                        onChange={(event) =>
                          setTipoProjeto(
                            event.target.value as (typeof PROJECT_TYPES)[number],
                          )
                        }
                        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      >
                        {PROJECT_TYPES.map((tipo) => (
                          <option key={tipo} value={tipo}>
                            {PROJECT_TYPE_LABELS[tipo]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Responsável
                      </label>
                      <input
                        value={responsavelNome}
                        onChange={(event) =>
                          setResponsavelNome(event.target.value)
                        }
                        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  <div className="grid gap-x-4 gap-y-5 lg:grid-cols-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Cliente
                      </label>
                      <ClienteSearchInput value={cliente} onChange={setCliente} />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Status
                      </label>
                      <select
                        value={status}
                        onChange={(event) =>
                          setStatus(
                            event.target.value as (typeof PROJECT_STATUSES)[number],
                          )
                        }
                        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      >
                        {PROJECT_STATUSES.map((valor) => (
                          <option key={valor} value={valor}>
                            {PROJECT_STATUS_LABELS[valor]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Data de Inclusão
                      </label>
                      <input
                        value={formatarData(criadoEm)}
                        readOnly
                        className="h-10 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Data Necessidade
                      </label>
                      <input
                        type="date"
                        value={dataObjetivo}
                        onChange={(event) => setDataObjetivo(event.target.value)}
                        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
              {index === 1 ? (
                <div className="mt-5 space-y-5">
                  <div className="grid gap-x-4 gap-y-5 lg:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Cliente
                      </label>
                      <ClienteSearchInput value={cliente} onChange={setCliente} />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Pedido de Compra do Cliente
                      </label>
                      <input
                        value={pedidoCompraCliente}
                        onChange={(event) =>
                          setPedidoCompraCliente(event.target.value)
                        }
                        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Documento do Cliente
                      </label>
                      <input
                        value={documentoCliente}
                        onChange={(event) =>
                          setDocumentoCliente(event.target.value)
                        }
                        placeholder="OM, Escopo, Contrato, RFQ"
                        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  {contatos.map(({ label, prefixo, contato, setContato }) => (
                    <div key={label} className="grid gap-x-4 gap-y-5 lg:grid-cols-4">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                          {label}
                        </label>
                        <ContatoSearchInput
                          valorNome={contato.nome}
                          onChangeNome={(nome) =>
                            setContato({ ...contato, nome })
                          }
                          onSelecionar={(sugestao) =>
                            selecionarContatoSugerido(contato, setContato, sugestao)
                          }
                          clienteId={cliente?.id ?? null}
                          prefixoColuna={prefixo}
                          projetoIdAtual={idProjeto}
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                          E-mail
                        </label>
                        <input
                          value={contato.email}
                          onChange={(event) =>
                            setContato({ ...contato, email: event.target.value })
                          }
                          className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                          Telefone
                        </label>
                        <input
                          value={contato.telefone}
                          onChange={(event) =>
                            setContato({
                              ...contato,
                              telefone: event.target.value,
                            })
                          }
                          className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                          Setor
                        </label>
                        <input
                          value={contato.setor}
                          onChange={(event) =>
                            setContato({ ...contato, setor: event.target.value })
                          }
                          className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {index === 2 ? (
                <textarea
                  value={observacoes}
                  onChange={(event) => setObservacoes(event.target.value)}
                  placeholder="Informações importantes sobre este projeto..."
                  className="mt-5 h-64 w-full resize-none rounded-md border border-slate-300 px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              ) : null}
              {index === 3 ? (
                <div className="mt-5 divide-y divide-slate-200 rounded-md border border-slate-200">
                  {[
                    [
                      "Nº de Produtos",
                      String(resumoOperacional?.numProdutos ?? 0),
                    ],
                    ["Nº de OFs", String(resumoOperacional?.numOfs ?? 0)],
                    [
                      "Custo Estimado",
                      formatarMoeda(resumoOperacional?.custoEstimado ?? 0),
                    ],
                    ["Custo Real", "Aguardando produção"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
                    >
                      <span
                        className={
                          projetoAprovado
                            ? "font-medium text-slate-600"
                            : "font-medium text-slate-400"
                        }
                      >
                        {label}
                      </span>
                      <span
                        className={
                          projetoAprovado
                            ? "font-semibold text-slate-800"
                            : "font-semibold text-slate-400"
                        }
                      >
                        {projetoAprovado ? value : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
