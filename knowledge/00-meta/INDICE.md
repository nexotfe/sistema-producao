# Índice — Base de Conhecimento NEXOTFE

**Fase:** 0 (roteamento apenas — nenhum arquivo foi movido, mesclado ou apagado)
**Como usar:** 1) `knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md` sempre primeiro (tem precedência sobre
qualquer coisa abaixo que a contradiga). 2) Este índice para achar o documento por tema.
3) `knowledge/00-meta/STATUS_FONTES.md` para saber se dá para confiar nele antes de usar.

Todos os caminhos abaixo são os caminhos **reais atuais** do repositório.

---

## 00 · Meta / Governança

| Tema | Caminho |
|---|---|
| Regras de processo | `CLAUDE.md`, `AGENTS.md` |
| Filosofia | `knowledge/01-MANIFESTO-NEXOTFE.md` |
| Método | `knowledge/02-METODO NEXUS.MD` |
| Precedência normativa vigente (patch de exceções) | `knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md` |
| Ordem de precedência entre fontes de banco | `knowledge/BASELINE_NEXOTFE_1_0.md` |
| Padrões de código/commit/nomenclatura | `knowledge/PADROES_DESENVOLVIMENTO_NEXOTFE_1_0.md` |
| Índice interno do "livro" funcional | `knowledge/livro-arquitetura-funcional/INDICE_NORMATIVO_NEXOTFE_1_0.md` |
| Integridade (hashes) do livro | `knowledge/livro-arquitetura-funcional/MANIFESTO_BASELINE_NORMATIVO_NEXOTFE_1_0.md` |
| Rastreabilidade tema → fonte canônica | `knowledge/livro-arquitetura-funcional/MATRIZ_RASTREABILIDADE_NORMATIVA_NEXOTFE_1_0.md` |
| Congelamento da Arquitetura 1.0 | `knowledge/livro-arquitetura-funcional/MILESTONE_01_ARQUITETURA_NEXOTFE_1_0_CONGELADA.md` |
| Introdução do livro (índice 00) | `knowledge/livro-arquitetura-funcional/00 - INTRODUÇÃO.md` |
| Princípios arquiteturais (constitucional) | `knowledge/livro-arquitetura-funcional/99 - PRINCÍPIOS ARQUITETURAIS.md` |
| Status de homologação por módulo | `knowledge/STATUS_HOMOLOGACAO_NEXOTFE_1_0.md` |

## 01 · Produto

| Tema | Caminho |
|---|---|
| Visão de produto | `PRODUCT.md` |
| Design system (fonte mais atual/granular) | `DESIGN.md` |
| Diretriz visual/UX (nível mais alto) | `docs/DIRETRIZ_VISUAL_UX_NEXOTFE.md` |
| Padrão de componente de navegação | `docs/PADRAO_NAVEGACAO_NEXUS.md` |
| Sistema de temas (claro/escuro) | `knowledge/arquitetura-tecnica/PAD-006_Sistema_de_Temas.md` |
| Design system base (inventário de UI) | `knowledge/arquitetura-tecnica/PAD-007_Design_System_Base.md` |
| Dicionário industrial (numerado) | `knowledge/livro-arquitetura-funcional/05 - DICIONÁRIO INDUSTRIAL.md` |
| Dicionário industrial (variante, tem verbetes extras) | `knowledge/livro-arquitetura-funcional/DICIONÁRIO INDUSTRIAL DO NEXOTFE` |
| Estados oficiais (numerado) | `knowledge/livro-arquitetura-funcional/03 - ESTADOS OFICIAIS Estados.md` |
| Estados oficiais (variante, tem seção "Decisão do PCP") | `knowledge/livro-arquitetura-funcional/ESTADOS OFICIAIS DO NEXOTFE` |
| Padrão de classificações (numerado — 4 tipos de projeto, ver decisão registrada) | `knowledge/livro-arquitetura-funcional/04 - PADRÃO OFICIAL.md` |
| Padrão de classificações (variante — contém "Revenda", não oficial) | `knowledge/livro-arquitetura-funcional/PADRÃO OFICIAL DE CLASSIFICAÇÕES DO NEXOTFE` |

## 02 · Roteiros / BOM

