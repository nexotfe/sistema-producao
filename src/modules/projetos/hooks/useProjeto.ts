"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ClienteResumo } from "@/modules/clientes/components/ClienteSearchInput";
import type { ProjectStatus, ProjectType } from "../types";

export type ContatoProjeto = {
  nome: string;
  email: string;
  telefone: string;
  setor: string;
};

const contatoVazio: ContatoProjeto = {
  nome: "",
  email: "",
  telefone: "",
  setor: "",
};

type ProjetoRow = {
  id: string;
  numero_projeto: string;
  nome: string;
  tipo_projeto: ProjectType;
  status: ProjectStatus;
  cliente_id: string | null;
  data_objetivo: string | null;
  observacoes: string | null;
  created_at: string;
  pedido_compra_cliente: string | null;
  documento_cliente: string | null;
  contato_comercial_nome: string | null;
  contato_comercial_email: string | null;
  contato_comercial_telefone: string | null;
  contato_comercial_setor: string | null;
  contato_tecnico_nome: string | null;
  contato_tecnico_email: string | null;
  contato_tecnico_telefone: string | null;
  contato_tecnico_setor: string | null;
  contato_tecnico_2_nome: string | null;
  contato_tecnico_2_email: string | null;
  contato_tecnico_2_telefone: string | null;
  contato_tecnico_2_setor: string | null;
};

function contatoDaLinha(
  linha: ProjetoRow,
  prefixo: "contato_comercial" | "contato_tecnico" | "contato_tecnico_2",
): ContatoProjeto {
  return {
    nome: linha[`${prefixo}_nome`] ?? "",
    email: linha[`${prefixo}_email`] ?? "",
    telefone: linha[`${prefixo}_telefone`] ?? "",
    setor: linha[`${prefixo}_setor`] ?? "",
  };
}

type ResumoOperacional = {
  numProdutos: number;
  numOfs: number;
  custoEstimado: number;
};

type BomEscolhaRow = {
  id: string;
  status: string;
  created_at: string;
};

type ResultadoSalvar =
  | { status: "ok"; id: string }
  | { status: "erro"; mensagem: string };

type ItemParaDuplicar = {
  produto_id: string;
  pn: string;
  descricao: string;
  revisao: string | null;
  quantidade: number;
  material: string | null;
  tipo_item: string | null;
};

