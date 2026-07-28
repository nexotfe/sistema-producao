# DEC-002 — Decisão de Negócio: Aprovação da Simulação Comercial (V1.1)

**Data:** 2026-07-25
**Versão:** 1.0
**Status:** Vigente
**Natureza do documento:** decisão de negócio formalizada, segunda da
série `DEC-` (ver `DEC-001_Desconto_Comercial_Orcamento.md` para a
convenção completa). Fecha as questões de negócio deixadas em aberto
durante a investigação da V1.0/V1.1 da Simulação Comercial (déficit
bloqueia ou não a aprovação; relação entre aprovação e dado
desatualizado) — uma vez aprovado, tem a mesma força de regra
permanente que os demais documentos desta pasta.

---

## Princípio

A aprovação de uma simulação comercial representa a aprovação do
cenário efetivamente analisado pelo usuário. Caso os dados utilizados
pelo Motor sejam alterados entre a simulação e a aprovação, a
aprovação deve ser bloqueada até que uma nova simulação seja executada
e revisada.

## Regra de Negócio — Déficit não bloqueia aprovação

Déficit não bloqueia a aprovação. Aprovar uma simulação com operações
em déficit significa que a empresa decidiu assumir aquela condição —
não significa que existe capacidade suficiente para cumpri-la. Quando
há déficit, a interface exige confirmação explícita extra (modal),
nunca aprova silenciosamente.

## Regra de Negócio — Critério de Revalidação

A aprovação só é permitida se todos os campos persistidos
permanecerem idênticos entre o resultado exibido e a revalidação
imediatamente anterior à aprovação.

A comparação é feita por `bom_operacao_id`: cada operação precisa
existir nos dois resultados; qualquer operação adicionada, removida,
ou com campo persistido diferente invalida a aprovação. Não há uma
lista separada de "campos importantes" — a comparação usa exatamente
os mesmos campos que a RPC `aprovar_projeto_com_simulacao` persiste:
`recurso_considerado_id`, `motivo_consideracao`, `deficit`,
`necessario`, e os 5 campos de capacidade (`capacidade_bruta`,
`capacidade_efetiva`, `capacidade_disponivel`, `comprometido`,
`livre`).

## Regra de Negócio — Substituição de Simulação Vigente

Aprovar uma simulação quando já existe uma simulação vigente para o
projeto substitui a anterior (`vigente = false`), preservando o
histórico — nenhuma linha é apagada. Quando aplicável, a interface
avisa isso explicitamente antes da aprovação.
