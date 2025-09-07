import { Injectable } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import {
  Auth,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';
import { BehaviorSubject, Observable } from 'rxjs';
import { environmentDistributor } from '../../../environments/environment.distributor';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private distributorApp: FirebaseApp;
  private distributorAuth: Auth;
  private userSubject = new BehaviorSubject<User | null>(null);
  user$: Observable<User | null> = this.userSubject.asObservable();

  constructor() {
    // Inicializa la app solo si no existe
    try {
      this.distributorApp = initializeApp(environmentDistributor.firebase);
    } catch (e) {
      // Si ya está inicializada, usa la existente
      this.distributorApp =
        (window as any).firebaseApp || initializeApp(environmentDistributor.firebase);
    }
    (window as any).firebaseApp = this.distributorApp;
    this.distributorAuth = getAuth();
    onAuthStateChanged(this.distributorAuth, (user) => {
      this.userSubject.next(user);
    });
  }

  login(email: string, password: string) {
    return signInWithEmailAndPassword(this.distributorAuth, email, password);
  }

  logout() {
    return signOut(this.distributorAuth);
  }

  register(email: string, password: string) {
    return createUserWithEmailAndPassword(this.distributorAuth, email, password);
  }

  getCurrentUser() {
    return this.distributorAuth.currentUser;
  }
}
