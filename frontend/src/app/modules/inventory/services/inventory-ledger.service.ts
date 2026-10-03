import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { assertAdministrativeTestWriteEnabled, isAdministrativeTestWriteEnabled } from '../../../core/integration/local-real-firestore-test.policy';
import { Observable, of } from 'rxjs';
import { InventoryMovementInput } from './inventory-ledger.policy';
import { recordInventoryMovement } from './inventory-write.transaction';

/** Immutable administrative movement log; it never changes usuarios/{ownerUid}/productos. */
@Injectable({ providedIn: 'root' })
export class InventoryLedgerService {
  private readonly firestore = inject(Firestore);
  private readonly businessContext = inject(BusinessContextService);
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
    const context = this.businessContext.context();
    if (context.status === 'signed-out' || input.actorUid !== context.actorUid) throw new Error('El responsable no coincide con la sesión actual.');
    await recordInventoryMovement(this.firestore, ownerUid, input, () => {
      const current = this.businessContext.context();
      if (current.status === 'signed-out' || current.ownerUid !== ownerUid || current.actorUid !== context.actorUid) throw new Error('La sesión cambió durante el registro.');
      assertAdministrativeTestWriteEnabled(ownerUid);
    });
  }
}
