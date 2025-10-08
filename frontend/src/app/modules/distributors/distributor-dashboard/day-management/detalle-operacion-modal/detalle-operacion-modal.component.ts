import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import {
  FacturaPendiente,
  GastoOperativo,
  OperacionDiaria,
  ProductoCargado,
  ProductoNoRetornado,
  ProductoRetornado,
  ResumenDiario,
} from '../../../models/distributor.models';
import { DistributorsService } from '../../../services/distributors.service';

@Component({
  selector: 'app-detalle-operacion-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detalle-operacion-modal.component.html',
  styleUrls: ['./detalle-operacion-modal.component.scss'],
})
export class DetalleOperacionModalComponent implements OnInit {
  @Input() operacion!: OperacionDiaria;
  @ViewChild('modal') modal!: ElementRef;

  isLoading = false;
  productosCargados: ProductoCargado[] = [];
  productosNoRetornados: ProductoNoRetornado[] = [];
  productosRetornados: ProductoRetornado[] = [];
  gastosOperativos: GastoOperativo[] = [];
  facturasPendientes: FacturaPendiente[] = [];
  resumenDiario: ResumenDiario | null = null;
  modalInstance: any = null;

  activeTab: 'productos' | 'gastos' | 'facturas' | 'resumen' = 'resumen';

  constructor(private distributorsService: DistributorsService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {}

  async abrirModal(operacion: OperacionDiaria): Promise<void> {
    this.operacion = operacion;
    this.isLoading = true;
    this.activeTab = 'resumen';

    try {
      await this.cargarDatosOperacion();
      this.inicializarModal();
    } catch (error) {
      console.error('Error al cargar datos de la operación:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  cerrarModal(): void {
    if (this.modalInstance) {
      this.modalInstance.hide();
    }
  }

  private inicializarModal(): void {
    if (this.modal?.nativeElement) {
      if (!this.modalInstance) {
        this.modalInstance = new (window as any).bootstrap.Modal(this.modal.nativeElement);
      }
      this.modalInstance.show();
    }
  }

  async cargarDatosOperacion(): Promise<void> {
    if (!this.operacion?.id) return;

    try {
      // Cargar todos los datos en paralelo para mayor eficiencia
      const [
        productosCargados,
        productosNoRetornados,
        productosRetornados,
        gastosOperativos,
        facturasPendientes,
        resumenDiario,
      ] = await Promise.all([
        this.distributorsService.getProductosCargados(this.operacion.id),
        this.distributorsService.getProductosNoRetornados(this.operacion.id),
        this.distributorsService.getProductosRetornados(this.operacion.id),
        this.distributorsService.getGastosOperativos(this.operacion.id),
        this.distributorsService.getFacturasPendientes(this.operacion.id),
        this.distributorsService.obtenerResumenDiario(
          this.operacion.distribuidorId,
          this.operacion.fecha
        ),
      ]);

      this.productosCargados = productosCargados;
      this.productosNoRetornados = productosNoRetornados;
      this.productosRetornados = productosRetornados;
      this.gastosOperativos = gastosOperativos;
      this.facturasPendientes = facturasPendientes;
      this.resumenDiario = resumenDiario;

      // Forzar detección de cambios para actualizar la UI
      this.cdr.detectChanges();

      console.log('Datos cargados correctamente:', {
        productosCargados: productosCargados.length,
        productosNoRetornados: productosNoRetornados.length,
        productosRetornados: productosRetornados.length,
        gastosOperativos: gastosOperativos.length,
        facturasPendientes: facturasPendientes.length,
        resumenDiario: !!resumenDiario,
      });
    } catch (error) {
      console.error('Error cargando datos de la operación:', error);
      throw error;
    }
  }

  setActiveTab(tab: 'productos' | 'gastos' | 'facturas' | 'resumen'): void {
    this.activeTab = tab;
    this.cdr.detectChanges();
  }

  // Métodos para cálculos y totales
  getTotalProductosCargados(): number {
    return this.productosCargados.reduce((sum, p) => sum + p.total, 0);
  }

  getCantidadProductosCargados(): number {
    return this.productosCargados.reduce((sum, p) => sum + p.cantidad, 0);
  }

  getTotalPerdidas(): number {
    return this.productosNoRetornados.reduce((sum, p) => sum + p.totalPerdida, 0);
  }

  getCantidadProductosNoRetornados(): number {
    return this.productosNoRetornados.reduce((sum, p) => sum + p.cantidad, 0);
  }

  getTotalProductosRetornados(): number {
    return this.productosRetornados.reduce((sum, p) => sum + (p.totalValor || 0), 0);
  }

  getCantidadProductosRetornados(): number {
    return this.productosRetornados.reduce((sum, p) => sum + p.cantidad, 0);
  }

  getTotalVentas(): number {
    return this.getTotalProductosCargados() - this.getTotalProductosRetornados();
  }

  getTotalGastos(): number {
    return this.gastosOperativos.reduce((sum, g) => sum + g.monto, 0);
  }

  getTotalFacturasPagas(): number {
    return this.facturasPendientes
      .filter((f) => f.estado === 'pagada' || f.estado === 'parcial')
      .reduce((total, f) => total + (f.montoPagado || 0), 0);
  }

  getDineroEsperado(): number {
    if (!this.operacion) return 0;
    return (
      this.operacion.montoInicial +
      this.getTotalVentas() -
      this.getTotalPerdidas() -
      this.getTotalGastos() +
      this.getTotalFacturasPagas()
    );
  }

  getDiferenciaDinero(): number {
    if (!this.resumenDiario || !this.resumenDiario.dineroEntregado) return 0;
    return this.resumenDiario.dineroEntregado - this.getDineroEsperado();
  }
}
