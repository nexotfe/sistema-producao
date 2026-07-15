NEXOTFE ERP Industrial Premium
Arquitetura do Motor de Simulação Comercial de Capacidade
Versão: 1.0
Status: Aprovado para implementação da primeira versão

1. Objetivo
O Motor de Simulação Comercial de Capacidade existe para responder, durante a elaboração do orçamento:
"Com a capacidade produtiva disponível, este projeto pode ser entregue na data desejada pelo cliente?"
Seu objetivo é apoiar a tomada de decisão comercial antes da aprovação da proposta.

2. Princípio Fundamental
A Simulação Comercial verifica se é possível produzir.
O PCP continuará responsável por definir como produzir.
Portanto, a Simulação Comercial:
- calcula capacidade;
- identifica gargalos;
- estima a primeira data possível;
- informa riscos.
Ela não:
- programa OFs;
- distribui operadores;
- escolhe máquinas;
- sequencia operações;
- balanceia recursos;
- cria programação diária.
Essas responsabilidades pertencem exclusivamente ao futuro módulo de PCP.

3. Arquitetura Geral
A simulação é composta por componentes independentes.
Calendário Operacional → Dias Produtivos → Capacidade dos Recursos → Modo de Produção → Capacidade Disponível ──── Demanda Selecionada → Carga Necessária ──── Comparação → Resultado
Primeiro a NEXOTFE calcula quanto a fábrica consegue produzir. Somente depois compara essa capacidade com a demanda selecionada.

4. Calendário Operacional
Cada empresa possui seu próprio Calendário Operacional. Todos os registros pertencem à empresa (empresa_id).
Durante a implantação da NEXOTFE (ou na abertura de um novo exercício), o sistema poderá carregar automaticamente uma base inicial de feriados nacionais, estaduais e municipais.
Após essa carga inicial, o calendário passa a pertencer exclusivamente à empresa. Ela poderá incluir ou alterar: recessos, paralisações, inventários, dias excepcionalmente trabalhados.
O calendário responde apenas: "Este dia é produtivo para esta empresa?" Ele nunca define horas de produção.
[NOTA: este modelo "seed + cópia" foi posteriormente REVISADO e SUBSTITUÍDO — ver Documento 3]

5. Recursos Produtivos
Cada recurso possui sua capacidade padrão.
Exemplos: Torno CNC 01 → 9 horas/dia | Centro de Usinagem 5 Eixos → 18 horas/dia | Serra Vertical → 16 horas/dia
A capacidade pertence exclusivamente ao recurso. Ela nunca é alterada pela simulação.

6. Capacidade Disponível
A capacidade disponível é calculada utilizando: dias produtivos do calendário; capacidade diária do recurso; modo de produção escolhido.
Exemplo: 10 dias produtivos, Torno CNC 9 horas/dia → Resultado: 90 horas disponíveis.

7. Modo de Produção
O Modo de Produção representa hipóteses temporárias utilizadas durante a simulação.
Exemplos: Produção Normal; Hora Extra; Hora Extra + Trabalho aos Sábados.
Essas premissas existem apenas durante a análise. Elas nunca alteram: o cadastro do recurso; o calendário operacional.
Exemplo: Torno CNC, capacidade padrão 9h/dia. Cenário: +2h/dia durante 5 dias, +5h no sábado. Capacidade utilizada apenas nesta simulação: 60 horas.

8. Demanda
A demanda pode ser analisada sob três visões independentes.
Confirmada: Somente projetos efetivamente aprovados.
Provável: Projetos aprovados mais oportunidades com alta probabilidade.
Potencial: Todos os orçamentos, exceto os reprovados.
A visão de demanda é independente do Modo de Produção.

9. Cenários
Os cenários existem apenas para apoiar a decisão do Orçamentista. Durante a análise, diversos cenários podem ser comparados.
Exemplos: Produção Normal; Hora Extra; Hora Extra + Sábado.
Ao concluir a análise: apenas o cenário aprovado é registrado no orçamento; os demais cenários não são persistidos.
O orçamento passa a armazenar somente: visão de demanda utilizada; modo de produção escolhido; premissas utilizadas; resultado da simulação.
Isso preserva a decisão tomada sem gerar crescimento desnecessário da base de dados.

10. Cálculo
Para cada recurso:
Necessário = Tempo do roteiro × Quantidade
Disponível = Dias produtivos × Capacidade diária
Capacidade Disponível = Disponível + Premissas do Modo de Produção
Comprometido = Demanda existente conforme a visão escolhida
Livre = Capacidade Disponível − Comprometido
Déficit = Necessário − Livre
Resultado: Folga; Déficit; Gargalo; Recurso Restritivo; Primeira Data Possível.

11. Situação Atual da Base
Até o momento foram consolidados: estrutura dos Recursos Produtivos; capacidade diária padronizada; vínculo entre recursos e tecnologias [NOTA: superado — ver knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md, vínculo agora é Recurso Produtivo direto, não Tecnologia]; grupos de recursos revisados; preparação da base para o cálculo da Simulação Comercial.
Ainda permanecem atividades de saneamento dos cadastros reais, incluindo revisão de vínculos e complementação de recursos de mão de obra, antes da validação definitiva do motor de simulação.

12. Evolução Futura
Fora do escopo da versão 1.0: sequenciamento de operações; programação da produção; balanceamento automático; escolha de recursos alternativos; manutenção; turnos; calendário individual por recurso; APS completo.
Também fica reservada uma evolução futura denominada Estratégia de Simulação. Possíveis estratégias: Conservadora; Realista; Otimista.
Essa funcionalidade não faz parte da primeira versão e está registrada apenas para preservar a direção arquitetural do produto.

Princípio Final
A Simulação Comercial não substitui o PCP. Ela calcula a capacidade disponível da empresa, compara essa capacidade com a demanda e fornece um diagnóstico confiável para apoiar a negociação comercial. O PCP continuará responsável por decidir como a fábrica executará o trabalho aprovado.