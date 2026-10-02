import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from '@angular/fire/firestore';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { assertAdministrativeTestWriteEnabled, isAdministrativeTestWriteEnabled } from '../../../core/integration/local-real-firestore-test.policy';
import { OperatorSessionService } from '../../../core/integration/operator-session.service';
import type {
  OperationReopenRevision,
  ReopenOperationInput,
} from '../models/operation-revision.models';
import { assertClosedOperation, normalizeReopenReason } from './operation-revisions.policy';

/**
 * Adds an auditable reopening record without altering mobile sales or the
 * previous daily summary. It is available in the emulator and in the explicit
 * local real-Firestore test build, never in a production build.
 */
@Injectable({ providedIn: 'root' })
export class OperationRevisionsService {
  private readonly firestore = inject(Firestore);
  private readonly businessContext = inject(BusinessContextService);
  private readonly operatorSession = inject(OperatorSessionService);
  get enabled(): boolean {
    const context = this.businessContext.context();
    return isAdministrativeTestWriteEnabled(context.status === 'signed-out' ? null : context.ownerUid);
  }

  async reopenClosedOperation(input: ReopenOperationInput): Promise<OperationReopenRevision> {
    if (!this.operatorSession.isAdministrator()) {
      throw new Error('Solo el usuario operativo Administrador puede reabrir una operación.');
    }

    const operationId = input.operationId.trim();
    if (operationId.length === 0) {
      throw new Error('No se puede reabrir una operación sin identificador.');
    }

    const reason = normalizeReopenReason(input.reason);
    const context = this.businessContext.context();
    const ownerUid = this.businessContext.requireOwnerUid();
    assertAdministrativeTestWriteEnabled(ownerUid);
    const operationRef = doc(this.firestore, `usuarios/${ownerUid}/gestionDiaria/${operationId}`);
    const summaryRef = doc(
      this.firestore,
      `usuarios/${ownerUid}/gestionDiaria/${operationId}/resumen_diario/resumen`
    );
    const revisionRef = doc(collection(operationRef, 'revisiones'));

    await runTransaction(this.firestore, async (transaction) => {
      const [operation, summary] = await Promise.all([
        transaction.get(operationRef),
        transaction.get(summaryRef),
      ]);

      if (!operation.exists()) {
        throw new Error('La operación que intenta reabrir ya no existe.');
      }

      const operationData = operation.data();
      assertClosedOperation(operationData['estado']);

      const previousClose = {
        cerradoPor: operationData['cerradoPor'] ?? null,
        fechaCierre: operationData['fechaCierre'] ?? null,
        estado: operationData['estado'],
      };

      transaction.set(revisionRef, {
        type: 'reapertura',
        operationId,
        ownerUid,
        actorUid: context.status === 'signed-out' ? ownerUid : context.actorUid,
        reason,
        previousState: 'cerrada',
        previousClose,
        previousSummary: summary.exists() ? summary.data() : null,
        createdAt: serverTimestamp(),
      });

      transaction.update(operationRef, {
        estado: 'activa',
        reopenedBy: context.status === 'signed-out' ? ownerUid : context.actorUid,
        reopenedAt: serverTimestamp(),
        reopenRevisionId: revisionRef.id,
        updatedAt: serverTimestamp(),
        ultima_modificacion: serverTimestamp(),
      });
    });

    return {
      id: revisionRef.id,
      type: 'reapertura',
      operationId,
      ownerUid,
      actorUid: context.status === 'signed-out' ? ownerUid : context.actorUid,
      reason,
      previousState: 'cerrada',
      previousClose: null,
      previousSummary: null,
    };
  }
}
