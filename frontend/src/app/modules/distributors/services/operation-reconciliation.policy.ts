export interface ObservedMobileSale {
  invoiceNumber: string;
  businessDate: string;
  sellerRole: string;
  total: string | null;
}

export type ReconciliationDecision = 'asociada' | 'ignorada';

export function normalizeIgnoreReason(reason: string): string {
  const normalized = reason.trim().replace(/\s+/g, ' ');
  if (normalized.length < 10) {
    throw new Error('Explique el motivo de ignorar la venta con al menos 10 caracteres.');
  }
  return normalized;
}

export function salesForOperation(
  sales: readonly ObservedMobileSale[],
  operation: { fecha: string; distribuidorId: string }
): ObservedMobileSale[] {
  const unique = new Map<string, ObservedMobileSale>();
  for (const sale of sales) {
    if (
      sale.invoiceNumber.trim().length > 0 &&
      sale.businessDate === operation.fecha &&
      sale.sellerRole === operation.distribuidorId
    ) {
      unique.set(sale.invoiceNumber, sale);
    }
  }
  return [...unique.values()];
}

export function unrecordedMobileSales(
  observed: readonly ObservedMobileSale[],
  recordedInvoiceNumbers: ReadonlySet<string>
): ObservedMobileSale[] {
  return observed.filter((sale) => !recordedInvoiceNumbers.has(sale.invoiceNumber));
}
