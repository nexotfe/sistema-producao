# SPRINT 02 — BASELINE E SANEAMENTO DO BANCO

**Data de início:** 20/06/2026  
**Estado:** Em andamento  
**Autorização:** Responsável do projeto

## Objetivo

Tornar o banco atual inventariado, recuperável e reproduzível antes da primeira evolução definitiva da Arquitetura NEXOTFE 1.0.

## Limites do primeiro ciclo

- somente leitura do repositório e do banco remoto;
- nenhuma migration criada, alterada ou aplicada;
- nenhum dado modificado;
- nenhum objeto remoto criado ou removido;
- nenhum fluxo funcional alterado.

## Entregas

- [ ] inventário das migrations locais;
- [ ] catálogo de tabelas, views, funções, triggers e políticas;
- [ ] mapa de dependências;
- [ ] identificação de duplicidades e objetos perigosos;
- [ ] comparação local versus Supabase remoto;
- [ ] classificação dos dados existentes;
- [ ] estratégia de baseline reproduzível;
- [ ] plano de backfill e compatibilidade;
- [ ] plano de rollback e recuperação;
- [ ] relatório de prontidão para saneamento controlado.

## Baseline inicial

- Branch declarada no repositório: `main`.
- HEAD observado: `a895fbeabfa0e3013b45d469bd888be4c71833f4`.
- Migrations locais encontradas: 52.
- Manifesto normativo: `MANIFESTO_BASELINE_NORMATIVO_NEXOTFE_1_0.md`.

## Gates

1. Inventário local concluído.
2. Backup/restauração comprovados antes de qualquer migration.
3. Drift remoto conhecido.
4. Migrations duplicadas retiradas do caminho de execução.
5. Dependências ordenadas.
6. Funções ambíguas tratadas em plano aprovado.
7. Ensaio em banco vazio e cópia representativa antes de produção.

## Progresso em 20/06/2026

- [x] inventário quantitativo das 52 migrations locais;
- [x] catálogo inicial de tabelas, views, funções, triggers e políticas;
- [x] mapa inicial das dependências ausentes e fora de ordem;
- [x] identificação da migration consolidada duplicada;
- [x] comparação de existência local versus Supabase remoto;
- [ ] inspeção integral do catálogo remoto, RLS, grants, constraints e assinaturas;
- [ ] classificação e validação dos dados existentes;
- [x] backup e restauração comprovados;
- [ ] baseline reproduzível aprovado;
- [ ] replay aprovado em banco vazio e cópia representativa.

Evidências:

- `SPRINT_02_INVENTARIO_MIGRATIONS.md`;
- `SPRINT_02_BLOQUEIOS_E_RECOMENDACOES.md`.

**Decisão:** a Sprint 02 pode prosseguir em modo de diagnóstico. Alterações de banco permanecem bloqueadas.

## Atualização em 21/06/2026

- [x] backup lógico do schema `public` gerado e validado por hash;
- [x] restauração local concluída em PostgreSQL isolado;
- [x] estrutura, dados e pós-processamento restaurados sem erro;
- [x] constraints e índices validados;
- [x] catálogo completo do banco restaurado gerado;
- [x] auditoria das migrations iniciada;
- [ ] grants e ledger remoto de migrations extraídos;
- [ ] baseline reproduzível definido e aprovado;
- [ ] replay integral das migrations aprovado.

Evidências adicionais:

- `CATALOGO_BANCO_RESTAURADO/README.md`;
- `SPRINT_02_AUDITORIA_MIGRATIONS_INICIAL.md`.
