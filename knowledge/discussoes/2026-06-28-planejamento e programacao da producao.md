# PLANEJAMENTO E PROGRAMAÇÃO DA PRODUÇÃO


# Objetivo

Após a aprovação da Proposta Comercial pelo cliente e o recebimento do Pedido de Compra, o NEXOTFE iniciará automaticamente o fluxo operacional do Projeto.

O sistema será responsável por gerar a estrutura inicial do Projeto.

Cada departamento executará suas atividades conforme suas próprias regras de negócio.

---

# Fluxo

Cliente

↓

Aprova a Proposta Comercial

↓

Envia Pedido de Compra

↓

Comercial confirma o Pedido

↓

O sistema cria oficialmente o Projeto

↓

O sistema comunica automaticamente:

* Financeiro
* Compras
* PCP

---

# Financeiro

O sistema deverá informar ao Financeiro:

* Número do Projeto.
* Cliente.
* Valor da Proposta.
* Previsão de desembolso.
* Previsão de faturamento.
* Previsão de recebimento.

O objetivo é preparar o fluxo financeiro do Projeto.

---

# Compras

O sistema deverá informar apenas:

* Número do Projeto.
* Valor disponível para compras.

Esse valor representa o orçamento previsto para aquisição de materiais e serviços relacionados ao Projeto.

O módulo de Compras seguirá suas próprias regras operacionais, definidas em documento específico.

---

# PCP

Após a criação do Projeto, o sistema deverá:

* Ler todos os Produtos do Projeto.
* Ler os respectivos Roteiros.
* Gerar automaticamente todas as OFs.
* Gerar automaticamente todas as OPs.
* Gerar automaticamente a programação inicial da produção.

O sistema executará esse planejamento inicial sem intervenção manual.

O PCP será responsável por validar, ajustar e liberar a programação.

---

# Liberação das OFs

A geração da OF não significa autorização para iniciar a produção.

Antes da liberação, o sistema deverá verificar obrigatoriamente:

* Desenho técnico aprovado e disponível.
* Matéria-prima disponível.

Enquanto qualquer um desses requisitos não for atendido, a OF permanecerá com o status:

**Aguardando Liberação**

---

# Bloqueios Operacionais

Além das verificações automáticas, o PCP poderá manter uma OF bloqueada por motivos operacionais.

Exemplos:

* Ferramenta indisponível.
* Dispositivo em fabricação.
* Máquina parada.
* Recurso indisponível.
* Prioridade alterada.
* Outro motivo justificado.

Toda retenção deverá possuir justificativa registrada.

---

# Planejamento Automático

O sistema deverá gerar automaticamente a programação inicial considerando:

* Recursos Produtivos disponíveis.
* Sequência das operações.
* Dependências entre OPs.
* Calendário da empresa.
* Projetos já aprovados.
* Capacidade disponível.

A programação inicial seguirá a regra:

**FIFO — Primeiro que Entra, Primeiro que Sai.**

O PCP poderá alterar essa programação quando necessário.

---

# Fatores de Produtividade

Durante o Planejamento e durante a Análise de Viabilidade, o sistema poderá utilizar fatores de produtividade para estimativa de capacidade.

Valores padrão sugeridos:

* Desenvolvimento: 75%
* Produção: 85%
* Montagem: 75%

Esses valores serão apenas referências iniciais.

Cada empresa poderá definir seus próprios percentuais.

Em situações específicas, o Orçamentista poderá alterar esses fatores durante a Análise de Viabilidade para criar cenários mais conservadores ou mais agressivos.

Essas alterações terão efeito apenas na simulação e nunca modificarão a programação oficial da fábrica.

---

# Responsabilidades

## Sistema

* Criar o Projeto.
* Gerar automaticamente OFs.
* Gerar automaticamente OPs.
* Criar a programação inicial.
* Verificar pré-requisitos para liberação das OFs.

---

## PCP

* Validar a programação.
* Alterar prioridades quando necessário.
* Liberar OFs.
* Bloquear OFs com justificativa.
* Reprogramar a produção quando necessário.

---

## Produção

* Executar as OFs liberadas.
* Criar OFs Operacionais quando necessário.
* Criar Grupos de Trabalho.
* Registrar apontamentos de produção.

---

# Princípios

O sistema executa automaticamente o planejamento inicial.

O PCP permanece responsável pela programação oficial da fábrica.

A Produção possui autonomia para otimizar a execução sem alterar o planejamento oficial.

Cada departamento executa suas atividades conforme suas regras específicas.

O NEXOTFE automatiza tarefas repetitivas, preservando as decisões estratégicas sob responsabilidade dos especialistas.
