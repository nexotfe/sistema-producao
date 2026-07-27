# DEC-003 — Decisão de Negócio: Status Aprovado via Simulação Comercial

**Data:** 2026-07-27
**Versão:** 1.0
**Status:** Vigente
**Natureza do documento:** decisão de negócio formalizada, terceira da
série `DEC-` (ver `DEC-001_Desconto_Comercial_Orcamento.md` para a
convenção completa). Formaliza uma regra que já existia implementada e
testada desde a Etapa 3 do motor de Simulação Comercial, mas que só
vivia como comentário de código (migration + commit message), nunca
como documento próprio — ver seção "Histórico técnico" abaixo. Uma vez
aprovado, tem a mesma força de regra permanente que os demais
documentos desta pasta.

---

## Princípio

O Status do Projeto é a fonte oficial da aprovação. A transição para
"Aprovado" deve ocorrer por uma operação transacional centralizada
(`aprovar_projeto_com_simulacao`), que exige e congela uma Simulação
Comercial válida como snapshot. A Simulação não aprova o Projeto; ela
é um pré-requisito de integridade para registrar a aprovação.

## Histórico técnico

A restrição já existia, implementada e testada, desde a Etapa 3 do
motor de Simulação Comercial — este documento formaliza, não introduz,
essa regra.

A trigger `projetos_bloquear_aprovacao_direta` (`BEFORE UPDATE OF
status ON public.projetos`), criada no commit `0d31552` ("feat(projetos):
snapshot de simulacao comercial aprovada - Etapa 3 do motor de
Simulacao Comercial", migration
`202607190006_simulacao_comercial_snapshot.sql`), bloqueia qualquer
`UPDATE` direto de `projetos.status` para `'aprovado'` que não passe
pela function `aprovar_projeto_com_simulacao`. O comentário original da
function, registrado na própria migration, já dizia: "Bloqueia UPDATE
direto de projetos.status para aprovado por qualquer caminho que nao
seja aprovar_projeto_com_simulacao() - garante que todo projeto
aprovado tenha um snapshot de simulacao correspondente."

Essa proteção nunca teve um consumidor de UI ciente dela: o dropdown de
Status em `src/app/projeto/page.tsx` sempre permitiu selecionar
"Aprovado" livremente, sem nenhuma validação client-side, e o hook
`useProjeto.ts` sempre enviou esse valor num `UPDATE` direto. Isso foi
identificado como regressão real de UX (não de dado — nada era
persistido incorretamente, a trigger sempre bloqueou corretamente no
banco) em 2026-07-27, e corrigido junto com a formalização deste
documento.

## Regra permanente

Nenhuma tela ou fluxo do sistema deve tentar transicionar
`projetos.status` para `'aprovado'` via `UPDATE` direto. O único
caminho válido é `aprovar_projeto_com_simulacao`, acessível hoje pela
tela de Simulação Comercial (`/projetos/{id}/simulacao`). Telas que
exibem ou editam o Status do Projeto devem tratar "Aprovado" como
estado somente-leitura quando já atingido, e devem orientar o usuário
para o fluxo de Simulação Comercial quando a aprovação ainda não
ocorreu — nunca tentar a transição diretamente.
