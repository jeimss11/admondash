import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { Users } from './users';
import { OperatorSessionService } from '../../../core/integration/operator-session.service';

describe('Users', () => {
  let component: Users;
  let fixture: ComponentFixture<Users>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Users],
      providers: [provideZonelessChangeDetection(), { provide: OperatorSessionService, useValue: { profiles: [], active: () => null, select: async () => {}, clear: () => {} } }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Users);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it('clears the password when selection is cancelled', () => {
    component.begin('seller1'); component.password.set('sensitive'); component.cancel();
    expect(component.password()).toBe(''); expect(component.pending()).toBeNull();
  });
  it('does not change or release the selected role while verification is pending', async () => {
    let finish!: () => void;
    const service = TestBed.inject(OperatorSessionService);
    spyOn(service, 'select').and.returnValue(new Promise<void>(resolve => { finish = resolve; }));
    const clear = spyOn(service, 'clear');
    component.begin('seller1'); component.password.set('secret');
    const verifying = component.confirm();
    component.cancel(); component.begin('seller2'); component.release();
    expect(component.pending()).toBe('seller1'); expect(clear).not.toHaveBeenCalled();
    finish(); await verifying;
    expect(component.pending()).toBeNull(); expect(component.password()).toBe('');
  });
  it('distinguishes a network failure from a wrong password and clears the secret', async () => {
    spyOn(TestBed.inject(OperatorSessionService), 'select').and.rejectWith({ code: 'auth/network-request-failed' });
    component.begin('seller1'); component.password.set('secret'); await component.confirm();
    expect(component.error()).toContain('conexión');
    expect(component.error()).not.toContain('no es correcta');
    expect(component.password()).toBe('');
  });
});
