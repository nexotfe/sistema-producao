# Versões Oficiais — NEXOTFE

Este documento registra as versões realmente instaladas/em uso no
ambiente de desenvolvimento, confirmadas por comando ou por
`node_modules` — não por memória ou suposição. Data da confirmação:
2026-07-29.

Ao trocar de máquina ou reinstalar o ambiente, rode os mesmos comandos
abaixo e atualize esta tabela se algum valor divergir.

## Ferramentas de ambiente

| Ferramenta | Comando de verificação | Versão confirmada |
|---|---|---|
| Node.js | `node --version` | v24.18.0 |
| npm | `npm --version` | 11.16.0 |
| Git | `git --version` | 2.55.0.windows.3 |
| VS Code (CLI) | `code --version` | 1.130.0 |
| Supabase CLI | `npx supabase --version` | 2.105.0 |

## Dependências do projeto (instaladas, via `node_modules`)

`package.json` fixa a maioria das dependências como `"latest"` — os
números abaixo são a versão real resolvida no momento da instalação,
não o que está escrito no `package.json`. Para reconferir, use
`node -e "console.log(require('./node_modules/<pacote>/package.json').version)"`.

| Pacote | Versão instalada |
|---|---|
| next | 16.2.6 |
| react | 19.2.6 |
| react-dom | 19.2.6 |
| @supabase/supabase-js | 2.106.2 |
| typescript | 6.0.3 |
| eslint | 9.39.4 |
| tailwindcss | 3.4.19 |
| supabase (devDependency, mesmo binário do `npx supabase`) | 2.105.0 |

## Observação sobre `"latest"` no `package.json`

Como a maior parte das dependências usa `"latest"` em vez de uma versão
fixa, a tabela acima **vai ficar desatualizada** a cada novo
`npm install`/`npm update`. Antes de confiar neste documento para
depurar um problema de compatibilidade, reconfirme com os comandos
acima em vez de presumir que os números aqui ainda são os atuais.

Observação: utilizar `"latest"` facilita acompanhar versões recentes
durante o desenvolvimento, porém reduz a reprodutibilidade do
ambiente. Quando o projeto entrar em fase de estabilização ou
produção, avaliar a substituição por versões fixas.
