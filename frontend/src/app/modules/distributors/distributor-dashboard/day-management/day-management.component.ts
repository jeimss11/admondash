import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  AjusteDinero,
  AlertaSistema,
  AperturaDia,
  CierreDia,
  EstadisticasDia,
  HistorialDia,
  ProductoCaducado,
  ProductoDefectuoso,
} from '../../models/distributor.models';
import { DistributorsService } from '../../services/distributors.service';

@Component({
  selector: 'app-day-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './day-management.component.html',
  styleUrls: ['./day-management.component.scss'],
})
export class DayManagementComponent implements OnInit {
  @Input() distribuidorId: string = '';
  @Input() distribuidorNombre: string = '';
  @Output() dayClosed = new EventEmitter<CierreDia>();

  // Estados del componente
  isLoading = false;
  activeSection: 'apertura' | 'gestion' | 'cierre' | 'historial' = 'apertura';

  // Datos del día actual
  diaActual: HistorialDia | null = null;
  aperturaActual: AperturaDia | null = null;
  cierreActual: CierreDia | null = null;

  // Formularios
  aperturaForm = {
    montoInicial: 0,
    observaciones: '',
    productosIniciales: [] as any[],
  };

  cierreForm = {
    dineroEntregado: 0,
    observaciones: '',
    productosDefectuosos: [] as ProductoDefectuoso[],
    productosCaducados: [] as ProductoCaducado[],
    ajustes: [] as AjusteDinero[],
  };

  // Formularios para productos especiales
  productoDefectuosoForm = {
    productoId: '',
    cantidad: 1,
    motivo: 'defectuoso',
    descripcion: '',
    costoUnitario: 0,
  };

  productoCaducadoForm = {
    productoId: '',
    cantidad: 1,
    fechaCaducidad: '',
    lote: '',
    costoUnitario: 0,
  };

  ajusteForm = {
    tipo: 'ingreso' as 'ingreso' | 'egreso',
    monto: 0,
    motivo: '',
    descripcion: '',
  };

  // Listas de productos disponibles
  productosDisponibles: any[] = [];

  // Estadísticas calculadas
  estadisticasDia: EstadisticasDia | null = null;

  // Alertas del sistema
  alertas: AlertaSistema[] = [];

  // Historial
  historialDias: HistorialDia[] = [];

  private subscriptions: Subscription[] = [];

