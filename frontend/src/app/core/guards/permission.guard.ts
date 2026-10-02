import { Injectable, inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, filter, map, take } from 'rxjs';
import { BusinessContextService } from '../integration/business-context.service';

/** Client-side navigation guard. Firestore rules remain the authorization boundary. */
@Injectable({ providedIn: 'root' })
export class PermissionGuard implements CanActivate {
  private readonly router = inject(Router);
  private readonly business = inject(BusinessContextService);

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
    const permission = route.data['permission'] as string | undefined;
    const ownerOnly = route.data['ownerOnly'] === true;
    return this.business.context$.pipe(
      // AuthGuard already establishes an authenticated Firebase user. The first
      // context emission can still be the synchronous signed-out placeholder
      // while that session is restored; it must not deny a valid owner route.
      filter((context) => context.status !== 'signed-out'),
      take(1),
      map((context) => {
        if (context.status === 'owner' && ownerOnly) return true;
        if (context.status === 'owner' && permission && this.business.can(permission)) return true;
        if (context.status === 'member' && !ownerOnly && permission && context.permissions[permission] === true) {
          return true;
        }
        return this.router.createUrlTree(['/dashboard']);
      })
    );
  }
}
