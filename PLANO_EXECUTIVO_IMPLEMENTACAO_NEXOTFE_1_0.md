# PLANO EXECUTIVO DE IMPLEMENTAÇÃO — NEXOTFE 1.0

**Versão:** 1.0  
**Status:** Guia operacional oficial  
**Data:** 19/06/2026  
**Base:** Arquitetura NEXOTFE 1.0 congelada e Plano Diretor de Implementação

## 1. Finalidade

Transformar o Plano Diretor em uma sequência operacional de Sprints, com entregas verificáveis, dependências explícitas, gates de qualidade e critérios uniformes de conclusão.

Este documento não altera a Arquitetura 1.0 e não autoriza interpretações arquiteturais durante a implementação.

## 2. Avaliação executiva do Plano Diretor

O Plano Diretor apresenta uma sequência tecnicamente válida:

```text
Gate normativo
→ Baseline do banco
→ Fundação industrial
→ Comercial
→ Engenharia
→ PCP e Materiais
→ Suprimentos
→ Recebimento
→ Produção
→ Qualidade
→ Expedição
→ Centrais
```

### 2.1 Ajustes executivos necessários

Os ajustes abaixo alteram apenas a ordem e a coordenação da implementação.

#### Qualidade transversal

Qualidade não pode começar somente depois de Produção. O modelo central será consolidado na Sprint de Qualidade, mas duas capacidades mínimas precisam ser antecipadas:

- inspeção de entrada durante Recebimento;
- inspeção de processo e bloqueios durante Produção.

Sem isso, materiais e produtos podem avançar sem disposição válida.

#### Estoque base antes do PCP

O cadastro de materiais, saldos e locais necessários ao fluxo deve estar estabilizado na Fundação. As regras avançadas de reserva permanecem na Sprint PCP e Materiais.

#### Estados antes das operações

Cada Sprint deve validar as transições oficiais das entidades que implementará. Não é permitido implementar primeiro e reconciliar os estados posteriormente.

#### Centrais por último

Centrais e dashboards devem permanecer após os módulos transacionais. Antecipá-los produziria indicadores sobre dados ainda instáveis.

### 2.2 Riscos de bloqueio

1. Os documentos normativos aprovados precisam estar materializados e versionados no repositório.
2. O banco atual não possui baseline local comprovadamente reproduzível.
3. Existem migrations duplicadas, dependências fora de ordem e funções potencialmente sobrecarregadas.
4. Dados atuais de consumo podem representar reservas antecipadas.
5. A Sprint PCP concentra concorrência, idempotência e múltiplos efeitos transacionais.

Esses riscos não exigem redesenho da arquitetura. Exigem gates de execução.

## 3. Mapa de fases para Sprints

| Sprint | Fase do Plano Diretor | Nome |
|---|---|---|
| 01 | Fase 0 | Prontidão Normativa |
| 02 | Fase 1 | Baseline e Saneamento do Banco |
| 03 | Fase 2 | Fundação Multiempresa e Cadastros |
| 04 | Fase 3 | Comercial e Projetos |
| 05 | Fase 4 | Engenharia Industrial |
| 06 | Fase 5 | PCP, OF e Materiais |
| 07 | Fase 6 | Suprimentos e Compras |
| 08 | Fase 7 | Recebimento, Qualidade de Entrada e Estoque |
| 09 | Fase 8 | Produção e Execução de Operações |
| 10 | Fase 9 | Qualidade Industrial Consolidada |
| 11 | Fase 10 | Expedição e Entrega |
| 12 | Fase 11 | Centrais, Indicadores e Integração |

As Sprints representam marcos de produto. Uma Sprint executiva pode ser subdividida em ciclos menores pela equipe sem alterar seus critérios de conclusão.

## 4. Plano operacional das Sprints

### Sprint 01 — Prontidão Normativa

**Complexidade:** Baixa

#### Objetivo

Disponibilizar à equipe a versão congelada e verificável da Arquitetura 1.0.

#### Escopo

- reunir documentos normativos aprovados;
- registrar versão, status e responsável;
- construir matriz de rastreabilidade normativa;
- confirmar glossário, classificações e estados aplicáveis.

#### Entregas

- pacote normativo versionado;
- índice oficial da Arquitetura 1.0;
- matriz documento → domínio → entidade → estado → regra;
- lista de dúvidas de implementação sem alteração arquitetural;
- ata de prontidão para o baseline.

