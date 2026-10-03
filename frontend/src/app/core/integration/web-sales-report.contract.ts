export interface WebSaleReportRecord {
  documentId: string;
  invoiceNumber: string | null;
  businessDate: string | null;
  total: string | null;
  deleted: boolean;
}

export function readWebSaleReportRecord(documentId: string, data: unknown): WebSaleReportRecord {
  const value = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
  const products = Array.isArray(value['productos']) ? value['productos'] : [];
  const totals = products.map((product) => product && typeof product === 'object' ? decimal((product as Record<string, unknown>)['total']) : null);
  const explicitTotal = decimal(value['total']);
  const fallback = totals.length > 0 && totals.every(Boolean) ? sum(totals as string[]) : null;
  const discount = decimal(value['discountAmount']) ??
    (value['discountType'] === 'amount' ? decimal(value['descuento']) : null);
  const hasLegacyDiscount = value['descuento'] !== undefined && decimal(value['descuento']) !== '0' && Number(value['descuento']) !== 0;
  let total = explicitTotal;
  // A malformed explicit total and ambiguous legacy discounts are never silently replaced by gross lines.
  if (value['total'] === undefined && fallback !== null) {
    total = discount !== null && Number(discount) >= 0 ? sum([fallback, `-${discount.replace(/^\+/, '')}`]) : hasLegacyDiscount ? null : fallback;
  }
  if (total !== null && Number(total) < 0) total = null;
  return {
    documentId,
    invoiceNumber: text(value['factura']),
    businessDate: civilDate(value['fecha2']),
    total,
    deleted: value['eliminado'] === true,
  };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function civilDate(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function decimal(value: unknown): string | null {
  const candidate = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  return typeof candidate === 'string' && /^[-+]?\d+(?:\.\d+)?$/.test(candidate) ? candidate : null;
}

function sum(values: string[]): string {
  const parts = values.map((value) => {
    const [, sign = '', integer, fraction = ''] = /^([-+]?)(\d+)(?:\.(\d+))?$/.exec(value)!;
    return { sign: sign === '-' ? -1n : 1n, integer, fraction };
  });
  const scale = Math.max(...parts.map((part) => part.fraction.length));
  const total = parts.reduce(
    (result, part) => result + part.sign * BigInt(`${part.integer}${part.fraction.padEnd(scale, '0')}`),
    0n
  );
  const negative = total < 0n;
  const digits = (negative ? -total : total).toString().padStart(scale + 1, '0');
  const integer = scale ? digits.slice(0, -scale) : digits;
  const fraction = scale ? digits.slice(-scale).replace(/0+$/, '') : '';
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}
