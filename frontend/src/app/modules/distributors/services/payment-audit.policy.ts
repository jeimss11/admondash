export function normalizePaymentCancellationReason(reason: string): string {
  const normalized = reason.trim().replace(/\s+/g, ' ');
  if (normalized.length < 10) {
    throw new Error('Explique la cancelación del cobro con al menos 10 caracteres.');
  }
  if (normalized.length > 500) {
    throw new Error('La nota de cancelación no puede superar 500 caracteres.');
  }
  return normalized;
}
