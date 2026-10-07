// Lista de bloqueio de senhas comuns (C2.4-I1A-3, AJUSTE FINAL).
//
// Fonte: SecLists (danielmiessler/SecLists), arquivo
// "Passwords/Common-Credentials/10k-most-common.txt" - o arquivo fonte
// real tem 10.001 linhas não-vazias (confirmado por contagem direta, não
// exatamente 10.000 apesar do nome "10k"), agregadas de vazamentos reais
// conhecidos publicamente. Licença MIT (Copyright (c) 2018 Daniel
// Miessler) - uso e redistribuição permitidos, inclusive em projeto
// proprietário; texto completo da licença e atribuição preservados em
// ./THIRD_PARTY_NOTICES.md (exigência da própria licença MIT, não só
// referência informal). Arquivo buscado em 2026-10-07 de
// raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/
// Common-Credentials/10k-most-common.txt.
//
// Combinada com um pequeno conjunto de termos próprios do NEXOTFE/
// português (a lista de origem é majoritariamente em inglês) - "senha",
// "nexotfe", "administrador", "bemvindo" etc., 10 termos, zero overlap
// com a fonte -, normalizados para minúsculas e deduplicados.
//
// Contagem final: 10.001 (fonte) + 10 (próprios) = 10.011 entradas,
// ~93KB (src/lib/senha/senhasComuns10k.json). 100% local, nenhuma
// chamada externa em tempo de execução - o arquivo já é parte do
// projeto, carregado via import estático de JSON (suporte nativo do
// TypeScript/Next.js, sem pacote adicional).
//
// Substituível: só o import abaixo precisa mudar para trocar de fonte -
// politicaSenha.ts nunca presume formato/origem específica, só que
// TERMOS_BASE_COMUNS é um array de strings em minúsculas.
import senhasComuns10k from "./senhasComuns10k.json";

export const TERMOS_BASE_COMUNS: readonly string[] = senhasComuns10k;
