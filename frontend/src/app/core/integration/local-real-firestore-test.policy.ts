import { environment } from '../../../environments/environment';

/**
 * A local, explicitly selected test build can exercise administrative flows
 * against one isolated owner route in the real project. The normal and
 * production environments return false, and no Firebase configuration is
 * changed by this guard.
 */
export function isAdministrativeTestWriteEnabled(ownerUid: string | null | undefined): boolean {
  if (environment.emulators !== null) return true;
  return !!ownerUid && environment.localRealFirestoreTestOwnerUid === ownerUid;
}

export function assertAdministrativeTestWriteEnabled(ownerUid: string): void {
  if (!isAdministrativeTestWriteEnabled(ownerUid)) {
    throw new Error('Esta operación administrativa solo está habilitada en el emulador o con la cuenta local de pruebas autorizada.');
  }
}
