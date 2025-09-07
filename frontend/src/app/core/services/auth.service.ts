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
    this.distributorApp = initializeApp(environmentDistributor.firebase, 'distributorAuthApp');
    this.distributorAuth = getAuth(this.distributorApp);
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
