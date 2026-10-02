import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { assertAdministrativeTestWriteEnabled, isAdministrativeTestWriteEnabled } from '../../../core/integration/local-real-firestore-test.policy';
import { Observable, firstValueFrom, of } from 'rxjs';
import { InventoryConfigurationService } from './inventory-configuration.service';
import { InventoryMovementInput, inventoryMovementId, normalizeInventoryMovement } from './inventory-ledger.policy';

/** Immutable administrative movement log; it never changes usuarios/{ownerUid}/productos. */
@Injectable({ providedIn: 'root' })
export class InventoryLedgerService {
  private readonly firestore = inject(Firestore);
  private readonly businessContext = inject(BusinessContextService);
  private readonly configuration = inject(InventoryConfigurationService);
  get enabled(): boolean {
    const context = this.businessContext.context();
    return isAdministrativeTestWriteEnabled(context.status === 'signed-out' ? null : context.ownerUid);
  }

  watch(ownerUid: string): Observable<(InventoryMovementInput & { id: string })[]> {
    if (!isAdministrativeTestWriteEnabled(ownerUid)) return of([]);
    return collectionData(collection(this.firestore, `negocios/${ownerUid}/inventario_movimientos`), { idField: 'id' }) as Observable<(InventoryMovementInput & { id: string })[]>;
  }

  async record(input: InventoryMovementInput): Promise<void> {
    const ownerUid = this.businessContext.requireOwnerUid();
    assertAdministrativeTestWriteEnabled(ownerUid);
    const configured = await firstValueFrom(this.configuration.watch(ownerUid));
    const movement = normalizeInventoryMovement({ ...input, mode: configured.mode });
    const id = inventoryMovementId(movement);
    await setDoc(doc(this.firestore, `negocios/${ownerUid}/inventario_movimientos/${id}`), {
      ...movement, id, ownerUid, createdAt: serverTimestamp(),
    }, { merge: false });
  }
}
