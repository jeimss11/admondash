import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OperacionDiaria, ResumenDiario } from '../../../../models/distributor.models';

@Component({
  selector: 'app-historial-operaciones',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './historial-operaciones.component.html',
  styleUrls: ['./historial-operaciones.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistorialOperacionesComponent {
  @Input() operacionesHistoricas: OperacionDiaria[] = [];
  @Input() operacionesFiltradas: OperacionDiaria[] = [];
  @Input() filtroFechaDesde: string = '';
  @Input() filtroFechaHasta: string = '';
  @Input() estaCargandoExtendido: boolean = false;
  @Input() resumenesDiarios: { [key: string]: ResumenDiario } = {};
  @Input() reopeningEnabled: boolean = false;
  @Input() reconciliationEnabled: boolean = false;

  @Output() filtroFechaDesdeChange = new EventEmitter<string>();
  @Output() filtroFechaHastaChange = new EventEmitter<string>();
  @Output() aplicarFiltros = new EventEmitter<void>();
  @Output() limpiarFiltros = new EventEmitter<void>();
  @Output() verDetalle = new EventEmitter<OperacionDiaria>();
  @Output() reabrir = new EventEmitter<OperacionDiaria>();
  @Output() conciliar = new EventEmitter<OperacionDiaria>();

  onFiltroFechaDesdeChange(value: string): void {
    this.filtroFechaDesdeChange.emit(value);
  }

  onFiltroFechaHastaChange(value: string): void {
    this.filtroFechaHastaChange.emit(value);
  }

  onAplicarFiltros(): void {
    this.aplicarFiltros.emit();
  }

  onLimpiarFiltros(): void {
    this.limpiarFiltros.emit();
  }

  onVerDetalle(operacion: OperacionDiaria): void {
    this.verDetalle.emit(operacion);
  }

  onReabrir(operacion: OperacionDiaria): void {
    this.reabrir.emit(operacion);
  }

  onConciliar(operacion: OperacionDiaria): void {
    this.conciliar.emit(operacion);
  }

  getStatusClass(estado: string): string {
    switch (estado) {
      case 'abierta':
        return 'badge bg-success';
      case 'cerrada':
        return 'badge bg-secondary';
      case 'cancelada':
        return 'badge bg-danger';
      default:
        return 'badge bg-warning';
    }
  }

  getStatusText(estado: string): string {
    switch (estado) {
      case 'abierta':
        return 'Abierta';
      case 'cerrada':
        return 'Cerrada';
      case 'cancelada':
        return 'Cancelada';
      default:
        return estado || 'Sin estado';
    }
  }

  getDineroEsperadoOperacion(operacion: OperacionDiaria): number | null {
    const value = this.resumenesDiarios[operacion.id || '']?.dineroEsperado;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  getDineroRecibidoOperacion(operacion: OperacionDiaria): number | null {
    const value = this.resumenesDiarios[operacion.id || '']?.dineroEntregado;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  getDiferenciaOperacion(operacion: OperacionDiaria): number | null {
    const value = this.resumenesDiarios[operacion.id || '']?.diferencia;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  getTotalDiferenciasFiltradas(): number | null {
    const values = this.operacionesFiltradas.map((operacion) => this.getDiferenciaOperacion(operacion));
    return values.some((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  }
}
