export class ConfiguracaoCalendarioAusenteError extends Error {
  readonly empresaId: string;

  constructor(empresaId: string) {
    super(
      `A empresa ${empresaId} não possui Calendário Operacional configurado. Não é possível resolver dias produtivos.`,
    );
    this.name = "ConfiguracaoCalendarioAusenteError";
    this.empresaId = empresaId;
  }
}

export class IntegridadeCalendarioError extends Error {
  readonly empresaId: string;
  readonly data: string;
  readonly idsConflitantes: string[];

  constructor(empresaId: string, data: string, idsConflitantes: string[]) {
    super(
      `Foram encontrados múltiplos eventos ativos para a empresa ${empresaId} em ${data}: ${idsConflitantes.join(", ")}.`,
    );
    this.name = "IntegridadeCalendarioError";
    this.empresaId = empresaId;
    this.data = data;
    this.idsConflitantes = idsConflitantes;
  }
}

export class TipoEventoNaoSuportadoError extends Error {
  readonly empresaId: string;
  readonly data: string;
  readonly tipo: string;

  constructor(empresaId: string, data: string, tipo: string) {
    super(
      `Evento com tipo não suportado "${tipo}" encontrado para empresa ${empresaId} em ${data}. O motor de dias produtivos não sabe como interpretar este tipo — verifique o cadastro ou atualize o domínio de tipos suportados.`,
    );
    this.name = "TipoEventoNaoSuportadoError";
    this.empresaId = empresaId;
    this.data = data;
    this.tipo = tipo;
  }
}
