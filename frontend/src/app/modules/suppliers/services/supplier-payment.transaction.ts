import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import type { PagoDto } from '../models/supplier.models';
import { readSupplierFinancialTotals, validateSupplierPayment } from './supplier-finance.policy';

/** The production transaction is also exercised against the isolated demo emulator. */
export async function recordSupplierPayment(
  firestore: Firestore, ownerUid: string, actorUid: string, facturaId: string,
  payment: PagoDto & { operationId: string }, assertSession: () => void = () => {},
): Promise<void> {
  if (!facturaId || facturaId.includes('/') || !/^[\w-]{1,120}$/.test(payment.operationId)) {
    throw new Error('La referencia de factura o comprobante no es válida.');
  }
  if (payment.facturaId !== facturaId || !['completo', 'parcial'].includes(payment.tipo)) {
    throw new Error('El comprobante no corresponde a esta factura.');
  }
  const invoiceRef = doc(firestore, `usuarios/${ownerUid}/facturas-proveedor/${facturaId}`);
  const paymentRef = doc(invoiceRef, `pagos/${payment.operationId}`);
  await runTransaction(firestore, async transaction => {
    assertSession();
    const [invoice, existing] = await Promise.all([transaction.get(invoiceRef), transaction.get(paymentRef)]);
    if (existing.exists()) {
      assertSession();
      const saved = existing.data();
      if (saved['monto'] !== payment.monto || saved['tipo'] !== payment.tipo ||
          (saved['observaciones'] ?? '') !== (payment.observaciones ?? '')) {
        throw new Error('Este comprobante ya existe con otros datos.');
      }
      return;
    }
    if (!invoice.exists()) throw new Error('Factura no encontrada.');
    const current = invoice.data();
    const paid = validateSupplierPayment(current as any, payment.monto);
    const supplierId = current['proveedorId'];
    if (typeof supplierId !== 'string' || !supplierId || supplierId.includes('/')) {
      throw new Error('La factura no tiene un proveedor válido. Requiere revisión.');
    }
    const supplierRef = doc(firestore, `usuarios/${ownerUid}/proveedores/${supplierId}`);
    const supplier = await transaction.get(supplierRef);
    if (!supplier.exists()) throw new Error('El proveedor ya no existe. Requiere revisión.');
    const totals = readSupplierFinancialTotals(supplier.data());
    const supplierPaid = totals.paid;
    const supplierPending = totals.pending;
    const tolerance = Math.max(1e-9, supplierPending * Number.EPSILON * 16);
    if (payment.monto - supplierPending > tolerance) {
      throw new Error('El saldo del proveedor no coincide con la factura. Requiere conciliación.');
    }
    const remaining = Math.abs(supplierPending - payment.monto) <= tolerance ? 0 : supplierPending - payment.monto;
    assertSession();
    const summary = {
      id: payment.operationId, operationId: payment.operationId, monto: payment.monto,
      tipo: payment.tipo, observaciones: payment.observaciones ?? '', registradoPor: actorUid,
      fecha: serverTimestamp(), fechaRegistro: serverTimestamp(),
    };
    transaction.set(paymentRef, summary);
    // A map permits server timestamps; Firestore does not permit transforms inside arrays.
    transaction.update(invoiceRef, {
      estado: paid === Number(current['monto']) ? 'pagada' : 'parcial', montoPagado: paid,
      [`pagosPorId.${payment.operationId}`]: summary, ultimaModificacion: serverTimestamp(),
    });
    transaction.update(supplierRef, {
      pagado: supplierPaid + payment.monto, pendiente: remaining,
      ultima_modificacion: serverTimestamp(),
    });
  });
}
