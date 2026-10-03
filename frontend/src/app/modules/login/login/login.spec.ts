import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { Login } from './login';
import { AuthService } from '../../../core/services/auth.service';
import { provideRouter } from '@angular/router';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: AuthService, useValue: { login: async () => {} } }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  it('does not authenticate an invalid form', async () => {
    const auth = TestBed.inject(AuthService);
    const login = spyOn(auth, 'login');
    await component.onSubmit();
    expect(login).not.toHaveBeenCalled();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
