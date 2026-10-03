/** Bind the remembered UI profile to the Firebase identity that selected it. */
export function operatorStorageKey(uid: string): string {
  if (!uid.trim()) throw new Error('La selección requiere una cuenta autenticada.');
  return `admondash.active-operator.v2.${uid}`;
}

export function assertOperatorSessionUnchanged(selectedUid: string, currentUid: string | null, startedRevision: number, currentRevision: number): void {
  if (selectedUid !== currentUid || startedRevision !== currentRevision) {
    throw new Error('La sesión cambió durante la validación. Seleccione nuevamente el usuario.');
  }
}
