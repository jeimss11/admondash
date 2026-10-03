import { Firestore, collection, doc, getDocs, limit, query, runTransaction, serverTimestamp } from 'firebase/firestore';
import { InventoryConfiguration, applyInventoryConfigurationChange, normalizeInventoryConfiguration } from './inventory-configuration.policy';
import { InventoryMovementInput, createInventoryReversal, inventoryMovementId, normalizeInventoryMovement, sameInventoryMovement } from './inventory-ledger.policy';

/** Caller owns environment/authorization checks; guard is rechecked around every asynchronous read. */
export async function saveInventoryConfiguration(firestore: Firestore, ownerUid: string, actorUid: string, input: Partial<InventoryConfiguration>, changeNote: string, guard: () => void): Promise<void> {
  guard();
  if (changeNote.trim().length < 10) throw new Error('Explique el cambio de inventario con al menos 10 caracteres.');
  const reference = doc(firestore, `negocios/${ownerUid}/configuracion/inventario`);
  // Legacy records precede the first-movement lock. Avoid downloading their complete history.
  const history = await getDocs(query(collection(firestore, `negocios/${ownerUid}/inventario_movimientos`), limit(1)));
  guard();
  await runTransaction(firestore, async (transaction) => {
    guard();
    const snapshot = await transaction.get(reference);
    const current = normalizeInventoryConfiguration(snapshot.data() ?? {});
    const configuration = applyInventoryConfigurationChange(current, input, !history.empty || snapshot.data()?.['inventoryStarted'] === true);
    guard();
    transaction.set(reference, { ...configuration, ownerUid, updatedByUid: actorUid, changeNote: changeNote.trim(), updatedAt: serverTimestamp() }, { merge: true });
  });
}

export async function recordInventoryMovement(firestore: Firestore, ownerUid: string, input: InventoryMovementInput, guard: () => void): Promise<void> {
  guard();
  const id = inventoryMovementId(normalizeInventoryMovement(input));
  const reference = doc(firestore, `negocios/${ownerUid}/inventario_movimientos/${id}`);
  const configurationReference = doc(firestore, `negocios/${ownerUid}/configuracion/inventario`);
  await runTransaction(firestore, async (transaction) => {
    guard();
    const configurationSnapshot = await transaction.get(configurationReference);
    const configured = normalizeInventoryConfiguration(configurationSnapshot.data() ?? {});
    const movement = normalizeInventoryMovement({ ...input, mode: input.correctionOf ? input.mode : configured.mode });
    const existing = await transaction.get(reference);
    if (existing.exists()) {
      if (!sameInventoryMovement(existing.data() as InventoryMovementInput, movement)) throw new Error('La referencia ya corresponde a otro movimiento. Use una referencia nueva; el historial se conserva.');
      guard();
      return;
    }
    if (movement.correctionOf) {
      const original = await transaction.get(doc(firestore, `negocios/${ownerUid}/inventario_movimientos/${movement.correctionOf}`));
      if (!original.exists()) throw new Error('No se encontró el movimiento original para corregir.');
      const expected = createInventoryReversal(original.data() as InventoryMovementInput, {
        sourceId: `reversal_${movement.correctionOf}`, actorUid: input.actorUid, reason: movement.correctionReason ?? '',
      });
      if (!sameInventoryMovement(expected, movement)) throw new Error('La corrección no corresponde al movimiento original.');
    }
    guard();
    const data = Object.fromEntries(Object.entries(movement).filter(([, value]) => value !== undefined));
    transaction.set(reference, { ...data, id, ownerUid, createdAt: serverTimestamp() });
    // Both operations read this document, so mode change vs first movement cannot interleave.
    if (configurationSnapshot.data()?.['inventoryStarted'] !== true) {
      transaction.set(configurationReference, { ...configured, ownerUid, inventoryStarted: true, inventoryStartedAt: serverTimestamp() }, { merge: true });
    }
  });
}
