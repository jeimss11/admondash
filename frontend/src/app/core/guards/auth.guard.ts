import { inject, Injectable } from '@angular/core';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(private router: Router = inject(Router), private auth: Auth = inject(Auth)) {}

  canActivate(): Observable<boolean | UrlTree> {
    // Si el usuario ya está autenticado, permite el acceso inmediatamente
    if (this.auth.currentUser) {
      return of(true);
    }
    // Si no, espera a que Firebase actualice el estado
    return new Observable<boolean | UrlTree>((observer) => {
      const unsubscribe = onAuthStateChanged(this.auth, (user) => {
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