#### Critérios de aceite

- nenhum documento obrigatório está vazio ou inacessível;
- cada documento possui versão e status;
- termos utilizados nos contratos existem no Dicionário;
- classificações e estados são localizáveis sem interpretação livre.

#### Critérios de conclusão

- aceite do Arquiteto-Chefe e responsáveis funcionais;
- baseline documental marcado e protegido contra alteração informal;
- Sprint 02 possui todas as referências necessárias.

#### Dependências

- disponibilização interna dos documentos aprovados.

#### Riscos

- documentos aprovados fora do repositório;
- versões divergentes;
- implementação baseada em cópia desatualizada.

---

### Sprint 02 — Baseline e Saneamento do Banco

**Complexidade:** Alta

#### Objetivo

Tornar o banco atual inventariado, recuperável e reproduzível antes de qualquer evolução definitiva.

#### Escopo

- comparar banco remoto e migrations locais;
- mapear dados existentes;
- identificar migrations perigosas;
- validar backup, restauração e ambiente limpo;
- preparar estratégia expand–migrate–contract.

#### Entregas

- catálogo físico do banco;
- mapa de dependências;
- baseline reproduzível;
- relatório de divergências;
- plano de backfill e rollback;
- classificação dos dados legados.

#### Critérios de aceite

- banco vazio reproduzido em ensaio;
- cópia representativa migrada sem perda;
- backup restaurado com sucesso;
- objetos duplicados e funções ambíguas identificados;
- nenhuma ação destrutiva incluída no primeiro cutover.

#### Critérios de conclusão

- relatório técnico aprovado;
- procedimento de recuperação ensaiado;
- ambiente de desenvolvimento recriável;
- riscos críticos possuem tratamento definido.

#### Dependências

- Sprint 01;
- acesso seguro ao banco e backups.

#### Riscos

- drift entre remoto e repositório;
- migrations fora de ordem;
- dados demonstrativos misturados a dados válidos.

---

### Sprint 03 — Fundação Multiempresa e Cadastros

**Complexidade:** Alta

#### Objetivo

Estabilizar tenant, identidade, numeração, classificações e cadastros industriais compartilhados.

#### Escopo

- empresas e usuários;
- clientes e fornecedores;
- materiais e itens industriais;
- tecnologias, grupos e recursos;
- colaboradores e configurações previstas;
- RLS e unicidade por tenant.

#### Entregas

- cadastros reais;
- numeração transacional;
- políticas multiempresa;
- APIs de consulta e manutenção;
- telas sem mocks para o escopo concluído;
- fixtures oficiais de teste.

#### Critérios de aceite

- dados de empresas distintas não se cruzam;
- códigos e números não colidem;
- classificações reproduzem a fonte normativa;
- vínculos cruzados entre tenants são bloqueados.

#### Critérios de conclusão

- todos os testes de RLS passam;
- cadastros necessários à Sprint 04 estão operacionais;
- documentação de dados e APIs está atualizada.

#### Dependências

- Sprints 01 e 02.

#### Riscos

- identidade duplicada;
- regra de numeração inconsistente;
- cadastros locais surgirem nos módulos posteriores.

---

### Sprint 04 — Comercial e Projetos

**Complexidade:** Média

#### Objetivo

Implementar o ciclo comercial e a origem da demanda industrial conforme os contratos aprovados.

#### Escopo

- clientes relacionados;
- projetos/orçamentos;
- itens de projeto;
- aprovação e histórico;
- reutilização de PN.

#### Entregas

- comandos e consultas do ciclo comercial;
- transições oficiais de projeto;
- telas reais de listagem, criação e detalhe;
- rastreabilidade cliente → projeto → item.

#### Critérios de aceite

- número gerado sem colisão;
- PN existente é reutilizado;
- transições inválidas são bloqueadas;
- aprovação possui responsável e data.

#### Critérios de conclusão

- um projeto real pode ser criado, aprovado e disponibilizado à Engenharia;
- nenhum dado crítico depende de mock;
- histórico é auditável.

#### Dependências

- Sprint 03.

#### Riscos

- Engenharia receber projeto ainda mutável;
- duplicação de PN;
- perda do histórico comercial.

---

### Sprint 05 — Engenharia Industrial

**Complexidade:** Muito Alta

#### Objetivo

Implementar a definição técnica publicada de PN, BOM, roteiro, materiais e operações.

