import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OperatorId, OperatorSessionService } from '../../../core/integration/operator-session.service';

@Component({ selector: 'app-users', standalone: true, imports: [FormsModule], templateUrl: './users.html', styleUrl: './users.scss' })
export class Users {
  readonly operators = inject(OperatorSessionService);
  readonly pending = signal<OperatorId | null>(null);
  readonly password = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  begin(operatorId: OperatorId): void { if (this.busy()) return; this.pending.set(operatorId); this.password.set(''); this.error.set(null); }
  cancel(): void { if (this.busy()) return; this.pending.set(null); this.password.set(''); this.error.set(null); }
  async confirm(): Promise<void> {
    const operatorId = this.pending();
    if (!operatorId || this.busy()) return;
    this.busy.set(true); this.error.set(null);
    try { await this.operators.select(operatorId, this.password()); this.pending.set(null); this.password.set(''); }
    catch (cause: unknown) {
      const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
      this.error.set(['auth/invalid-credential', 'auth/wrong-password', 'auth/invalid-login-credentials'].includes(code)
        ? 'La contraseña de la cuenta principal no es correcta.'
        : code === 'auth/network-request-failed' ? 'No hay conexión para verificar la contraseña. Inténtalo nuevamente.'
        : code === 'auth/too-many-requests' ? 'Demasiados intentos. Espera antes de intentar nuevamente.'
        : 'No fue posible cambiar el usuario. Comprueba que la sesión principal siga activa e inténtalo nuevamente.');
      this.password.set('');
    }
    finally { this.busy.set(false); }
  }
  release(): void { if (!this.busy()) this.operators.clear(); }
}
