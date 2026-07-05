# NEXOTFE

# Fundação da Arquitetura do Sistema

## Versão 1.0

Este documento é o manual oficial de arquitetura do NEXOTFE.

Ele deve ser tratado como um documento vivo de engenharia. Isso significa que sua função não é apenas registrar o estado atual do sistema, mas também preservar o raciocínio por trás das decisões tomadas durante o desenvolvimento. Sempre que uma nova decisão arquitetural for aprovada, este documento deverá ser atualizado para manter a coerência do sistema ao longo do tempo.

O NEXOTFE está sendo construído como um sistema de gestão industrial com foco em processos reais de orçamento, engenharia, produção, compras, estoque, expedição e faturamento. Por isso, a arquitetura deve preservar a lógica operacional da empresa e evitar soluções genéricas que não representem o fluxo industrial.

---

## 1. Apresentação

### 1.1 Objetivo do NEXOTFE

O objetivo do NEXOTFE é organizar o ciclo completo de uma empresa industrial, desde o primeiro contato comercial até a entrega e o faturamento. O sistema deve permitir que cada área trabalhe com informações consistentes, rastreáveis e conectadas.

O NEXOTFE não deve ser apenas um conjunto de cadastros. Ele deve representar o fluxo de trabalho da empresa. Cada página deve existir porque atende a uma etapa real do processo produtivo ou administrativo.

Essa decisão foi tomada porque sistemas industriais perdem valor quando as informações ficam espalhadas, duplicadas ou desconectadas. O NEXOTFE deve reduzir retrabalho, evitar divergência de dados e dar clareza ao usuário sobre onde cada informação nasce e para onde ela segue.

### 1.2 Público-alvo

O sistema é destinado a usuários que trabalham diariamente com processos industriais, comerciais e administrativos, incluindo:

- área comercial;
- orçamentistas;
- engenharia;
- planejamento e controle da produção;
- compras;
- estoque;
- produção;
- expedição;
- faturamento;
- gestão.

As telas devem ser pensadas para uso recorrente, não para demonstração visual. O usuário precisa localizar informações rapidamente, executar ações com poucos cliques e entender o estado operacional de cada processo.

### 1.3 Conceito do sistema

O NEXOTFE é um sistema industrial orientado por fluxo.

O projeto comercial inicia o ciclo. A partir dele surgem orçamento, produto, roteiro, proposta comercial e, quando aprovado, o projeto ativo. Depois disso, o fluxo segue para planejamento, compras, produção, expedição e faturamento.

Essa arquitetura evita que cada módulo funcione como uma ilha. O número do projeto acompanha todo o ciclo e serve como eixo de rastreabilidade.

---

## 2. Filosofia do Sistema

### 2.1 Uma informação nasce apenas uma vez

Uma informação deve ser registrada no ponto correto do processo e depois herdada pelas próximas etapas.

Exemplo: dados principais do projeto nascem na página Projeto. O Orçamento deve exibir esses dados como informação herdada, não como novo formulário editável.

Essa regra existe para evitar divergências. Se o mesmo dado puder ser editado em várias páginas, o sistema perde confiabilidade. O usuário deixa de saber qual informação é oficial.

### 2.2 O sistema calcula. O especialista decide.

O NEXOTFE deve automatizar cálculos, consolidações e somatórios, mas a decisão final continua sendo do especialista.

Exemplo: a carga tributária sugerida pode vir das configurações do sistema, mas o orçamentista pode ajustar a carga tributária adotada em um orçamento específico quando houver justificativa comercial ou fiscal.

Essa separação é importante porque processos industriais exigem regra, mas também exigem julgamento técnico. O sistema deve apoiar a decisão, não substituir o conhecimento do usuário.

### 2.3 Cada página possui apenas uma responsabilidade

Cada rota deve representar uma responsabilidade clara.

Exemplo:

- `/projetos` lista projetos;
- `/projetos/{id}` apresenta os detalhes do projeto;
- `/projetos/{id}/estrutura/{estruturaId}` apresenta itens de uma estrutura;
- `/projetos/novo` representa a página de orçamento em seu estado atual de evolução.

Essa decisão evita páginas confusas, com funções misturadas. Quando uma página tenta resolver muitos problemas ao mesmo tempo, a manutenção fica difícil e o usuário perde orientação.

### 2.4 O número do Projeto acompanha todo o ciclo do produto

O número do projeto deve acompanhar orçamento, produto, roteiro, proposta comercial e etapas posteriores.

Esse número é o elo de rastreabilidade. Ele permite responder perguntas como:

- qual orçamento originou este item;
- qual roteiro foi usado;
- quais compras foram necessárias;
- quais ordens foram abertas;
- quais documentos foram enviados ao cliente.

Essa decisão foi aprovada porque a rastreabilidade é essencial em ambiente industrial.

### 2.5 As telas devem respirar

As telas devem ter espaçamento suficiente para leitura, comparação e operação diária.

O objetivo não é preencher todos os espaços vazios. O espaço em branco ajuda a organizar a atenção do usuário e reduz fadiga visual.

Essa decisão reforça o conceito de sistema industrial premium: limpo, direto, previsível e profissional.

### 2.6 Interface limpa

A interface deve evitar excesso de botões, informações repetidas e elementos decorativos sem função operacional.

Uma informação deve aparecer uma vez. Uma ação deve ter um lugar claro.

Essa decisão foi tomada para reduzir poluição visual e tornar o sistema mais rápido para quem trabalha nele todos os dias.

### 2.7 Sistema industrial premium

O NEXOTFE deve transmitir solidez, precisão e confiança.

Isso significa:

- uso moderado de cores;
- botões primários bem definidos;
- cartões limpos;
- bordas discretas;
- hierarquia visual clara;
- tabelas legíveis;
- ausência de efeitos visuais excessivos.

O sistema deve parecer uma ferramenta profissional de trabalho, não uma página promocional.

---

## 3. Fluxo Geral

O fluxo geral aprovado para o NEXOTFE é:

```text
Projeto
↓
Orçamento
↓
Produto
↓
Roteiro
↓
Proposta Comercial
↓
Projeto Ativo
↓
Planejamento e Controle da Produção
↓
Compras
↓
Produção
↓
Expedição
↓
Faturamento
```

Esse fluxo representa a jornada natural de uma demanda industrial.

A decisão de iniciar pelo Projeto foi tomada porque o projeto concentra o contexto comercial e técnico inicial. O orçamento depende desse contexto. O produto e o roteiro dependem do orçamento. A proposta comercial depende do orçamento consolidado. A produção depende da aprovação do cliente.

---

## 4. Página Projeto

### 4.1 Objetivo

A página Projeto é a porta de entrada comercial.

Ela representa o ponto onde a empresa identifica a demanda do cliente, registra informações iniciais e organiza os dados que serão herdados pelas próximas etapas.

### 4.2 Campos principais

A página Projeto deve concentrar informações como:

- Projeto;
- Descrição do Projeto;
- Natureza;
- Responsável;
- Cliente;
- Situação;
- Data de Inclusão;
- Data de Necessidade.

Esses campos existem porque definem a identidade inicial da demanda.

### 4.3 Informações herdadas

As informações do Projeto devem ser herdadas pelo Orçamento.

No Orçamento, essas informações devem aparecer como painel informativo, não como formulário editável. Se o usuário precisar alterar dados do projeto, deverá retornar à página Projeto.

Essa decisão preserva a origem oficial da informação.

### 4.4 Responsabilidades

A página Projeto deve:

- identificar o projeto;
- associar o cliente;
- registrar natureza e responsável;
- permitir navegação para orçamento e roteiro;
- apresentar observações e resumo operacional.

A página Projeto não deve calcular preço, custo industrial ou carga tributária. Essas responsabilidades pertencem ao Orçamento e ao Roteiro.