  constructor(private distributorsService: DistributorsService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    console.log('🚀 DayManagementComponent inicializado');
    console.log('📥 Props recibidas:', {
      distribuidorId: this.distribuidorId,
      distribuidorNombre: this.distribuidorNombre,
    });

    this.cargarProductosDisponibles();
    this.verificarEstadoDiaActual();
    this.cargarHistorial();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  // === MÉTODOS PRINCIPALES ===

  private async verificarEstadoDiaActual(): Promise<void> {
    try {
      const fechaHoy = new Date().toISOString().split('T')[0];
      const estadoDia = await this.distributorsService.getEstadoDia(this.distribuidorId, fechaHoy);

      if (estadoDia) {
        this.diaActual = estadoDia;
        this.aperturaActual = estadoDia.apertura || null;
        this.cierreActual = estadoDia.cierre || null;

        // Determinar sección activa basada en el estado
        if (estadoDia.estado === 'abierto') {
          this.activeSection = 'gestion';
        } else if (estadoDia.estado === 'cerrado') {
          this.activeSection = 'historial';
        } else {
          this.activeSection = 'apertura';
        }

        this.calcularEstadisticasDia();
      } else {
        this.activeSection = 'apertura';
      }
    } catch (error) {
      console.error('❌ Error verificando estado del día:', error);
      this.activeSection = 'apertura';
    }
  }

  private async cargarProductosDisponibles(): Promise<void> {
    try {
      this.productosDisponibles = await this.distributorsService.getProductosDisponibles();
    } catch (error) {
      console.error('❌ Error cargando productos:', error);
      this.productosDisponibles = [];
    }
  }

  private async cargarHistorial(): Promise<void> {
    try {
      this.historialDias = await this.distributorsService.getHistorialDias(this.distribuidorId, 30); // Últimos 30 días
    } catch (error) {
      console.error('❌ Error cargando historial:', error);
      this.historialDias = [];
    }
  }

  // === APERTURA DEL DÍA ===

  async abrirDia(): Promise<void> {
    if (!this.aperturaForm.montoInicial || this.aperturaForm.montoInicial <= 0) {
      alert('Debe ingresar un monto inicial válido');
      return;
    }

    this.isLoading = true;
    try {
      const fechaHoy = new Date().toISOString().split('T')[0];
      const horaActual = new Date().toTimeString().split(' ')[0];

      const apertura: AperturaDia = {
        distribuidorId: this.distribuidorId,
        fecha: fechaHoy,
        horaApertura: horaActual,
        montoInicial: this.aperturaForm.montoInicial!,
        productosIniciales: this.aperturaForm.productosIniciales || [],
        observaciones: this.aperturaForm.observaciones,
        estado: 'abierto',
        creadoPor: 'admin', // TODO: Obtener del usuario actual
        fechaCreacion: new Date().toISOString(),
      };

      await this.distributorsService.abrirDia(apertura);

      // Actualizar estado local
      this.aperturaActual = apertura;
      this.diaActual = {
        distribuidorId: this.distribuidorId,
        fecha: fechaHoy,
        apertura: apertura,
        estado: 'abierto',
        resumen: {
          ventasTotales: 0,
          productosVendidos: 0,
          productosDefectuosos: 0,
          productosCaducados: 0,
          diferenciaDinero: 0,
        },
      };

      this.activeSection = 'gestion';
      alert('Día abierto correctamente');
    } catch (error) {
      console.error('❌ Error abriendo día:', error);
      alert('Error al abrir el día. Intente nuevamente.');
    } finally {
      this.isLoading = false;
    }
  }

  // === GESTIÓN DEL DÍA ===

  agregarProductoDefectuoso(): void {
    if (!this.productoDefectuosoForm.productoId || !this.productoDefectuosoForm.cantidad) {
      alert('Complete todos los campos requeridos');
      return;
    }

    const producto = this.productosDisponibles.find(
      (p) => p.id === this.productoDefectuosoForm.productoId
    );
    if (!producto) return;

    const defectuoso: ProductoDefectuoso = {
      productoId: this.productoDefectuosoForm.productoId!,
      nombre: producto.name,
      cantidad: this.productoDefectuosoForm.cantidad!,
      motivo: this.productoDefectuosoForm.motivo! as 'defectuoso' | 'dañado' | 'otro',
      descripcion: this.productoDefectuosoForm.descripcion,
      costoUnitario: this.productoDefectuosoForm.costoUnitario!,
      costoTotal:
        this.productoDefectuosoForm.cantidad! * this.productoDefectuosoForm.costoUnitario!,
      fechaRegistro: new Date().toISOString(),
      registradoPor: 'admin', // TODO: Usuario actual
    };

    if (!this.cierreForm.productosDefectuosos) {
      this.cierreForm.productosDefectuosos = [];
    }
    this.cierreForm.productosDefectuosos!.push(defectuoso);

    // Limpiar formulario
    this.productoDefectuosoForm = {
      productoId: '',
      cantidad: 1,
      motivo: 'defectuoso',
      descripcion: '',
      costoUnitario: 0,
    };

    this.calcularEstadisticasDia();
  }

  agregarProductoCaducado(): void {
    if (
      !this.productoCaducadoForm.productoId ||
      !this.productoCaducadoForm.cantidad ||
      !this.productoCaducadoForm.fechaCaducidad
    ) {
      alert('Complete todos los campos requeridos');
      return;
    }

    const producto = this.productosDisponibles.find(
      (p) => p.id === this.productoCaducadoForm.productoId
    );
    if (!producto) return;

    const caducado: ProductoCaducado = {
      productoId: this.productoCaducadoForm.productoId!,
      nombre: producto.name,
      cantidad: this.productoCaducadoForm.cantidad!,
      fechaCaducidad: this.productoCaducadoForm.fechaCaducidad!,
      lote: this.productoCaducadoForm.lote,
      costoUnitario: this.productoCaducadoForm.costoUnitario!,
      costoTotal: this.productoCaducadoForm.cantidad! * this.productoCaducadoForm.costoUnitario!,
      fechaRegistro: new Date().toISOString(),
      registradoPor: 'admin',
    };

    if (!this.cierreForm.productosCaducados) {
      this.cierreForm.productosCaducados = [];
    }
    this.cierreForm.productosCaducados!.push(caducado);

    // Limpiar formulario
    this.productoCaducadoForm = {
      productoId: '',
      cantidad: 1,
      fechaCaducidad: '',
      lote: '',
      costoUnitario: 0,
    };

    this.calcularEstadisticasDia();
  }

  agregarAjuste(): void {
    if (!this.ajusteForm.monto || !this.ajusteForm.motivo) {
      alert('Complete todos los campos requeridos');
      return;
    }

    const ajuste: AjusteDinero = {
      tipo: this.ajusteForm.tipo!,
      monto: this.ajusteForm.monto!,
      motivo: this.ajusteForm.motivo!,
      descripcion: this.ajusteForm.descripcion,
      fechaRegistro: new Date().toISOString(),
      registradoPor: 'admin',
    };

    if (!this.cierreForm.ajustes) {
      this.cierreForm.ajustes = [];
    }
    this.cierreForm.ajustes!.push(ajuste);

    // Limpiar formulario
    this.ajusteForm = {
      tipo: 'ingreso' as 'ingreso' | 'egreso',
      monto: 0,
      motivo: '',
      descripcion: '',
    };

    this.calcularEstadisticasDia();
  }

  // === CIERRE DEL DÍA ===

  async cerrarDia(): Promise<void> {
    if (!this.cierreForm.dineroEntregado) {
      alert('Debe ingresar el dinero entregado');
      return;
    }

    if (!confirm('¿Está seguro de cerrar el día? Esta acción no se puede deshacer.')) {
      return;
    }

    this.isLoading = true;
    try {
      const fechaHoy = new Date().toISOString().split('T')[0];
      const horaActual = new Date().toTimeString().split(' ')[0];

      // Calcular estadísticas finales
      const estadisticas = await this.distributorsService.calcularEstadisticasDia(
        this.distribuidorId,
        fechaHoy
      );

      const cierre: CierreDia = {
        distribuidorId: this.distribuidorId,
        fecha: fechaHoy,
        horaCierre: horaActual,
        montoInicial: this.aperturaActual?.montoInicial || 0,
        ventasTotales: estadisticas.ventasTotales,
        dineroEntregado: this.cierreForm.dineroEntregado!,
        diferencia:
          this.cierreForm.dineroEntregado! -
          (this.aperturaActual?.montoInicial || 0) -
          estadisticas.ventasTotales,
        productosVendidos: estadisticas.productosVendidos,
        productosDefectuosos: this.cierreForm.productosDefectuosos || [],
        productosCaducados: this.cierreForm.productosCaducados || [],
        ajustes: this.cierreForm.ajustes || [],
        observaciones: this.cierreForm.observaciones,
        estado: 'completado',
        creadoPor: 'admin',
        fechaCreacion: new Date().toISOString(),
      };

      await this.distributorsService.cerrarDia(cierre);

      // Actualizar estado local
      this.cierreActual = cierre;
      if (this.diaActual) {
        this.diaActual.cierre = cierre;
        this.diaActual.estado = 'cerrado';
        this.diaActual.resumen = {
          ventasTotales: estadisticas.ventasTotales,
          productosVendidos: estadisticas.productosVendidos.length,
          productosDefectuosos: cierre.productosDefectuosos.length,
          productosCaducados: cierre.productosCaducados.length,
          diferenciaDinero: cierre.diferencia,
          observaciones: cierre.observaciones,
        };
      }

      this.activeSection = 'historial';
      this.dayClosed.emit(cierre);

      alert('Día cerrado correctamente');
    } catch (error) {
      console.error('❌ Error cerrando día:', error);
      alert('Error al cerrar el día. Intente nuevamente.');
    } finally {
      this.isLoading = false;
    }
  }

  // === ESTADÍSTICAS Y CÁLCULOS ===

  private async calcularEstadisticasDia(): Promise<void> {
    if (!this.distribuidorId) return;

    try {
      const fechaHoy = new Date().toISOString().split('T')[0];
      this.estadisticasDia = await this.distributorsService.calcularEstadisticasDia(
        this.distribuidorId,
        fechaHoy
      );

      // Generar alertas si hay diferencias
      this.generarAlertas();
    } catch (error) {
      console.error('❌ Error calculando estadísticas:', error);
    }
  }

  private generarAlertas(): void {
    this.alertas = [];

    if (!this.estadisticasDia) return;

    // Alerta por diferencia de dinero
    if (Math.abs(this.estadisticasDia.diferencia) > 1000) {
      this.alertas.push({
        tipo: 'diferencia_dinero',
        prioridad: Math.abs(this.estadisticasDia.diferencia) > 5000 ? 'critica' : 'alta',
        distribuidorId: this.distribuidorId,
        fecha: new Date().toISOString().split('T')[0],
        mensaje: `Diferencia de dinero detectada: ${this.estadisticasDia.diferencia.toLocaleString()} COP`,
        valorEsperado: this.estadisticasDia.dineroInicial + this.estadisticasDia.ventasTotales,
        valorReal: this.estadisticasDia.dineroFinal,
        diferencia: this.estadisticasDia.diferencia,
        estado: 'activa',
        fechaCreacion: new Date().toISOString(),
      });
    }

    // Alerta por productos defectuosos
    if (this.estadisticasDia.productosDefectuosos > 0) {
      this.alertas.push({
        tipo: 'productos_defectuosos',
        prioridad: 'media',
        distribuidorId: this.distribuidorId,
        fecha: new Date().toISOString().split('T')[0],
        mensaje: `${this.estadisticasDia.productosDefectuosos} productos registrados como defectuosos`,
        estado: 'activa',
        fechaCreacion: new Date().toISOString(),
      });
    }

    // Alerta por productos caducados
    if (this.estadisticasDia.productosCaducados > 0) {
      this.alertas.push({
        tipo: 'productos_caducados',
        prioridad: 'media',
        distribuidorId: this.distribuidorId,
        fecha: new Date().toISOString().split('T')[0],
        mensaje: `${this.estadisticasDia.productosCaducados} productos registrados como caducados`,
        estado: 'activa',
        fechaCreacion: new Date().toISOString(),
      });
    }
  }

  // === UTILIDADES ===

  setActiveSection(section: 'apertura' | 'gestion' | 'cierre' | 'historial'): void {
    this.activeSection = section;
  }

  getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  getStatusClass(estado: string): string {
    switch (estado) {
      case 'abierto':
        return 'alert-success';
      case 'cerrado':
        return 'alert-info';
      case 'pendiente_cierre':
        return 'alert-warning';
      default:
        return 'alert-secondary';
    }
  }

  getStatusText(estado: string): string {
    switch (estado) {
      case 'abierto':
        return 'Abierto';
      case 'cerrado':
        return 'Cerrado';
      case 'pendiente_cierre':
        return 'Pendiente de Cierre';
      default:
        return 'Sin Estado';
    }
  }

  getStatusIcon(estado: string): string {
    switch (estado) {
      case 'abierto':
        return 'fas fa-door-open';
      case 'cerrado':
        return 'fas fa-door-closed';
      case 'pendiente_cierre':
        return 'fas fa-clock';
      default:
        return 'fas fa-question';
    }
  }

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

  getTotalProductosDefectuosos(): number {
    return this.cierreForm.productosDefectuosos?.reduce((sum, p) => sum + p.costoTotal, 0) || 0;
  }

  getTotalProductosCaducados(): number {
    return this.cierreForm.productosCaducados?.reduce((sum, p) => sum + p.costoTotal, 0) || 0;
  }

  getTotalAjustes(): number {
    if (!this.cierreForm.ajustes) return 0;

    return this.cierreForm.ajustes.reduce((sum, ajuste) => {
      return sum + (ajuste.tipo === 'ingreso' ? ajuste.monto : -ajuste.monto);
    }, 0);
  }

  getDiferenciaEsperada(): number {
    if (!this.aperturaActual || !this.estadisticasDia) return 0;

    return (
      this.aperturaActual.montoInicial +
      this.estadisticasDia.ventasTotales -
      this.getTotalProductosDefectuosos() -
      this.getTotalProductosCaducados() +
      this.getTotalAjustes()
    );
  }

  getDiferenciaReal(): number {
    if (!this.cierreForm.dineroEntregado || !this.getDiferenciaEsperada()) return 0;

    return this.cierreForm.dineroEntregado - this.getDiferenciaEsperada();
  }

  // Remover items de listas
  removeProductoDefectuoso(index: number): void {
    if (this.cierreForm.productosDefectuosos) {
      this.cierreForm.productosDefectuosos.splice(index, 1);
      this.calcularEstadisticasDia();
    }
  }

  removeProductoCaducado(index: number): void {
    if (this.cierreForm.productosCaducados) {
      this.cierreForm.productosCaducados.splice(index, 1);
      this.calcularEstadisticasDia();
    }
  }

  removeAjuste(index: number): void {
    if (this.cierreForm.ajustes) {
      this.cierreForm.ajustes.splice(index, 1);
      this.calcularEstadisticasDia();
    }
  }

  // Método para ver detalle de día (placeholder)
  verDetalleDia(dia: any): void {
    console.log('Ver detalle del día:', dia);
    // TODO: Implementar modal de detalle
    alert('Funcionalidad de detalle próximamente disponible');
  }
}
