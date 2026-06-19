# ESTUDO TÉCNICO 001 — Roteiro, Necessidades e Decisão de Materiais

**Versão:** 1.0  
**Status:** Contrato técnico pré-migration  
**Data:** 19/06/2026  
**Escopo:** Roteiro de Fabricação → Necessidades de Materiais → Decisão PCP → Reserva/Requisição

## 1. Objetivo

Definir o contrato funcional e de dados para transformar o Roteiro de Fabricação em necessidades rastreáveis de materiais, submetê-las à decisão humana do PCP e atendê-las por reserva de estoque, requisição de compra ou combinação dos dois caminhos.

Este estudo antecede qualquer migration ou implementação. Alterações no modelo aqui definido devem ser revisadas no próprio documento antes de serem transformadas em código.

Ficam fora deste escopo:

- APS e sequenciamento automático;
- cálculo avançado de capacidade;
- apontamento completo de produção;
- cotação, recebimento fiscal e financeiro;
- consumo automático de material sem confirmação operacional.

## 2. Princípio central

```text
Roteiro define consumo unitário
  → OF define a quantidade a fabricar
  → Sistema calcula necessidades
  → PCP decide como atender
  → Estoque reserva e/ou Compras recebe uma requisição
```

Regras fundamentais:

1. O sistema calcula e sugere; o PCP decide.
2. Toda necessidade nasce com decisão pendente.
3. Criar uma OF não pode reservar material nem gerar compra automaticamente.
4. Reserva e consumo são eventos diferentes.
5. Uma OF deve preservar a versão do roteiro e os valores usados no cálculo.
6. Toda decisão deve ser rastreável até empresa, projeto, OF, PN, roteiro, material e responsável.
7. Reprocessamentos não podem duplicar necessidades, reservas ou requisições.

## 3. Tabelas novas

### 3.1 `roteiros_fabricacao`

Cabeçalho versionado do processo de fabricação de um PN.

Campos mínimos:

- `id`;
- `empresa_id`;
- `produto_id`;
- `versao`;
- `status`;
- `descricao`;
- `vigente_desde`;
- `created_at`, `updated_at`, `created_by`;
- `ativo`, `deleted_at`, `deleted_by`.

Um roteiro publicado não deve ser alterado estruturalmente. Uma mudança deve gerar nova versão.

### 3.2 `roteiro_materiais`

Materiais e consumos unitários definidos pelo roteiro.

Campos mínimos:

- `id`;
- `empresa_id`;
- `roteiro_id`;
- `materia_prima_id`;
- `quantidade_unitaria`;
- `unidade`;
- dimensões operacionais aplicáveis;
- `ordem`;
- `observacoes`;
- auditoria e soft delete.

A unidade deve ser validada contra o cadastro da matéria-prima. Conversões não podem ser implícitas.

### 3.3 `roteiro_operacoes`

Sequência operacional mínima do roteiro.

Campos mínimos:

- `id`;
- `empresa_id`;
- `roteiro_id`;
- `sequencia`;
- `descricao_operacional`;
- `tipo_operacao`;
- `tecnologia_id`;
- `tempo_previsto`;
- `unidade_tempo`;
- `terceirizada`;
- `observacoes`;
- auditoria e soft delete.

### 3.4 `roteiro_operacao_materiais`

Relaciona o material à operação em que ele precisa estar disponível.

Campos mínimos:

- `id`;
- `empresa_id`;
- `roteiro_operacao_id`;
- `roteiro_material_id`;
- `observacoes`.

Essa relação permite calcular futuramente a data de necessidade a partir da sequência operacional. Um material sem operação vinculada deve assumir a data de início planejada da OF até existir cálculo mais preciso.

### 3.5 `grupos_tecnologias`

Agrupamento funcional das tecnologias utilizadas nas operações.

Campos mínimos:

- `id`;
- `empresa_id`;
- `codigo`;
- `descricao`;
- `status`;
- auditoria e soft delete.

### 3.6 `tecnologias`

Competência produtiva exigida por uma operação.

Campos mínimos:

- `id`;
- `empresa_id`;
- `grupo_tecnologia_id`;
- `codigo`;
- `descricao`;
- `fator_planejamento`;
- `unidade_planejamento`;
- `status`;
- auditoria e soft delete.

