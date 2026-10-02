/** Production builds never contain a real-Firestore test account exception. */
export const environment = {
  production: true,
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
  localRealFirestoreTestOwnerUid: null as string | null,
};
