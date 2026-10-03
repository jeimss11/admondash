import type { Firestore } from 'firebase/firestore';
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import type { FacturaPendiente } from '../models/distributor.models';

export interface InvoicePaymentBalance {
  monto: number;
  montoPagado?: number;
  montoDelDia?: number;
}

/** Applied to the latest persisted balance inside the Firestore transaction. */
export function applyInvoiceCollection(balance: InvoicePaymentBalance, amount: number | 'remaining') {
  const total = balance.monto;
  const paid = balance.montoPagado ?? 0;
  const today = balance.montoDelDia ?? 0;
  const tolerance = Number.EPSILON * Math.max(total, paid, today, 1) * 16;
  if (![total, paid, today].every(Number.isFinite) || total <= 0 || paid < 0 || paid - total > tolerance || today < 0 || today - paid > tolerance) {
    throw new Error('La factura contiene importes inconsistentes; revise su saldo antes de cobrar.');
  }
  const collection = amount === 'remaining' ? total - paid : amount;
  if (!Number.isFinite(collection) || collection <= tolerance || collection - (total - paid) > tolerance) {
    throw new Error('El cobro debe ser positivo y no puede superar el saldo actualizado de la factura.');
  }
  const montoPagado = Math.abs(total - paid - collection) <= tolerance ? total : paid + collection;
  return {
    montoPagado,
    montoDelDia: today + collection,
    estado: montoPagado >= total ? 'pagada' as const : 'parcial' as const,
    collection,
  };
}

export function administrativeInvoiceId(invoiceNumber: string): string {
  if (!invoiceNumber.trim()) throw new Error('La factura requiere un número.');
  return `factura_${encodeURIComponent(invoiceNumber.trim())}`;
}

/** Shared transaction implementation, executable against the isolated emulator. */
export async function persistInvoiceCollection(firestore: Firestore, ownerUid: string,
  operacionId: string, factura: FacturaPendiente, amount: number | 'remaining', actorUid: string,
  requestId?: string): Promise<void> {
    const operationRef = doc(firestore, `usuarios/${ownerUid}/gestionDiaria/${operacionId}`);
    // Historic IDs remain addressable regardless of their prefix. Only venta-
    // denotes a temporary mobile row; new administrative IDs are deterministic.
    const invoiceId = factura.id && !factura.id.startsWith('venta-')
      ? factura.id : administrativeInvoiceId(factura.numeroFactura);
    const invoiceRef = doc(collection(operationRef, 'facturas_pendientes'), invoiceId);
    const receiptRef = requestId
      ? doc(collection(invoiceRef, 'auditoria_cobros'), encodeURIComponent(requestId))
      : doc(collection(invoiceRef, 'auditoria_cobros'));
    await runTransaction(firestore, async (transaction) => {
      const [operation, invoice, receipt] = await Promise.all([
        transaction.get(operationRef), transaction.get(invoiceRef), transaction.get(receiptRef),
      ]);
      if (receipt.exists()) {
        const previous = receipt.data();
        if (previous['requestedAmount'] !== amount || previous['actorUid'] !== actorUid) {
          throw new Error('La referencia del cobro ya fue utilizada con otros datos.');
        }
        return; // An acknowledged retry does not collect or increment again, even after closing.
      }
      if (!operation.exists() || operation.data()['estado'] !== 'activa') throw new Error('La operación ya no está activa.');
      if (!invoice.exists() && factura.id?.startsWith('venta-')) {
        if (!factura.ventaMovilId) throw new Error('La factura no conserva la referencia de su venta móvil.');
        const mobileRef = doc(firestore, `usuarios/${ownerUid}/ventas/${factura.ventaMovilId}`);
        const mobile = await transaction.get(mobileRef);
        if (!mobile.exists() || mobile.data()['eliminado'] === true || mobile.data()['pagado'] !== false
          || Number(mobile.data()['total']) !== factura.monto) {
          throw new Error('La venta móvil cambió; actualice sus datos antes de registrar el cobro.');
        }
      }
      const current = invoice.exists() ? invoice.data() as FacturaPendiente : { ...factura, montoDelDia: 0 };
      const payment = applyInvoiceCollection(current, amount);
      if (invoice.exists()) {
        transaction.update(invoiceRef, { montoPagado: payment.montoPagado, montoDelDia: payment.montoDelDia,
          estado: payment.estado, ultima_modificacion: serverTimestamp() });
      } else {
        const { id: _temporaryId, estadoPagoMovilObservado: _observed, ...details } = factura;
        transaction.set(invoiceRef, { ...details, id: invoiceId, operacionId,
          montoPagado: payment.montoPagado, montoDelDia: payment.montoDelDia, estado: payment.estado,
          registradoPor: actorUid, ultima_modificacion: serverTimestamp() });
      }
      transaction.set(receiptRef, { type: 'cobro', amount: payment.collection, requestedAmount: amount, actorUid,
        previousMontoPagado: current.montoPagado ?? 0, createdAt: serverTimestamp() });
      transaction.update(operationRef, { operationRevision: (operation.data()['operationRevision'] ?? 0) + 1,
        ultima_modificacion: serverTimestamp() });
    });
}
