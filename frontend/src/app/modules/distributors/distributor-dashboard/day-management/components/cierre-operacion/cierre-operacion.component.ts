import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OperacionDiaria } from '../../../../models/distributor.models';

export interface CierreOperacionData {
  dineroEntregado: number;
  observaciones: string;
}

@Component({
  selector: 'app-cierre-operacion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cierre-operacion.component.html',
  styleUrls: ['./cierre-operacion.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CierreOperacionComponent {
  @Input() operacionActual: OperacionDiaria | null = null;
  @Input() isLoading: boolean = false;
  @Input() dineroEntregado: number = 0;
  @Input() observaciones: string = '';

  // Inputs para los totales calculados en el padre
  @Input() montoInicial: number = 0;
  @Input() totalVentas: number = 0;
  @Input() totalGastos: number = 0;
  @Input() totalPerdidas: number = 0;
  @Input() totalFacturasPagas: number = 0;
  @Input() dineroEsperado: number = 0;

  @Output() dineroEntregadoChange = new EventEmitter<number>();
  @Output() observacionesChange = new EventEmitter<string>();
  @Output() cerrar = new EventEmitter<CierreOperacionData>();

  onDineroEntregadoChange(value: number): void {
    this.dineroEntregadoChange.emit(value);
  }

  onObservacionesChange(value: string): void {
    this.observacionesChange.emit(value);
  }

  onCerrarOperacion(): void {
    this.cerrar.emit({
      dineroEntregado: this.dineroEntregado,
      observaciones: this.observaciones,
    });
  }

  getDiferenciaDinero(): number {
    if (!this.dineroEntregado) return 0;
    return this.dineroEntregado - this.dineroEsperado;
  }

  getTodayDate(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
