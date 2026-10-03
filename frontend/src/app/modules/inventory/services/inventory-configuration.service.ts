import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { Observable, map, of } from 'rxjs';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { assertAdministrativeTestWriteEnabled, isAdministrativeTestWriteEnabled } from '../../../core/integration/local-real-firestore-test.policy';
import {
  DEFAULT_INVENTORY_CONFIGURATION,
  InventoryConfiguration,
  normalizeInventoryConfiguration,
} from './inventory-configuration.policy';
import { saveInventoryConfiguration } from './inventory-write.transaction';

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
    // Do not query unapproved administrative paths in the normal application.
    if (!isAdministrativeTestWriteEnabled(ownerUid)) return of({ ...DEFAULT_INVENTORY_CONFIGURATION });
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
    const context = this.businessContext.context();
    if (context.status === 'signed-out' || context.ownerUid !== ownerUid) throw new Error('La sesión del negocio cambió.');
    const actorUid = context.actorUid;
    await saveInventoryConfiguration(this.firestore, ownerUid, actorUid, input, changeNote, () => {
      const currentSession = this.businessContext.context();
      if (currentSession.status === 'signed-out' || currentSession.ownerUid !== ownerUid || currentSession.actorUid !== actorUid) throw new Error('La sesión del negocio cambió.');
      assertAdministrativeTestWriteEnabled(ownerUid);
    });
  }
}