#### Escopo

- PN e estrutura;
- BOM e itens;
- roteiro de fabricação;
- materiais e operações;
- tecnologias;
- publicação e versionamento;
- documentos previstos.

#### Entregas

- manutenção de rascunho técnico;
- publicação transacional;
- histórico de versões;
- portal técnico real;
- estrutura pronta para originar OF.

#### Critérios de aceite

- versão publicada é imutável;
- unidade do material é preservada;
- sequência operacional é válida;
- publicação concorrente não produz duas versões vigentes incompatíveis.

#### Critérios de conclusão

- um PN possui BOM e roteiro publicados;
- materiais e operações estão persistidos;
- versões anteriores são consultáveis;
- PCP consegue consumir a estrutura sem redigitação.

#### Dependências

- Sprints 03 e 04.

#### Riscos

- OF utilizar definição técnica mutável;
- BOM e roteiro perderem coerência;
- retrabalho em todo o fluxo posterior.

---

### Sprint 06 — PCP, OF e Materiais

**Complexidade:** Muito Alta

#### Objetivo

Entregar o eixo Roteiro → OF → Necessidades → Decisão PCP → Reserva/Requisição.

#### Escopo

- criação de OF com snapshot;
- cálculo de necessidades;
- decisão total, parcial ou compra;
- reserva e eventos;
- requisição complementar;
- cancelamentos;
- separação entre reserva e consumo.

#### Entregas

- RPCs transacionais do Estudo Técnico 001;
- APIs de OF, necessidades e decisões;
- telas operacionais;
- histórico ponta a ponta;
- migração controlada das funções antigas.

#### Critérios de aceite

- saldo total, parcial e zero funcionam;
- decisão repetida é idempotente;
- concorrência não gera saldo negativo;
- falha intermediária provoca rollback integral;
- cancelamento libera reservas permitidas.

#### Critérios de conclusão

- os três cenários materiais são demonstráveis;
- nenhuma reserva ou requisição nasce sem PCP;
- OF preserva a definição técnica utilizada;
- RLS, auditoria e reconciliação aprovadas.

#### Dependências

- Sprints 02, 03 e 05.

#### Riscos

- corrupção de saldo;
- duplicidade de compra;
- deadlock;
- mistura entre reserva e consumo.

---

### Sprint 07 — Suprimentos e Compras

**Complexidade:** Alta

#### Objetivo

Transformar requisições aprovadas em planejamento e pedidos rastreáveis.

#### Escopo

- requisições;
- consolidação;
- planejamento total, parcial ou por OF;
- decisão do comprador;
- pedido e fornecedor;
- acompanhamento de estados.

#### Entregas

- RPCs e APIs de planejamento;
- geração idempotente de pedido;
- telas reais de compras;
- rastreabilidade das origens.

#### Critérios de aceite

- consolidação preserva origem e quantidade;
- pedido não é duplicado;
- decisão humana é auditada;
- cancelamentos respeitam o estado atual.

#### Critérios de conclusão

- requisição percorre o ciclo até pedido;
- pedido está disponível para recebimento;
- nenhuma origem é perdida.

#### Dependências

- Sprints 03 e 06.

#### Riscos

- agrupamento industrial incorreto;
- pedido sem fornecedor válido;
- perda de vínculo com necessidade.

---

### Sprint 08 — Recebimento, Qualidade de Entrada e Estoque

**Complexidade:** Alta

#### Objetivo

Receber, conferir, inspecionar e liberar materiais para estoque e produção.

#### Escopo

- recebimento parcial e total;
- conferência física e documental;
- inspeção de entrada mínima;
- divergência e rejeição;
- entrada única de estoque;
- atualização de pedido e necessidade.

#### Entregas

- comandos transacionais de recebimento;
- APIs e telas de conferência;
- inspeção de entrada;
- reconciliação pedido–recebimento–estoque.

#### Critérios de aceite

- repetição não duplica saldo;
- material sujeito a inspeção não entra livremente;
- divergências ficam registradas;
- recebimento parcial atualiza quantidades corretamente.

#### Critérios de conclusão

- material recebido e liberado reflete no estoque e na OF;
- pedido e necessidade permanecem reconciliados;
- qualidade de entrada aprovada.

#### Dependências

- Sprints 03, 06 e 07.

#### Riscos

