import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, query } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export type MembershipRole = 'consulta' | 'operador' | 'administrador';

export interface BusinessMember {
  uid: string;
  email: string;
  role: MembershipRole;
  status: 'activo' | 'revocado';
  permissions: Record<string, boolean>;
}

export interface ProvisionedMember {
  uid: string;
  email: string;
  role: MembershipRole;
}

export interface AcceptedInvitation {
  ownerUid: string;
  memberUid: string;
  status: 'active';
}

export interface ResolvedMembership {
  ownerUid: string;
  role: MembershipRole;
  permissions: Record<string, boolean>;
}

/**
 * This client deliberately fails closed outside Emulator Suite. Production
 * membership calls remain unavailable until an approved Functions deployment.
 */
@Injectable({ providedIn: 'root' })
export class MembershipService {
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);

  readonly enabled = environment.emulators !== null;

  watchMembers(ownerUid: string): Observable<BusinessMember[]> {
    this.requireEnabled();
    const members = query(collection(this.firestore, `negocios/${ownerUid}/miembros`));
    return collectionData(members, { idField: 'uid' }).pipe(
      map((items) =>
        items.map((item) => {
          const value = item as Record<string, unknown>;
          return {
            uid: String(value['uid'] ?? ''),
            email: String(value['email'] ?? ''),
            role: value['role'] as MembershipRole,
            status: value['estado'] === 'revocado' ? 'revocado' : 'activo',
            permissions: (value['permisos'] as Record<string, boolean> | undefined) ?? {},
          };
        })
      )
    );
  }

  async provisionMember(
    email: string,
    password: string,
    role: MembershipRole
  ): Promise<ProvisionedMember> {
    this.requireEnabled();
    const callable = httpsCallable<
      { email: string; password: string; role: MembershipRole },
      ProvisionedMember
    >(
      this.functions,
      'provisionMember'
    );
    return (await callable({ email, password, role })).data;
  }

  async revokeMember(memberUid: string): Promise<void> {
    this.requireEnabled();
    const callable = httpsCallable<{ memberUid: string }, { status: string }>(
      this.functions,
      'revokeMember'
    );
    await callable({ memberUid });
  }

  async resolveMyMembership(): Promise<ResolvedMembership | null> {
    this.requireEnabled();
    const callable = httpsCallable<void, ResolvedMembership | null>(this.functions, 'resolveMyMembership');
    return (await callable()).data;
  }

  private requireEnabled(): void {
    if (!this.enabled) {
      throw new Error('Las subcuentas no están habilitadas en este entorno.');
    }
  }
}
