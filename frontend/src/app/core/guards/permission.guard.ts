import { Injectable, InjectionToken, inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, catchError, filter, map, of, switchMap, take, timeout } from 'rxjs';
import { BusinessContextService } from '../integration/business-context.service';
import { AuthService } from '../services/auth.service';

export const PERMISSION_CONTEXT_TIMEOUT = new InjectionToken<number>('permission-context-timeout', { providedIn: 'root', factory: () => 10_000 });

/** Client-side navigation guard. Firestore rules remain the authorization boundary. */
@Injectable({ providedIn: 'root' })
export class PermissionGuard implements CanActivate {
  private readonly router = inject(Router);
  private readonly business = inject(BusinessContextService);
  private readonly auth = inject(AuthService);
  private readonly contextTimeout = inject(PERMISSION_CONTEXT_TIMEOUT);

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
    const permission = route.data['permission'] as string | undefined;
    const ownerOnly = route.data['ownerOnly'] === true;
    return this.auth.sessionReady$.pipe(
      filter(Boolean),
      switchMap(() => this.auth.user$),
      switchMap((user) => {
        if (!user) return of(this.router.createUrlTree(['/login']));
        return this.business.context$.pipe(
          // Ignore a restored placeholder or a cached context of a prior UID.
          filter((context) => context.status !== 'signed-out' && context.actorUid === user.uid),
          take(1),
          map((context) => {
            if (context.status === 'owner' && ownerOnly) return true;
            if (context.status === 'owner' && permission && this.business.can(permission)) return true;
            if (context.status === 'member' && !ownerOnly && permission && context.permissions[permission] === true) return true;
            return this.router.createUrlTree(['/dashboard']);
          }),
          // Failed context restoration must not leave navigation hanging forever.
          timeout({ first: this.contextTimeout, with: () => of(this.router.createUrlTree(['/dashboard'])) }),
          catchError(() => of(this.router.createUrlTree(['/dashboard']))),
        );
      }),
      take(1),
    );
  }
}
