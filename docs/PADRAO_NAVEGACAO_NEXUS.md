# Padrao de Navegacao Nexus

## Objetivo

Consolidar uma linguagem simples para retorno e avancos entre telas dos modulos Nexus.

O padrao nasceu no modulo Clientes e deve ser replicado nos proximos modulos quando eles passarem por revisao de UX.

## Retorno

Usar um link discreto no topo da pagina:

```text
‹ CLIENTES
```

ou, conforme o contexto:

```text
‹ CLIENTE
```

Regras:

- usar apenas uma seta;
- manter seta e texto com o mesmo peso visual;
- aplicar espacamento de letras apenas no texto, nunca na seta;
- alinhar seta e texto verticalmente;
- usar hover discreto;
- manter foco visivel para navegacao por teclado;
- direcionar para a tela operacional anterior do modulo.

## Avanco

Quando uma acao principal abrir uma nova tela de cadastro, integrar a acao ao titulo do card:

```text
Cadastro de Clientes ›
```

Regras:

- nao criar botao adicional para a mesma acao;
- manter aparencia de link, sem parecer botao;
- separar a seta do texto com respiro visual suficiente;
- usar `ml-2` na seta como referencia inicial;
- manter cursor, hover e foco visivel;
- direcionar para a rota de novo cadastro do modulo.

## Quantidade de registros

Mostrar a quantidade apenas uma vez.

Exemplo preferencial:

```text
Todos (3)
```

Evitar repetir a mesma informacao no card, como:

```text
3 registros
```

## Linguagem

Usar textos curtos, corporativos e operacionais.

Exemplo:

```text
Consulte e gerencie os clientes da empresa.
```

## Aplicacao futura

Aplicar este padrao, quando os modulos forem revisados, em:

- Fornecedores
- Produtos
- Transportadoras
- Pedidos
- Financeiro
- Usuarios
- Demais modulos
