"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMyMembership = exports.revokeMember = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const membership_policy_js_1 = require("./membership-policy.js");
if ((0, app_1.getApps)().length === 0) {
    // The deployed runtime uses its service account; the explicit ID keeps emulator tests isolated.
    (0, app_1.initializeApp)({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-admondash' });
}
const database = () => (0, firestore_1.getFirestore)();
function callerUid(auth) {
    if (!auth)
        throw new https_1.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    return auth.uid;
}
function asHttpsError(error) {
    if (error instanceof https_1.HttpsError)
        throw error;
    if (error instanceof membership_policy_js_1.MembershipInputError)
        throw new https_1.HttpsError(error.code, error.message);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'auth/email-already-exists') {
        throw new https_1.HttpsError('already-exists', 'Ya existe una cuenta con ese correo.');
    }
    throw new https_1.HttpsError('internal', 'No fue posible completar la operación.');
}
/** Owner-only revocation; it never touches Firebase Auth nor mobile sessions. */
exports.revokeMember = (0, https_1.onCall)(async (request) => {
    try {
        const ownerUid = callerUid(request.auth);
        const memberUid = request.data?.memberUid;
        if (typeof memberUid !== 'string' || memberUid.trim().length === 0 || memberUid === ownerUid) {
            throw new https_1.HttpsError('invalid-argument', 'El colaborador no es válido.');
        }
        const membership = database().doc(`negocios/${ownerUid}/miembros/${memberUid}`);
        const audit = database().collection(`negocios/${ownerUid}/auditoria`).doc();
        await database().runTransaction(async (transaction) => {
            const current = await transaction.get(membership);
            if (!current.exists)
                throw new https_1.HttpsError('not-found', 'La membresía no existe.');
            transaction.update(membership, {
                estado: 'revocado', revokedByUid: ownerUid, revokedAt: firestore_1.FieldValue.serverTimestamp(), updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            transaction.set(audit, {
                tipo: 'membresia.revocada', actorUid: ownerUid, memberUid, createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
        return { memberUid, status: 'revoked' };
    }
    catch (error) {
        return asHttpsError(error);
    }
});
/** Resolves a collaborator's business without making membership collections listable to clients. */
exports.resolveMyMembership = (0, https_1.onCall)(async (request) => {
    try {
        const memberUid = callerUid(request.auth);
        const matches = await database().collectionGroup('miembros').where('uid', '==', memberUid).where('estado', '==', 'activo').limit(2).get();
        if (matches.empty)
            return null;
        if (matches.size > 1)
            throw new https_1.HttpsError('failed-precondition', 'La cuenta pertenece a más de un negocio; falta seleccionar el negocio activo.');
        const document = matches.docs[0];
        const ownerUid = document.ref.parent.parent?.id;
        const data = document.data();
        if (!ownerUid || data.uid !== memberUid)
            throw new https_1.HttpsError('internal', 'La membresía no es válida.');
        return {
            ownerUid,
            role: typeof data.role === 'string' ? data.role : 'consulta',
            permissions: typeof data.permisos === 'object' && data.permisos !== null ? data.permisos : {},
        };
    }
    catch (error) {
        return asHttpsError(error);
    }
});
//# sourceMappingURL=index.js.map