import { inject, Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, getAuth, onAuthStateChanged } from 'firebase/auth';
import { Observable } from 'rxjs';
import { environmentDistributor } from '../../../environments/environment.distributor';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  private distributorApp: FirebaseApp;
  private distributorAuth: Auth;

  constructor(private router: Router = inject(Router)) {
    this.distributorApp = initializeApp(environmentDistributor.firebase, 'distributorAuthGuardApp');
    this.distributorAuth = getAuth(this.distributorApp);
  }

  canActivate(): Observable<boolean | UrlTree> {
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
