import type { Producto } from './inventory.service';

/** Export only the observed catalog; blank quantities retain their unknown state. */
export function exportObservedInventory(products: readonly Producto[]): void {
  const cell = (value: unknown): string => {
    const text = String(value ?? '');
    const safe = /^\s*[=+@-]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const rows: unknown[][] = [['Origen', 'Código', 'Producto', 'Cantidad observada móvil', 'Valor unitario', 'Moneda']];
  for (const product of products) rows.push(['Catálogo móvil', product.codigo, product.nombre, product.cantidad == null || String(product.cantidad).trim() === '' ? 'No informada' : product.cantidad, product.valor, 'COP']);
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob(['\uFEFF', rows.map((row) => row.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
  link.href = url; link.download = 'inventario-observado.csv'; link.click();
  URL.revokeObjectURL(url);
}
