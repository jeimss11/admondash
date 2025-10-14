import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AlertaSistema } from '../../../../models/distributor.models';

@Component({
  selector: 'app-estadisticas-operacion',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './estadisticas-operacion.component.html',
  styleUrls: ['./estadisticas-operacion.component.scss'],
})
export class EstadisticasOperacionComponent {
  // Inputs: Datos que recibe del componente padre
  @Input() cantidadProductosCargados: number = 0;
  @Input() cantidadProductosRetornados: number = 0;
  @Input() cantidadProductosNoRetornados: number = 0;
  @Input() dineroEsperado: number = 0;
  @Input() alertas: AlertaSistema[] = [];
  @Input() isCollapsed: boolean = false;

  // Output: Eventos que emite al componente padre
  @Output() toggleCollapse = new EventEmitter<void>();

  /**
   * Emite el evento para colapsar/expandir el panel
   */
  onToggleCollapse(): void {
    this.toggleCollapse.emit();
  }

  /**
   * Obtiene la clase CSS según la prioridad de la alerta
   */
  getAlertPriorityClass(prioridad: string): string {
    switch (prioridad) {
      case 'baja':
        return 'badge-priority-baja';
      case 'media':
        return 'badge-priority-media';
      case 'alta':
        return 'badge-priority-alta';
      case 'critica':
        return 'badge-priority-critica';
      default:
        return 'badge-secondary';
    }
  }
}
