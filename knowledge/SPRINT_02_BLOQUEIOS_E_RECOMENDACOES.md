# SPRINT 02 — BLOQUEIOS, RISCOS E RECOMENDAÇÕES

**Data:** 20/06/2026  
**Situação:** saneamento ainda não autorizado

## Bloqueios críticos

### B01 — Histórico não reproduzível

O repositório não contém a fundação completa do banco e possui uma dependência de tabela fora de ordem.

**Impede:** reset, CI com banco limpo, homologação confiável e recuperação integral.  
**Ação exigida:** construir e validar um baseline completo, sem alterar a arquitetura congelada.

### B02 — Migration consolidada no caminho cronológico

`202606050036_all_migrations_consolidated.sql` repete migrations anteriores e contém comandos não idempotentes.

**Impede:** aplicação sequencial segura.  
**Ação exigida:** retirar o arquivo do caminho executável por estratégia formal, preservando-o como evidência histórica quando necessário.

### B03 — Fundação remota sem fonte local

`empresas`, `usuarios`, `clientes`, `recursos_produtivos`, `empresa_atual_id()` e `set_updated_at()` não estão integralmente versionados nas migrations locais.

**Impede:** considerar o repositório como fonte única do esquema.  
**Ação exigida:** capturar a definição canônica desses objetos e incorporá-la ao baseline controlado.

### B04 — Backup e restauração não comprovados

Não existe evidência, nesta Sprint, de backup restaurável do banco remoto.

**Impede:** qualquer saneamento ou migration com alteração de estado.  
**Ação exigida:** obter backup, restaurar em ambiente isolado e registrar evidência de integridade.

### B05 — Assinaturas possivelmente ambíguas

As funções `registrar_consumo_interno` e `registrar_requisicao_compra_material` foram redefinidas com parâmetro adicional, sem remoção explícita da assinatura antiga.

**Impede:** confiar nas RPCs até inspeção do catálogo remoto.  
**Ação exigida:** inventariar assinaturas existentes e definir tratamento de compatibilidade e rollback.

## Riscos altos, não bloqueantes para o inventário

- Views sem comprovação de `security_invoker`, com risco de contornar a intenção das políticas RLS.
- RLS, grants e constraints remotos ainda não comparados em nível de catálogo.
- `consumos_internos` mistura semântica de separação/reserva com consumo físico em fluxos existentes.
- `criar_ordem_fabricacao_operacional` gera consumo ou requisição durante a criação da OF, divergindo do eixo normativo Roteiro → Necessidades → Decisão PCP → Reserva/Requisição.
- Dados existentes ainda não foram classificados por volume, integridade, duplicidade e vínculo multiempresa.

## Ordem recomendada para desbloqueio

1. Obter acesso de catálogo somente leitura e exportar esquema, políticas, grants, funções e ledger de migrations do remoto.
2. Gerar backup e comprovar restauração isolada.
3. Definir o baseline canônico completo, incluindo a fundação atualmente ausente do histórico.
4. Excluir logicamente a migration consolidada do caminho de replay.
5. Reordenar dependências no baseline, sem reescrever silenciosamente o histórico aplicado.
6. Resolver overloads e registrar compatibilidade das RPCs.
7. Executar replay em banco vazio.
8. Executar ensaio em cópia representativa dos dados.
9. Comparar schema final, RLS, grants, constraints e contagens de dados.
10. Somente então autorizar migrations evolutivas da Arquitetura 1.0.

## Decisão atual

**Pode continuar:** inventário, documentação, extração somente leitura e planejamento do saneamento.  
**Permanece bloqueado:** criar, alterar ou aplicar migrations; modificar dados; substituir RPCs; iniciar as estruturas industriais definitivas.

