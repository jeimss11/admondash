import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-user-menu',
  standalone: true,
  templateUrl: './user-menu.html',
  styleUrls: ['./user-menu.scss'],
})
export class UserMenu {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly user = toSignal(this.auth.user$, { initialValue: null });

  async logout() {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
