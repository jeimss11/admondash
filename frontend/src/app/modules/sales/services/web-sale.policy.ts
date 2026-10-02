/** A web invoice is distinct from the Firestore auto-ID and mirrors the mobile timestamp pattern. */
export function createWebInvoiceNumber(epochMilliseconds: number, entropy: string): string {
  if (!Number.isSafeInteger(epochMilliseconds) || epochMilliseconds <= 0) {
    throw new Error('El timestamp de factura no es válido.');
  }
  const suffix = entropy.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  if (suffix.length < 4) throw new Error('No fue posible generar entropía para la factura.');
  return `${epochMilliseconds}-${suffix}`;
}

/** Firestore document identity for a web-only sale. It is deterministic per logical invoice. */
export function webSaleDocumentId(invoiceNumber: string): string {
  if (!/^\d{10,16}-[a-zA-Z0-9]{4,10}$/.test(invoiceNumber)) {
    throw new Error('El formato de factura web no es válido.');
  }
  return `web_${invoiceNumber}`;
}

/** Civil business date in Colombia, never UTC date slicing. */
export function colombiaBusinessDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const find = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = find('year');
  const month = find('month');
  const day = find('day');
  if (!year || !month || !day) throw new Error('No fue posible calcular la fecha de negocio.');
  return `${year}-${month}-${day}`;
}
