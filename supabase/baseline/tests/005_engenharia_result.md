# Resultado — 005_engenharia.sql

**Data:** 21/06/2026  
**Ambiente:** PostgreSQL 18 local e descartável  
**Resultado:** APROVADO

## Estrutura aprovada

- 11 tabelas de Engenharia;
- `itens_industriais` como origem única do PN;
- `materias_primas` como origem da unidade oficial do material;
- documentos e revisões técnicas normalizados;
- itens de projeto sem duplicar PN;
- BOM e itens de BOM versionados;
- Roteiro, materiais, operações e vínculo operação–material;
- 33 policies RLS;
- três RPCs transacionais privilegiadas;
- integridade multiempresa por FKs compostas.

## Invariantes aprovadas

- PN é único por empresa;
- revisão referenciada pertence obrigatoriamente ao mesmo PN;
- somente uma revisão aprovada permanece vigente por PN;
- unidade da BOM e do Roteiro deve coincidir com a origem oficial;
- item da BOM referencia exatamente matéria-prima ou componente;
- BOM sem itens não pode ser publicada;
- BOM publicada não aceita alteração estrutural;
- Roteiro sem operação não pode ser ativado;
- toda operação do Roteiro possui obrigatoriamente Tecnologia e Tempo;
- existe no máximo um Roteiro ativo por PN;
- Roteiro ativo é estruturalmente imutável;
- operação e material associados pertencem ao mesmo Roteiro;
- `terceirizada` é derivada do tipo da operação, sem segunda fonte.

## Comportamentos testados

- aprovação controlada de revisão;
- vínculo Projeto → Item → PN → Revisão;
- publicação da BOM;
- rejeição de unidade divergente;
- rejeição de novo item após publicação;
- ativação do Roteiro;
- rejeição de alteração operacional após ativação;
- isolamento de leitura entre duas empresas.

## Reprodução

O conjunto `bootstrap → 001 → 002 → 003 → 004 → 005` foi instalado em dois bancos vazios independentes e produziu schemas normalizados idênticos.

**SHA-256 do schema normalizado:**  
`b816bf7a958c5ca66464b6752b3381050f9c96fc9e5c003ce2e01a25b9aeeb64`

## Integridade dos arquivos

| Arquivo | SHA-256 |
|---|---|
| `005_engenharia.sql` | `1eda94fbf2744d77a8f3bbaf1309a3e89e59c7847577e38f906f27aea4133056` |
| `005_engenharia_test.sql` | `6fb9a20bed73bfa51c88be4f93ecd38109962f8897042ab1f3b7ac7f437461e2` |

## Gate

O módulo `005_engenharia.sql` está encerrado e libera o início do `006_pcp.sql`.
