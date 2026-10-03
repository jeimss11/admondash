import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { OperatorSessionService } from '../../core/integration/operator-session.service';
import { BusinessContextService } from '../../core/integration/business-context.service';

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './user-menu.html',
  styleUrls: ['./user-menu.scss'],
})
export class UserMenu {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly operators = inject(OperatorSessionService);
  readonly business = inject(BusinessContextService);
  readonly user = toSignal(this.auth.user$, { initialValue: null });
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async logout() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.logout();
      this.operators.clear();
      await this.router.navigate(['/login']);
    } catch {
      this.error.set('No fue posible cerrar la sesión. Inténtalo nuevamente.');
    } finally { this.busy.set(false); }
  }
}
