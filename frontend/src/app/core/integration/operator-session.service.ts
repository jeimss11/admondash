import { Injectable, computed, inject, signal } from '@angular/core';
import { Auth, EmailAuthProvider, reauthenticateWithCredential } from '@angular/fire/auth';

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
  private readonly storageKey = 'admondash.active-operator.v1';
  readonly profiles: OperatorProfile[] = [
    { id: 'admon', label: 'Administrador', role: 'administrador', permissions: Object.fromEntries(ALL_PERMISSIONS.map((permission) => [permission, true])) },
    { id: 'seller1', label: 'Vendedor 1', role: 'operador', permissions: operatorPermissions },
    { id: 'seller2', label: 'Vendedor 2', role: 'operador', permissions: operatorPermissions },
    { id: 'seller3', label: 'Vendedor 3', role: 'operador', permissions: operatorPermissions },
  ];
  private readonly activeId = signal<OperatorId | null>(this.readCached());
  readonly active = computed(() => this.profiles.find((profile) => profile.id === this.activeId()) ?? null);

  can(permission: string): boolean {
    return this.active()?.permissions[permission] === true;
  }

  /** UI/audit guard for actions reserved to the mobile-compatible `admon` role. */
  isAdministrator(): boolean {
    return this.active()?.id === 'admon';
  }

  async select(operatorId: OperatorId, password: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user?.email) throw new Error('La sesión principal ya no está disponible.');
    if (!password) throw new Error('Ingresa la contraseña de la cuenta principal.');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    this.activeId.set(operatorId);
    localStorage.setItem(this.storageKey, operatorId);
  }

  clear(): void {
    this.activeId.set(null);
    localStorage.removeItem(this.storageKey);
  }

  private readCached(): OperatorId | null {
    const value = localStorage.getItem(this.storageKey);
    return this.profiles.some((profile) => profile.id === value) ? value as OperatorId : null;
  }
}
