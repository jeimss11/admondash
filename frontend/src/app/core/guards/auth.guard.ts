import { inject, Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, getAuth, onAuthStateChanged } from 'firebase/auth';
import { Observable, of } from 'rxjs';
import { environmentDistributor } from '../../../environments/environment.distributor';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  private distributorApp: FirebaseApp;
  private distributorAuth: Auth;

  constructor(private router: Router = inject(Router)) {
    // Usa la app por defecto
    try {
      this.distributorApp = initializeApp(environmentDistributor.firebase);
    } catch (e) {
      this.distributorApp =
        (window as any).firebaseApp || initializeApp(environmentDistributor.firebase);
    }
    (window as any).firebaseApp = this.distributorApp;
    this.distributorAuth = getAuth();
  }

  canActivate(): Observable<boolean | UrlTree> {
    // Si el usuario ya está autenticado, permite el acceso inmediatamente
    if (this.distributorAuth.currentUser) {
      return of(true);
    }
    // Si no, espera a que Firebase actualice el estado
    return new Observable<boolean | UrlTree>((observer) => {
      const unsubscribe = onAuthStateChanged(this.distributorAuth, (user) => {
        if (user) {
          observer.next(true);
        } else {
          observer.next(this.router.createUrlTree(['/login']));
        }
        observer.complete();
      });
      return { unsubscribe };
    });
  }
}
