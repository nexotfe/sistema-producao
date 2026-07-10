# ANÁLISE DE VIABILIDADE

## Objetivo

A Análise de Viabilidade é uma etapa interna da elaboração do Orçamento.

Seu objetivo é verificar se a empresa possui condições reais de fabricar e entregar os produtos solicitados pelo cliente dentro do prazo desejado.

Ela ocorre após a conclusão técnica do Orçamento e antes do envio da proposta comercial ao cliente.

A Análise de Viabilidade não cria um Projeto.

Seu objetivo é validar a capacidade real de execução da empresa.

---

## Pré-requisitos

A Análise de Viabilidade somente poderá ser iniciada quando:

* Todos os Produtos do Orçamento estiverem cadastrados.
* Todos os Produtos possuírem um Roteiro válido.
* Todas as matérias-primas estiverem definidas.
* Todas as operações estiverem concluídas.

Caso exista qualquer Produto sem Roteiro, a Análise não poderá ser executada.

---

## O que será analisado

A Análise considera, entre outros fatores:

* Prazo de compra das matérias-primas.
* Materiais críticos.
* Disponibilidade dos Recursos Produtivos.
* Gargalos de produção.
* Capacidade do PCP.
* Terceirizações necessárias.
* Possibilidade de horas extras.
* Custos industriais.
* Data provável de entrega.

---

## Resultado da Análise

Ao finalizar a Análise de Viabilidade, o sistema deverá informar:

* É possível fabricar?
* É possível atender ao prazo solicitado?
* Caso não seja possível, qual o menor prazo tecnicamente viável?
* Custo industrial estimado.
* Gargalos identificados.
* Cenários possíveis.
* Riscos envolvidos.
* Data provável de entrega.

---

## Resultado Comercial

Após a escolha do cenário pelo usuário, o Orçamento continuará sendo apenas uma proposta comercial.

Nenhum Projeto será criado nesta etapa.

O Comercial utilizará essas informações para elaborar e enviar a proposta ao cliente.

Exemplo:

Prazo solicitado pelo cliente:

15/08/2026

Resultado da Análise:

Prazo mínimo tecnicamente viável:

05/09/2026

A proposta comercial será emitida considerando essa data.

A decisão de aceitar ou não esse prazo pertence ao cliente.

---

## Possíveis resultados

### Cliente aprova a proposta

O Orçamento muda para:

**Aprovado**

Somente neste momento será criado o Projeto.

---

### Cliente solicita alterações

O Orçamento retorna para edição.

Uma nova Análise de Viabilidade poderá ser executada.

---

### Cliente rejeita a proposta

O Orçamento será encerrado como:

**Não Aprovado**

Nenhum Projeto será criado.

Todo o histórico permanecerá registrado.

---

## Fluxo

Cliente

↓

Oportunidade

↓

Orçamento

↓

Análise de Viabilidade

↓

Proposta Comercial

↓

Resposta do Cliente

↓

Aprovado?

├── Não
│
├── Revisar Orçamento
│
└── Encerrar Oportunidade

↓

Sim

↓

Projeto

↓

Engenharia

↓

Compras

↓

Planejamento PCP

↓

Programação Diária

↓

Produção

↓

Qualidade

↓

Expedição

↓

Entrega

↓

Pós-venda

---

## Princípios

A Análise de Viabilidade não autoriza a fabricação.

Ela apenas fornece informações técnicas e operacionais para que a empresa possa apresentar uma proposta comercial consistente ao cliente.

O Projeto somente nasce após a aprovação formal do Orçamento pelo cliente.

O sistema organiza, calcula e apresenta cenários.

A decisão final permanece sempre com o especialista.
