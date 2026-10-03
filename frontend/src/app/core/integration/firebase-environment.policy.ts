export interface FirebaseEnvironment {
  production: boolean;
  firebase: { projectId: string };
  localRealFirestoreTestOwnerUid: string | null;
  emulators: {
    authUrl: string;
    firestoreHost: string;
    firestorePort: number;
    functionsHost: string;
    functionsPort: number;
  } | null;
}

/** Fail before initializing an SDK; this does not change any remote settings. */
export function assertFirebaseEnvironment(config: FirebaseEnvironment): void {
  if (config.production && (config.emulators || config.localRealFirestoreTestOwnerUid)) {
    throw new Error('Una versión de producción no admite emuladores ni excepciones de cuenta de pruebas.');
  }
  if (!config.emulators) {
    if (config.firebase.projectId.startsWith('demo-')) {
      throw new Error('Un proyecto de demostración requiere emuladores locales explícitos.');
    }
    return;
  }
  if (config.firebase.projectId !== 'demo-admondash' || config.localRealFirestoreTestOwnerUid) {
    throw new Error('El entorno emulado solo admite demo-admondash, sin excepciones de cuentas reales.');
  }
  const local = (host: string) => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  const port = (value: number) => Number.isInteger(value) && value > 0 && value <= 65535;
  const emulator = config.emulators;
  let authUrl: URL;
  try { authUrl = new URL(emulator.authUrl); }
  catch { throw new Error('La dirección del emulador Auth no es válida.'); }
  if (authUrl.protocol !== 'http:' || !local(authUrl.hostname) || !authUrl.port || !port(Number(authUrl.port))
      || authUrl.username || authUrl.password || authUrl.search || authUrl.hash || authUrl.pathname !== '/') {
    throw new Error('El emulador Auth debe usar una dirección HTTP local con puerto explícito.');
  }
  if (!local(emulator.firestoreHost) || !local(emulator.functionsHost)
      || !port(emulator.firestorePort) || !port(emulator.functionsPort)) {
    throw new Error('Firestore y Functions emulados deben usar solamente direcciones y puertos locales.');
  }
}
