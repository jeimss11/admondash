import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FacturaPendiente } from '../../../../models/distributor.models';

export interface FacturaFormData {
  cliente: string;
  numeroFactura: string;
  monto: number;
  fechaVencimiento: string;
  observaciones: string;
}

export interface AbonoData {
  factura: FacturaPendiente;
  montoAbono: number;
}

@Component({
  selector: 'app-gestion-facturas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './gestion-facturas.component.html',
  styleUrls: ['./gestion-facturas.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GestionFacturasComponent implements AfterViewInit, OnDestroy {
  @Input() facturasPendientes: FacturaPendiente[] = [];

  // Form data passed from parent (two-way binding)
  @Input() cliente: string = '';
  @Input() numeroFactura: string = '';
  @Input() monto: number = 0;
  @Input() fechaVencimiento: string = '';
  @Input() observaciones: string = '';

  @Output() clienteChange = new EventEmitter<string>();
  @Output() numeroFacturaChange = new EventEmitter<string>();
  @Output() montoChange = new EventEmitter<number>();
  @Output() fechaVencimientoChange = new EventEmitter<string>();
  @Output() observacionesChange = new EventEmitter<string>();

  @Output() crearFactura = new EventEmitter<FacturaFormData>();
  @Output() marcarPagada = new EventEmitter<{ factura: FacturaPendiente; index: number }>();
  @Output() cancelarPago = new EventEmitter<{ factura: FacturaPendiente; index: number }>();
  @Output() confirmarAbono = new EventEmitter<AbonoData>();

  @ViewChild('modalAbono', { static: false }) modalAbono!: ElementRef;

  // Modal state
  facturaAbono: FacturaPendiente | null = null;
  montoAbono: number = 0;
  private modalAbonoInstance: any;

  ngAfterViewInit(): void {
    // Bootstrap modal se inicializa cuando se necesita
  }

  ngOnDestroy(): void {
    // Limpiar modal Bootstrap si existe
    if (this.modalAbonoInstance) {
      this.modalAbonoInstance.dispose();
    }
  }

  onClienteChange(value: string): void {
    this.clienteChange.emit(value);
  }

  onNumeroFacturaChange(value: string): void {
    this.numeroFacturaChange.emit(value);
  }

  onMontoChange(value: number): void {
    this.montoChange.emit(value);
  }

  onFechaVencimientoChange(value: string): void {
    this.fechaVencimientoChange.emit(value);
  }

  onObservacionesChange(value: string): void {
    this.observacionesChange.emit(value);
  }

  onCrearFactura(): void {
    this.crearFactura.emit({
      cliente: this.cliente,
      numeroFactura: this.numeroFactura,
      monto: this.monto,
      fechaVencimiento: this.fechaVencimiento,
      observaciones: this.observaciones,
    });
  }

  onMarcarPagada(factura: FacturaPendiente, index: number): void {
    this.marcarPagada.emit({ factura, index });
  }

  onCancelarPago(factura: FacturaPendiente, index: number): void {
    this.cancelarPago.emit({ factura, index });
  }

  abrirModalAbono(factura: FacturaPendiente): void {
    this.facturaAbono = factura;
    this.montoAbono = 0;

    // Inicializar y mostrar el modal usando Bootstrap
    if (this.modalAbono && this.modalAbono.nativeElement) {
      if (!this.modalAbonoInstance) {
        this.modalAbonoInstance = new (window as any).bootstrap.Modal(
          this.modalAbono.nativeElement
        );
      }
      this.modalAbonoInstance.show();
    }
  }

  onConfirmarAbono(): void {
    if (!this.facturaAbono || !this.montoAbono || this.montoAbono <= 0) {
      return;
    }

    this.confirmarAbono.emit({
      factura: this.facturaAbono,
      montoAbono: this.montoAbono,
    });

    // Cerrar modal
    if (this.modalAbonoInstance) {
      this.modalAbonoInstance.hide();
    }

    // Reset
    this.facturaAbono = null;
    this.montoAbono = 0;
  }

  getMontoPendienteFactura(factura: FacturaPendiente | null): number {
    if (!factura) return 0;
    const monto = factura.monto || 0;
    const montoPagado = factura.montoPagado || 0;
    return monto - montoPagado;
  }
}
