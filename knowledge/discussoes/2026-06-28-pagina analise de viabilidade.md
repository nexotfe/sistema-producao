# PÁGINA — ANÁLISE DE VIABILIDADE

## NEXOTFE 1.0

# Objetivo

A Análise de Viabilidade tem como objetivo verificar se a empresa possui capacidade real para atender à solicitação do cliente, permitindo ao Orçamentista estudar alternativas antes da emissão da Proposta Comercial.

Esta etapa pertence ao processo de Orçamento.

Nenhuma simulação altera a programação oficial da fábrica.

---

# Fluxo

Criar Orçamento

↓

Cadastrar Produtos

↓

Criar todos os Roteiros

↓

Salvar Orçamento

↓

**Botão: Análise de Viabilidade**

↓

Abre a página:

**Análise de Viabilidade**

---

# Liberação

O botão **Análise de Viabilidade** somente será habilitado quando:

* Todos os Produtos estiverem cadastrados.
* Todos os Produtos possuírem Roteiro.
* Todos os Roteiros estiverem concluídos.

Caso contrário:

Mensagem:

**Conclua todos os Roteiros antes de iniciar a Análise de Viabilidade.**

---

# Cabeçalho

Título:

**Análise de Viabilidade**

Botões:

* Voltar
* Início
* Capacidade Real
* Novo Cenário
* Salvar Cenário
* Emitir Proposta Comercial

---

# Dados do Orçamento

Exibir somente leitura:

* Projeto
* Cliente
* Natureza
* Data solicitada pelo cliente
* Margem de Segurança
* Data de Planejamento
* Valor do Orçamento

---

# Data de Planejamento

A Data de Planejamento será calculada automaticamente.

Exemplo:

Data solicitada pelo cliente:

20/07/2026

Margem de Segurança:

2 dias

Resultado:

Data utilizada para planejamento:

18/07/2026

Toda a Análise de Viabilidade utilizará essa data como referência.

A data prometida ao cliente permanece sendo 20/07/2026.

---

# Capacidade Real

Botão:

**Capacidade Real**

Ao executar esta função, o sistema deverá consultar automaticamente:

* Projetos aprovados.
* Programação oficial do PCP.
* OFs liberadas.
* Recursos Produtivos.
* Disponibilidade dos colaboradores.
* Capacidade cadastrada dos colaboradores.
* Matérias-primas críticas.
* Serviços terceirizados.
* Restrições operacionais.
* Fatores de produtividade padrão da empresa.
* Margem de Segurança.

O sistema calculará automaticamente:

* Primeira data possível para fabricação.
* Data prevista de conclusão.
* Gargalos produtivos.
* Recursos críticos.
* Compras críticas.

Nenhuma alteração será realizada na programação oficial da empresa.

---

# Simulação de Cenários

Botão:

**Novo Cenário**

Cada cenário representa uma hipótese criada pelo Orçamentista.

Os cenários não alteram a programação oficial da empresa.

O Orçamentista poderá simular:

* Horas extras.
* Trabalho em finais de semana.
* Alterações temporárias de capacidade.
* Terceirização.
* Fornecedores alternativos.
* Reprogramação sugerida de Projetos.
* Alteração dos fatores de produtividade.
* Alteração da Margem de Segurança.
* Combinação de diversas alternativas.

Cada cenário será salvo independentemente.

---

# Comparação

O sistema permitirá comparar:

* Capacidade Real.
* Cenário A.
* Cenário B.
* Cenário C.

Para cada cenário deverão ser apresentados:

* Data prevista de entrega.
* Custo estimado.
* Diferença de custo.
* Impactos na produção.
* Recursos críticos.
* Compras críticas.
* Riscos identificados.

---

# Escolha do Cenário

Após analisar as alternativas, o Orçamentista escolherá apenas um cenário.

Somente esse cenário será utilizado para elaborar a Proposta Comercial.

A escolha do cenário não altera automaticamente o planejamento oficial da fábrica.

---

# Emitir Proposta Comercial

Após selecionar o cenário desejado, o sistema permitirá emitir a Proposta Comercial.

A proposta deverá utilizar:

* Produtos.
* Quantidades.
* Valor.
* Prazo prometido ao cliente.
* Condições comerciais.
* Observações.

Após a emissão, o Orçamento permanecerá aguardando a resposta do cliente.

---

# Aprovação

Caso o cliente aprove a proposta e envie o Pedido de Compra:

O sistema:

* cria oficialmente o Projeto;
* informa o Financeiro;
* informa Compras (valor disponível para o Projeto);
* informa o PCP.

A partir desse momento inicia-se o fluxo operacional.

---

# Princípios

A Capacidade Real representa a situação verdadeira da empresa.

A Data de Planejamento será utilizada internamente pelo sistema para reduzir riscos de atraso.

A data prometida ao cliente permanece inalterada.

Os Cenários representam apenas estudos realizados pelo Orçamentista.

Nenhuma simulação altera a programação oficial da fábrica.

A programação oficial somente será criada após a aprovação do cliente e será administrada pelo PCP.

O sistema calcula.

O Orçamentista analisa.

O cliente decide.

O PCP programa.

A Produção executa.
