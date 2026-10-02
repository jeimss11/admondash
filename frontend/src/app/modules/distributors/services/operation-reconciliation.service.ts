import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { assertAdministrativeTestWriteEnabled, isAdministrativeTestWriteEnabled } from '../../../core/integration/local-real-firestore-test.policy';
import { OperatorSessionService } from '../../../core/integration/operator-session.service';
import type { ObservedMobileSale } from './operation-reconciliation.policy';
import {
  normalizeIgnoreReason,
  type ReconciliationDecision,
} from './operation-reconciliation.policy';

/**
 * Keeps an administrative snapshot of mobile-sale references only. It never
 * copies a mobile sale into web sales and never writes to the mobile ventas collection.
 */
@Injectable({ providedIn: 'root' })
export class OperationReconciliationService {
  private readonly firestore = inject(Firestore);
  private readonly businessContext = inject(BusinessContextService);
  private readonly operatorSession = inject(OperatorSessionService);
  get enabled(): boolean {
    const context = this.businessContext.context();
    return isAdministrativeTestWriteEnabled(context.status === 'signed-out' ? null : context.ownerUid);
  }

  async captureObservedSales(operationId: string, sales: readonly ObservedMobileSale[]): Promise<void> {
    this.requireEnabled();
    this.requireAdministrator();
    const ownerUid = this.businessContext.requireOwnerUid();
    const references = collection(
      this.firestore,
      `usuarios/${ownerUid}/gestionDiaria/${operationId}/ventas_movil_observadas`
    );

    await Promise.all(
      sales.map((sale) =>
        setDoc(doc(references), {
          invoiceNumber: sale.invoiceNumber,
          businessDate: sale.businessDate,
          sellerRole: sale.sellerRole,
          total: sale.total,
          capturedAt: serverTimestamp(),
        })
      )
    );
  }

  async getRecordedInvoiceNumbers(operationId: string): Promise<Set<string>> {
    this.requireEnabled();
    const ownerUid = this.businessContext.requireOwnerUid();
    const references = collection(
      this.firestore,
      `usuarios/${ownerUid}/gestionDiaria/${operationId}/ventas_movil_observadas`
    );
    const snapshot = await getDocs(references);
    return new Set(
      snapshot.docs
        .map((item) => item.data()['invoiceNumber'])
        .filter((invoice): invoice is string => typeof invoice === 'string' && invoice.length > 0)
    );
  }

  async getDecisions(operationId: string): Promise<Map<string, ReconciliationDecision>> {
    this.requireEnabled();
    const ownerUid = this.businessContext.requireOwnerUid();
    const decisions = collection(
      this.firestore,
      `usuarios/${ownerUid}/gestionDiaria/${operationId}/conciliaciones`
    );
    const snapshot = await getDocs(decisions);
    const result = new Map<string, ReconciliationDecision>();
    snapshot.docs.forEach((item) => {
      const data = item.data();
      if (
        typeof data['invoiceNumber'] === 'string' &&
        (data['decision'] === 'asociada' || data['decision'] === 'ignorada')
      ) {
        result.set(data['invoiceNumber'], data['decision']);
      }
    });
    return result;
  }

  async recordDecision(
    operationId: string,
    sale: ObservedMobileSale,
    decision: ReconciliationDecision,
    note = ''
  ): Promise<void> {
    this.requireEnabled();
    this.requireAdministrator();
    const ownerUid = this.businessContext.requireOwnerUid();
    const context = this.businessContext.context();
    const normalizedNote = decision === 'ignorada' ? normalizeIgnoreReason(note) : note.trim();
    const decisionId = `mobile_${encodeURIComponent(sale.invoiceNumber)}`;
    const reference = doc(
      this.firestore,
      `usuarios/${ownerUid}/gestionDiaria/${operationId}/conciliaciones/${decisionId}`
    );

    await setDoc(reference, {
      invoiceNumber: sale.invoiceNumber,
      businessDate: sale.businessDate,
      sellerRole: sale.sellerRole,
      total: sale.total,
      decision,
      note: normalizedNote || null,
      actorUid: context.status === 'signed-out' ? ownerUid : context.actorUid,
      decidedAt: serverTimestamp(),
    });
  }

  private requireEnabled(): void {
    assertAdministrativeTestWriteEnabled(this.businessContext.requireOwnerUid());
  }

  private requireAdministrator(): void {
    if (!this.operatorSession.isAdministrator()) {
      throw new Error('Solo el usuario operativo Administrador puede registrar una conciliación.');
    }
  }
}