Capacidade e alocação de recursos não pertencem a este estudo.

### 3.7 `necessidades_materiais`

Demanda calculada e congelada para uma OF.

Campos mínimos:

- `id`;
- `empresa_id`;
- `of_id`;
- `roteiro_id`;
- `roteiro_material_id`;
- `roteiro_operacao_material_id`, quando aplicável;
- `materia_prima_id`;
- `quantidade_unitaria_snapshot`;
- `quantidade_of_snapshot`;
- `quantidade_necessaria`;
- `unidade_snapshot`;
- `data_necessidade`;
- `status_decisao`;
- `status_atendimento`;
- `versao_calculo`;
- `calculada_em`;
- auditoria e soft delete.

Os campos snapshot preservam a justificativa do cálculo mesmo após uma nova versão do roteiro.

### 3.8 `decisoes_necessidade_material`

Histórico da decisão humana do PCP.

Campos mínimos:

- `id`;
- `empresa_id`;
- `necessidade_material_id`;
- `tipo_decisao`;
- `quantidade_estoque`;
- `quantidade_compra`;
- `justificativa`;
- `revisao`;
- `idempotency_key`;
- `decidido_por`;
- `decidido_em`;
- `cancelado_em`, quando aplicável.

Uma nova decisão não deve apagar a anterior. Correções devem gerar revisão e preservar histórico.

### 3.9 `reservas_estoque`

Alocação lógica de saldo para uma necessidade e OF.

Campos mínimos:

- `id`;
- `empresa_id`;
- `necessidade_material_id`;
- `decisao_id`;
- `of_id`;
- `materia_prima_id`;
- `estoque_saldo_id`;
- `quantidade`;
- `status`;
- `reservada_em`;
- `consumida_em`;
- `liberada_em`;
- `cancelada_em`;
- auditoria.

Uma decisão pode gerar várias reservas quando o saldo estiver distribuído entre locais ou lotes.

### 3.10 `reserva_estoque_eventos`

Histórico imutável do ciclo de vida da reserva.

Campos mínimos:

- `id`;
- `empresa_id`;
- `reserva_estoque_id`;
- `tipo_evento`;
- `quantidade`;
- `motivo`;
- `created_at`;
- `created_by`.

## 4. Ajustes nas tabelas existentes

### `ordens_fabricacao`

Adicionar:

- `roteiro_id`;
- status coerente com o fluxo industrial;
- derivação do estado de disponibilidade de material.

A OF deve referenciar uma versão publicada e imutável do roteiro.

### `estoque_saldos`

Reaproveitar:

- `saldo_disponivel` como quantidade física;
- `saldo_reservado` como alocação lógica;
- `saldo_livre` como `saldo_disponivel - saldo_reservado`.

Toda alteração deve ocorrer sob bloqueio de linha em transação.

### `estoque_movimentacoes`

Manter como razão de movimentos físicos: entrada, saída e ajuste. Reserva e liberação devem ser registradas em `reservas_estoque` e `reserva_estoque_eventos`, pois não alteram quantidade física.

### `consumos_internos`

Adicionar:

- `reserva_estoque_id`;
- vínculo obrigatório com OF e necessidade para consumos industriais;
- proteção contra consumo superior à reserva ativa.

Registros legados precisam ser classificados antes da mudança, pois parte deles pode representar reserva antecipada e não consumo físico.

### `requisicoes_compra`

Manter como cabeçalho da aquisição externa. A origem industrial deve permanecer vinculada à OF.

### `requisicao_compra_itens`

Adicionar:

- `necessidade_material_id`;
- `decisao_id`;
- proteção contra duplicidade da mesma decisão.

### `itens_industriais`, `materias_primas`, `projetos` e `projeto_itens`

Reaproveitar sem duplicar identidade ou dados. PN nasce em `itens_industriais`; unidade oficial nasce em `materias_primas`; projeto é alcançado pela OF.

## 5. Estados controlados

Preferir colunas `text` com `CHECK` nesta etapa. Enums nativos do PostgreSQL só devem ser adotados se houver justificativa para o maior custo de evolução.

### Roteiro

```text
rascunho
ativo
inativo
```

