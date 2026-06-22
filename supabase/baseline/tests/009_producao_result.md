# Resultado — 009_producao.sql

**Data:** 22/06/2026  
**Ambiente:** PostgreSQL 18 local e descartável  
**Resultado:** APROVADO

## Estrutura aprovada

- 6 tabelas de Produção;
- OP executável derivada da OF e da operação do Roteiro;
- snapshot imutável de sequência, descrição, tipo, Tecnologia, Tempo e quantidade;
- histórico imutável dos estados da OP;
- alocações de recursos e colaboradores;
- apontamentos imutáveis de tempo, produção e perda;
- serviços terceirizados vinculados a OP e fornecedor;
- histórico imutável dos serviços terceirizados;
- 6 policies RLS;
- 7 RPCs operacionais e 2 funções internas;
- integridade multiempresa por FKs compostas.

## Invariantes aprovadas

- OF organiza e OP executa;
- OP preserva o Roteiro usado pela OF sem depender de alterações posteriores;
- toda OP possui obrigatoriamente Tecnologia e Tempo planejado;
- geração de OPs é idempotente e completa;
- recurso e colaborador precisam estar qualificados para a Tecnologia;
- recurso ou colaborador não pode possuir alocações sobrepostas;
- apontamentos da mesma alocação não podem sobrepor períodos;
- apontamento pode registrar somente tempo, quantidade produzida e/ou perda;
- apontamento é imutável e identifica executor e recurso;
- uma OP sucessora não inicia antes da conclusão das anteriores;
- OP terceirizada exige serviço e fornecedor homologado;
- serviço terceirizado precisa retornar e ser aceito antes da inspeção da OP;
- a primeira OP executada coloca a OF em produção;
- a OF somente finaliza quando todas as OPs estão concluídas.

## Comportamentos testados

- geração e repetição idempotente de duas OPs;
- preservação dos snapshots do Roteiro;
- alocação idempotente de recurso e colaborador qualificados;
- rejeição de sobreposição de recurso;
- planejamento e ciclo completo do serviço terceirizado;
- rejeição do início antecipado da OP sucessora;
- transição automática da OF para `em_producao`;
- apontamento somente de tempo;
- apontamento produtivo idempotente;
- rejeição de sobreposição de apontamentos;
- inspeção e conclusão sequencial das OPs;
- finalização automática da OF;
- históricos completos de OP e serviço terceirizado;
- bloqueio de alteração direta do apontamento;
- isolamento de leitura entre duas empresas.

## Reprodução

O conjunto `bootstrap → 001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009` foi instalado em dois bancos vazios independentes e produziu schemas normalizados idênticos.

**SHA-256 do schema normalizado:**  
`8927d168abe999e57b6a16274b660f4c38e529ed0d2003bf1e9c3bb815069862`

## Integridade dos arquivos

| Arquivo | SHA-256 |
|---|---|
| `009_producao.sql` | `e52950e0bf72e01da8070304be20f802ddbefb508a358af6cc1bf89ce6ffd439` |
| `009_producao_test.sql` | `57d611b55062b8793bf9628e932798c055938710de7cc185802e614c3b01ce92` |

## Gate

O módulo `009_producao.sql` está encerrado e libera o início do `010_qualidade.sql`.
