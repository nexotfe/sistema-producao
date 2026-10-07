// Política central de senha (C2.4-I1A-3) - decisão de produto já
// fechada: mínimo 10 caracteres, sem exigência de composição (sem
// maiúscula/minúscula/número/símbolo obrigatórios, permite frases-senha),
// bloqueia senhas comuns/óbvias/previsíveis, sem troca periódica forçada.
//
// Mesma regra vale para primeiro acesso, recuperação, reset administrativo
// e qualquer futura criação/alteração de senha no NEXOTFE - este módulo é
// o único lugar que decide "senha válida ou não", nunca duplicado.
//
// Função pura: nunca loga, nunca persiste, nunca lança exceção, nunca
// chama serviço externo. Usável tanto no cliente (feedback imediato no
// formulário) quanto no servidor (checagem final antes de updateUser) -
// por isso não tem "server-only": não há nada sensível a proteger aqui,
// é só lógica de validação de formato.
//
// Espaço inicial/final (AJUSTE FINAL, C2.4-I1A-3): rejeitado por inteiro
// (Opção B), não "ignorado só para contar o comprimento" (Opção A) -
// regra única e simples de comunicar, sem comprimento "efetivo" diferente
// do literal, e sem precisar alterar silenciosamente a senha do usuário
// em nenhum ponto antes de validar/enviar ao Auth. Espaços INTERNOS
// continuam permitidos (frases-senha), só a borda é rejeitada.
//
// DEFESA EM PROFUNDIDADE AINDA PENDENTE (registrado, não implementado
// aqui): supabase/config.toml tem minimum_password_length=6 hoje - mais
// fraco que os 10 exigidos aqui. Alinhar para 10 antes de produção é
// requisito futuro, fora do escopo desta fatia (não altera configuração
// Auth).
import { TERMOS_BASE_COMUNS } from "./listaSenhasComuns";

const TAMANHO_MINIMO = 10;
const CONJUNTO_TERMOS_COMUNS = new Set(TERMOS_BASE_COMUNS);

export const MENSAGEM_POLITICA_SENHA =
  "A senha deve ter pelo menos 10 caracteres e não pode ser uma senha muito comum.";

export type ResultadoValidacaoSenha = { valida: true } | { valida: false; mensagem: string };

function temEspacoNaBorda(senha: string): boolean {
  return senha.length > 0 && senha !== senha.trim();
}

function removerDigitosFinais(texto: string): string {
  return texto.replace(/\d+$/, "");
}

// Sequências puramente numéricas crescentes, decrescentes ou repetidas,
// com 6+ dígitos (ex.: "1234567890", "0123456789", "999999999") - padrão
// trivial, não precisa estar na lista de termos-base. Aritmética cíclica
// (mod 10): "1234567890" é a sequência crescente mais comum do teclado,
// mas em código de caractere puro o "0" vem ANTES do "1" (ASCII 48 < 49)
// - sem o módulo, essa quebra no último dígito faria o padrão escapar
// da detecção.
function temSequenciaNumericaTrivial(texto: string): boolean {
  if (!/^\d+$/.test(texto) || texto.length < 6) {
    return false;
  }
  const valorDigito = (c: string) => c.charCodeAt(0) - 48;
  let crescente = true;
  let decrescente = true;
  let repetido = true;
  for (let i = 1; i < texto.length; i += 1) {
    const atual = valorDigito(texto[i]);
    const anterior = valorDigito(texto[i - 1]);
    if ((atual - anterior + 10) % 10 !== 1) crescente = false;
    if ((anterior - atual + 10) % 10 !== 1) decrescente = false;
    if (atual !== anterior) repetido = false;
  }
  return crescente || decrescente || repetido;
}

function ehSenhaComum(senhaMinuscula: string): boolean {
  if (temSequenciaNumericaTrivial(senhaMinuscula)) {
    return true;
  }
  const semDigitosFinais = removerDigitosFinais(senhaMinuscula);
  return CONJUNTO_TERMOS_COMUNS.has(senhaMinuscula) || CONJUNTO_TERMOS_COMUNS.has(semDigitosFinais);
}

export function validarPoliticaSenha(senha: string): ResultadoValidacaoSenha {
  // Espaço na borda é rejeitado ANTES de qualquer outra checagem, sobre a
  // string literal recebida - nunca alterada/trimada antes desta
  // comparação, para nunca mascarar silenciosamente o que o usuário
  // realmente digitou.
  if (temEspacoNaBorda(senha)) {
    return { valida: false, mensagem: MENSAGEM_POLITICA_SENHA };
  }
  if (senha.length < TAMANHO_MINIMO) {
    return { valida: false, mensagem: MENSAGEM_POLITICA_SENHA };
  }
  if (ehSenhaComum(senha.toLowerCase())) {
    return { valida: false, mensagem: MENSAGEM_POLITICA_SENHA };
  }
  return { valida: true };
}
