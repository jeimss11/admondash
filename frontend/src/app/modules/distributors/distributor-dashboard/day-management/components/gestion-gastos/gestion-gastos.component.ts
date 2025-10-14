import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GastoOperativo } from '../../../../models/distributor.models';

@Component({
  selector: 'app-gestion-gastos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './gestion-gastos.component.html',
  styleUrls: ['./gestion-gastos.component.scss'],
})
export class GestionGastosComponent {
  // Inputs: Datos que recibe del componente padre
  @Input() gastosOperativos: GastoOperativo[] = [];
  @Input() isLoading: boolean = false;

  // Outputs: Eventos que emite al componente padre
  @Output() gastoRegistrado = new EventEmitter<Omit<GastoOperativo, 'id'>>();
  @Output() gastoEliminado = new EventEmitter<number>();

  // Formulario de gastos
  gastoForm = {
    tipo: 'gasolina' as 'gasolina' | 'alimentacion' | 'transporte' | 'hospedaje' | 'otros',
    descripcion: '',
    monto: 0,
  };

  /**
   * Emite el evento para registrar un nuevo gasto
   */
  onRegistrarGasto(): void {
    if (!this.gastoForm.monto || !this.gastoForm.descripcion) {
      return;
    }

    const gasto: Omit<GastoOperativo, 'id'> = {
      operacionId: '', // Se asignará en el componente padre
      tipo: this.gastoForm.tipo,
      descripcion: this.gastoForm.descripcion,
      monto: this.gastoForm.monto,
      fechaGasto: new Date().toISOString(),
      registradoPor: 'admin', // TODO: Usuario actual
    };

    this.gastoRegistrado.emit(gasto);

    // Limpiar formulario después de emitir
    this.gastoForm = {
      tipo: 'gasolina',
      descripcion: '',
      monto: 0,
    };
  }

  /**
   * Emite el evento para eliminar un gasto
   */
  onEliminarGasto(index: number): void {
    if (confirm('¿Está seguro de eliminar este gasto?')) {
      this.gastoEliminado.emit(index);
    }
  }

  /**
   * Calcula el total de gastos
   */
  getTotalGastos(): number {
    return this.gastosOperativos.reduce((sum, g) => sum + g.monto, 0);
  }
}
