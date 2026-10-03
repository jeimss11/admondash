import {
  ApplicationConfig,
  DEFAULT_CURRENCY_CODE,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { connectAuthEmulator, getAuth, provideAuth } from '@angular/fire/auth';
import { connectFirestoreEmulator, getFirestore, provideFirestore } from '@angular/fire/firestore';
import { connectFunctionsEmulator, getFunctions, provideFunctions } from '@angular/fire/functions';
import { provideRouter } from '@angular/router';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { assertFirebaseEnvironment } from './core/integration/firebase-environment.policy';

assertFirebaseEnvironment(environment);

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'es-CO' },
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'COP' },
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideFirestore(() => {
      const firestore = getFirestore();
      const emulator = environment.emulators;
      if (emulator) connectFirestoreEmulator(firestore, emulator.firestoreHost, emulator.firestorePort);
      return firestore;
    }),
    provideAuth(() => {
      const auth = getAuth();
      if (environment.emulators) connectAuthEmulator(auth, environment.emulators.authUrl);
      return auth;
    }),
    provideFunctions(() => {
      const functions = getFunctions();
      const emulator = environment.emulators;
      if (emulator) connectFunctionsEmulator(functions, emulator.functionsHost, emulator.functionsPort);
      return functions;
    }),
  ],
};
