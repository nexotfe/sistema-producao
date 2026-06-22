# Comparação do Banco Restaurado com os Documentos Normativos — NEXOTFE 1.0

## 1. Objetivo e escopo

Este documento compara o estado efetivamente restaurado do banco com:

- Arquitetura Geral;
- Arquitetura de Dados;
- Estados Oficiais;
- Plano Diretor;
- Dicionário Industrial.

A análise usa exclusivamente o catálogo do banco restaurado. Não avalia intenção presente em código ou migrations ainda não aplicadas e não altera a arquitetura normativa.

Classificações usadas:

- **ATENDE**: existe estrutura coerente com a responsabilidade normativa principal;
- **PARCIAL**: existe base aproveitável, mas faltam identidade, relações, ciclo de vida ou rastreabilidade;
- **AUSENTE**: não existe entidade persistente correspondente;
- **INCOMPATÍVEL**: a implementação existente contradiz um princípio ou fluxo normativo.

As matrizes detalhadas estão em `COMPARACAO_BANCO_DOCUMENTOS_NORMATIVOS.csv` e `COMPARACAO_ESTADOS_BANCO_NORMA.csv`.

## 2. Evidência examinada

O banco restaurado contém:

- 29 tabelas;
- 16 views;
- 23 funções;
- 117 chaves estrangeiras;
- 106 policies RLS;
- 29 triggers;
- 33 registros distribuídos entre as tabelas.

O catálogo técnico utilizado está em `knowledge/CATALOGO_BANCO_RESTAURADO/`.

## 3. Resultado executivo

O banco **não implementa a Arquitetura NEXOTFE 1.0 de ponta a ponta**. Ele representa um protótipo funcional com partes aproveitáveis dos núcleos administrativo, engenharia e suprimentos, mas sem o encadeamento industrial normativo.

Dos 46 conceitos avaliados:

- 5 atendem à responsabilidade principal;
- 20 estão parciais;
- 18 estão ausentes;
- 3 são incompatíveis com a norma.

Os três conceitos incompatíveis são centrais: Necessidade de Material, Decisão PCP e Reserva. A incompatibilidade também alcança o comportamento atual de criação da OF, que automatiza o atendimento. Assim, o problema não é apenas ausência de tabelas; existe comportamento persistido contrário ao princípio de decisão humana do PCP e à separação entre reserva lógica e consumo físico.

## 4. Comparação por módulo

### 4.1 Administrativo

Há boa base reaproveitável em `empresas`, `tecnologias_aplicadas`, `grupos_recursos`, `recursos_produtivos`, `funcionarios`, `numeracao_configuracoes` e `producao_configuracoes`.

Desvios relevantes:

- `profiles` e `usuarios` mantêm fontes concorrentes de empresa e nível de acesso; para o baseline, `public.usuarios` será a única fonte oficial de empresa, papel e permissões, enquanto `auth.users` permanecerá restrito à autenticação;
- a numeração cobre somente projeto e OF;
- `projetos.numero_projeto` é globalmente único, enquanto a numeração é configurada por empresa;
- capacidade e disponibilidade são atributos estáticos, não capacidade operacional no tempo;
- o isolamento multiempresa não é garantido apenas por possuir `empresa_id`: as FKs simples permitem, em tese, relacionar registros de empresas diferentes.

Conclusão: **parcialmente aderente** e útil como fundação, porém ainda não encerra a Fase 0 do Plano Diretor.

### 4.2 Comercial

`clientes` é aproveitável. `projetos` possui cliente e um ciclo de vida rudimentar.

Faltam entidades próprias para Contato, Orçamento e Aprovação Comercial. A tabela `projetos` concentra funções de Projeto Comercial e Projeto Industrial, sem uma passagem formal entre as duas responsabilidades.

Conclusão: **Fase 1 parcial**. O banco não preserva a origem comercial completa que deveria alimentar a engenharia.

### 4.3 Engenharia

São aproveitáveis:

- `projeto_itens` como base de item de projeto;
- `itens_industriais` como base de identidade técnica;
- `boms` e `bom_itens` como base de composição versionada.

Lacunas e riscos:

- PN é apenas um campo nullable, sem unicidade por empresa, e aparece duplicado em `projeto_itens`;
- documento técnico e revisão são campos, não entidades versionadas e auditáveis;
- BOM não possui fluxo formal de revisão/liberação;
- RLS está desativada em `boms` e `bom_itens`;
- Roteiro de Fabricação, suas versões, operações, materiais e sequência estão ausentes.