- duplicação de entrada;
- material rejeitado disponível à produção;
- divergências sem efeito operacional.

---

### Sprint 09 — Produção e Operações

**Complexidade:** Muito Alta

#### Objetivo

Executar operações de OF com consumo, progresso, paradas e conclusão auditáveis.

#### Escopo

- filas operacionais;
- início, pausa, retomada e conclusão;
- apontamentos;
- consumo de reserva;
- perdas e ocorrências previstas;
- inspeção de processo mínima;
- conclusão da OF.

#### Entregas

- comandos transacionais de execução;
- APIs operacionais;
- telas de fila, operação e apontamento;
- produto acabado conforme contrato.

#### Critérios de aceite

- transições oficiais são respeitadas;
- consumo não excede reserva;
- operação não conclui com pendências proibidas;
- evento concorrente não duplica quantidade ou tempo.

#### Critérios de conclusão

- uma OF real percorre a execução completa;
- consumo e progresso reconciliam;
- histórico identifica usuário, recurso, tempo e quantidade.

#### Dependências

- Sprints 05, 06 e 08.

#### Riscos

- execução de versão errada;
- consumo sem saldo;
- apontamentos concorrentes;
- conclusão sem qualidade aplicável.

---

### Sprint 10 — Qualidade Industrial Consolidada

**Complexidade:** Alta

#### Objetivo

Consolidar inspeção de entrada, processo e final, não conformidades e disposições.

#### Escopo

- planos e resultados;
- bloqueios e liberações;
- não conformidade;
- retrabalho e reinspeção;
- inspeção final;
- histórico imutável.

#### Entregas

- serviços e telas de Qualidade;
- integração com Recebimento e Produção;
- rastreabilidade de disposição;
- segregação de responsabilidades.

#### Critérios de aceite

- produto sujeito a inspeção não avança sem decisão;
- rejeição e retrabalho possuem efeitos coerentes;
- histórico não pode ser apagado.

#### Critérios de conclusão

- Qualidade cobre os pontos definidos na Arquitetura 1.0;
- todas as disposições são rastreáveis;
- Expedição recebe apenas produto liberado.

#### Dependências

- Sprints 08 e 09.

#### Riscos

- divergência entre bloqueio de Qualidade e estado físico;
- não conformidade sem impacto na produção.

---

### Sprint 11 — Expedição e Entrega

**Complexidade:** Média

#### Objetivo

Expedir e entregar produtos acabados e liberados com rastreabilidade.

#### Escopo

- preparação;
- conferência;
- expedição parcial ou total;
- movimentação de saída;
- entrega e comprovantes;
- encerramento previsto.

#### Entregas

- comandos e APIs de expedição;
- telas operacionais;
- histórico produto → OF → projeto → cliente.

#### Critérios de aceite

- produto não liberado é bloqueado;
- confirmação repetida não duplica saída;
- quantidades expedidas e entregues reconciliam.

#### Critérios de conclusão

- ciclo oficial chega a Entregue;
- estoque e entrega permanecem consistentes;
- comprovantes e responsáveis estão registrados.

#### Dependências

- Sprints 04, 09 e 10.

#### Riscos

- saída duplicada;
- entrega sem qualidade;
- encerramento sem quantidade completa.

---

### Sprint 12 — Centrais, Indicadores e Integração

**Complexidade:** Alta

#### Objetivo

Disponibilizar perspectivas operacionais e contratos de integração sobre dados transacionais estáveis.

#### Escopo

- Central Nexus;
- Central de Operações;
- indicadores aprovados;
- alertas;
- APIs externas e eventos previstos;
- navegação até a origem.

#### Entregas

- read models e consultas;
- dashboards rastreáveis;
- contratos de integração versionados;
- mecanismos de recuperação previstos.

#### Critérios de aceite

- indicador reconcilia com sua origem;
- Central não cria regra transacional própria;
- integração é idempotente quando aplicável;
- tenant permanece isolado.

#### Critérios de conclusão

- perspectivas previstas estão operacionais;
- dados agregados são explicáveis;
- integrações possuem contrato e monitoramento.

#### Dependências

- todas as Sprints transacionais aplicáveis.

#### Riscos

- métrica divergente;
- acoplamento ao schema interno;
- evento perdido ou duplicado.

## 5. Roadmap executivo completo