export function useProjeto(
  idInicial: string | null,
  duplicarDeId: string | null = null,
) {
  const [projetoId, setProjetoId] = useState<string | null>(idInicial);
  const [numeroProjeto, setNumeroProjeto] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [tipoProjeto, setTipoProjeto] = useState<ProjectType>("fabricacao");
  const [status, setStatus] = useState<ProjectStatus>("rascunho");
  const [cliente, setCliente] = useState<ClienteResumo | null>(null);
  const [dataObjetivo, setDataObjetivo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [responsavelNome, setResponsavelNome] = useState("");
  const [criadoEm, setCriadoEm] = useState<string | null>(null);

  const [pedidoCompraCliente, setPedidoCompraCliente] = useState("");
  const [documentoCliente, setDocumentoCliente] = useState("");
  const [contatoComercial, setContatoComercial] =
    useState<ContatoProjeto>(contatoVazio);
  const [contatoTecnico, setContatoTecnico] =
    useState<ContatoProjeto>(contatoVazio);
  const [contatoTecnico2, setContatoTecnico2] =
    useState<ContatoProjeto>(contatoVazio);

  const [resumoOperacional, setResumoOperacional] =
    useState<ResumoOperacional | null>(null);

  // Estado "invisivel" do modo Duplicar: /projeto nao tem campos de
  // Margem/Carga Tributaria nem de itens na tela, mas esses dados
  // precisam ser carregados junto do projeto de origem e só gravados
  // quando o usuario clicar Salvar de verdade (nunca no clique de
  // "Duplicar" em si - ver ProjectDetailsPageContent.tsx).
  const [margemLucroPercentDuplicado, setMargemLucroPercentDuplicado] =
    useState<number | null>(null);
  const [cargaTributariaPercentDuplicado, setCargaTributariaPercentDuplicado] =
    useState<number | null>(null);
  const [itensParaDuplicar, setItensParaDuplicar] = useState<
    ItemParaDuplicar[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const salvandoRef = useRef(false);

  const carregarResumoOperacional = useCallback(
    async (idProjeto: string, tipoAtual: ProjectType) => {
      const [{ data: itens }, { count: numOfs }] = await Promise.all([
        supabase
          .from("projeto_itens")
          .select("produto_id,quantidade,custo_congelado")
          .eq("projeto_id", idProjeto)
          .is("deleted_at", null),
        supabase
          .from("ordens_fabricacao")
          .select("id", { count: "exact", head: true })
          .eq("projeto_id", idProjeto)
          .is("deleted_at", null),
      ]);

      const linhas = (itens ?? []) as {
        produto_id: string;
        quantidade: number;
        custo_congelado: number | null;
      }[];

      const excluirMateriaPrima = tipoAtual === "industrializacao";
      let custoEstimado = 0;

      for (const item of linhas) {
        if (item.custo_congelado !== null) {
          custoEstimado += Number(item.custo_congelado) * item.quantidade;
          continue;
        }

        const { data: boms } = await supabase
          .from("boms")
          .select("id,status,created_at")
          .eq("produto_id", item.produto_id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });

        const bomsLista = (boms ?? []) as BomEscolhaRow[];
        const bomEscolhido =
          bomsLista.find((bom) => bom.status === "ativo") ?? bomsLista[0];

        if (!bomEscolhido) {
          continue;
        }

        const { data: custo } = await supabase.rpc("calcular_custo_bom", {
          p_bom_id: bomEscolhido.id,
          p_excluir_materia_prima: excluirMateriaPrima,
        });

        const total = ((custo ?? []) as { categoria: string; valor: number }[]).find(
          (linha) => linha.categoria === "total",
        )?.valor;

        custoEstimado += Number(total ?? 0) * item.quantidade;
      }

      setResumoOperacional({
        numProdutos: linhas.length,
        numOfs: numOfs ?? 0,
        custoEstimado,
      });
    },
    [],
  );

  useEffect(() => {
    async function carregar() {
      setLoading(true);
      setErro(null);

      const { data: userData } = await supabase.auth.getUser();

      if (userData.user) {
        const { data: usuario } = await supabase
          .from("usuarios")
          .select("nome")
          .eq("id", userData.user.id)
          .single();

        if (usuario?.nome) {
          setResponsavelNome((atual) => atual || usuario.nome);
        }
      }

      if (!idInicial && duplicarDeId) {
        const { data: origem, error: origemError } = await supabase
          .from("projetos")
          .select(
            `nome,tipo_projeto,cliente_id,data_objetivo,observacoes,
            margem_lucro_percent,carga_tributaria_percent,
            pedido_compra_cliente,documento_cliente,
            contato_comercial_nome,contato_comercial_email,contato_comercial_telefone,contato_comercial_setor,
            contato_tecnico_nome,contato_tecnico_email,contato_tecnico_telefone,contato_tecnico_setor,
            contato_tecnico_2_nome,contato_tecnico_2_email,contato_tecnico_2_telefone,contato_tecnico_2_setor`,
          )
          .eq("id", duplicarDeId)
          .is("deleted_at", null)
          .maybeSingle();

        if (origemError || !origem) {
          setErro("Não foi possível carregar o projeto de origem para duplicar.");
          setLoading(false);
          return;
        }

        const projetoOrigem = origem as unknown as ProjetoRow & {
          margem_lucro_percent: number;
          carga_tributaria_percent: number | null;
        };

        setNome(projetoOrigem.nome);
        setTipoProjeto(projetoOrigem.tipo_projeto);
        setDataObjetivo(projetoOrigem.data_objetivo ?? "");
        setObservacoes(projetoOrigem.observacoes ?? "");
        setPedidoCompraCliente(projetoOrigem.pedido_compra_cliente ?? "");
        setDocumentoCliente(projetoOrigem.documento_cliente ?? "");
        setContatoComercial(contatoDaLinha(projetoOrigem, "contato_comercial"));
        setContatoTecnico(contatoDaLinha(projetoOrigem, "contato_tecnico"));
        setContatoTecnico2(contatoDaLinha(projetoOrigem, "contato_tecnico_2"));
        setMargemLucroPercentDuplicado(Number(projetoOrigem.margem_lucro_percent));
        setCargaTributariaPercentDuplicado(
          projetoOrigem.carga_tributaria_percent !== null
            ? Number(projetoOrigem.carga_tributaria_percent)
            : null,
        );

        if (projetoOrigem.cliente_id) {
          const { data: clienteData } = await supabase
            .from("clientes")
            .select("id,nome")
            .eq("id", projetoOrigem.cliente_id)
            .single();

          if (clienteData) {
            setCliente({ id: clienteData.id, nome: clienteData.nome ?? "" });
          }
        }

        const { data: itensOrigem } = await supabase
          .from("projeto_itens")
          .select("produto_id,pn,descricao,revisao,quantidade,material,tipo_item")
          .eq("projeto_id", duplicarDeId);

        setItensParaDuplicar((itensOrigem ?? []) as ItemParaDuplicar[]);

        // projetoId/numeroProjeto permanecem null de propósito: isso é um
        // rascunho novo, nada foi gravado no banco ainda. Não bloqueado
        // por status='aprovado' porque nunca há projetoId aqui.
        setLoading(false);
        return;
      }

      if (!idInicial) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("projetos")
        .select(
          `id,numero_projeto,nome,tipo_projeto,status,cliente_id,data_objetivo,observacoes,created_at,
          pedido_compra_cliente,documento_cliente,
          contato_comercial_nome,contato_comercial_email,contato_comercial_telefone,contato_comercial_setor,
          contato_tecnico_nome,contato_tecnico_email,contato_tecnico_telefone,contato_tecnico_setor,
          contato_tecnico_2_nome,contato_tecnico_2_email,contato_tecnico_2_telefone,contato_tecnico_2_setor`,
        )
        .eq("id", idInicial)
        .is("deleted_at", null)
        .single();

      if (error || !data) {
        setErro("Não foi possível carregar o projeto.");
        setLoading(false);
        return;
      }

      const projeto = data as unknown as ProjetoRow;

      setProjetoId(projeto.id);
      setNumeroProjeto(projeto.numero_projeto);
      setNome(projeto.nome);
      setTipoProjeto(projeto.tipo_projeto);
      setStatus(projeto.status);
      setDataObjetivo(projeto.data_objetivo ?? "");
      setObservacoes(projeto.observacoes ?? "");
      setCriadoEm(projeto.created_at);
      setPedidoCompraCliente(projeto.pedido_compra_cliente ?? "");
      setDocumentoCliente(projeto.documento_cliente ?? "");
      setContatoComercial(contatoDaLinha(projeto, "contato_comercial"));
      setContatoTecnico(contatoDaLinha(projeto, "contato_tecnico"));
      setContatoTecnico2(contatoDaLinha(projeto, "contato_tecnico_2"));

      if (projeto.cliente_id) {
        const { data: clienteData } = await supabase
          .from("clientes")
          .select("id,nome")
          .eq("id", projeto.cliente_id)
          .single();

        if (clienteData) {
          setCliente({ id: clienteData.id, nome: clienteData.nome ?? "" });
        }
      }

      if (projeto.status === "aprovado") {
        await carregarResumoOperacional(projeto.id, projeto.tipo_projeto);
      }

      setLoading(false);
    }

    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idInicial, duplicarDeId]);

  useEffect(() => {
    if (!projetoId) {
      setResumoOperacional(null);
      return;
    }

    if (status === "aprovado") {
      carregarResumoOperacional(projetoId, tipoProjeto);
    } else {
      setResumoOperacional(null);
    }
  }, [projetoId, status, tipoProjeto, carregarResumoOperacional]);

  async function salvar(): Promise<ResultadoSalvar> {
    if (!nome.trim()) {
      return { status: "erro", mensagem: "Informe a descrição do projeto." };
    }

    if (!cliente) {
      return { status: "erro", mensagem: "Selecione o cliente." };
    }

    if (salvandoRef.current) {
      return { status: "erro", mensagem: "Salvamento já em andamento." };
    }

    salvandoRef.current = true;
    setSalvando(true);
    setErro(null);

    try {
      const payload = {
        nome: nome.trim(),
        tipo_projeto: tipoProjeto,
        status,
        cliente_id: cliente.id,
        data_objetivo: dataObjetivo || null,
        observacoes: observacoes.trim() || null,
        pedido_compra_cliente: pedidoCompraCliente.trim() || null,
        documento_cliente: documentoCliente.trim() || null,
        contato_comercial_nome: contatoComercial.nome.trim() || null,
        contato_comercial_email: contatoComercial.email.trim() || null,
        contato_comercial_telefone: contatoComercial.telefone.trim() || null,
        contato_comercial_setor: contatoComercial.setor.trim() || null,
        contato_tecnico_nome: contatoTecnico.nome.trim() || null,
        contato_tecnico_email: contatoTecnico.email.trim() || null,
        contato_tecnico_telefone: contatoTecnico.telefone.trim() || null,
        contato_tecnico_setor: contatoTecnico.setor.trim() || null,
        contato_tecnico_2_nome: contatoTecnico2.nome.trim() || null,
        contato_tecnico_2_email: contatoTecnico2.email.trim() || null,
        contato_tecnico_2_telefone: contatoTecnico2.telefone.trim() || null,
        contato_tecnico_2_setor: contatoTecnico2.setor.trim() || null,
      };

      if (projetoId) {
        const { error } = await supabase
          .from("projetos")
          .update(payload)
          .eq("id", projetoId);

        if (error) {
          setErro("Não foi possível salvar o projeto.");
          return { status: "erro", mensagem: error.message };
        }

        return { status: "ok", id: projetoId };
      }

      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        return { status: "erro", mensagem: "Usuário não autenticado." };
      }

      const { data: usuario, error: usuarioError } = await supabase
        .from("usuarios")
        .select("empresa_id")
        .eq("id", userData.user.id)
        .single();

      if (usuarioError || !usuario?.empresa_id) {
        return { status: "erro", mensagem: "Empresa do usuário não encontrada." };
      }

      const { data, error } = await supabase
        .from("projetos")
        .insert({
          ...payload,
          ...(margemLucroPercentDuplicado !== null
            ? { margem_lucro_percent: margemLucroPercentDuplicado }
            : {}),
          ...(cargaTributariaPercentDuplicado !== null
            ? { carga_tributaria_percent: cargaTributariaPercentDuplicado }
            : {}),
          empresa_id: usuario.empresa_id,
          created_by: userData.user.id,
        })
        .select("id,numero_projeto")
        .single();

      if (error || !data) {
        setErro("Não foi possível criar o projeto.");
        return { status: "erro", mensagem: error?.message ?? "Erro desconhecido." };
      }

      if (itensParaDuplicar.length > 0) {
        const novosItens = itensParaDuplicar.map((item) => ({
          ...item,
          projeto_id: data.id,
          empresa_id: usuario.empresa_id,
          created_by: userData.user.id,
        }));

        const { error: itensError } = await supabase
          .from("projeto_itens")
          .insert(novosItens);

        if (itensError) {
          setErro(
            `Projeto ${data.numero_projeto} criado, mas falha ao copiar os itens: ${itensError.message}`,
          );
          return {
            status: "erro",
            mensagem: `Projeto ${data.numero_projeto} criado, mas falha ao copiar os itens: ${itensError.message}`,
          };
        }
      }

      setProjetoId(data.id);
      setNumeroProjeto(data.numero_projeto);

      return { status: "ok", id: data.id };
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
  }

  return {
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

    loading,
    salvando,
    erro,
    salvar,
  };
}
