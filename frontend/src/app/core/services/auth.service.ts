import { Injectable } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from '@angular/fire/auth';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  constructor(private auth: Auth) {
    onAuthStateChanged(this.auth, (user) => {
      this.userSubject.next(user);
    });
  }
  private userSubject = new BehaviorSubject<User | null>(null);
  user$: Observable<User | null> = this.userSubject.asObservable();

  login(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  logout() {
    return signOut(this.auth);
  }

  register(email: string, password: string) {
    return createUserWithEmailAndPassword(this.auth, email, password);
  }

  getCurrentUser() {
    return this.auth.currentUser;
  }
}