| Sprint | Objetivo | Módulos | Banco | Backend | Frontend | Testes | Documentação |
|---|---|---|---|---|---|---|---|
| 01 | Prontidão normativa | Todos | Inventário preliminar | Nenhum | Nenhum | Consistência documental | Baseline normativo |
| 02 | Baseline seguro | Plataforma | Schema atual | Inventário de funções | Nenhum | Migração, restore e drift | Catálogo e rollback |
| 03 | Fundação | Cadastros | Tenant e mestres | APIs/RPCs básicas | Cadastros | RLS e unicidade | Dados e APIs |
| 04 | Origem comercial | Comercial | Projetos e itens | Ciclo e estados | Projetos | Fluxo comercial | Regras e aceite |
| 05 | Definição técnica | Engenharia | PN/BOM/Roteiro | Publicação | Portal técnico | Versão e integridade | Estrutura técnica |
| 06 | Decisão material | PCP/Estoque | OF/Necessidade/Reserva | RPCs atômicas | OF e PCP | Concorrência/rollback | Contrato executado |
| 07 | Aquisição | Suprimentos | Requisição/Planejamento/Pedido | Compras | Telas de compras | Consolidação | Processo de compra |
| 08 | Entrada | Recebimento/Estoque/Qualidade | Recebimento e saldo | Liberação | Conferência | Idempotência | Procedimento operacional |
| 09 | Execução | Produção | OP/Apontamento/Consumo | Execução | Chão de fábrica | Estados e concorrência | Operação |
| 10 | Conformidade | Qualidade | Inspeção/NC | Disposição | Qualidade | Bloqueios e histórico | Plano de qualidade |
| 11 | Saída | Expedição | Expedição/Entrega | Confirmações | Logística | Reconciliação | Processo de entrega |
| 12 | Visibilidade | Centrais/Integração | Read models | APIs/eventos | Dashboards | Contratos e métricas | Catálogo de indicadores |

## 6. Paralelização

### Obrigatoriamente sequenciais

```text
Sprint 01 → Sprint 02 → Sprint 03
Sprint 03 → Sprint 04 → Sprint 05 → Sprint 06
Sprint 06 → Sprint 07 → Sprint 08
Sprint 05 + Sprint 06 + Sprint 08 → Sprint 09
Sprint 09 + Sprint 10 → Sprint 11
Sprints transacionais → Sprint 12
```

### Paralelização segura

- Na Sprint 03: clientes, fornecedores e tecnologias podem ter frentes distintas.
- Durante a Sprint 05: testes do PCP podem ser preparados com fixtures contratuais.
- Durante a Sprint 06: Suprimentos pode preparar consultas sem ativar pedidos.
- Durante as Sprints 08 e 09: Qualidade pode evoluir seu núcleo compartilhado.
- Durante a Sprint 09: Expedição pode preparar consultas de produto acabado sem ativar saída.
- Documentação, observabilidade e automação de testes acompanham todas as Sprints.

## 7. Primeira Sprint oficial

### Sprint 01 — Prontidão Normativa

É a primeira Sprint porque possui menor risco, não modifica o sistema e elimina a possibilidade de implementação baseada em documentos incompletos ou versões divergentes.

### Arquivos envolvidos

- `knowledge/livro-arquitetura-funcional/*`;
- `ESTUDO_TECNICO_001.md`;
- `PLANO_DIRETOR_IMPLEMENTACAO_NEXOTFE_1_0.md`;
- `PLANO_EXECUTIVO_IMPLEMENTACAO_NEXOTFE_1_0.md`;
- `knowledge/decisoes/*`;
- documentação de migrations existente, apenas para referência;
- `supabase/migrations/*`, apenas para inventário.

### Migrations

- nenhuma migration será criada;
- nenhuma migration será alterada;
- nenhuma migration será aplicada;
- todas as migrations atuais serão catalogadas para a Sprint 02.

### Tabelas

- nenhuma tabela será criada ou alterada;
- tabelas existentes serão listadas somente para rastreabilidade documento → domínio.

### RPCs

- nenhuma RPC será criada ou alterada;
- funções existentes serão apenas relacionadas aos contratos normativos.

### Testes

- presença e integridade dos documentos;
- versões e status;
- termos do Estudo Técnico presentes no Dicionário;
- estados utilizados presentes nos Estados Oficiais;
- classificações utilizadas presentes no padrão oficial;
- links e referências sem destino ausente.

### Documentação entregue

