import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { UserMenu } from '../user-menu/user-menu';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [UserMenu],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.scss'],
})
export class Navbar implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  @Output() menuToggle = new EventEmitter<void>();
  currentPage: string = 'Dashboard';

  constructor(private router: Router) {}

  ngOnInit() {
    // Obtener la página actual basada en la ruta
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe((event: NavigationEnd) => {
        this.updateCurrentPage(event.url);
      });

    // Establecer página inicial
    this.updateCurrentPage(this.router.url);
  }

  private updateCurrentPage(url: string) {
    const path = url.split('/')[1] || 'dashboard';

    const pageNames: { [key: string]: string } = {
      dashboard: 'Dashboard',
      sales: 'Ventas',
      clients: 'Clientes',
      inventory: 'Inventario',
      distributors: 'Distribuidores',
      expenses: 'Gastos',
      reports: 'Reportes',
      users: 'Usuarios',
      suppliers: 'Proveedores',
    };

    this.currentPage = pageNames[path] || 'Dashboard';
    this.cdr.markForCheck();
  }
}
