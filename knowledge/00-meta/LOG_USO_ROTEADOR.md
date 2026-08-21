# Log de Uso do Roteador de Conhecimento

Registro de consultas reais ao roteador (`CLAUDE.md`/`AGENTS.md` →
`INDICE.md` → `STATUS_FONTES.md`), para decidir com evidência — depois de
10-15 consultas reais — se alguma pasta de `knowledge/` justifica
reorganização física.

## Linha de base (testes de validação, 2026-08-07)

| Data | Consulta (resumo) | Arquivos abertos | Busca ampla? | Resultado correto? | Lacuna encontrada |
|---|---|---|---|---|---|
| 2026-08-07 | Tipos de projeto oficiais / identificador PN→Código | 6 | Não | Sim | — |
| 2026-08-07 | RPC que persiste a Simulação Comercial / distribuição parcial | 6 (+1 `ls` pontual) | Não | Sim | — |
| 2026-08-07 | Regras de exclusão lógica de roteiro (antes do fix) | 9 | Sim | Sim | `excluir_bom` sem documento indexado — fechada no mesmo dia com DEC-005 |
| 2026-08-07 | Tipos de projeto / PN→Código (reteste pós-fechamento) | 6 | Não | Sim | — |
| 2026-08-07 | Regras de exclusão lógica de roteiro (reteste pós-fix) | 4 | Não | Sim | — |

## Consultas reais

| Data | Consulta (resumo) | Arquivos abertos | Busca ampla? | Resultado correto? | Lacuna encontrada |
|---|---|---|---|---|---|
| 2026-08-07 | Fluxo de autenticação, proteção de rotas, cookie vs localStorage (2 investigações) | ~20 (código, não `knowledge/`) | Sim (esperado — código, não há doc no índice) | Sim | Nenhuma documentação de arquitetura de autenticação/sessão/proteção de rota existe em `knowledge/` — não há PAD/DEC sobre o assunto |
| 2026-08-10 | Retomar ativação do Calculador Reverso na persistência (RPC v5) | 19 | Sim — `PAD-008` não cita a migration v5 nem os módulos TS já implementados no mesmo dia da sua última revisão | Sim | `PAD-008_Motor_Capacidade.md` (Vigente) desatualizado: não documenta `202608030001` (RPC v5 aplicada), `estimarInicioNecessario.ts`/`prepararCalculadorReverso.ts` (36 testes) nem o preview já ativo em `SimulacaoCapacidade.tsx`. Sem HANDOVER-005 nem entrada no índice cobrindo essa "Entrega 3" |
| 2026-08-10 | Diagnóstico/desenho: geração e comparação de cenários (Motor/Calculador Reverso/futuro PCP) | ~29 (14 `knowledge/`+`docs/`, 15 `src/`) | Sim — grep dirigido por turno/hora extra/antecipação/lote em todo `src/` e `knowledge/`+`docs/`, além dos documentos indexados | Sim | (1) `PAD-008_Motor_Capacidade.md` continua desatualizado quanto à v5/DEC-006 — mesma lacuna já registrada na linha acima, ainda não corrigida no documento em si. (2) `DEC-006_Calculador_Reverso_Persistencia.md` (vigente, 2026-08-10) ainda não está listado em `INDICE.md`/`STATUS_FONTES.md` — só foi encontrado porque indicado explicitamente na consulta, não pelo roteador sozinho |
| 2026-08-10 | Desenho técnico completo do Gerador/Comparador de Cenários Viáveis (hora extra, troca de prioridade, terceirização, recursos temporários) | 2 (leitura direta de `calcular_comprometido_v2` e do schema de `simulacao_comercial_item_distribuicoes` em `202608020001_...sql`, fora do roteiro indexado) | Não (consulta pontual ao código já mapeado nas duas investigações anteriores) | Sim | Nenhuma nova — confirma que `calcular_comprometido_v2` só devolve agregado (não por origem/projeto), o que já era esperado pelo diagnóstico anterior; nenhuma decisão de negócio ainda tomada sobre os pontos assinalados no desenho (teto de hora extra, produtividade de recurso temporário, lock por recurso vs. por projeto) |
