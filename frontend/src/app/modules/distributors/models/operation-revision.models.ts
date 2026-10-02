/**
 * Administrative history attached to an existing gestionDiaria operation.
 * It is deliberately separate from mobile sales and from the legacy `dias`
 * documents: reopening never rewrites those records.
 */
export interface OperationReopenRevision {
  id: string;
  type: 'reapertura';
  operationId: string;
  ownerUid: string;
  actorUid: string;
  reason: string;
  previousState: 'cerrada';
  previousClose: Record<string, unknown> | null;
  previousSummary: Record<string, unknown> | null;
}

export interface ReopenOperationInput {
  operationId: string;
  reason: string;
}

