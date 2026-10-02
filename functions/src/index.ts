import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { MembershipInputError, normalizeEmail, permissionsFor, resolveRole } from './membership-policy.js';

if (getApps().length === 0) {
  // The deployed runtime uses its service account; the explicit ID keeps emulator tests isolated.
  initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-admondash' });
}

const database = () => getFirestore();
type RevokeMemberInput = { memberUid?: unknown };
type ResolvedMembership = { ownerUid: string; role: string; permissions: Record<string, boolean> };

function callerUid(auth: { uid: string } | null | undefined): string {
  if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  return auth.uid;
}

function asHttpsError(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof MembershipInputError) throw new HttpsError(error.code, error.message);
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'auth/email-already-exists') {
    throw new HttpsError('already-exists', 'Ya existe una cuenta con ese correo.');
  }
  throw new HttpsError('internal', 'No fue posible completar la operación.');
}

/** Owner-only revocation; it never touches Firebase Auth nor mobile sessions. */
export const revokeMember = onCall<RevokeMemberInput>(async (request) => {
  try {
    const ownerUid = callerUid(request.auth);
    const memberUid = request.data?.memberUid;
    if (typeof memberUid !== 'string' || memberUid.trim().length === 0 || memberUid === ownerUid) {
      throw new HttpsError('invalid-argument', 'El colaborador no es válido.');
    }
    const membership = database().doc(`negocios/${ownerUid}/miembros/${memberUid}`);
    const audit = database().collection(`negocios/${ownerUid}/auditoria`).doc();
    await database().runTransaction(async (transaction) => {
      const current = await transaction.get(membership);
      if (!current.exists) throw new HttpsError('not-found', 'La membresía no existe.');
      transaction.update(membership, {
        estado: 'revocado', revokedByUid: ownerUid, revokedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(audit, {
        tipo: 'membresia.revocada', actorUid: ownerUid, memberUid, createdAt: FieldValue.serverTimestamp(),
      });
    });
    return { memberUid, status: 'revoked' };
  } catch (error) {
    return asHttpsError(error);
  }
});

/** Resolves a collaborator's business without making membership collections listable to clients. */
export const resolveMyMembership = onCall<void>(async (request): Promise<ResolvedMembership | null> => {
  try {
    const memberUid = callerUid(request.auth);
    const matches = await database().collectionGroup('miembros').where('uid', '==', memberUid).where('estado', '==', 'activo').limit(2).get();
    if (matches.empty) return null;
    if (matches.size > 1) throw new HttpsError('failed-precondition', 'La cuenta pertenece a más de un negocio; falta seleccionar el negocio activo.');
    const document = matches.docs[0];
    const ownerUid = document.ref.parent.parent?.id;
    const data = document.data();
    if (!ownerUid || data.uid !== memberUid) throw new HttpsError('internal', 'La membresía no es válida.');
    return {
      ownerUid,
      role: typeof data.role === 'string' ? data.role : 'consulta',
      permissions: typeof data.permisos === 'object' && data.permisos !== null ? data.permisos as Record<string, boolean> : {},
    };
  } catch (error) {
    return asHttpsError(error);
  }
});
