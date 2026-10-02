import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { assertAdministrativeTestWriteEnabled, isAdministrativeTestWriteEnabled } from '../../../core/integration/local-real-firestore-test.policy';
import {
  DEFAULT_INVENTORY_CONFIGURATION,
  InventoryConfiguration,
  normalizeInventoryConfiguration,
} from './inventory-configuration.policy';

/**
 * Administrative configuration deliberately lives outside usuarios/{ownerUid}/productos.
 * A mobile client can replace product documents, so neither configuration nor stock ledger
 * metadata may be stored in those shared documents.
 */
@Injectable({ providedIn: 'root' })
export class InventoryConfigurationService {
  private readonly firestore = inject(Firestore);
  private readonly businessContext = inject(BusinessContextService);

  /** Real-project writes are limited to the explicit local test owner. */
  get enabled(): boolean {
    const context = this.businessContext.context();
    return isAdministrativeTestWriteEnabled(context.status === 'signed-out' ? null : context.ownerUid);
  }

  watch(ownerUid: string): Observable<InventoryConfiguration> {
    const reference = doc(this.firestore, `negocios/${ownerUid}/configuracion/inventario`);
    return docData(reference).pipe(
      map((value) => normalizeInventoryConfiguration((value ?? {}) as Partial<InventoryConfiguration>))
    );
  }

  async save(input: Partial<InventoryConfiguration>, changeNote: string): Promise<void> {
    if (changeNote.trim().length < 10) {
      throw new Error('Explique el cambio de inventario con al menos 10 caracteres.');
    }

    const ownerUid = this.businessContext.requireOwnerUid();
    assertAdministrativeTestWriteEnabled(ownerUid);
    // Current context is owner-only; collaborator resolution will provide a distinct actor later.
    const actorUid = ownerUid;
    const configuration = normalizeInventoryConfiguration(input);
    const reference = doc(this.firestore, `negocios/${ownerUid}/configuracion/inventario`);
    await setDoc(reference, {
      ...configuration,
      ownerUid,
      updatedByUid: actorUid,
      changeNote: changeNote.trim(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
}
