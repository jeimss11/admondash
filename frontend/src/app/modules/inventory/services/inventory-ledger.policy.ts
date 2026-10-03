import type { InventoryMode } from './inventory-configuration.policy';

/** Physical location, kept separate from mobile product quantities and names. */
export type InventoryLocation = 'factory' | 'shared-distributors' | `distributor:${string}`;

export type InventoryMovementKind =
  | 'factory-receipt'
  | 'load'
  | 'return'
  | 'loss'
  | 'adjustment-in'
  | 'adjustment-out';

export interface InventoryMovementInput {
  operationId: string;
  sourceId: string;
  kind: InventoryMovementKind;
  productCode: string;
  productName: string;
  quantity: number;
  /** Required for distribution movements; factory receipts have no distributor. */
  distributorId?: string;
  actorUid: string;
  mode: InventoryMode;
  /** Explicit locations for new events. Older events are resolved from their mode and distributor. */
  sourceLocation?: InventoryLocation;
  destinationLocation?: InventoryLocation;
  /** Free-text evidence for a receipt or other administrative event. */
  note?: string;
  /** Links a compensating movement to immutable evidence it corrects. */
  correctionOf?: string;
  /** A correction must always explain why the original evidence was reversed. */
  correctionReason?: string;
}

export function inventoryMovementId(input: Pick<InventoryMovementInput, 'operationId' | 'sourceId' | 'kind'>): string {
  const operation = input.operationId.trim();
  const source = input.sourceId.trim();
  if (!operation || !source) throw new Error('El movimiento debe tener operación y origen.');
  return `${input.kind}_${operation}_${source}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function normalizeInventoryMovement(input: InventoryMovementInput): InventoryMovementInput {
  if (!['factory-receipt', 'load', 'return', 'loss', 'adjustment-in', 'adjustment-out'].includes(input.kind) || !['central', 'by-seller'].includes(input.mode)) {
    throw new Error('El tipo o modo del movimiento no es válido.');
  }
  if (!input.productCode.trim() || !input.productName.trim() || !input.actorUid.trim()) {
    throw new Error('El movimiento de inventario requiere producto y responsable.');
  }
  if (input.kind !== 'factory-receipt' && !input.distributorId?.trim()) {
    throw new Error('El movimiento de distribución requiere un distribuidor o bolsa compartida.');
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error('La cantidad del movimiento debe ser mayor que cero.');
  }
  inventoryMovementId(input);
  if (input.note !== undefined && typeof input.note !== 'string') {
    throw new Error('La nota del movimiento debe ser texto.');
  }
  const note = input.note?.trim();
  return {
    ...input,
    ...(note ? { note } : {}),
    ...resolveInventoryMovementLocations(input),
  };
}

/** Compares event content, ignoring Firestore metadata, for an idempotent retry. */
export function sameInventoryMovement(left: InventoryMovementInput, right: InventoryMovementInput): boolean {
  const keys: (keyof InventoryMovementInput)[] = ['operationId', 'sourceId', 'kind', 'productCode', 'productName', 'quantity', 'distributorId', 'actorUid', 'mode', 'sourceLocation', 'destinationLocation', 'note', 'correctionOf', 'correctionReason'];
  const a = normalizeInventoryMovement(left);
  const b = normalizeInventoryMovement(right);
  return keys.every((key) => a[key] === b[key]);
}

export function distributorInventoryLocation(distributorId: string): InventoryLocation {
  const normalized = distributorId.trim();
  if (!normalized) throw new Error('La ubicación del distribuidor requiere un identificador.');
  return `distributor:${normalized}`;
}

/**
 * Existing `central` entries become the shared pool. Existing `by-seller`
 * entries belong to the named distributor. New entries retain locations
 * explicitly, so a future configuration change never reinterprets history.
 */
export function resolveInventoryMovementLocations(
  input: Pick<InventoryMovementInput, 'kind' | 'mode' | 'distributorId' | 'sourceLocation' | 'destinationLocation'>
): Pick<InventoryMovementInput, 'sourceLocation' | 'destinationLocation'> {
  const distributionLocation = input.kind === 'factory-receipt'
    ? undefined
    : input.mode === 'central'
      ? 'shared-distributors' as const
      : distributorInventoryLocation(input.distributorId ?? '');
  const defaults: Pick<InventoryMovementInput, 'sourceLocation' | 'destinationLocation'> = input.kind === 'factory-receipt'
    ? { destinationLocation: 'factory' }
    : input.kind === 'load'
      ? { sourceLocation: 'factory', destinationLocation: distributionLocation }
      : input.kind === 'return'
        ? { sourceLocation: distributionLocation, destinationLocation: 'factory' }
        : input.kind === 'adjustment-in'
          ? { destinationLocation: distributionLocation }
          : { sourceLocation: distributionLocation };
  const sourceLocation = input.sourceLocation ?? defaults.sourceLocation;
  const destinationLocation = input.destinationLocation ?? defaults.destinationLocation;

  if (input.kind === 'factory-receipt' && (sourceLocation || destinationLocation !== 'factory')) {
    throw new Error('Una recepción debe entrar a la fábrica desde un origen externo.');
  }
  if (input.kind === 'load' && (sourceLocation !== 'factory' || !destinationLocation || destinationLocation === 'factory')) {
    throw new Error('Una carga debe salir de fábrica hacia una ubicación de distribución.');
  }
  if (input.kind === 'return' && (sourceLocation === 'factory' || destinationLocation !== 'factory')) {
    throw new Error('Una devolución debe regresar desde distribución hacia fábrica.');
  }
  if (input.kind === 'loss' && (!sourceLocation || destinationLocation)) {
    throw new Error('Una pérdida debe indicar su ubicación de origen y no tiene destino de inventario.');
  }
  if (input.kind === 'adjustment-in' && (sourceLocation || !destinationLocation || destinationLocation === 'factory')) {
    throw new Error('Un ajuste de entrada debe llegar a una ubicación de distribución desde una conciliación.');
  }
  if (input.kind === 'adjustment-out' && (!sourceLocation || sourceLocation === 'factory' || destinationLocation)) {
    throw new Error('Un ajuste de salida debe salir de una ubicación de distribución sin destino físico.');
  }
  return { sourceLocation, destinationLocation };
}

export interface InventoryReversalOptions {
  sourceId: string;
  actorUid: string;
  reason: string;
}

/**
 * Produces compensating evidence instead of deleting or editing an inventory
 * event. The caller persists this movement alongside the original one.
 */
export function createInventoryReversal(
  input: InventoryMovementInput,
  options: InventoryReversalOptions,
): InventoryMovementInput {
  const original = normalizeInventoryMovement(input);
  if (original.correctionOf) throw new Error('Una corrección ya auditada no se revierte desde este formulario; requiere conciliación específica.');
  const sourceId = options.sourceId.trim();
  const actorUid = options.actorUid.trim();
  const reason = options.reason.trim();
  if (!sourceId || !actorUid) throw new Error('La corrección requiere origen y responsable.');
  if (reason.length < 10) throw new Error('La corrección requiere una nota de al menos 10 caracteres.');

  const base: InventoryMovementInput = {
    ...original,
    sourceId,
    actorUid,
    correctionOf: inventoryMovementId(original),
    correctionReason: reason,
  };

  switch (original.kind) {
    case 'load':
      return normalizeInventoryMovement({
        ...base,
        kind: 'return',
        sourceLocation: original.destinationLocation,
        destinationLocation: original.sourceLocation,
      });
    case 'return':
      return normalizeInventoryMovement({
        ...base,
        kind: 'load',
        sourceLocation: original.destinationLocation,
        destinationLocation: original.sourceLocation,
      });
    case 'loss':
    case 'adjustment-out':
      return normalizeInventoryMovement({
        ...base,
        kind: 'adjustment-in',
        sourceLocation: undefined,
        destinationLocation: original.sourceLocation,
      });
    case 'adjustment-in':
      return normalizeInventoryMovement({
        ...base,
        kind: 'adjustment-out',
        sourceLocation: original.destinationLocation,
        destinationLocation: undefined,
      });
    case 'factory-receipt':
      throw new Error('La corrección de una recepción de fábrica requiere una conciliación de fábrica específica.');
  }
}

export interface InventoryAdministrativeBalance {
  productCode: string;
  productName: string;
  loaded: number;
  returned: number;
  lost: number;
  adjustedIn: number;
  adjustedOut: number;
  outstanding: number;
}

export interface InventoryLocationBalance {
  productCode: string;
  productName: string;
  factory: number;
  sharedDistributorPool: number;
  distributors: { distributorId: string; quantity: number }[];
  lost: number;
}

/**
 * Outstanding quantity is an administrative reconciliation value, not a claim
 * about the absolute quantity last uploaded by a mobile device.
 */
export function summarizeInventoryMovements(
  movements: readonly Pick<InventoryMovementInput, 'kind' | 'productCode' | 'productName' | 'quantity'>[]
): InventoryAdministrativeBalance[] {
  const balances = new Map<string, InventoryAdministrativeBalance>();
  for (const movement of movements) {
    const current = balances.get(movement.productCode) ?? {
      productCode: movement.productCode,
      productName: movement.productName,
      loaded: 0,
      returned: 0,
      lost: 0,
      adjustedIn: 0,
      adjustedOut: 0,
      outstanding: 0,
    };
    if (movement.kind === 'load') current.loaded += movement.quantity;
    if (movement.kind === 'return') current.returned += movement.quantity;
    if (movement.kind === 'loss') current.lost += movement.quantity;
    if (movement.kind === 'adjustment-in') current.adjustedIn += movement.quantity;
    if (movement.kind === 'adjustment-out') current.adjustedOut += movement.quantity;
    current.outstanding = current.loaded - current.returned - current.lost + current.adjustedIn - current.adjustedOut;
    balances.set(movement.productCode, current);
  }
  return [...balances.values()].sort((a, b) => a.productName.localeCompare(b.productName));
}

/**
 * Administrative stock flow by physical location. It starts at zero: until a
 * physical opening count/receipts are recorded, a negative factory value means
 * an incomplete baseline, not negative physical stock.
 */
export function summarizeInventoryLocations(
  movements: readonly InventoryMovementInput[]
): InventoryLocationBalance[] {
  const balances = new Map<string, InventoryLocationBalance>();
  const add = (balance: InventoryLocationBalance, location: InventoryLocation, quantity: number): void => {
    if (location === 'factory') balance.factory += quantity;
    else if (location === 'shared-distributors') balance.sharedDistributorPool += quantity;
    else {
      const distributorId = location.slice('distributor:'.length);
      const existing = balance.distributors.find((entry) => entry.distributorId === distributorId);
      if (existing) existing.quantity += quantity;
      else balance.distributors.push({ distributorId, quantity });
    }
  };

  for (const raw of movements) {
    const movement = normalizeInventoryMovement(raw);
    const balance = balances.get(movement.productCode) ?? {
      productCode: movement.productCode,
      productName: movement.productName,
      factory: 0,
      sharedDistributorPool: 0,
      distributors: [],
      lost: 0,
    };
    if (movement.sourceLocation) add(balance, movement.sourceLocation, -movement.quantity);
    if (movement.destinationLocation) add(balance, movement.destinationLocation, movement.quantity);
    if (movement.kind === 'loss') balance.lost += movement.quantity;
    balances.set(movement.productCode, balance);
  }

  return [...balances.values()]
    .map((balance) => ({ ...balance, distributors: [...balance.distributors].sort((a, b) => a.distributorId.localeCompare(b.distributorId)) }))
    .sort((a, b) => a.productName.localeCompare(b.productName));
}
