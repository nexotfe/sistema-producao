// DEC-007 §6.2/Fase 8b (redesenho: página compacta) - cartão compacto
// de Materiais. O formulário/cálculo (PainelAntecipacaoMaterial.tsx) é
// EXATAMENTE o mesmo já aprovado - só passa a abrir dentro de um Modal
// em vez de ficar sempre visível na página. Nenhum cálculo muda aqui.
//
// CORREÇÃO (achada em teste visual real, projeto 260011, DEC-007):
// `custo` agora vem da previsão comercial NOVA
// (previsaoComercial.saidaAjustada.custoAdicional.negociacaoMaterial),
// nunca mais do motor antigo isolado (resumoMateriais.custoAdicionalTotal).
// "Ganho de prazo" foi REMOVIDO: quando material é combinado com hora
// extra no mesmo cenário (o caso normal), não existe uma avaliação
// SÓ do material para atribuir um ganho isolado a ela - a previsão
// combinada, no bloco principal da tela, já responde "quando entrega"
// para o conjunto. Mostrar um número isolado aqui seria fabricado.
"use client";

import { useState } from "react";
import { Card } from "@/modules/shared/ui/Card";
import { Modal } from "@/modules/shared/ui/Modal";
import { CartaoConfiguracao } from "./CartaoConfiguracao";
import { PainelAntecipacaoMaterial } from "./PainelAntecipacaoMaterial";
import type { BaseCenarios } from "@/modules/simulacao-comercial/lib/cenarios/carregarBaseCenarios";
import type { DecisoesCenario } from "@/modules/simulacao-comercial/lib/cenarios/avaliarCenario";

export interface MateriaisConfiguracaoCardProps {
  base: BaseCenarios;
  disponibilidadeOriginal: string | null;
  dataNegociada: string | null;
  /** Custo da negociação, vindo da previsão comercial nova - null = ainda não calculado. */
  custo: number | null;
  onCalcular: (decisoes: DecisoesCenario) => void;
  calculando?: boolean;
  /**
   * Projeto de Industrialização (orçamento 260007, DEC-007): disponibilidade
   * de material é automática (Data Prevista de Aprovação do Pedido) - sem
   * configuração nem negociação. Estado próprio (ver renderização abaixo):
   * só título + 1 frase citando a data - nunca "Disponibilidade original"/
   * "Data negociada"/"Custo"/"Ainda não calculado" nem o botão "Configurar",
   * para não sugerir que existe negociação de matéria-prima para esta
   * natureza (decisão confirmada com o usuário).
   */
  naturezaIndustrializacao?: boolean;
}

function formatarDataBr(dataIso: string | null): string {
  if (!dataIso) return "—";
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function MateriaisConfiguracaoCard({
  base,
  disponibilidadeOriginal,
  dataNegociada,
  custo,
  onCalcular,
  calculando,
  naturezaIndustrializacao,
}: MateriaisConfiguracaoCardProps) {
  const [aberto, setAberto] = useState(false);

  // Estado específico de Industrialização (orçamento 260007, DEC-007) -
  // internamente o motor já usa a Data Prevista de Aprovação do Pedido
  // como disponibilidade (ver GeradorComparadorCenarios.tsx/
  // prepararJanelaComercial.ts); aqui é só a transparência dessa data,
  // nunca um convite a configurar algo que não existe para esta
  // natureza. `Card` puro (não `CartaoConfiguracao`) de propósito - sem
  // isso o botão "Configurar" apareceria sempre, só desabilitado.
  if (naturezaIndustrializacao) {
    return (
      <Card title="Materiais">
        <p className="text-[13px] leading-[1.6] text-text-secondary">
          Não se aplica para projetos de Industrialização. O material é considerado disponível em{" "}
          {formatarDataBr(disponibilidadeOriginal)}, conforme a aprovação prevista do pedido.
        </p>
      </Card>
    );
  }

  return (
    <>
      <CartaoConfiguracao titulo="Materiais" onConfigurar={() => setAberto(true)}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div>
            <dt className="text-[11.5px] font-semibold text-text-secondary">Disponibilidade original</dt>
            <dd className="text-text-primary">{formatarDataBr(disponibilidadeOriginal)}</dd>
          </div>
          <div>
            <dt className="text-[11.5px] font-semibold text-text-secondary">Data negociada</dt>
            <dd className="text-text-primary">{formatarDataBr(dataNegociada)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[11.5px] font-semibold text-text-secondary">Custo</dt>
            <dd className="text-text-primary">{custo === null ? "Ainda não calculado" : formatarMoeda(custo)}</dd>
          </div>
        </dl>
      </CartaoConfiguracao>

      <Modal open={aberto} onClose={() => setAberto(false)} title="Materiais" size="lg">
        <PainelAntecipacaoMaterial
          base={base}
          onCalcular={(decisoes) => {
            onCalcular(decisoes);
            setAberto(false);
          }}
          calculando={calculando}
        />
      </Modal>
    </>
  );
}
