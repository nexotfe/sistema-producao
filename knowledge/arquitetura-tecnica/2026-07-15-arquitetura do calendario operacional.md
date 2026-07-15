NEXOTFE ERP Industrial Premium
Arquitetura do Calendário Operacional para a Simulação Comercial
Versão: 1.0
Status: Conceito aprovado (modelo de calendário posteriormente revisado — ver Documento 3)

Objetivo
O Calendário Operacional existe para determinar quais dias são produtivos durante a janela de produção utilizada pela Simulação Comercial. Ele não define a capacidade dos recursos. A capacidade pertence exclusivamente ao cadastro dos Recursos Produtivos.

Princípio Fundamental
O cálculo da capacidade disponível é composto por três elementos independentes: Calendário Operacional; Capacidade diária do recurso; Premissas do cenário de simulação.

1. Calendário Operacional
Informa apenas quais dias podem ser utilizados para produção — representa o calendário padrão da empresa. Exemplos: dias úteis, finais de semana, feriados nacionais/estaduais/municipais, recessos, paralisações programadas. O calendário não possui qualquer informação sobre máquinas ou colaboradores.

2. Capacidade dos Recursos
Cada recurso possui sua própria capacidade diária (ex: Torno CNC 01 → 9h/dia). Pertence ao cadastro do recurso, não depende do calendário.

Cálculo da Capacidade Normal: Capacidade diária do recurso × Dias produtivos da janela.

3. Cenários da Simulação
Representam hipóteses temporárias do Orçamentista. Não alteram permanentemente o calendário nem a capacidade cadastrada.
Cenário A — Produção Normal: horário normal, sem horas extras, sem sábado.
Cenário B — Hora Extra: exemplo +2h/dia por 5 dias + 5h sábado → Torno CNC 01: 45h normais + 10h extra + 5h sábado = 60h total.
Horas extras por recurso podem ser diferentes dentro do mesmo cenário (simula só os recursos que representam gargalo).

Princípio Arquitetural
O Calendário Operacional nunca altera a capacidade dos recursos. Os Recursos nunca alteram o calendário. Os Cenários nunca alteram permanentemente nenhum dos dois.