### Operação

```text
interna
terceirizada
movimentacao
inspecao
```

### Decisão da necessidade

```text
pendente
decidida
cancelada
```

### Tipo de decisão PCP

```text
estoque
compra
estoque_compra
```

### Atendimento da necessidade

```text
pendente
parcial
reservado
requisitado
atendido
cancelado
```

### Reserva

```text
ativa
consumida
liberada
cancelada
```

### Ordem de Fabricação

```text
simulacao
aguardando_material
pronta_programacao
programada
producao
parada
finalizada
cancelada
```

Os mesmos valores devem ser usados no banco, tipos TypeScript, validações e interface.

## 6. Constraints e invariantes

Constraints mínimas:

- `unique (empresa_id, produto_id, versao)` em `roteiros_fabricacao`;
- índice único parcial permitindo apenas um roteiro ativo por PN e empresa;
- `unique (empresa_id, roteiro_id, sequencia)` em `roteiro_operacoes`;
- `unique (empresa_id, of_id, roteiro_material_id, versao_calculo)` em `necessidades_materiais`;
- `unique (empresa_id, necessidade_material_id, idempotency_key)` em decisões;
- unicidade de requisição por decisão e necessidade;
- quantidades unitária, necessária, reservada e comprada maiores que zero quando informadas;
- `quantidade_estoque + quantidade_compra = quantidade_necessaria` para a decisão vigente;
- `saldo_reservado >= 0` e `saldo_reservado <= saldo_disponivel`;
- consumo acumulado nunca superior à quantidade reservada;
- unidade da necessidade igual à unidade snapshot definida no roteiro;
- registros ativos não podem referenciar entidades inativas ou removidas;
- roteiro publicado não pode sofrer alteração estrutural;
- OF cancelada ou finalizada não pode receber nova decisão sem reabertura formal.

Relacionamentos multiempresa não podem depender apenas de FKs simples por `id`. Usar FKs compostas com `empresa_id` quando viável ou validar explicitamente o tenant dentro das RPCs.

Novas FKs em dados legados devem ser criadas como `NOT VALID`, seguidas de saneamento e `VALIDATE CONSTRAINT`. Colunas `NOT NULL` só devem ser aplicadas após backfill validado.

## 7. RLS e segurança Supabase

Todas as tabelas novas devem habilitar RLS.

Política base:

- `SELECT`: somente registros da `empresa_atual_id()` e não removidos;
- `INSERT`: `empresa_id = empresa_atual_id()` e `created_by = auth.uid()`;
- `UPDATE`: mesmo tenant, registro ativo e transição de estado autorizada;
- `DELETE`: bloqueado; cancelamento ou soft delete por operação controlada.

Recomendações obrigatórias:

- operações de decisão, reserva, consumo e cancelamento não devem ser feitas por múltiplos comandos diretos do frontend;
- revogar mutações diretas nas tabelas transacionais quando a operação possuir RPC própria;
- views expostas pela API devem usar `security_invoker = true` e preservar o filtro por tenant;
- conceder execução das RPCs apenas a `authenticated`;
- validar `auth.uid()`, empresa e vínculo do usuário em toda RPC;
- usar `SECURITY INVOKER` por padrão;
- se `SECURITY DEFINER` for indispensável, fixar `search_path`, qualificar todos os objetos e repetir as validações de autorização;
- impedir que IDs válidos de outra empresa sejam associados ao registro atual.

## 8. RPCs transacionais

### `publicar_roteiro_fabricacao`

Deve validar o roteiro, bloquear a publicação concorrente, inativar a versão anterior e ativar a nova versão na mesma transação.

### `criar_of_com_necessidades`

Deve criar a OF, fixar a versão do roteiro e gerar as necessidades. Não deve decidir, reservar ou comprar.

### `gerar_necessidades_materiais_of`

Deve calcular `quantidade_unitaria × quantidade_of`, preservar snapshots e ser idempotente. Reprocessamento deve exigir versão de cálculo e regra explícita para necessidades já decididas.

### `registrar_decisao_pcp`

Deve executar atomicamente:

