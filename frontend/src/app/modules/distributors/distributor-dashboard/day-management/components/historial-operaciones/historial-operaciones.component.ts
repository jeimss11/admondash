import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OperacionDiaria, ResumenDiario } from '../../../../models/distributor.models';

interface CalculoDetallado {
  dineroEsperado: number;
  dineroRecibido: number;
}

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
  @Input() calculosDetallados: { [key: string]: CalculoDetallado } = {};

  @Output() filtroFechaDesdeChange = new EventEmitter<string>();
  @Output() filtroFechaHastaChange = new EventEmitter<string>();
  @Output() aplicarFiltros = new EventEmitter<void>();
  @Output() limpiarFiltros = new EventEmitter<void>();
  @Output() verDetalle = new EventEmitter<OperacionDiaria>();

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

  getDineroEsperadoOperacion(operacion: OperacionDiaria): number {
    // Primero verificar si tenemos un cálculo detallado
    const calculoDetallado = this.calculosDetallados[operacion.id || ''];
    if (calculoDetallado && calculoDetallado.dineroEsperado !== undefined) {
      return calculoDetallado.dineroEsperado;
    }

    // Intentar obtener el resumen diario si está disponible
    const resumen = this.resumenesDiarios[operacion.id || ''];
    if (resumen && resumen.dineroEsperado !== undefined && resumen.dineroEsperado !== null) {
      return resumen.dineroEsperado;
    }

    // Si no hay resumen, devolver el monto inicial como aproximación
    return operacion.montoInicial || 0;
  }

  getDineroRecibidoOperacion(operacion: OperacionDiaria): number {
    // Primero verificar si tenemos un cálculo detallado
    const calculoDetallado = this.calculosDetallados[operacion.id || ''];
    if (calculoDetallado && calculoDetallado.dineroRecibido !== undefined) {
      return calculoDetallado.dineroRecibido;
    }

    // Intentar obtener el resumen diario si está disponible
    const resumen = this.resumenesDiarios[operacion.id || ''];
    if (resumen && resumen.dineroEntregado !== undefined && resumen.dineroEntregado !== null) {
      return resumen.dineroEntregado;
    }

    // Si no hay resumen, devolver el monto inicial como aproximación
    return operacion.montoInicial || 0;
  }

  getDiferenciaOperacion(operacion: OperacionDiaria): number {
    return this.getDineroRecibidoOperacion(operacion) - this.getDineroEsperadoOperacion(operacion);
  }

  getTotalDiferenciasFiltradas(): number {
    return this.operacionesFiltradas.reduce((total, operacion) => {
      return total + this.getDiferenciaOperacion(operacion);
    }, 0);
  }
}
