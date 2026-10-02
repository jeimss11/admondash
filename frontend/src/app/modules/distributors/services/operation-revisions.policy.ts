export function normalizeReopenReason(reason: string): string {
  const normalized = reason.trim().replace(/\s+/g, ' ');

  if (normalized.length < 10) {
    throw new Error('Explique el motivo de reapertura con al menos 10 caracteres.');
  }

  if (normalized.length > 500) {
    throw new Error('El motivo de reapertura no puede superar 500 caracteres.');
  }

  return normalized;
}

export function assertClosedOperation(state: unknown): asserts state is 'cerrada' {
  if (state !== 'cerrada') {
    throw new Error('Solo se puede reabrir una operación que ya esté cerrada.');
  }
}

