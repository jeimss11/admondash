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

export interface PaymentCancellationData {
  factura: FacturaPendiente;
  index: number;
  reason: string;
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
  @Output() cancelarPago = new EventEmitter<PaymentCancellationData>();
  @Output() confirmarAbono = new EventEmitter<AbonoData>();
  @Output() registrarPendiente = new EventEmitter<FacturaPendiente>();

  @ViewChild('modalAbono', { static: false }) modalAbono!: ElementRef;
  @ViewChild('modalCancelarPago', { static: false }) modalCancelarPago!: ElementRef;
  @ViewChild('modalVistaPrevia', { static: false }) modalVistaPrevia!: ElementRef;

  // Modal state
  facturaAbono: FacturaPendiente | null = null;
  montoAbono: number = 0;
  private modalAbonoInstance: any;
  facturaCancelar: FacturaPendiente | null = null;
  indiceFacturaCancelar = -1;
  motivoCancelacion = '';
  private modalCancelarPagoInstance: any;
  private modalVistaPreviaInstance: any;
  facturaVistaPrevia: FacturaPendiente | null = null;
  terminoBusqueda = '';

  ngAfterViewInit(): void {
    // Bootstrap modal se inicializa cuando se necesita
  }

  ngOnDestroy(): void {
    // Limpiar modal Bootstrap si existe
    if (this.modalAbonoInstance) {
      this.modalAbonoInstance.dispose();
    }
    if (this.modalCancelarPagoInstance) {
      this.modalCancelarPagoInstance.dispose();
    }
    if (this.modalVistaPreviaInstance) {
      this.modalVistaPreviaInstance.dispose();
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

  abrirModalCancelarPago(factura: FacturaPendiente, index: number): void {
    this.facturaCancelar = factura;
    this.indiceFacturaCancelar = index;
    this.motivoCancelacion = '';
    if (this.modalCancelarPago?.nativeElement) {
      if (!this.modalCancelarPagoInstance) {
        this.modalCancelarPagoInstance = new (window as any).bootstrap.Modal(this.modalCancelarPago.nativeElement);
      }
      this.modalCancelarPagoInstance.show();
    }
  }

  onRegistrarPendiente(factura: FacturaPendiente): void {
    this.registrarPendiente.emit(factura);
  }

  abrirVistaPrevia(factura: FacturaPendiente): void {
    this.facturaVistaPrevia = factura;
    if (this.modalVistaPrevia?.nativeElement) {
      if (!this.modalVistaPreviaInstance) {
        this.modalVistaPreviaInstance = new (window as any).bootstrap.Modal(
          this.modalVistaPrevia.nativeElement
        );
      }
      this.modalVistaPreviaInstance.show();
    }
  }

  get facturasVisibles(): FacturaPendiente[] {
    const term = this.terminoBusqueda.trim().toLocaleLowerCase();
    if (!term) return this.facturasPendientes;
    return this.facturasPendientes.filter((factura) =>
      [
        factura.cliente,
        factura.numeroFactura,
        this.getConsecutivoFactura(factura.numeroFactura),
        this.getOrigenFactura(factura),
        this.getEstadoVisible(factura),
      ]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase().includes(term))
    );
  }

  /** El móvil suele generar prefijo-consecutivo; para buscar basta el consecutivo. */
  getConsecutivoFactura(numeroFactura: string): string {
    const separator = numeroFactura.lastIndexOf('-');
    return separator >= 0 ? numeroFactura.slice(separator + 1).trim() : numeroFactura;
  }

  onCancelarPago(): void {
    if (!this.facturaCancelar || this.motivoCancelacion.trim().length < 10) return;
    this.cancelarPago.emit({
      factura: this.facturaCancelar,
      index: this.indiceFacturaCancelar,
      reason: this.motivoCancelacion,
    });
    this.modalCancelarPagoInstance?.hide();
    this.facturaCancelar = null;
    this.indiceFacturaCancelar = -1;
    this.motivoCancelacion = '';
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

  getOrigenFactura(factura: FacturaPendiente): 'Móvil' | 'Escritorio' {
    return factura.isFacturaLocal === false ? 'Móvil' : 'Escritorio';
  }

  getEstadoVisible(factura: FacturaPendiente): string {
    if (factura.estadoPagoMovilObservado === 'sin-confirmar') return 'Sin confirmar';
    if (factura.estadoPagoMovilObservado === 'pagada') return 'Pagada móvil';
    return factura.estado === 'parcial' ? 'Pago parcial' : factura.estado;
  }
}