### 4.5 Regras

O Projeto é a origem do contexto. Ele não deve ser duplicado em outros módulos.

O número do Projeto deve acompanhar todo o ciclo posterior.

---

## 5. Página Orçamento

### 5.1 Objetivo

A página Orçamento transforma a demanda comercial em uma composição econômica.

Ela deve reunir produtos, quantidades, roteiros, custos, carga tributária, margem de lucro e total do orçamento.

### 5.2 Fluxo

O Orçamento recebe informações herdadas do Projeto. A partir dele, o usuário adiciona itens, seleciona ou cria produtos, acessa roteiros e consolida os valores.

O botão de adicionar item deve iniciar o fluxo de seleção de produto. Ele não deve criar uma linha vazia diretamente, porque um item de orçamento precisa estar associado a um produto.

Essa decisão evita itens sem identidade técnica e prepara a arquitetura para rastreabilidade.

### 5.3 Tabela dos produtos

A tabela dos itens do projeto deve conter:

| Coluna | Função |
|---|---|
| Descrição | Identifica o produto ou item solicitado. |
| Código | Identifica tecnicamente o item. |
| Quantidade | Representa a quantidade solicitada. |
| Roteiro | Permite acessar o roteiro do produto. |
| Custo | Valor calculado a partir do roteiro. |
| Impostos | Valor calculado a partir da carga tributária do orçamento. |
| Lucro | Valor calculado a partir da margem de lucro. |
| Total | Resultado da formação de preço do item. |
| Estrutura | Indica se o item possui estrutura navegável. |

Essa estrutura foi aprovada porque separa claramente informação técnica, custo interno e valor comercial consolidado.

### 5.4 Resumo do Orçamento

O Resumo do Orçamento deve exibir:

- Custo Total;
- Impostos Totais;
- Lucro Total;
- Valor Total do Orçamento.

Esses campos devem ser somente leitura. Eles não devem ser digitados manualmente.

No futuro:

- Custo Total será a soma da coluna Custo;
- Impostos Totais serão a soma da coluna Impostos;
- Lucro Total será a soma da coluna Lucro;
- Valor Total do Orçamento será a soma da coluna Total.

Essa decisão garante que o orçamento seja resultado dos itens, e não um valor livre sem rastreabilidade.

### 5.5 Formação do preço

O preço é formado por:

```text
Custo
↓
Carga Tributária
↓
Margem de Lucro
↓
Preço de Venda
```

O preço nunca deve ser digitado manualmente.

O usuário pode ajustar parâmetros permitidos, como carga tributária adotada e margem de lucro, mas o preço final deve ser calculado pelo sistema.

### 5.6 Regras de cálculo

As regras de cálculo devem ser implementadas de forma incremental.

Neste momento, a arquitetura define o conceito:

- custo vem do Roteiro;
- impostos vêm da carga tributária do Orçamento;
- lucro vem da margem definida no Orçamento;
- total é a composição final.

Essa separação foi aprovada porque torna o cálculo auditável.

---

## 6. Página Produto

### 6.1 Objetivo

A página Produto deve cadastrar a identidade técnica básica do item.

Ela não deve concentrar toda a engenharia do produto. A engenharia detalhada pertence ao Roteiro.

### 6.2 Cadastro simplificado

O cadastro de Produto deve manter apenas os campos essenciais:

- Código;
- Descrição;
- Quantidade;
- Situação.

Essa simplificação foi aprovada porque informações como unidade e tipo podem gerar redundância quando não estiverem claramente ligadas a uma regra de negócio validada.

### 6.3 Relacionamento com o Roteiro

O Produto pode abrir um Roteiro.

O Roteiro define como o produto será fabricado, quais materiais serão usados, quais operações serão realizadas, quais serviços de terceiros serão necessários e quais transportes poderão impactar o custo.

Essa decisão mantém o Produto simples e transfere a complexidade produtiva para o local correto.

