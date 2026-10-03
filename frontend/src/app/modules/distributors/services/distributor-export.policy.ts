function csvCell(value: unknown): string {
  const text = String(value ?? '');
  // A quoted CSV cell still executes spreadsheet formulas unless prefixed.
  const safe = /^\s*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Export exactly the currently filtered, observed mobile invoices. No writes. */
export function buildDistributorInvoiceCsv(invoices: readonly any[], role: string, mobileSales: readonly any[]): string {
  const rows: unknown[][] = [['Origen', 'Distribuidor', 'Factura', 'Fecha de negocio', 'Total observado', 'Estado de pago móvil', 'Moneda']];
  const sourceByInvoice = new Map(mobileSales.map((sale) => [sale.factura, sale]));
  for (const invoice of invoices) {
    const mobile = sourceByInvoice.get(invoice.number);
    const observed = mobile ? mobile.total : invoice.amount;
    const text = String(observed ?? '').trim();
    const total = text && /^[+]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text) && Number.isFinite(Number(text))
      ? observed : 'No disponible';
    const payment = mobile?.pagado === true ? 'Pagada' : mobile?.pagado === false ? 'No pagada' : 'Sin confirmar';
    rows.push(['Móvil', role, invoice.number, invoice.date, total, payment, 'COP']);
  }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
}