| Tema | Caminho |
|---|---|
| Entidades mestre e regras anti-duplicidade | `knowledge/ARQUITETURA_ENTIDADES_NEXOTFE_1_0.md` |
| Cadastro inteligente de materiais | `knowledge/livro-arquitetura-funcional/ESTUDO 007 Cadastro Inteligente de Materiais` |
| Cadastro de tecnologias | `knowledge/livro-arquitetura-funcional/Capítulo 02 Cadastro de Tecnologias` |
| Grupos de tecnologias | `knowledge/livro-arquitetura-funcional/Capítulo 03 Grupos de Tecnologias` |
| Cadastro de recursos produtivos | `knowledge/livro-arquitetura-funcional/Capítulo 04 Cadastro de Recursos Produtivos` |
| Capacidade operacional | `knowledge/livro-arquitetura-funcional/Capítulo 05 Capacidade Operacional` |
| Arquitetura funcional de OF e Operações | `knowledge/livro-arquitetura-funcional/ESTUDO 002 Arquitetura Funcional das Ordens de Fabricação e Operações` |
| Roteiro de desenvolvimento (v2) | `knowledge/arquitetura-tecnica/2026-07-15-arquitetura-roteiro-desenvolvimento-v2.md` (replicado também dentro de ARQUITETURA_VIGENTE §15) |
| Regra de OF Operacional / Grupo de Trabalho (só em rascunho, ver STATUS_FONTES) | `knowledge/discussoes/2026-06-28-grupos e of operacionais.md`, `knowledge/discussoes/2026-06-28-flexibilidade operacional.md` |
| Exclusão lógica de Roteiro (admin, subconjunto, orçamento, locks) | `knowledge/arquitetura-tecnica/DEC-005_Exclusao_Logica_Roteiro.md` |

## 03 · Projetos / Orçamento

| Tema | Caminho |
|---|---|
| Ciclo de vida do projeto industrial | `knowledge/livro-arquitetura-funcional/01-ORCAMENTO` |
| Desconto comercial no orçamento | `knowledge/arquitetura-tecnica/DEC-001_Desconto_Comercial_Orcamento.md` |
| Rota de listagem de projetos (`/projetos`) | `knowledge/decisoes/ADR-006-projetos-rota-listagem.md` |

## 04 · Simulação Comercial

| Tema | Caminho |
|---|---|
| Hub técnico vigente (calendário, capacidade, roteiro-dev) | `knowledge/arquitetura-tecnica/ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md` |
| Motor de capacidade (contratos, distribuição parcial) | `knowledge/arquitetura-tecnica/PAD-008_Motor_Capacidade.md` |
| Aprovação da simulação comercial | `knowledge/arquitetura-tecnica/DEC-002_Aprovacao_Simulacao_Comercial.md` |
| Status "Aprovado" via simulação | `knowledge/arquitetura-tecnica/DEC-003_Status_Aprovado_Via_Simulacao.md` |
| Objetivo/papéis/limites da Simulação Comercial | `knowledge/arquitetura-tecnica/DEC-004_Simulacao_Comercial.md` |

## 05 · Banco

| Tema | Caminho |
|---|---|
| Padrões gerais de desenvolvimento de banco | `knowledge/PADROES_DESENVOLVIMENTO_NEXOTFE_1_0.md` |
| Política de exclusão (soft delete) | `knowledge/arquitetura-tecnica/PAD-004_Politica_Exclusao_Registros.md` |
| Auditoria pontual do soft delete | `knowledge/arquitetura-tecnica/AUD-2026-07-19_Soft_Delete.md` |
| Implementação de referência do soft delete | `knowledge/arquitetura-tecnica/IMP-SoftDelete.md` |
| Exclusão lógica de Roteiro/BOM (especialização da política geral) | `knowledge/arquitetura-tecnica/DEC-005_Exclusao_Logica_Roteiro.md` |
| Segurança de functions SQL | `knowledge/arquitetura-tecnica/PAD-005_Seguranca_Functions_SQL.md` |
| Ordem de precedência normativa de banco | `knowledge/BASELINE_NEXOTFE_1_0.md` |
| Schema "definitivo" reconstruído (não aplicado ao remoto) | `supabase/baseline/README.md` |

## 06 · Operação

| Tema | Caminho |
|---|---|
| Fundação geral do sistema (fluxo macro) | `docs/FUNDACAO_ARQUITETURA_SISTEMA_NEXOTFE_1_0.md` |
| Fundação industrial (PN, OF, OP, eficiência) | `docs/FUNDACAO_INDUSTRIAL_NEXOTFE.md` |
| Fundação de compras | `docs/FUNDACAO_COMPRAS_NEXOTFE.md` |
| Arquitetura operacional do PCP | `docs/ARQUITETURA_OPERACIONAL_PCP_NEXOTFE.md` |
| Suprimentos (capítulo final) | `knowledge/livro-arquitetura-funcional/PARTE V SUPRIMENTOS` |
| Produção — filosofia | `knowledge/livro-arquitetura-funcional/PARTE VI PRODUÇÃO` |
| Produção — organização do fluxo | `knowledge/livro-arquitetura-funcional/PARTE VI PRODUÇÃO parte1` |
| Arquitetura das Centrais | `knowledge/livro-arquitetura-funcional/PARTE VII ARQUITETURA DAS CENTRAIS` |
| Navegação e tomada de decisão | `knowledge/livro-arquitetura-funcional/ESTUDO 006 – Arquitetura de Navegação e Tomada de Decisão` |
| Planejamento inteligente de compras | `knowledge/livro-arquitetura-funcional/ESTUDO 008 — Planejamento Inteligente de Compras Status  🟢 Aprovado – Versão 1.0` |
| Central de Operações | `knowledge/livro-arquitetura-funcional/ESTUDO 016 Central de Operações` |
| Requisição de compra | `knowledge/livro-arquitetura-funcional/Capítulo 01 Requisição de Compra` |
| Recebimento | `knowledge/livro-arquitetura-funcional/Capítulo 03 Recebimento` |
| Gestão de estoque | `knowledge/livro-arquitetura-funcional/Capítulo 04 Gestão de Estoque` |
| Homologação por rota/página (mantido separado — decisão registrada) | `docs/HOMOLOGACAO_OPERACIONAL_NEXOTFE_1_0.md` |
| Homologação por módulo (mantido separado — decisão registrada) | `knowledge/STATUS_HOMOLOGACAO_NEXOTFE_1_0.md` |
| Baseline operacional (comportamento esperado por módulo) | `knowledge/BASELINE_OPERACIONAL_NEXOTFE_1_0.md` |
| ADR — mapeamento de rotas | `knowledge/decisoes/ADR-004-integracao-001.md` |
| ADR — Central Nexus (`/central`) | `knowledge/decisoes/ADR-005-central-nexus.md` |

