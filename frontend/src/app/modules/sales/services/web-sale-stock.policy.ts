/** Exact decimal quantities: never round fractional stock using binary arithmetic. */
type Decimal = { units: bigint; scale: number };
function decimal(value: unknown): Decimal {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^\d+(?:\.\d+)?$/.test(text)) {
    throw new Error('El inventario no tiene una cantidad válida informada.');
  }
  const [integer, fraction = ''] = text.split('.');
  if (fraction.length > 18 || integer.length > 18) throw new Error('La cantidad excede la precisión admitida.');
  return { units: BigInt(integer + fraction), scale: fraction.length };
}
function format(units: bigint, scale: number): string {
  const digits = units.toString().padStart(scale + 1, '0');
  return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, '') : digits;
}
export function stockQuantityChange(current: unknown, quantity: unknown, direction: 'subtract' | 'add'): string {
  const a = decimal(current), b = decimal(quantity);
  if (b.units <= 0n) throw new Error('La cantidad debe ser mayor que cero.');
  const scale = Math.max(a.scale, b.scale);
  const left = a.units * 10n ** BigInt(scale - a.scale);
  const right = b.units * 10n ** BigInt(scale - b.scale);
  const result = direction === 'subtract' ? left - right : left + right;
  if (result < 0n) throw new Error('Inventario insuficiente para registrar la venta.');
  const formatted = format(result, scale);
  decimal(formatted); // Reject overflow rather than save an unreadable future balance.
  return formatted;
}
export function canonicalStockQuantity(value: unknown): string {
  const parsed = decimal(value);
  return format(parsed.units, parsed.scale);
}
export function assertProductCode(code: unknown): asserts code is string {
  if (typeof code !== 'string' || !code || code !== code.trim() || code.includes('/') ||
      code === '.' || code === '..' || /^__.*__$/.test(code) || new TextEncoder().encode(code).length > 1500) {
    throw new Error('El código del producto no es válido.');
  }
}
export function aggregateStockLines(lines: readonly { codigo?: string; cantidad: string }[]): { codigo: string; cantidad: string }[] {
  if (!Array.isArray(lines) || !lines.length) throw new Error('La venta debe contener productos.');
  const quantities = new Map<string, string>();
  for (const line of lines) {
    assertProductCode(line.codigo);
    const quantity = canonicalStockQuantity(line.cantidad);
    if (quantity === '0') throw new Error('La cantidad debe ser mayor que cero.');
    quantities.set(line.codigo, quantities.has(line.codigo)
      ? stockQuantityChange(quantities.get(line.codigo), quantity, 'add') : quantity);
  }
  // Firestore transactions have bounded document writes; reject oversized carts upfront.
  if (quantities.size > 200) throw new Error('La venta supera el máximo de 200 productos distintos.');
  return [...quantities].map(([codigo, cantidad]) => ({ codigo, cantidad })).sort((a, b) => a.codigo.localeCompare(b.codigo));
}
