# MÉTODO NEXUS

**Versão:** 1.0  
**Status:** Em construção permanente

---

# Objetivo

O Método Nexus define como o NEXOTFE é concebido, analisado e evoluído.

Ele não descreve módulos específicos.

Descreve a forma de pensar que deverá orientar todas as decisões do projeto.

Toda nova funcionalidade deverá respeitar este método.

---

# A filosofia

O NEXOTFE não é orientado por telas.

O NEXOTFE não é orientado por tecnologia.

O NEXOTFE é orientado pelos processos reais da indústria.

O software deve representar a empresa.

Nunca o contrário.

---

# O processo vem antes do código

Nenhuma funcionalidade deverá ser implementada antes de responder às seguintes perguntas:

- Como a empresa trabalha?
- Quem inicia este processo?
- Quem utiliza esta informação?
- Quem depende dela?
- Quais decisões serão tomadas a partir dela?
- Existe duplicidade?
- Existe uma forma mais simples?

Somente depois dessas respostas o desenvolvimento poderá começar.

---

# Uma informação nasce uma única vez

Toda informação possui uma origem.

Exemplos:

Cliente nasce no Comercial.

Fornecedor nasce em Suprimentos.

PN nasce durante o orçamento.

OF nasce após aprovação do projeto.

Requisição nasce da necessidade de material.

O sistema nunca deverá solicitar novamente uma informação que já exista.

---

# O sistema acompanha o fluxo industrial

Cada módulo existe porque faz parte de um processo.

O fluxo principal do NEXOTFE é:

Cliente

↓

Comercial

↓

Projeto

↓

Roteiro

↓

Simulação

↓

Venda

↓

Produção

↓

Compras

↓

Estoque

↓

Expedição

↓

Entrega

Nenhum módulo deverá existir isoladamente.

Todos fazem parte de um único processo industrial.

---

# Evolução contínua

O projeto nunca será considerado finalizado.

Sempre será possível:

- simplificar uma tela;
- eliminar um clique;
- reduzir um cadastro;
- melhorar uma decisão;
- automatizar uma atividade.

O objetivo é evoluir continuamente.

---

# Simplicidade

A simplicidade é uma decisão de engenharia.

Sempre que houver duas soluções corretas, deverá ser escolhida aquela que:

- seja mais fácil de entender;
- gere menos retrabalho;
- utilize menos telas;
- reduza duplicidade;
- facilite o treinamento.

---

# Elegância

Elegância não significa aparência.

Elegância significa naturalidade.

O usuário não deve precisar pensar para utilizar o sistema.

A interface deve conduzir o processo naturalmente.

---

# O papel do desenvolvedor

O desenvolvedor não cria regras industriais.

Ele implementa regras previamente documentadas e validadas.

Sempre que houver dúvida sobre uma regra de negócio, a Base de Conhecimento deverá ser atualizada antes do código.

---

# O papel da Base de Conhecimento

A Base de Conhecimento é a fonte oficial do projeto.

Toda documentação deverá ser registrada nela.

Toda decisão importante deverá permanecer documentada.

Toda evolução deverá preservar a coerência do sistema.

---

# A melhoria contínua

Nenhum documento desta Base de Conhecimento é definitivo.

Nenhuma decisão é imutável.

Sempre que surgir uma solução melhor, mais simples e mais elegante, ela deverá substituir a anterior.

Evoluir faz parte do Método Nexus.

---

# Princípio fundamental

Primeiro entendemos.

Depois documentamos.

Depois implementamos.

Por último, evoluímos.

Nunca inverter essa ordem.