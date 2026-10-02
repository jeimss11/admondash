import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { BusinessContextService } from '../../core/integration/business-context.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.scss'],
})
export class Sidebar {
  readonly business = inject(BusinessContextService);

  get workspaceLabel(): string {
    const context = this.business.context();
    if (context.status === 'owner') return 'Propietario';
    if (context.status === 'member') {
      return context.role === 'administrador' ? 'Administrador' : context.role === 'operador' ? 'Operador' : 'Consulta';
    }
    return 'Sesión pendiente';
  }

  get workspaceHint(): string {
    const context = this.business.context();
    if (context.status === 'owner') return 'Acceso completo al negocio';
    if (context.status === 'member') return 'Acceso según tus permisos';
    return 'Inicia sesión para continuar';
  }
}
