/**
 * Local-only test build. It uses the existing Firebase project but only enables
 * administrative writes for the explicit test-owner UID below. Never use this
 * file for a production build or publish it as a hosted environment.
 */
export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSyAbijgJmN1_PgiRnnft7yIptFkAyTNTMmE',
    authDomain: 'impresion-gratis.firebaseapp.com',
    projectId: 'impresion-gratis',
    storageBucket: 'impresion-gratis.appspot.com',
    messagingSenderId: '151013644579',
    appId: '1:151013644579:web:91b246ba20f52e15759496',
    measurementId: 'G-GNPVCEMRLR',
  },
  emulators: null as {
    authUrl: string;
    firestoreHost: string;
    firestorePort: number;
    functionsHost: string;
    functionsPort: number;
  } | null,
  localRealFirestoreTestOwnerUid: 'Kv1o39fFnyW22INmXyXS8WMFgnR2',
};