- índice normativo;
- matriz de rastreabilidade;
- registro de responsáveis;
- lista de desvios de implementação já existentes;
- autorização para Sprint 02.

### Critérios para encerramento

- zero documento normativo obrigatório vazio;
- zero termo operacional sem definição;
- zero estado utilizado sem fonte oficial;
- responsáveis aprovam a matriz;
- pacote 1.0 recebe identificação imutável de versão;
- Sprint 02 é formalmente liberada.

## 8. Critérios obrigatórios de desenvolvimento

Toda entrega deve responder **SIM** às perguntas abaixo:

- Está de acordo com o Livro Mestre?
- Está de acordo com os Contratos Técnicos?
- Está de acordo com a Arquitetura de Dados?
- Está de acordo com os Estados Oficiais?
- Está de acordo com o Dicionário Industrial?
- Usa somente classificações oficiais?
- Mantém rastreabilidade até a origem?
- Mantém isolamento multiempresa?
- Mantém idempotência quando necessária?
- Possui estratégia de rollback ou compensação?
- Possui testes automatizados proporcionais ao risco?
- Preserva histórico e auditoria exigidos?
- Não duplica regra já pertencente a outro domínio?

Qualquer resposta negativa impede a conclusão da entrega.

## 9. Definition of Done oficial

### Código

- revisão técnica concluída;
- sem regra industrial duplicada;
- tipos e nomes aderentes ao Dicionário;
- erros de domínio tratados de forma estável;
- lint, tipagem e build aprovados.

### Banco

- modelo físico rastreado até a Arquitetura de Dados;
- constraints e índices revisados;
- relacionamentos multiempresa protegidos;
- dados legados reconciliados;
- nenhuma alteração destrutiva não planejada.

### Migrations

- migration nova e imutável após aplicação;
- executável em banco vazio;
- executável sobre base representativa;
- backfill idempotente;
- ordem e dependências documentadas;
- recuperação ou compensação ensaiada.

### RPCs

- transação atômica quando houver múltiplos efeitos;
- autenticação e tenant validados;
- idempotência quando necessária;
- bloqueios concorrentes revisados;
- sucesso, erro e rollback testados;
- permissões mínimas concedidas.

### APIs

- contrato documentado e versionado quando aplicável;
- validação de entrada e autorização;
- erros previsíveis;
- consumidores não dependem de detalhes físicos desnecessários;
- testes de contrato aprovados.

### Frontend

- utiliza fonte real no fluxo concluído;
- não contém regra transacional distribuída;
- estados e classificações oficiais;
- erros e carregamentos tratados;
- navegação mantém continuidade e rastreabilidade.

### Testes

- invariantes críticas integralmente cobertas;
- transições permitidas e proibidas;
- RLS com dois tenants e usuário sem acesso;
- concorrência e idempotência nos fluxos críticos;
- integração entre módulos;
- regressão para todo defeito crítico.

### Documentação

- regras e decisões referenciadas;
- schema, RPCs e APIs atualizados;
- procedimento operacional registrado;
- riscos e limitações conhecidos;
- changelog da Sprint.

### Arquitetura

- zero desvio não aprovado;
- ownership respeitado;
- sem nova fonte de verdade concorrente;
- revisão arquitetural registrada para itens críticos.

### Segurança e RLS

- princípio do menor privilégio;
- RLS habilitada e testada;
- views expostas preservam isolamento;
- operações administrativas restritas;
- nenhuma credencial ou segredo versionado.

### Performance

- consultas críticas possuem plano avaliado;
- paginação para coleções operacionais;
- ausência de bloqueios longos não justificados;
- cenário de volume definido para a Sprint;
- regressão relevante bloqueia a entrega.

### Observabilidade

- erros transacionais identificáveis;
- logs sem dados sensíveis indevidos;
- operações críticas possuem correlação;
- métricas e alertas mínimos definidos;
- falhas de integração podem ser diagnosticadas.

### Rastreabilidade

- usuário, empresa, data e origem registrados;
- navegação até entidades relacionadas;
- histórico preservado;
- relatórios reconciliam com fatos transacionais.

## 10. Gestão de branches

### Branches

- `main`: produção e releases aprovadas;
- `develop`: integração da próxima entrega homologável;
- `feature/<sprint>-<descricao>`: trabalho curto e isolado;
- `fix/<descricao>`: correções antes da release;
- `hotfix/<descricao>`: correção urgente originada da `main`.