## 07 · Setup / Ambiente

| Tema | Caminho |
|---|---|
| Setup de máquina Windows | `knowledge/SETUP_WINDOWS.md` |
| Versões oficiais de dependências | `knowledge/VERSOES_OFICIAIS.md` |
| Troubleshooting | `knowledge/TROUBLESHOOTING.md` |
| Backup e recuperação | `knowledge/BACKUP_E_RECUPERACAO.md` |

## Planos de execução (raiz — vigentes, ver investigação em STATUS_FONTES.md)

| Tema | Caminho |
|---|---|
| Plano diretor de implementação (12 fases, detalhado) | `PLANO_DIRETOR_IMPLEMENTACAO_NEXOTFE_1_0.md` |
| Plano executivo de implementação (sprints, DoD) | `PLANO_EXECUTIVO_IMPLEMENTACAO_NEXOTFE_1_0.md` |

## Documentação de código (fora de `knowledge/`, desatualizada — ver STATUS_FONTES.md)

| Tema | Caminho |
|---|---|
| Escopo do módulo Compras | `src/modules/compras/README.md` |
| Escopo do módulo Estoque | `src/modules/estoque/README.md` |
| Escopo do módulo Projetos | `src/modules/projetos/README.md` |

## 99 · Histórico

> Ver `knowledge/00-meta/STATUS_FONTES.md` para a lista completa e individual.
> Nunca usar como base de decisão sem confirmar contra o vigente correspondente.

| Bloco | Caminho |
|---|---|
| Handovers de sessão | `knowledge/HANDOVER_NEXOTFE_2026-07-27.md`, `knowledge/HANDOVER-002_NEXOTFE_2026-07-29.md`, `knowledge/HANDOVER-003_NEXOTFE_2026-08-02.md`, `knowledge/HANDOVER-004_NEXOTFE_2026-08-03.md` |
| Auditoria de banco jun/2026 (Sprints 02/03) | `knowledge/SPRINT_02_*.md`, `knowledge/SPRINT_03_*.md`, `knowledge/AUDITORIA_COMPLETA_*.md`, `knowledge/COMPARACAO_*.md`, `knowledge/CATALOGO_BANCO_RESTAURADO/`, `knowledge/REGISTRO_PRONTIDAO_SPRINT_01.md` |
| Migrations 32-36 (mesmo conteúdo 3x) | `ACTION_PLAN.md`, `MIGRATIONS_README.md`, `MIGRATIONS_SUMMARY.md` |
| Simulação comercial — versões pré-consolidação | `knowledge/arquitetura-tecnica/2026-07-15-01-motor de simulacao.md`, `knowledge/arquitetura-tecnica/2026-07-15-Resumo das decisoes.md`, `knowledge/arquitetura-tecnica/2026-07-15-arquitetura do calendario operacional.md` |
| Planos "congelados" do livro (baseline v1.0) | `knowledge/livro-arquitetura-funcional/06 - PLANO DIRETOR.md`, `knowledge/livro-arquitetura-funcional/07 - PLANO EXECUTIVO.md` |
| Contrato técnico não implementado | `ESTUDO_TECNICO_001.md` |
| Suprimentos — rascunho de template | `knowledge/livro-arquitetura-funcional/PARTE III — SUPRIMENTOS Capítulo 03` |
| Índice antigo do livro (estrutura divergente) | `knowledge/livro-arquitetura-funcional/00-INTRODUCAO-E-FILOSOFIA.MD` |
| Discussões brainstorm (26 arquivos) | `knowledge/discussoes/` |
| Onboarding de IA em inglês (mai/2026) | `knowledge/omboard/2026-05-07-HANDBOOK-001.md` a `-010` (HANDBOOK-CLAUDE-011 é caso à parte — ver STATUS_FONTES) |
| Schema reconstruído, validado mas não implantado | `supabase/baseline/` (README + `tests/*.md`) |