1. validar autenticação, tenant e estado da OF;
2. bloquear necessidade, decisão vigente e saldos com `FOR UPDATE`;
3. validar quantidades e saldo livre;
4. registrar a decisão;
5. criar uma ou mais reservas;
6. criar requisição complementar, quando necessária;
7. atualizar os estados da necessidade e da OF;
8. registrar auditoria;
9. retornar o resultado completo.

Qualquer erro deve desfazer toda a operação. A RPC deve exigir chave de idempotência.

### `liberar_reserva_material`

Deve reduzir o saldo reservado, atualizar a reserva e registrar evento, sem alterar saldo físico.

### `consumir_reserva_material`

Deve reduzir simultaneamente saldo disponível e reservado, registrar o consumo físico, atualizar a reserva e impedir consumo acima do reservado.

### `cancelar_decisao_necessidade`

Deve preservar histórico, liberar reservas ativas e cancelar requisições ainda não convertidas, respeitando estados que já possuam efeitos irreversíveis.

### `cancelar_of_e_liberar_reservas`

Deve cancelar a OF e liberar suas reservas ativas na mesma transação. Requisições e pedidos já avançados devem ser sinalizados para tratamento, não apagados.

Todas as RPCs devem usar bloqueios determinísticos para reduzir deadlocks e retornar erros de domínio estáveis para a aplicação.

## 9. Separação entre reserva e consumo

### Reserva

- representa compromisso lógico do estoque com uma OF;
- aumenta `saldo_reservado`;
- reduz `saldo_livre` automaticamente;
- não altera `saldo_disponivel`;
- não gera custo consumido definitivo;
- pode ser liberada ou cancelada.

### Consumo

- representa saída física efetiva para produção;
- exige reserva ativa, salvo exceção formal auditada;
- reduz `saldo_disponivel` e `saldo_reservado` na mesma quantidade;
- gera `estoque_movimentacoes` do tipo saída;
- gera ou atualiza `consumos_internos`;
- apropria custo industrial ao projeto e à OF;
- não pode ser simplesmente desfeito; correção exige movimento compensatório.

Exemplo:

```text
Saldo físico: 100
Saldo reservado: 0
Saldo livre: 100

Reserva de 40:
Saldo físico: 100
Saldo reservado: 40
Saldo livre: 60

Consumo de 25 da reserva:
Saldo físico: 75
Saldo reservado: 15
Saldo livre: 60
```

## 10. Ordem de implementação

1. Aprovar este contrato técnico e a lista canônica de unidades.
2. Retirar a migration consolidada do fluxo automático.
3. Criar baseline reproduzível do schema remoto atual.
4. Corrigir dependências e ordem das migrations existentes.
5. Inventariar e classificar dados legados de consumo e reserva.
6. Unificar estados de OF entre documentação, SQL e TypeScript.
7. Criar grupos de tecnologias e tecnologias.
8. Criar tabelas de roteiro, materiais, operações e vínculos.
9. Criar necessidades, decisões, reservas e eventos.
10. Adicionar novas colunas e FKs inicialmente sem bloqueio de dados legados.
11. Executar backfill e validar inconsistências.
12. Validar constraints e aplicar `NOT NULL` quando seguro.
13. Criar RLS, grants e views com `security_invoker`.
14. Criar e testar RPCs transacionais isoladamente.
15. Migrar ou encerrar funções antigas que misturam reserva e consumo.
16. Conectar Roteiro, Decisão PCP, Estoque e OF ao banco real.
17. Remover mocks somente após o fluxo real estar validado.
18. Executar testes completos em banco vazio e em cópia anonimizada do banco atual.

## 11. Riscos técnicos

- duas decisões concorrentes reservarem o mesmo saldo;
- reprocessamento duplicar necessidades, reservas ou requisições;
- dados atuais de consumo representarem apenas reserva antecipada;
- alteração retroativa de roteiro modificar OF já liberada;
- unidades incompatíveis entre roteiro, estoque e compra;
- relacionamento entre registros de empresas diferentes;
- cancelamento de OF deixar reservas ativas;
- requisição cancelada não refletir na necessidade;
- deadlock por bloqueio de saldos em ordens diferentes;
- views ou RPCs contornarem RLS;
- sessão server-side não propagar corretamente a identidade Supabase;
- datas de necessidade permanecerem estimadas enquanto não houver planejamento operacional completo;
- mudança de assinatura criar overload de funções antigas em vez de substituí-las;
- constraints novas falharem sobre dados legados;
- migrations atuais não reconstruírem um ambiente limpo;
- subprocessos e serviços terceirizados serem tratados incorretamente como matéria-prima.

