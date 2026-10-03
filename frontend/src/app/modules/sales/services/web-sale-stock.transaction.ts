import { doc, runTransaction, serverTimestamp, type DocumentData, type Firestore } from 'firebase/firestore';
import { aggregateStockLines, assertProductCode, canonicalStockQuantity, stockQuantityChange } from './web-sale-stock.policy';

export interface WebSaleStockImpact {
  protocol: 'direct-products-v1';
  entries: { codigo: string; cantidad: string; before: string; after: string }[];
}
function sameInvoice(a: DocumentData, b: DocumentData): boolean {
  const identity = (data: DocumentData) => JSON.stringify([
    data['factura'], data['cliente'], data['subtotal'], data['total'], data['descuento'],
    data['discountType'], data['discountAmount'], data['ownerUid'], data['createdByUid'], data['role'],
    Array.isArray(data['productos']) ? data['productos'].map((p: DocumentData) =>
      [p['codigo'], p['nombre'], p['cantidad'], p['precio'], p['subtotal'], p['total']]) : null,
  ]);
  return identity(a) === identity(b);
}
function productStock(data: DocumentData | undefined, code: string): string {
  if (!data || data['eliminado'] === true) throw new Error(`El producto ${code} ya no está disponible.`);
  if (data['codigo'] !== undefined && data['codigo'] !== code) throw new Error(`El código del producto ${code} no coincide con el catálogo.`);
  try { return canonicalStockQuantity(data['cantidad']); }
  catch { throw new Error(`El producto ${code} no tiene una cantidad de inventario válida informada.`); }
}

/** Actual SDK transaction shared by Angular and isolated concurrency tests. */
export async function createWebSaleWithStock(
  firestore: Firestore, ownerUid: string, documentId: string, sale: DocumentData, assertSession: () => void = () => {},
): Promise<'created' | 'already-exists'> {
  const lines = aggregateStockLines(sale['productos']);
  const saleRef = doc(firestore, `usuarios/${ownerUid}/ventas_appweb/${documentId}`);
  return runTransaction(firestore, async transaction => {
    assertSession();
    const existing = await transaction.get(saleRef);
    if (existing.exists()) {
      if (!sameInvoice(existing.data(), sale)) throw new Error('Esta factura ya fue guardada con otros datos. Consulta la venta antes de continuar.');
      if (existing.data()['eliminado'] === true) throw new Error('Esta factura fue anulada. No puede volver a registrarse.');
      assertSession();
      return 'already-exists';
    }
    const products = await Promise.all(lines.map(line => transaction.get(doc(firestore, `usuarios/${ownerUid}/productos/${line.codigo}`))));
    const entries = lines.map((line, i) => {
      const before = productStock(products[i].data(), line.codigo);
      let after: string;
      try { after = stockQuantityChange(before, line.cantidad, 'subtract'); }
      catch { throw new Error(`Inventario insuficiente para el producto ${line.codigo}. Disponible: ${before}.`); }
      return { ...line, before, after };
    });
    assertSession();
    for (let i = 0; i < entries.length; i++) transaction.update(products[i].ref, {
      cantidad: entries[i].after, ultima_modificacion: serverTimestamp(),
    });
    // Only web documents store impact evidence. Never write mobile ventas or sessions.
    const payload = Object.fromEntries(Object.entries(sale).filter(([, value]) => value !== undefined));
    transaction.set(saleRef, { ...payload, stockImpact: { protocol: 'direct-products-v1', entries },
      createdAt: serverTimestamp(), ultima_modificacion: serverTimestamp() });
    return 'created';
  });
}

/** A logical cancellation compensates its saved impact once; legacy invoices never invent stock. */
export async function cancelWebSaleWithStock(
  firestore: Firestore, ownerUid: string, documentId: string, actorUid: string, role: string,
  assertSession: () => void = () => {},
): Promise<void> {
  const saleRef = doc(firestore, `usuarios/${ownerUid}/ventas_appweb/${documentId}`);
  await runTransaction(firestore, async transaction => {
    assertSession();
    const sale = await transaction.get(saleRef);
    if (!sale.exists()) throw new Error('La venta ya no existe.');
    const data = sale.data();
    if (data['eliminado'] === true) return;
    const impact = data['stockImpact'] as WebSaleStockImpact | undefined;
    if (impact !== undefined && (impact.protocol !== 'direct-products-v1' || !Array.isArray(impact.entries))) {
      throw new Error('El impacto de inventario de esta venta requiere revisión.');
    }
    if (data['stockReversal'] !== undefined) throw new Error('Esta venta ya contiene una compensación de inventario; requiere revisión.');
    const entries = impact?.entries ?? [];
    if (impact && (!entries.length || entries.length > 200 || new Set(entries.map(e => e.codigo)).size !== entries.length)) {
      throw new Error('El impacto de inventario de esta venta requiere revisión.');
    }
    entries.forEach(entry => { assertProductCode(entry.codigo); canonicalStockQuantity(entry.cantidad); });
    if (impact) {
      const originalLines = aggregateStockLines(data['productos']);
      const expected = new Map(originalLines.map(line => [line.codigo, line.cantidad]));
      if (expected.size !== entries.length || entries.some(entry =>
        expected.get(entry.codigo) !== canonicalStockQuantity(entry.cantidad) ||
        stockQuantityChange(entry.before, entry.cantidad, 'subtract') !== canonicalStockQuantity(entry.after))) {
        throw new Error('La evidencia de inventario no coincide con la venta original. Requiere revisión.');
      }
    }
    const products = await Promise.all(entries.map(entry => transaction.get(doc(firestore, `usuarios/${ownerUid}/productos/${entry.codigo}`))));
    const restored = entries.map((entry, i) => {
      // A deleted/malformed product needs reconciliation, not silent resurrection.
      const before = productStock(products[i].data(), entry.codigo);
      return { codigo: entry.codigo, cantidad: entry.cantidad, before, after: stockQuantityChange(before, entry.cantidad, 'add') };
    });
    assertSession();
    restored.forEach((entry, i) => transaction.update(products[i].ref, { cantidad: entry.after, ultima_modificacion: serverTimestamp() }));
    transaction.update(saleRef, { eliminado: true, ultima_modificacion: serverTimestamp(),
      annulment: { actorUid, role, createdAt: serverTimestamp(), stockRestored: !!impact },
      ...(impact ? { stockReversal: { protocol: impact.protocol, entries: restored, createdAt: serverTimestamp(), actorUid, role } } : {}),
    });
  });
}
