// DEC-007 §6.2/Fase 8b (redesenho: regras semanais compactas) - cartão
// compacto de Capacidade e recursos. Linguagem comercial direta (pedido
// do usuário após um bug real de teste manual: 1h segunda + 1h terça
// apresentava 11h porque a regra repetia em todas as semanas do
// cenário - corrigido em expandirRegraSemanal.ts/
// construirDecisoesCapacidadeExtraDeRegras.ts). Duas fontes de dado
// DIFERENTES, nunca confundidas:
// - "Disponibilizadas" vem de `resumo` (ResumoCapacidadeRecursos,
//   calculado dentro de JanelaCapacidadeRecursos.tsx a partir das
//   REGRAS que acabaram de ser configuradas - quanto foi AUTORIZADO,
//   nunca necessariamente usado - eco da configuração, não resultado de
//   cálculo nenhum).
// - "Utilizadas"/"custo utilizado" vêm de props calculadas no
//   componente pai (GeradorComparadorCenarios.tsx) A PARTIR DO MOTOR
//   NOVO (previsaoComercial.saidaAjustada.capacidadeUtilizada/custoAdicional)
//   - CORREÇÃO (achada em teste visual real, projeto 260011, DEC-007):
//   antes vinham do motor ANTIGO (resumoCapacidadeExtra, isolado das
//   demais alternativas) e contradiziam a previsão comercial nova
//   (ex.: "0h utilizadas" enquanto a previsão cobrava custo de hora
//   adicional de verdade). "Nova entrega"/"dias antecipados" (conceitos
//   exclusivos do motor antigo - "esta alternativa isolada") foram
//   REMOVIDOS deste cartão: a previsão comercial combinada, no bloco
//   principal da tela, já é quem responde "quando entrega" - mostrar um
//   número isolado aqui de novo criaria a mesma contradição.
"use client";

import { useState } from "react";
import { Modal } from "@/modules/shared/ui/Modal";
import { CartaoConfiguracao } from "./CartaoConfiguracao";
import {
  JanelaCapacidadeRecursos,
  type ResumoCapacidadeRecursos,
  type RegraInterna,
  type RecursoTemporarioLocal,
} from "./JanelaCapacidadeRecursos";
import type { BaseCenarios } from "@/modules/simulacao-comercial/lib/cenarios/carregarBaseCenarios";
import type { DecisoesCenario } from "@/modules/simulacao-comercial/lib/cenarios/avaliarCenario";
import type { NecessidadeCapacidadeFlexivel } from "@/modules/simulacao-comercial/lib/cenarios/necessidadeCapacidadeFlexivel";
import type { DetalhamentoRecursoPrevisaoComercial } from "@/modules/simulacao-comercial/lib/cenarios/detalhamentoCapacidadePorRecurso";
import type { NomesDiagnostico } from "@/modules/simulacao-comercial/lib/cenarios/carregarNomesDiagnostico";

export interface CapacidadeRecursosConfiguracaoCardProps {
  base: BaseCenarios;
  /** Fonte de verdade do motor novo (Etapa C) para o seletor "Recurso" - ver JanelaCapacidadeRecursosProps. */
  necessidadesOrcamentoNovo: readonly NecessidadeCapacidadeFlexivel[];
  empresaId: string;
  janelaInicio: string;
  prazoInterno: string;
  onCalcular: (decisoes: DecisoesCenario) => void;
  calculando?: boolean;
  /** Horas adicionais REALMENTE alocadas pela previsão comercial nova (nunca o teto disponibilizado) - null = previsão nova ainda não calculada. */
  horasUtilizadas: number | null;
  /** Custo adicional de hora extra EFETIVAMENTE utilizado pela previsão comercial nova (nunca o potencial máximo) - null = ainda não calculado. */
  custoUtilizado: number | null;
  /** Mesma fonte de horasUtilizadas/custoUtilizado, por recurso - correção de transparência (DEC-007 §6.2, achada em teste visual real, projeto 260011: "a tela não explica qual recurso consumiu as horas"). [] = previsão nova ainda não calculada. */
  detalhamentoPorRecurso: readonly DetalhamentoRecursoPrevisaoComercial[];
  nomesRecursos: NomesDiagnostico["recursos"];
}

