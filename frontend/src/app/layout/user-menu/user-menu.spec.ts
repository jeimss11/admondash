import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { UserMenu } from './user-menu';
import { AuthService } from '../../core/services/auth.service';
import { OperatorSessionService } from '../../core/integration/operator-session.service';
import { BusinessContextService } from '../../core/integration/business-context.service';

describe('UserMenu logout', () => {
  let logout: jasmine.Spy;
  let clear: jasmine.Spy;
  beforeEach(() => {
    logout = jasmine.createSpy().and.resolveTo(); clear = jasmine.createSpy();
    TestBed.configureTestingModule({ imports: [UserMenu], providers: [provideZonelessChangeDetection(), provideRouter([]),
      { provide: AuthService, useValue: { user$: of({ email: 'synthetic@example.test' }), logout } },
      { provide: OperatorSessionService, useValue: { clear } },
      { provide: BusinessContextService, useValue: { can: () => true } },
    ] });
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });
  it('clears the operational selection after Firebase logout', async () => {
    const component = TestBed.createComponent(UserMenu).componentInstance;
    await component.logout();
    expect(logout).toHaveBeenCalledTimes(1); expect(clear).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/login']);
  });
  it('does not claim logout succeeded when Firebase rejects it', async () => {
    logout.and.rejectWith(new Error('synthetic failure'));
    const fixture = TestBed.createComponent(UserMenu); fixture.detectChanges();
    await fixture.componentInstance.logout(); await fixture.whenStable();
    expect(clear).not.toHaveBeenCalled(); expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('No fue posible cerrar la sesión');
    expect(fixture.componentInstance.busy()).toBeFalse();
  });
});
