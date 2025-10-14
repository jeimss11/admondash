import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface AperturaOperacionData {
  fecha: string;
  montoInicial: number;
  observaciones: string;
}

@Component({
  selector: 'app-apertura-operacion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './apertura-operacion.component.html',
  styleUrls: ['./apertura-operacion.component.scss'],
})
export class AperturaOperacionComponent implements OnInit {
  // Inputs: Datos que recibe del componente padre
  @Input() isLoading: boolean = false;
  @Input() distribuidorNombre: string = '';

  // Outputs: Eventos que emite al componente padre
  @Output() operacionAbierta = new EventEmitter<AperturaOperacionData>();

  // Formulario de apertura
  aperturaForm: AperturaOperacionData = {
    fecha: '',
    montoInicial: 0,
    observaciones: '',
  };

  ngOnInit(): void {
    // Inicializar fecha por defecto con la fecha actual
    this.aperturaForm.fecha = this.getTodayDate();
  }

  /**
   * Emite el evento para abrir la operación
   */
  onAbrirOperacion(): void {
    if (this.aperturaForm.montoInicial === null || this.aperturaForm.montoInicial === undefined) {
      alert('Debe ingresar un monto inicial (puede ser 0)');
      return;
    }

    if (!this.aperturaForm.fecha) {
      alert('Debe seleccionar una fecha para la operación');
      return;
    }

    // Validar que la fecha no sea futura
    const fechaSeleccionada = new Date(this.aperturaForm.fecha);
    const fechaHoy = new Date();
    fechaHoy.setHours(0, 0, 0, 0);

    if (fechaSeleccionada > fechaHoy) {
      alert('No se puede abrir una operación para una fecha futura');
      return;
    }

    // Emitir evento con los datos de la apertura
    this.operacionAbierta.emit({ ...this.aperturaForm });

    // No limpiar el formulario aquí, dejar que el padre lo maneje después de éxito
  }

  /**
   * Limpia el formulario después de una apertura exitosa
   * Este método será llamado desde el componente padre
   */
  limpiarFormulario(): void {
    this.aperturaForm = {
      fecha: this.getTodayDate(),
      montoInicial: 0,
      observaciones: '',
    };
  }

  /**
   * Obtiene la fecha actual en formato YYYY-MM-DD
   */
  getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }
}
