import { Injectable, computed, inject, signal } from '@angular/core';
import { Auth, EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential } from '@angular/fire/auth';
import { assertOperatorSessionUnchanged, operatorStorageKey } from './operator-session.policy';

/** A mobile seller role is extensible; the current app exposes the four IDs below. */
export type OperatorId = string;

export interface OperatorProfile {
  id: OperatorId;
  label: string;
  role: 'administrador' | 'operador' | 'otro';
  permissions: Record<string, boolean>;
}

const ALL_PERMISSIONS = ['ventas.leer', 'catalogo.leer', 'clientes.leer', 'gastos.leer', 'proveedores.leer', 'caja.leer', 'reportes.leer'];
const operatorPermissions = { 'ventas.leer': true, 'catalogo.leer': true, 'clientes.leer': true, 'reportes.leer': true };

/**
 * Mirrors the mobile app's operator selection without writing active_sellers,
 * mobile sessions or subscriptions. Only the non-sensitive active ID is cached.
 */
@Injectable({ providedIn: 'root' })
export class OperatorSessionService {
  private readonly auth = inject(Auth);
  private sessionUid: string | null = null;
  private sessionRevision = 0;
  readonly profiles: OperatorProfile[] = [
    { id: 'admon', label: 'Administrador', role: 'administrador', permissions: Object.fromEntries(ALL_PERMISSIONS.map((permission) => [permission, true])) },
    { id: 'seller1', label: 'Vendedor 1', role: 'operador', permissions: operatorPermissions },
    { id: 'seller2', label: 'Vendedor 2', role: 'operador', permissions: operatorPermissions },
    { id: 'seller3', label: 'Vendedor 3', role: 'operador', permissions: operatorPermissions },
  ];
  private readonly activeId = signal<OperatorId | null>(null);
  readonly active = computed(() => this.profiles.find((profile) => profile.id === this.activeId()) ?? null);

  constructor() {
    onAuthStateChanged(this.auth, (user) => {
      if (this.sessionUid === (user?.uid ?? null)) return;
      this.sessionUid = user?.uid ?? null;
      this.sessionRevision++;
      this.activeId.set(this.sessionUid ? this.readCached(this.sessionUid) : null);
    });
  }

  can(permission: string): boolean {
    return this.active()?.permissions[permission] === true;
  }

  /** UI/audit guard for actions reserved to the mobile-compatible `admon` role. */
  isAdministrator(): boolean {
    return this.active()?.id === 'admon';
  }

  async select(operatorId: OperatorId, password: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!this.profiles.some((profile) => profile.id === operatorId)) throw new Error('El usuario operativo no existe.');
    if (!user?.email) throw new Error('La sesión principal ya no está disponible.');
    if (!password) throw new Error('Ingresa la contraseña de la cuenta principal.');
    const revision = this.sessionRevision;
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    assertOperatorSessionUnchanged(user.uid, this.auth.currentUser?.uid ?? null, revision, this.sessionRevision);
    this.activeId.set(operatorId);
    try { localStorage.setItem(operatorStorageKey(user.uid), operatorId); } catch { /* Selection remains in memory when storage is unavailable. */ }
  }

  clear(): void {
    this.activeId.set(null);
    this.sessionRevision++;
    try {
      if (this.sessionUid) localStorage.removeItem(operatorStorageKey(this.sessionUid));
      localStorage.removeItem('admondash.active-operator.v1');
    } catch { /* Browser storage is optional. */ }
  }

  private readCached(uid: string): OperatorId | null {
    try {
      const value = localStorage.getItem(operatorStorageKey(uid));
      return this.profiles.some((profile) => profile.id === value) ? value as OperatorId : null;
    } catch { return null; }
  }
}
