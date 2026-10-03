import { runTransaction, serverTimestamp, type DocumentData, type DocumentReference, type Firestore } from 'firebase/firestore';

/** Compare business evidence; a retry's display timestamp is not a new movement. */
export function isSameOperationRecord(existing: DocumentData, incoming: DocumentData): boolean {
  const ignored = new Set(['ultima_modificacion', 'fechaCarga', 'fechaRegistro', 'fechaGasto']);
  const keys = Object.keys(incoming).filter((key) => !ignored.has(key));
  return keys.every((key) => JSON.stringify(existing[key]) === JSON.stringify(incoming[key]));
}

export async function persistActiveOperationRecord(firestore: Firestore, reference: DocumentReference, data: DocumentData, guard: () => void = () => {}): Promise<void> {
  guard();
  const operationRef = reference.parent.parent;
  if (!operationRef) throw new Error('La escritura requiere una operación.');
  await runTransaction(firestore, async (transaction) => {
    guard();
    const [operation, existing] = await Promise.all([transaction.get(operationRef), transaction.get(reference)]);
    guard();
    if (existing.exists()) {
      if (isSameOperationRecord(existing.data(), data)) return;
      throw new Error('Este registro ya existe con otros datos; no se puede reemplazar su evidencia.');
    }
    if (!operation.exists() || operation.data()['estado'] !== 'activa') throw new Error('La operación ya no está activa.');
    transaction.set(reference, { ...data, ultima_modificacion: serverTimestamp() });
    transaction.update(operationRef, { operationRevision: (operation.data()['operationRevision'] ?? 0) + 1,
      ultima_modificacion: serverTimestamp() });
  });
}
