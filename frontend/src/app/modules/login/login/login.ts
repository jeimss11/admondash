import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  loginForm: FormGroup;
  loading = false;
  error: string | null = null;

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  async onSubmit() {
    if (this.loginForm.invalid || this.loading) return;
    this.loading = true;
    this.error = null;
    const { email, password } = this.loginForm.value;
    try {
      await this.auth.login(email.trim(), password);
      this.router.navigate(['/dashboard']);
    } catch (err: any) {
      this.error = err?.code === 'auth/network-request-failed'
        ? 'No se pudo conectar. Revisa tu conexión e intenta nuevamente.'
        : 'No se pudo iniciar sesión. Revisa el correo y la contraseña.';
    } finally {
      this.loading = false;
    }
  }
}