---

## 7. Estrutura do Produto

### 7.1 Decisão oficial

A Estrutura do Produto não será um módulo independente.

A estrutura será representada pelo próprio Roteiro.

Essa decisão foi tomada porque, no NEXOTFE, a estrutura não é apenas uma lista de componentes. Ela envolve engenharia, matéria-prima, operações, serviços de terceiros, transportes, documentação técnica e custos industriais.

Separar a estrutura em um módulo isolado criaria duplicidade e enfraqueceria o vínculo com o processo real de fabricação.

### 7.2 Conteúdo da estrutura

O Roteiro contém:

- Engenharia;
- Matérias-primas;
- Operações;
- Serviços de Terceiros;
- Transportes;
- Documentação Técnica;
- Resumo de Custos Industriais.

Cada item pode possuir estrutura própria. A navegação deve permitir entrar em estruturas de forma hierárquica, sempre preservando o contexto do Projeto.

---

## 8. Página Roteiro

### 8.1 Objetivo

A página Roteiro representa a engenharia operacional do produto.

Ela deve responder como o item será produzido, quais recursos serão utilizados, quais materiais serão consumidos, quais terceiros serão acionados e quais custos industriais serão formados.

### 8.2 Engenharia

A seção Engenharia registra operações de planejamento técnico, análise, preparação e demais atividades de engenharia.

Ela existe porque nem todo custo industrial nasce na produção física. Tempo técnico também compõe o custo do produto.

### 8.3 Matérias-primas

A seção Matérias-primas registra os materiais necessários para produzir o item.

No futuro, essa seção deve alimentar automaticamente custos de matéria-prima e necessidades de compras.

### 8.4 Operações

A seção Operações registra as etapas produtivas internas.

Ela deve alimentar automaticamente mão de obra, tempo de máquina e custo industrial.

### 8.5 Serviços de Terceiros

A seção Serviços de Terceiros registra processos externos, como tratamentos, ensaios, beneficiamentos ou serviços especializados.

Essa decisão foi tomada para separar custos internos de custos contratados.

### 8.6 Transportes

A seção Transportes registra deslocamentos necessários para execução do roteiro, especialmente quando houver envio para fornecedores externos.

Ela alimentará custos de logística.

### 8.7 Documentação Técnica

A documentação técnica concentra arquivos e referências do produto ou processo.

Ela deve apoiar produção, compras, qualidade e comunicação técnica.

### 8.8 Resumo de Custos Industriais

O Resumo de Custos Industriais deve ser uma consolidação automática.

Ele não deve ser preenchido manualmente.

Cada linha virá da seção correspondente do Roteiro:

- Engenharia vem das operações de engenharia;
- Matéria-prima vem dos materiais;
- Mão de obra vem das operações produtivas;
- Terceiros vêm dos serviços de terceiros;
- Logística vem dos transportes.

Essa decisão garante que o custo industrial seja rastreável.

---

## 9. Formação dos Custos

O custo industrial é formado por:

```text
Engenharia
↓
Matéria-prima
↓
Mão de Obra
↓
Terceiros
↓
Logística
↓
Custo Industrial
```

Cada componente do custo deve nascer em sua seção operacional correta.

Essa decisão evita que o usuário digite um custo total sem memória de cálculo. O custo precisa ser explicável, revisável e auditável.

---

## 10. Formação do Preço

O preço de venda é formado por:

```text
Custo
↓
Carga Tributária
↓
Margem de Lucro
↓
Preço de Venda
```

O preço nunca é digitado manualmente.

Essa regra foi aprovada porque o preço precisa refletir a composição do item. Se o preço fosse digitado livremente, o sistema perderia o vínculo entre custo, imposto, lucro e valor final.

O usuário poderá ajustar parâmetros autorizados, mas o sistema deve manter a responsabilidade pelo cálculo.

---

## 11. Página Proposta Comercial

### 11.1 Objetivo

