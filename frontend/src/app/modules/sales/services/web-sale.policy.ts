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

export interface WebSaleAmounts {
  productos: readonly { codigo?: string; cantidad: string; precio: string; subtotal: string; total: string }[];
  subtotal?: string;
  total?: string;
  descuento: string;
  discountType?: 'percentage' | 'amount';
  discountAmount?: string;
}

/** Check persisted amounts at the service boundary, independent of the form. */
export function validateWebSaleAmounts(sale: WebSaleAmounts): void {
  if (!Array.isArray(sale.productos) || sale.productos.length === 0) throw new Error('La venta debe contener productos.');
  const number = (value: unknown): number => {
    if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error('La venta contiene un importe o cantidad inválidos.');
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error('La venta contiene un importe o cantidad inválidos.');
    return parsed;
  };
  const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-8, Math.abs(a) * Number.EPSILON * 16);
  let subtotal = 0;
  for (const line of sale.productos) {
    if (!line.codigo?.trim()) throw new Error('Cada producto debe conservar su código.');
    const quantity = number(line.cantidad);
    const price = number(line.precio);
    const amount = number(line.subtotal);
    if (quantity <= 0 || !same(amount, quantity * price) || !same(number(line.total), amount)) {
      throw new Error('La cantidad y los importes del producto no coinciden.');
    }
    subtotal += amount;
  }
  const discount = number(sale.descuento);
  if (sale.discountType !== 'percentage' && sale.discountType !== 'amount') throw new Error('Selecciona el tipo de descuento.');
  if ((sale.discountType === 'percentage' && discount > 100) || (sale.discountType === 'amount' && discount > subtotal)) {
    throw new Error('El descuento supera el importe de la venta.');
  }
  const discountAmount = sale.discountType === 'percentage' ? subtotal * discount / 100 : discount;
  if (!same(number(sale.subtotal), subtotal) || !same(number(sale.discountAmount), discountAmount) ||
      !same(number(sale.total), subtotal - discountAmount)) throw new Error('Los totales de la venta no coinciden.');
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
