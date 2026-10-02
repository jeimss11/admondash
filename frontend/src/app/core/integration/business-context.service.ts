import { Injectable, Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { User } from '@angular/fire/auth';
import { catchError, distinctUntilChanged, from, map, of, shareReplay, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { MembershipRole, MembershipService } from './membership.service';
import { OperatorSessionService } from './operator-session.service';

export type BusinessContext =
  | { status: 'signed-out' }
  | { status: 'owner'; ownerUid: string; actorUid: string; email: string | null }
  | { status: 'member'; ownerUid: string; actorUid: string; email: string | null; role: MembershipRole; permissions: Record<string, boolean> };

/**
 * Resolves the business whose data can be read in this session.
 *
 * An owner reads usuarios/{uid}; an accepted collaborator resolves the owner's
 * route through the backend membership flow. Neither path touches mobile sessions.
 */
@Injectable({ providedIn: 'root' })
export class BusinessContextService {
  private readonly authService = inject(AuthService);
  private readonly memberships = inject(MembershipService);
  private readonly operator = inject(OperatorSessionService);

  readonly user = toSignal<User | null>(this.authService.user$, { initialValue: null });

  readonly context$ = this.authService.user$.pipe(
    switchMap((user) => this.resolveContext(user)),
    distinctUntilChanged((previous, current) => {
      if (previous.status !== current.status) return false;
      if (previous.status === 'signed-out' || current.status === 'signed-out') return true;
      return previous.ownerUid === current.ownerUid && previous.actorUid === current.actorUid;
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  readonly context: Signal<BusinessContext> = toSignal(this.context$, {
    initialValue: { status: 'signed-out' } as BusinessContext,
  });

  /** Captures the UID at operation start so later auth changes cannot redirect a request. */
  requireOwnerUid(): string {
    const context = this.context();
    if (context.status === 'signed-out') {
      throw new Error('Debe iniciar sesión antes de consultar datos del negocio.');
    }
    return context.ownerUid;
  }

  /** UI hint only. Firestore rules and backend remain the authorization boundary. */
  can(permission: string): boolean {
    const context = this.context();
    // The owner Firebase session remains the Firestore identity. For that shared
    // session, this is a UI/audit boundary matching the mobile operator picker.
    if (context.status === 'owner') return this.operator.can(permission);
    if (context.status === 'member') return context.permissions[permission] === true;
    return false;
  }

  private toContext(user: User | null): BusinessContext {
    if (!user) return { status: 'signed-out' };

    return {
      status: 'owner',
      ownerUid: user.uid,
      actorUid: user.uid,
      email: user.email,
    };
  }

  private resolveContext(user: User | null) {
    if (!user) return of<BusinessContext>({ status: 'signed-out' });
    if (!this.memberships.enabled) return of(this.toContext(user));
    return from(this.memberships.resolveMyMembership()).pipe(
      map((membership): BusinessContext => membership
        ? { status: 'member', ownerUid: membership.ownerUid, actorUid: user.uid, email: user.email, role: membership.role, permissions: membership.permissions }
        : this.toContext(user)),
      // A failed lookup must never invent another owner's business. The user's own route remains safe.
      catchError(() => of(this.toContext(user)))
    );
  }
}