Conclusão: **Fase 2 parcial e estruturalmente incompleta**. A ausência de Roteiro impede derivar necessidades segundo o Dicionário Industrial.

### 4.4 PCP

`ordens_fabricacao` é uma base aproveitável, com vínculos para projeto, item, produto e BOM. Entretanto, não registra roteiro/revisão congelados e usa estados diferentes dos oficiais.

O fluxo atual é incompatível com a norma:

1. `criar_ordem_fabricacao_operacional` percorre diretamente a BOM;
2. consulta saldo disponível;
3. registra automaticamente “consumo interno” ou requisição;
4. não cria Necessidade de Material persistente;
5. não espera nem registra a decisão humana do PCP.

Além disso, `registrar_consumo_interno` aumenta `saldo_reservado`, grava movimento do tipo `reserva` e cria simultaneamente um registro denominado consumo. Isso mistura três fatos distintos: decisão, reserva lógica e consumo físico.

Views como `vw_demanda_bom_of` e `vw_decisao_material_of` são projeções úteis, mas não substituem entidades transacionais com estado, autoria e histórico.

Programação e dependências entre OFs estão ausentes.

Conclusão: **Fase 3 não aderente**. Este é o principal bloqueio arquitetural do banco restaurado.

### 4.5 Suprimentos

Há estruturas aproveitáveis para fornecedor, requisição, planejamento, origens do planejamento e pedido.

Desvios:

- existem dois modelos de movimentação de estoque (`estoque_movimentacoes` e `movimentacoes_estoque`);
- `estoque_movimentacoes` inclui `reserva` e `liberacao_reserva` como tipos de movimento, contrariando a reserva lógica separada do consumo físico;
- requisição não referencia Necessidade nem Decisão PCP;
- pedido guarda `fornecedor_nome` em texto, apesar de existir `fornecedores`;
- estados de requisição e pedido não coincidem com os oficiais;
- Recebimento, conferência documental e inspeção estão ausentes.

Conclusão: **Fase 4 parcial**. A parte de planejamento é a mais próxima da norma, mas sua origem e seu destino ainda não fecham a rastreabilidade.

### 4.6 Produção

Tecnologias, recursos e colaboradores estão cadastrados, mas não existe o modelo transacional de produção: Roteiro, OP, alocação, apontamento, execução, perdas, tempos e serviço terceirizado.

`ordens_fabricacao.quantidade_produzida` é um acumulador, não substitui apontamentos rastreáveis.

Conclusão: **Fase 5 não iniciada**, exceto pelos cadastros de apoio.

### 4.7 Qualidade

Não existem Inspeção, Certificado, Não Conformidade ou Liberação. Também não há ponto formal de inspeção no recebimento ou na OP.

Conclusão: **Fase 6 não iniciada**.

### 4.8 Expedição

Não existem Produto Acabado, Separação, Expedição ou Entrega. O tipo `produto acabado` em `itens_industriais` é uma classificação cadastral e não representa o estado operacional de um produto produzido.

Conclusão: **Fase 7 não iniciada**.

## 5. Estados oficiais

Nenhum dos nove ciclos de vida normativos está integralmente implementado.

| Entidade | Diagnóstico |
|---|---|
| Projeto | Incompatível: cinco valores locais comprimem nove estados oficiais |
| OF | Incompatível: não distingue simulação, material e programação |
| Necessidade | Ausente |
| Reserva | Ausente como entidade; comportamento atual é incompatível |
| Requisição | Incompatível |
| Pedido | Incompatível |
| Recebimento | Ausente |
| OP | Ausente |
| Produto Acabado | Ausente |

Os valores são implementados por constraints `CHECK`, não por tipos enum do PostgreSQL. A divergência é, portanto, estrutural e não apenas de apresentação.

## 6. Relações normativas faltantes ou frágeis

Relações ausentes que interrompem o fluxo oficial:

