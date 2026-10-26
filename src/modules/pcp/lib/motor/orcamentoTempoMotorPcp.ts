// Etapa 2O.8B-I6-B: números únicos do orçamento de tempo do Motor
// supervisionado - mantidos em UM lugar para nunca divergirem entre o
// cálculo do limite efetivo e qualquer `export const maxDuration` real
// que vier a existir numa página futura.
//
// PENDÊNCIA EXPLÍCITA (auditoria I6-B): MAX_DURATION_FUNCAO_SEGUNDOS
// reflete o limite real configurado no painel da Vercel (confirmado
// pelo usuário), mas NENHUMA página real hoje declara
// `export const maxDuration` para solicitarCalculoProgramacaoPcpAction
// (achado: zero consumidor de UI, grep em src/app) - a documentação do
// Next.js exige essa declaração no segmento de página, nunca num
// arquivo comum de Server Action, para a Vercel de fato aplicar o
// limite. Até existir essa página, este número só alimenta o cálculo
// interno de T_efetivo (testável isoladamente) - a imposição REAL da
// Vercel sobre esta Server Action específica permanece não verificada.
export const LIMITE_MOTOR_MS = 240_000;
export const MAX_DURATION_FUNCAO_SEGUNDOS = 300;
export const MAX_DURATION_FUNCAO_MS = MAX_DURATION_FUNCAO_SEGUNDOS * 1000;
/** "Meta adicional de interrupção" (decisão do usuário, auditoria I6-B) - até 10s reservados para validação + finalização da reserva depois que o Motor responder. */
export const MARGEM_FINALIZACAO_MS = 10_000;
/** Abaixo disso, nem vale tentar - decisão operacional, ajustável; nunca inferida silenciosamente além deste valor registrado. */
export const LIMITE_MINIMO_VIAVEL_MS = 10_000;
/** TTL nominal da reserva (mesmo valor já usado desde a Parte 3). */
export const TTL_RESERVA_SEGUNDOS = 300;
