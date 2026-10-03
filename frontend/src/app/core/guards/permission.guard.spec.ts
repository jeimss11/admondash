import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ActivatedRouteSnapshot, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { BusinessContext, BusinessContextService } from '../integration/business-context.service';
import { PERMISSION_CONTEXT_TIMEOUT, PermissionGuard } from './permission.guard';

describe('PermissionGuard restoration', () => {
  let ready: BehaviorSubject<boolean>;
  let user: BehaviorSubject<any>;
  let context: BehaviorSubject<BusinessContext>;
  const route = (data: Record<string, unknown>) => ({ data } as ActivatedRouteSnapshot);
  beforeEach(() => {
    ready = new BehaviorSubject(false); user = new BehaviorSubject<any>(null);
    context = new BehaviorSubject<BusinessContext>({ status: 'signed-out' });
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]),
      { provide: AuthService, useValue: { sessionReady$: ready, user$: user } },
      { provide: BusinessContextService, useValue: { context$: context, can: () => false } },
      { provide: PERMISSION_CONTEXT_TIMEOUT, useValue: 20 },
    ] });
  });
  it('waits for initial Auth restoration before returning login', async () => {
    let returned = false;
    const result = firstValueFrom(TestBed.inject(PermissionGuard).canActivate(route({ ownerOnly: true }))).then(value => { returned = true; return value; });
    await Promise.resolve(); expect(returned).toBeFalse();
    ready.next(true);
    expect(TestBed.inject(Router).serializeUrl(await result as any)).toBe('/login');
  });
  it('ignores stale prior-UID context and allows the restored owner', async () => {
    user.next({ uid: 'B' }); ready.next(true);
    context.next({ status: 'owner', actorUid: 'A', ownerUid: 'A', email: null });
    const result = firstValueFrom(TestBed.inject(PermissionGuard).canActivate(route({ ownerOnly: true })));
    context.next({ status: 'owner', actorUid: 'B', ownerUid: 'B', email: null });
    expect(await result).toBeTrue();
  });
  it('logout while waiting for context redirects instead of hanging', async () => {
    user.next({ uid: 'A' }); ready.next(true);
    const result = firstValueFrom(TestBed.inject(PermissionGuard).canActivate(route({ ownerOnly: true })));
    user.next(null);
    expect(TestBed.inject(Router).serializeUrl(await result as any)).toBe('/login');
  });
  it('missing context times out without granting a restricted route', async () => {
    user.next({ uid: 'A' }); ready.next(true);
    const result = await firstValueFrom(TestBed.inject(PermissionGuard).canActivate(route({ permission: 'caja.leer' })));
    expect(TestBed.inject(Router).serializeUrl(result as any)).toBe('/dashboard');
  });
  it('a member cannot enter an owner-only page', async () => {
    user.next({ uid: 'A' }); ready.next(true);
    context.next({ status: 'member', actorUid: 'A', ownerUid: 'O', email: null, role: 'administrador', permissions: { 'caja.leer': true } });
    const guard = TestBed.inject(PermissionGuard);
    expect(TestBed.inject(Router).serializeUrl(await firstValueFrom(guard.canActivate(route({ ownerOnly: true }))) as any)).toBe('/dashboard');
    expect(await firstValueFrom(guard.canActivate(route({ permission: 'caja.leer' })))).toBeTrue();
  });
});
