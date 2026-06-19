# MATRIZ DE RASTREABILIDADE NORMATIVA — NEXOTFE 1.0

**Sprint:** 01 — Prontidão Normativa  
**Estado:** Inicial

## Matriz por domínio

| Domínio/tema | Fonte principal | Fontes complementares | Consumidores previstos | Prontidão física |
|---|---|---|---|---|
| Filosofia e método | Manifesto; Método Nexus | Introdução e Filosofia | Todos | Pronto |
| Arquitetura de módulos | Arquitetura Geral | Livro Mestre | Todos | Bloqueado: fonte vazia |
| Modelo conceitual e lógico | Arquitetura de Dados | Contratos Técnicos | Banco, backend, integrações | Bloqueado: fonte vazia |
| Linguagem industrial | Dicionário Industrial | Livro Mestre | Banco, APIs, interface, relatórios | Bloqueado: fonte vazia |
| Classificações | Padrão Oficial de Classificações | Capítulos funcionais | Banco, validações, interface | Bloqueado: fonte vazia |
| Estados e ciclos de vida | Estados Oficiais | Capítulos e contratos | Banco, RPCs, APIs, interface | Pronto para referência; transições devem ser confirmadas pela fonte congelada |
| Comercial e Projeto | Capítulo 01 — Orçamento | Fundação Industrial | Comercial, Engenharia, PCP | Pronto |
| Colaboradores | Cadastro de Colaboradores | Recursos Produtivos | Produção, PCP, auditoria | Bloqueado: fonte vazia |
| Tecnologias | Cadastro de Tecnologias | Grupos; Recursos | Engenharia, PCP, Produção | Pronto |
| Recursos produtivos | Cadastro de Recursos | Tecnologias | PCP, Produção | Pronto |
| Materiais | Estudo 007 | Estoque; Estudo Técnico 001 | Engenharia, Estoque, Compras | Bloqueado: fonte principal vazia |
| Estoque | Gestão de Estoque | Fundação Industrial; Estudo Técnico 001 | PCP, Compras, Produção | Parcial: regra geral disponível |
| OF e OP | Estudo 002 | Estados Oficiais; Estudo Técnico 001 | PCP, Produção, Qualidade | Bloqueado: fonte principal vazia |
| Capacidade | Capítulo 05 | Tecnologias; Recursos | Comercial, PCP | Bloqueado: fonte vazia |
| Necessidades e decisão PCP | Estudo Técnico 001 | Estudo 008; Estados Oficiais | PCP, Estoque, Compras | Pronto no escopo do contrato |
| Requisição e planejamento | Requisição de Compra; Estudo 008 | Fundação de Compras | PCP, Compras | Pronto |
| Recebimento | Capítulo 03 — Recebimento | Fundação de Compras | Compras, Estoque, Qualidade | Pronto em nível funcional |
| Produção | Parte VI | Estados; OF/OP | Produção, Qualidade, PCP | Bloqueado: fonte vazia |
| Navegação decisória | Estudo 006 | ADRs | Centrais e módulos | Pronto |
| Central de Operações | Estudo 016; Parte VII | Estudo 006 | Gestão operacional | Bloqueado: fontes vazias |
| Sequência de implementação | Plano Diretor | Plano Executivo | Equipe de desenvolvimento | Pronto |

## Matriz do eixo do Estudo Técnico 001

| Etapa | Entidade central | Regra normativa | Estado da referência |
|---|---|---|---|
| Definição técnica | Roteiro | Consumo unitário e operações | Contrato disponível; fontes gerais parcialmente vazias |
| Demanda real | OF | Quantidade e snapshot técnico | Contrato disponível; Estudo 002 vazio |
| Cálculo | Necessidade de Material | Quantidade unitária × quantidade da OF | Disponível |
| Decisão | Decisão PCP | Estoque, Compra ou Estoque + Compra | Disponível |
| Atendimento interno | Reserva | Reserva não é consumo | Disponível |
| Atendimento externo | Requisição | Formaliza compra aprovada | Disponível |
| Uso físico | Consumo | Baixa física vinculada à reserva | Disponível |

## Regra de uso

Uma entrega somente pode começar quando a linha correspondente possuir fonte principal materializada. Fontes complementares não podem substituir uma fonte principal vazia.