- Projeto Comercial → aprovação → Projeto Industrial;
- PN/BOM → Roteiro versionado;
- OF → versão do Roteiro utilizada;
- Roteiro/OF → Necessidades de Material;
- Necessidade → Decisão PCP;
- Decisão → Reserva e/ou Requisição;
- Reserva → eventos de reserva → Consumo físico;
- Requisição → Planejamento → Pedido → Fornecedor por FK;
- Pedido → Recebimento → inspeção/liberação;
- OF → OPs → apontamentos → Produto Acabado;
- Produto Acabado → Separação → Expedição → Entrega;
- OF → dependências entre OFs.

Fragilidades transversais:

- FKs não comprovam que pai e filho pertencem à mesma `empresa_id`;
- vários vínculos coexistem por ID e por número textual (`of_id` e `of_numero`);
- PN e número de projeto não seguem consistentemente a fronteira da empresa;
- documentos e revisões não possuem histórico normalizado;
- views operacionais inferem estados/decisões que deveriam ter origem transacional auditável.

## 7. Aderência ao Plano Diretor

| Fase normativa | Situação no banco restaurado | Condição |
|---|---|---|
| Fase 0 — Fundação Técnica | Baseline restaurável existe; RLS, estados, identidade e migrations possuem bloqueios já auditados | Parcial |
| Fase 1 — Comercial | Cliente e projeto básico | Parcial |
| Fase 2 — Engenharia | Item, PN parcial e BOM; Roteiro ausente | Parcial/bloqueada |
| Fase 3 — PCP | OF parcial; núcleo Necessidade/Decisão/Reserva incompatível ou ausente | Não aderente |
| Fase 4 — Suprimentos | Requisição, planejamento e pedido parciais; recebimento ausente | Parcial |
| Fase 5 — Produção | Apenas cadastros de apoio | Não iniciada |
| Fase 6 — Qualidade | Sem entidades | Não iniciada |
| Fase 7 — Expedição | Sem entidades | Não iniciada |

A ordem do Plano Diretor continua correta. O banco atual avançou em partes de Suprimentos antes de concluir Engenharia e PCP, gerando precisamente o risco previsto pelo plano: compras sem uma origem industrial normativa e auditável.

## 8. O que pode ser preservado

Podem ser preservados como base, após saneamento de segurança e relações:

- cadastros de empresa, cliente e fornecedor;
- tecnologias, grupos, recursos e colaboradores;
- itens industriais e itens de projeto;
- estrutura de BOM e seus itens;
- cabeçalho básico da OF;
- requisição, planejamento de compras, origens e itens de pedido;
- saldo de estoque como conceito;
- numeração e configurações operacionais;
- views de demanda como consultas auxiliares, desde que deixem de representar a fonte oficial da decisão.

Preservar tabela não significa preservar integralmente seu contrato atual. Estados, vínculos, RLS e responsabilidades precisam ser alinhados antes de uso definitivo.

## 9. Bloqueios antes de migrations definitivas

Em conformidade com o Plano Diretor, permanecem bloqueadores:

1. definir uma baseline reproduzível a partir da história de migrations auditada;
2. resolver as falhas críticas de RLS e as tabelas BOM sem RLS;
3. alinhar os ciclos de vida aos Estados Oficiais, com estratégia explícita de migração de dados;
4. eliminar a decisão automática de estoque/compra na criação da OF;
5. representar Roteiro, Necessidade, Decisão PCP e Reserva conforme o Estudo Técnico 001;
6. separar reserva lógica de consumo/movimentação física;
7. consolidar a autoridade já definida: `public.usuarios` como fonte única de empresa, papel e permissões, removendo `profiles` das decisões de autorização;
8. garantir integridade multiempresa também nos relacionamentos;
9. decidir a consolidação dos dois modelos concorrentes de estoque;
10. assegurar que Pedido referencie Fornecedor e que a cadeia de origem seja preservada.

## 10. Conclusão arquitetural

O banco restaurado é **aproveitável como matéria-prima de migração**, mas **não é uma implementação aderente da Arquitetura NEXOTFE 1.0**.

Ele não deve ser descartado: contém cadastros e estruturas úteis, e o volume atual de dados de negócio é baixo. Essa baixa volumetria reduz o risco de transformação. Contudo, as migrations definitivas não devem ser aplicadas sobre essa base até que a Fase 0 seja encerrada e o núcleo Roteiro → Necessidades → Decisão PCP → Reserva/Requisição seja implementado segundo o contrato normativo.

O diagnóstico final é: **fundação parcial, fluxo industrial interrompido e núcleo PCP atualmente incompatível**.