### Regras

- nenhuma alteração direta em `main` ou `develop`;
- branches curtas, preferencialmente com uma entrega coerente;
- atualização frequente a partir de `develop`;
- merge somente por pull request;
- revisão obrigatória para banco, RLS, RPC e estado;
- migrations aplicadas nunca são reescritas após merge compartilhado;
- release mergeada de `develop` para `main` após homologação;
- tag de versão em toda release.

### Commits

Usar Conventional Commits:

```text
feat: nova capacidade
fix: correção de comportamento
docs: documentação
test: testes
refactor: mudança interna sem alterar contrato
chore: manutenção
db: mudança de banco ou migration
```

Commits devem ser pequenos, descritivos e não misturar documentação normativa, banco e interface sem necessidade.

### Momento correto do merge

- critérios da entrega atendidos;
- testes automatizados aprovados;
- revisão concluída;
- migration ensaiada quando aplicável;
- documentação atualizada;
- ausência de desvio arquitetural;
- plano de rollback conhecido.

## 11. Organização recomendada do repositório

Não executar reorganização estrutural durante uma feature funcional. Preparar mudança isolada e sem alterar comportamento.

```text
docs/
  architecture/
    master-book/
    general/
    data/
    states/
    classifications/
    dictionary/
  contracts/
  decisions/
  implementation/
  operations/

src/
  app/
  modules/
    commercial/
    engineering/
    pcp/
    inventory/
    procurement/
    production/
    quality/
    shipping/
    shared/
  lib/

supabase/
  migrations/
  tests/
  seeds/

tests/
  integration/
  e2e/
  fixtures/
```

### Recomendações organizacionais

- mover documentação normativa para árvore canônica única;
- eliminar placeholders duplicados somente após confirmar a fonte oficial;
- manter ADRs próximos da arquitetura;
- separar contratos técnicos de guias operacionais;
- adicionar índice com versão e status de cada documento;
- separar migrations, testes de banco e dados de demonstração;
- manter módulos alinhados às responsabilidades aprovadas;
- evitar pastas genéricas que se tornem depósitos de regras compartilhadas.

## 12. Backlog arquitetural futuro

Os itens abaixo permanecem fora da implementação 1.0, salvo quando a Arquitetura congelada determinar fundações mínimas.

| Item | Motivo para adiamento |
|---|---|
| APS avançado | Depende de dados reais de capacidade, tempos e calendário |
| Balanceamento automático | Exige maturidade dos apontamentos e restrições produtivas |
| BI/Data Warehouse | Deve consumir fatos estáveis após os módulos transacionais |
| Inteligência Artificial | Necessita histórico confiável e governança de decisão |
| IoT de máquinas | Depende do contrato consolidado de OP e eventos MES |
| Aplicativo Mobile | Deve reutilizar APIs estáveis, não antecipá-las |
| CRM avançado | O fluxo comercial básico deve amadurecer primeiro |
| Financeiro completo | Deve integrar-se por contrato sem atrasar o núcleo industrial |
| Fiscal avançado/NF-e | Parser e regras fiscais ampliam significativamente o escopo |
| Manutenção/EAM | Requer ativos, planos e ordens próprios fora do núcleo 1.0 |
| Otimização de corte | Depende de materiais, dimensões e dados reais de consumo |
| Planejamento preditivo | Depende de histórico de produção e compras |
| Portal de fornecedor | Deve usar contratos de compras e recebimento estabilizados |
| Integrações externas adicionais | Cada conector deve nascer de API/evento versionado |
| Multi-instância dedicada | Avaliar quando volume, contrato ou isolamento exigirem |

## 13. Autorização final

**SIM**

Autorizo o início da Sprint 01 — Prontidão Normativa. Ela não cria código, migrations, tabelas ou RPCs e possui o menor risco possível. Sua função é tornar a Arquitetura 1.0 aprovada efetivamente consumível pela equipe e liberar com segurança o baseline do banco.

A autorização não se estende à criação de migrations definitivas enquanto os critérios de encerramento da Sprint 01 não forem atendidos.

### Três primeiras entregas da Sprint 01

1. Pacote normativo completo, versionado e acessível no repositório.
2. Índice oficial e matriz de rastreabilidade da Arquitetura 1.0.
3. Registro de prontidão contendo responsáveis, versões, desvios existentes e autorização formal para a Sprint 02.