function formatarDataBr(dataIso: string | null): string {
  if (!dataIso) return "—";
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarHoras(horas: number): string {
  return `${horas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
}

const PAPEL_LABEL: Record<DetalhamentoRecursoPrevisaoComercial["papel"], string> = {
  original: "Original",
  compativel: "Alternativo",
  temporario: "Temporário",
};

export function CapacidadeRecursosConfiguracaoCard({
  base,
  necessidadesOrcamentoNovo,
  empresaId,
  janelaInicio,
  prazoInterno,
  onCalcular,
  calculando,
  horasUtilizadas,
  custoUtilizado,
  detalhamentoPorRecurso,
  nomesRecursos,
}: CapacidadeRecursosConfiguracaoCardProps) {
  const [aberto, setAberto] = useState(false);
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false);
  const [resumo, setResumo] = useState<ResumoCapacidadeRecursos | null>(null);

  // DEC-007 §6.2/Fase 8b (correção achada em teste visual real, projeto
  // 260011) - as 3 listas "já confirmadas" da modal moraram aqui (este
  // componente NÃO desmonta ao fechar a Modal, só o filho dela
  // desmonta) para sobreviver a fechar/reabrir "Configurar" dentro da
  // mesma visita à página - useState comum, sem persistência própria,
  // então uma recarga de página volta a zerar normalmente.
  const [regrasInternas, setRegrasInternas] = useState<RegraInterna[]>([]);
  const [recursosAlternativos, setRecursosAlternativos] = useState<string[]>([]);
  const [recursosTemporarios, setRecursosTemporarios] = useState<RecursoTemporarioLocal[]>([]);

  return (
    <>
      <CartaoConfiguracao titulo="Capacidade e recursos" onConfigurar={() => setAberto(true)}>
        {resumo ? (
          <div className="flex flex-col gap-3">
            {resumo.semanasConfiguradas.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {resumo.semanasConfiguradas.map((semana, indice) => (
                  <li key={`${semana.recursoNome}-${semana.semanaInicio}-${indice}`}>
                    <strong>{semana.recursoNome}</strong> · Semana de {formatarDataBr(semana.semanaInicio)} a{" "}
                    {formatarDataBr(semana.semanaFim)} · {formatarHoras(semana.horasDisponibilizadas)} disponibilizadas
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nenhuma regra ativa configurada.</p>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <dt className="text-[11.5px] font-semibold text-text-secondary">Horas extras disponibilizadas</dt>
                <dd className="text-text-primary">{formatarHoras(resumo.horasAdicionaisDisponibilizadas)}</dd>
              </div>
              <div>
                <dt className="text-[11.5px] font-semibold text-text-secondary">Horas extras utilizadas pela previsão comercial</dt>
                <dd className="text-text-primary">{horasUtilizadas === null ? "Ainda não calculado" : formatarHoras(horasUtilizadas)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[11.5px] font-semibold text-text-secondary">Custo adicional efetivamente utilizado</dt>
                <dd className="text-text-primary">{custoUtilizado === null ? "Ainda não calculado" : formatarMoeda(custoUtilizado)}</dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={() => setMostrarDetalhes((v) => !v)}
              className="self-start text-[12.5px] font-semibold text-action-primary hover:underline"
            >
              {mostrarDetalhes ? "Ocultar detalhes" : "Ver detalhes"}
            </button>

            {mostrarDetalhes ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border-subtle pt-3">
                <div className="col-span-2">
                  <dt className="text-[11.5px] font-semibold text-text-secondary">Custo potencial máximo (se toda hora disponibilizada fosse usada)</dt>
                  <dd className="text-text-primary">{formatarMoeda(resumo.custoPotencialMaximo)}</dd>
                  <p className="mt-0.5 text-[11px] text-text-secondary">
                    Potencial máximo - nunca o custo real do cenário, que é sempre o valor &ldquo;efetivamente utilizado&rdquo; acima.
                  </p>
                </div>
                <div>
                  <dt className="text-[11.5px] font-semibold text-text-secondary">Recursos ajustados</dt>
                  <dd className="text-text-primary">{resumo.recursosAjustados}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-semibold text-text-secondary">Recursos internos alternativos</dt>
                  <dd className="text-text-primary">{resumo.recursosAlternativos}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-semibold text-text-secondary">Recursos temporários</dt>
                  <dd className="text-text-primary">{resumo.recursosTemporarios}</dd>
                </div>
              </dl>
            ) : null}

            {mostrarDetalhes && detalhamentoPorRecurso.length > 0 ? (
              <div className="border-t border-border-subtle pt-3">
                <p className="mb-2 text-[11.5px] font-semibold text-text-secondary">Detalhamento por recurso</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-[12px]">
                    <thead className="text-text-secondary">
                      <tr className="border-b border-border-subtle">
                        <th className="py-1.5 pr-2 font-semibold">Recurso</th>
                        <th className="py-1.5 pr-2 font-semibold">Papel</th>
                        <th className="py-1.5 pr-2 text-right font-semibold">Normal utilizada</th>
                        <th className="py-1.5 pr-2 text-right font-semibold">Extra disponível</th>
                        <th className="py-1.5 pr-2 text-right font-semibold">Extra utilizada</th>
                        <th className="py-1.5 pr-2 text-right font-semibold">Extra descartada</th>
                        <th className="py-1.5 text-right font-semibold">Custo extra efetivo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {detalhamentoPorRecurso.map((linha) => (
                        <tr key={linha.recursoId}>
                          <td className="py-1.5 pr-2 text-text-primary">{nomesRecursos[linha.recursoId] ?? linha.recursoId}</td>
                          <td className="py-1.5 pr-2 text-text-secondary">{PAPEL_LABEL[linha.papel]}</td>
                          <td className="py-1.5 pr-2 text-right text-text-primary">{formatarHoras(linha.horasNormaisUtilizadas)}</td>
                          <td className="py-1.5 pr-2 text-right text-text-primary">{formatarHoras(linha.horasExtrasDisponibilizadas)}</td>
                          <td className="py-1.5 pr-2 text-right text-text-primary">{formatarHoras(linha.horasExtrasUtilizadas)}</td>
                          <td className="py-1.5 pr-2 text-right text-text-primary">
                            {linha.horasExtrasDescartadas > 0 ? formatarHoras(linha.horasExtrasDescartadas) : "—"}
                          </td>
                          <td className="py-1.5 text-right text-text-primary">
                            {linha.custoExtraEfetivo === null ? "—" : formatarMoeda(linha.custoExtraEfetivo)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {detalhamentoPorRecurso.some((l) => l.horasExtrasDescartadas > 0) ? (
                  <p className="mt-2 text-[11px] text-text-secondary">{detalhamentoPorRecurso.find((l) => l.horasExtrasDescartadas > 0)!.motivoDescarte}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p>Nenhum ajuste de capacidade configurado ainda.</p>
        )}
      </CartaoConfiguracao>

      <Modal open={aberto} onClose={() => setAberto(false)} title="Capacidade e recursos" size="full">
        <JanelaCapacidadeRecursos
          base={base}
          necessidadesOrcamentoNovo={necessidadesOrcamentoNovo}
          empresaId={empresaId}
          janelaInicio={janelaInicio}
          prazoInterno={prazoInterno}
          calculando={calculando}
          onResumoChange={setResumo}
          onCalcular={(decisoes) => {
            onCalcular(decisoes);
            setAberto(false);
          }}
          regrasInternas={regrasInternas}
          setRegrasInternas={setRegrasInternas}
          recursosAlternativos={recursosAlternativos}
          setRecursosAlternativos={setRecursosAlternativos}
          recursosTemporarios={recursosTemporarios}
          setRecursosTemporarios={setRecursosTemporarios}
        />
      </Modal>
    </>
  );
}