A Proposta Comercial representa o documento enviado ao cliente.

Ela deve traduzir o orçamento interno em uma comunicação comercial clara, profissional e externa.

### 11.2 Cabeçalho

O cabeçalho deve apresentar a identidade da empresa, número da proposta, revisão, data, contatos, dados legais e endereço.

O cabeçalho deve ter aparência de documento corporativo, não de painel interno.

### 11.3 Cliente

A seção de cliente deve mostrar:

- Nome da Empresa;
- CNPJ;
- E-mail;
- Nome do Solicitante.

Essas informações identificam o destinatário comercial da proposta.

### 11.4 Itens

A seção Itens da Proposta deve apresentar:

- Produto;
- Código;
- NCM;
- Quantidade;
- Valor Unitário;
- Valor Total.

Ela não deve apresentar custos internos.

### 11.5 Resumo

A proposta deve exibir o Valor Total da Proposta.

Esse valor é voltado ao cliente. Ele representa o preço final comercial, não a memória interna de custos.

### 11.6 Observações

A seção Considerações deve permitir texto comercial profissional.

Esse texto deve apoiar a comunicação com o cliente e contextualizar a proposta.

### 11.7 Anexos

A proposta deve preparar espaço para anexos.

Exemplos:

- desenhos;
- especificações;
- fotos;
- catálogos;
- certificados;
- documentos de apoio.

Os anexos devem complementar a proposta sem misturar regras internas de orçamento.

### 11.8 Gerar PDF

A ação Gerar PDF deverá, no futuro, gerar o documento final da proposta para envio ao cliente.

Essa funcionalidade não deve alterar os dados do orçamento. Ela deve apenas materializar a proposta em formato de documento.

### 11.9 Enviar Proposta

A ação Enviar Proposta deverá, no futuro, abrir o fluxo de envio ao cliente.

O envio deverá registrar histórico com:

- data e hora;
- usuário;
- destinatário;
- número da proposta;
- documentos anexados;
- situação Proposta Enviada.

### 11.10 Histórico

O histórico da proposta deve registrar eventos comerciais importantes.

Essa decisão permite rastrear quando a proposta foi enviada, revisada ou reenviada.

### 11.11 Informações que não devem aparecer na proposta

A Proposta Comercial nunca apresenta:

- custos internos;
- margem de lucro.

Essas informações pertencem exclusivamente ao Orçamento interno.

Essa decisão protege a estratégia comercial da empresa e separa claramente informação interna de informação enviada ao cliente.

---

## 12. Fluxo Comercial

O fluxo comercial aprovado é:

```text
Projeto
↓
Orçamento
↓
Produto
↓
Roteiro
↓
Proposta Comercial
↓
Anexos
↓
Gerar PDF
↓
Enviar Proposta
↓
Cliente
↓
Projeto Ativo
```

Esse fluxo preserva a ordem natural do processo comercial.

Primeiro a demanda é registrada. Depois o orçamento é formado. Em seguida, produto e roteiro dão base técnica e econômica. Somente depois a proposta é enviada ao cliente.

---

## 13. Padrões Visuais

### 13.1 Azul 700

O azul 700 é a cor oficial para ações primárias.

Exemplos:

- Salvar;
- Gerar Proposta Comercial;
- Gerar PDF;
- Enviar Proposta.

Essa decisão cria consistência visual. O usuário passa a reconhecer rapidamente a ação principal da tela.

### 13.2 Botão Salvar

O botão Salvar deve usar o estilo primário.

Ele deve aparecer apenas quando a página realmente permite persistir alterações.

### 13.3 Botão Voltar

O botão Voltar deve retornar ao contexto anterior.

Em fluxos hierárquicos, voltar deve respeitar o nível da hierarquia, não apenas o histórico do navegador quando isso puder confundir o usuário.

### 13.4 Realce ao passar o cursor

Cartões e linhas de tabela podem usar realce discreto ao passar o cursor.

