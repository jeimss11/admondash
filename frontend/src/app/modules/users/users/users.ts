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

  begin(operatorId: OperatorId): void { this.pending.set(operatorId); this.password.set(''); this.error.set(null); }
  cancel(): void { this.pending.set(null); this.password.set(''); this.error.set(null); }
  async confirm(): Promise<void> {
    const operatorId = this.pending();
    if (!operatorId || this.busy()) return;
    this.busy.set(true); this.error.set(null);
    try { await this.operators.select(operatorId, this.password()); this.cancel(); }
    catch { this.error.set('La contraseña de la cuenta principal no es correcta.'); }
    finally { this.busy.set(false); }
  }
  release(): void { this.operators.clear(); }
}
