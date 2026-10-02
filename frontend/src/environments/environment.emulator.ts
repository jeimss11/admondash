export const environment = {
  production: false,
  firebase: {
    apiKey: 'demo-admondash-local-only',
    authDomain: 'demo-admondash.local',
    projectId: 'demo-admondash',
    storageBucket: 'demo-admondash.local',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:demo',
  },
  emulators: {
    authUrl: 'http://127.0.0.1:9099',
    firestoreHost: '127.0.0.1',
    firestorePort: 8080,
    functionsHost: '127.0.0.1',
    functionsPort: 5001,
  },
  localRealFirestoreTestOwnerUid: null,
};