O realce deve ser sutil. O objetivo é indicar interação, não chamar atenção excessiva.

### 13.5 Cartões padronizados

Os cartões devem usar:

- borda neutra;
- raio discreto;
- fundo branco;
- espaçamento interno consistente;
- realce azul em estados interativos quando aplicável.

Essa decisão mantém unidade visual entre módulos.

### 13.6 Espaçamento

O espaçamento deve permitir leitura confortável.

Campos não devem ficar comprimidos. Tabelas devem priorizar legibilidade, especialmente nas colunas de descrição e situação.

### 13.7 Hierarquia visual

Títulos, subtítulos, rótulos e valores devem ter pesos visuais diferentes.

Essa hierarquia ajuda o usuário a entender rapidamente o que é seção, o que é campo e o que é valor.

---

## 14. Regras Gerais

### 14.1 Não duplicar informação

Quando duas informações representam o mesmo conceito, apenas uma deve permanecer.

Essa regra foi usada, por exemplo, na remoção de contadores redundantes e na padronização de cabeçalhos.

### 14.2 Não duplicar ação

Uma ação deve existir em um único lugar claro.

Exemplo: se o título de um cartão já representa uma navegação de cadastro, não deve existir outro botão redundante para a mesma ação.

### 14.3 Não reconstruir módulos sem necessidade

Módulos existentes devem ser preservados quando contiverem lógica operacional válida.

O objetivo é integrar, padronizar e evoluir, não descartar conhecimento acumulado.

### 14.4 Não alterar regra de negócio sem validação

Quando houver dúvida sobre regra industrial, comercial ou fiscal, a implementação deve parar e a dúvida deve ser registrada.

Essa decisão evita que o sistema incorpore suposições incorretas.

### 14.5 Dados externos devem ser tratados com rastreabilidade

Informações de cliente, compras, fornecedores, estoque e produção devem manter origem clara.

O usuário precisa saber de onde veio a informação e qual processo a gerou.

### 14.6 Documentação acompanha desenvolvimento

Cada decisão aprovada deve ser documentada.

Este manual deve evoluir junto com o sistema.

---

## 15. Próximas Etapas

### 15.1 Planejamento e Controle da Produção

O planejamento deverá receber o projeto ativo e organizar a execução produtiva.

Essa etapa precisará respeitar roteiro, materiais, capacidade e prioridades.

### 15.2 Compras

Compras deverá receber necessidades de matéria-prima, serviços de terceiros e transportes.

O objetivo é evitar compras desconectadas do projeto, do roteiro ou da necessidade real.

### 15.3 Produção

Produção deverá executar operações planejadas e registrar andamento.

Essa etapa deverá preservar vínculo com projeto, produto, roteiro e ordem de fabricação.

### 15.4 Estoque

Estoque deverá controlar saldo, reservas, origem, localização e movimentações.

As futuras decisões sobre origem e endereço de estoque devem ser documentadas neste manual.

### 15.5 Financeiro

Financeiro deverá receber informações consolidadas de pedidos, faturamento e contas.

Essa etapa não deve nascer isolada. Ela deve herdar dados do fluxo operacional.

### 15.6 Qualidade

Qualidade deverá se conectar à documentação técnica, produção, inspeções, certificados e requisitos do cliente.

Essa etapa será importante para rastreabilidade e conformidade.

---

## 16. Manutenção deste Manual

Este documento deve ser atualizado sempre que:

- uma decisão arquitetural for aprovada;
- uma regra de negócio for consolidada;
- um novo módulo entrar no fluxo oficial;
- uma responsabilidade de página for alterada;
- um padrão visual for definido;
- uma integração futura for planejada.

Cada atualização deve explicar:

- o que foi decidido;
- por que foi decidido;
- qual impacto a decisão terá no sistema;
- quais módulos serão afetados;
- quais cuidados devem ser observados por desenvolvedores futuros.

O valor deste manual está em preservar raciocínio, não apenas registrar telas.

