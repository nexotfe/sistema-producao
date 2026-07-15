Decisão final sobre a arquitetura do Calendário Operacional, após discussão:

O modelo "seed + cópia" (calendário oficial copiado para a empresa na implantação) foi ABANDONADO.

Arquitetura definitiva adotada:

CALENDÁRIO OFICIAL
- Responsabilidade da SISARE (fornecedora do sistema), como um "banco de CEP" ou tabela NCM/IBGE.
- Compartilhado por todas as empresas clientes.
- Somente leitura — a empresa nunca altera.
- Versionado anualmente (ex: Calendário Oficial 2027, 2028...).
- Contém exclusivamente: feriados nacionais, estaduais, municipais.
- Sem empresa_id (é dado global do sistema).
- A simulação consulta este calendário EM TEMPO REAL, filtrando por Estado/Município da empresa — nunca copia os dados para dentro da empresa.

CALENDÁRIO DA EMPRESA
- Pertence à empresa (empresa_id).
- Contém EXCLUSIVAMENTE eventos internos: recesso coletivo, inventário, paralisações, dias excepcionalmente trabalhados.
- NUNCA cadastra feriados oficiais (não existe "Natal" duplicado aqui).

FERIADO LOCAL TEMPORÁRIO (mecanismo de exceção)
- Caso um feriado municipal ainda não exista na base oficial, a empresa pode registrar uma exceção temporária, claramente identificada como provisória.
- Uso excepcional, não a regra geral.
- Quando a SISARE atualizar o Calendário Oficial e o feriado passar a existir oficialmente, a exceção deve ser reconciliada (removida ou consolidada) — estratégia técnica de reconciliação NÃO definida ainda, só a diretriz arquitetural.

CADASTRO DA EMPRESA
- País, Estado e Município são campos obrigatórios do cadastro da empresa.
- Não são campos específicos da Simulação — são dados cadastrais básicos reutilizados por outros módulos (Fiscal, Endereços, Relatórios, e também o Calendário Operacional).

Motivação da decisão: pensando em um ERP vendido para centenas de empresas, duplicar feriados oficiais por empresa geraria inconsistência e retrabalho de manutenção (ex: "500 natais" ao invés de um único Natal). Centralizar o dado oficial na SISARE e deixar a empresa responsável apenas pelas suas exceções internas é a arquitetura mais limpa e escalável.

CENÁRIOS (reconfirmado)
Cenários (Modo de Produção) existem apenas durante a análise. Somente o cenário aprovado é registrado no orçamento; os demais são descartados, evitando crescimento desnecessário da base.

TERCEIRO EIXO FUTURO (registrado, fora do escopo v1.0)
Estratégia de Simulação: Conservadora, Realista, Otimista — muda a produtividade considerada (ex: 75%/85%/95%). Fica reservado para evolução futura.

DOIS EIXOS INDEPENDENTES DA SIMULAÇÃO (terminologia definida)
- Demanda (antes chamado "Visão"): Confirmada / Provável / Potencial — qual demanda considerar.
- Produção (chamado "Cenário" ou "Modo de Produção"): Normal / Hora Extra / Hora Extra + Sábado / Personalizado — como pretende produzir.
Esses dois eixos são completamente independentes entre si (ex: pode rodar "Demanda Provável" + "Produção Hora Extra" ao mesmo tempo).