Migrations que exigem tratamento prévio:

- `202606050036_all_migrations_consolidated.sql`, por duplicar objetos das migrations anteriores;
- criação de `projeto_itens`, por depender de `itens_industriais` antes de sua criação;
- alterações das assinaturas de `registrar_consumo_interno` e `registrar_requisicao_compra_material`, que podem manter overloads antigos;
- alterações de status de OF com registros legados incompatíveis;
- views existentes sem declaração explícita de `security_invoker`.

## 12. Testes mínimos

### Migrations

- criar o banco integralmente do zero usando apenas migrations versionadas;
- atualizar uma cópia anonimizada do banco atual;
- confirmar que não existem objetos duplicados ou funções ambíguas;
- validar backfill antes de ativar FKs e `NOT NULL`;
- documentar plano de recuperação para falha de migration.

### Cálculo e idempotência

- gerar necessidade com saldo suficiente, parcial e zero;
- confirmar cálculo `consumo unitário × quantidade da OF`;
- executar duas vezes a mesma geração sem duplicidade;
- repetir uma decisão com a mesma chave de idempotência;
- impedir alteração retroativa por nova versão do roteiro.

### Concorrência e atomicidade

- executar duas decisões concorrentes para o mesmo saldo;
- provocar falha após criação da decisão e confirmar rollback total;
- reservar material distribuído em mais de um local;
- validar ordem determinística de bloqueios e ausência de deadlock no cenário esperado.

### Reserva e consumo

- reservar sem alterar saldo físico;
- liberar reserva;
- consumir total e parcialmente;
- impedir consumo acima da reserva;
- cancelar OF e liberar reservas;
- exigir movimento compensatório para correção de consumo físico.

### Requisição

- gerar somente a parcela sem cobertura de estoque;
- impedir requisição duplicada para a mesma decisão;
- cancelar decisão antes e depois da conversão da requisição;
- preservar rastreabilidade até projeto, OF e material.

### Segurança

- validar isolamento com dois tenants;
- impedir FK cruzada entre empresas;
- negar mutação por usuário anônimo;
- negar execução por usuário sem vínculo com a empresa;
- confirmar que views não vazam dados de outro tenant;
- confirmar que chamadas diretas não contornam RPCs obrigatórias.

### Estados

- validar todas as transições permitidas e proibidas;
- impedir decisão em OF cancelada ou finalizada;
- recalcular corretamente o estado de material da OF após reserva, compra, liberação e cancelamento.

## 13. Critérios de conclusão

A etapa será considerada concluída somente quando:

1. Um PN possuir roteiro versionado, publicável e imutável após publicação.
2. O roteiro possuir materiais, operações e tecnologias persistidos.
3. A OF referenciar explicitamente a versão do roteiro utilizada.
4. As necessidades forem calculadas com snapshots reproduzíveis.
5. Toda necessidade nascer com decisão pendente.
6. Nenhuma reserva ou requisição for criada sem decisão do PCP.
7. O PCP puder decidir por estoque, compra ou atendimento parcial.
8. Reservas alterarem apenas o saldo reservado e o saldo livre.
9. Consumo físico reduzir saldo disponível e reservado atomicamente.
10. Cancelamentos liberarem reservas e preservarem histórico.
11. Requisições forem únicas e rastreáveis até sua necessidade e decisão.
12. Concorrência não permitir saldo negativo ou reserva superior ao saldo físico.
13. Todas as tabelas e RPCs respeitarem isolamento multiempresa.
14. As telas do eixo deixarem de utilizar dados mockados.
15. Banco vazio e banco legado migrarem sem intervenção manual não documentada.
16. Lint, TypeScript, migrations e testes de banco passarem sem erro.
17. O fluxo completo puder ser demonstrado para saldo total, parcial e inexistente.

---

Este documento é o contrato técnico da etapa. Nenhuma migration deverá ser criada antes da aprovação explícita deste estudo.
