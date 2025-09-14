import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  // Mantener algunos modelos antiguos para compatibilidad
  AlertaSistema,
  EstadisticasOperacion,
  FacturaPendiente,
  GastoOperativo,
  // Nuevos modelos para gestión diaria completa
  OperacionDiaria,
  ProductoCargado,
  ProductoNoRetornado,
  ProductoRetornado,
  ResumenDiario,
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
  @Output() dayClosed = new EventEmitter<ResumenDiario>();

  // Estados del componente
  isLoading = false;
  activeSection: 'apertura' | 'productos' | 'gastos' | 'facturas' | 'cierre' | 'historial' =
    'apertura';

  // Nueva estructura: Operación Diaria
  operacionActual: OperacionDiaria | null = null;
  operacionId: string | null = null;

  // Formularios de apertura
  aperturaForm = {
    montoInicial: 0,
    observaciones: '',
  };

  // Formularios de productos
  productoCargadoForm = {
    productoId: '',
    nombre: '',
    cantidad: 1,
    precioUnitario: 0,
    total: 0,
  };

  productoNoRetornadoForm = {
    productoId: '',
    nombre: '',
    cantidad: 1,
    motivo: 'daño' as 'daño' | 'mal_funcionamiento' | 'cambio' | 'robo' | 'otro',
    descripcion: '',
    costoUnitario: 0,
    totalPerdida: 0,
  };

  productoRetornadoForm = {
    productoId: '',
    nombre: '',
    cantidad: 1,
    estado: 'bueno' as 'bueno' | 'defectuoso' | 'devuelto' | 'dañado',
    observaciones: '',
  };

  // Formularios de gastos
  gastoForm = {
    tipo: 'gasolina' as 'gasolina' | 'alimentacion' | 'transporte' | 'hospedaje' | 'otros',
    descripcion: '',
    monto: 0,
  };

  // Formularios de facturas
  facturaForm = {
    cliente: '',
    numeroFactura: '',
    monto: 0,
    fechaVencimiento: '',
    observaciones: '',
  };

  // Formularios de cierre
  cierreForm = {
    dineroEntregado: 0,
    observaciones: '',
  };

  // Listas de datos
  productosCargados: ProductoCargado[] = [];
  productosNoRetornados: ProductoNoRetornado[] = [];
  productosRetornados: ProductoRetornado[] = [];
  gastosOperativos: GastoOperativo[] = [];
  facturasPendientes: FacturaPendiente[] = [];

  // Listas de productos disponibles
  productosDisponibles: any[] = [];

  // Estadísticas y alertas
  estadisticasOperacion: EstadisticasOperacion | null = null;
  alertas: AlertaSistema[] = [];

  // Historial
  operacionesHistoricas: OperacionDiaria[] = [];

  private subscriptions: Subscription[] = [];

  constructor(private distributorsService: DistributorsService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    console.log('🚀 DayManagementComponent inicializado');
    console.log('📥 Props recibidas:', {
      distribuidorId: this.distribuidorId,
      distribuidorNombre: this.distribuidorNombre,
    });

    this.cargarProductosDisponibles();
    this.verificarOperacionActual();
    this.cargarHistorial();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  // === MÉTODOS PRINCIPALES ===

  private async verificarOperacionActual(): Promise<void> {
    try {
      const operacion = await this.distributorsService.getOperacionActiva(this.distribuidorId);

      if (operacion) {
        this.operacionActual = operacion;
        this.operacionId = operacion.id!;

        // Determinar sección activa basada en el estado
        if (operacion.estado === 'activa') {
          this.activeSection = 'productos';
        } else if (operacion.estado === 'cerrada') {
          this.activeSection = 'historial';
        }

        // Cargar datos de la operación
        await this.cargarDatosOperacion();
        this.calcularEstadisticas();
      } else {
        this.activeSection = 'apertura';
      }
    } catch (error) {
      console.error('❌ Error verificando operación actual:', error);
      this.activeSection = 'apertura';
    }
  }

  private async cargarDatosOperacion(): Promise<void> {
    if (!this.operacionId) return;

    try {
      // Cargar productos cargados
      this.productosCargados = await this.distributorsService.getProductosCargados(
        this.operacionId
      );

      // Cargar productos no retornados
      this.productosNoRetornados = await this.distributorsService.getProductosNoRetornados(
        this.operacionId
      );

      // Cargar productos retornados
      this.productosRetornados = await this.distributorsService.getProductosRetornados(
        this.operacionId
      );

      // Cargar gastos operativos
      this.gastosOperativos = await this.distributorsService.getGastosOperativos(this.operacionId);

      // Cargar facturas pendientes
      this.facturasPendientes = await this.distributorsService.getFacturasPendientes(
        this.operacionId
      );
    } catch (error) {
      console.error('❌ Error cargando datos de operación:', error);
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
      this.operacionesHistoricas = await this.distributorsService.getOperacionesPorDistribuidor(
        this.distribuidorId,
        this.getFechaHace30Dias(),
        this.getTodayDate()
      );
    } catch (error) {
      console.error('❌ Error cargando historial:', error);
      this.operacionesHistoricas = [];
    }
  }

  // === APERTURA DE OPERACIÓN ===

  async abrirOperacion(): Promise<void> {
    if (!this.aperturaForm.montoInicial || this.aperturaForm.montoInicial <= 0) {
      alert('Debe ingresar un monto inicial válido');
      return;
    }

    this.isLoading = true;
    try {
      const operacionId = await this.distributorsService.crearOperacionDiaria({
        uid: 'admin', // TODO: Obtener del usuario actual
        distribuidorId: this.distribuidorId,
        fecha: this.getTodayDate(),
        montoInicial: this.aperturaForm.montoInicial,
        estado: 'activa',
      });

      // Actualizar estado local
      this.operacionId = operacionId;
      this.operacionActual = {
        id: operacionId,
        uid: 'admin',
        distribuidorId: this.distribuidorId,
        fecha: this.getTodayDate(),
        montoInicial: this.aperturaForm.montoInicial,
        estado: 'activa',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.activeSection = 'productos';
      alert('Operación diaria abierta correctamente');
    } catch (error) {
      console.error('❌ Error abriendo operación:', error);
      alert('Error al abrir la operación. Intente nuevamente.');
    } finally {
      this.isLoading = false;
    }
  }

  // === GESTIÓN DE PRODUCTOS ===

  async agregarProductoCargado(): Promise<void> {
    if (
      !this.operacionId ||
      !this.productoCargadoForm.productoId ||
      !this.productoCargadoForm.cantidad
    ) {
      alert('Complete todos los campos requeridos');
      return;
    }

    const producto = this.productosDisponibles.find(
      (p) => p.id === this.productoCargadoForm.productoId
    );
    if (!producto) return;

    this.isLoading = true;
    try {
      const productoCargado: Omit<ProductoCargado, 'id'> = {
        operacionId: this.operacionId!,
        productoId: this.productoCargadoForm.productoId,
        nombre: producto.name,
        cantidad: this.productoCargadoForm.cantidad,
        precioUnitario: this.productoCargadoForm.precioUnitario,
        total: this.productoCargadoForm.cantidad * this.productoCargadoForm.precioUnitario,
        fechaCarga: new Date().toISOString(),
        cargadoPor: 'admin', // TODO: Usuario actual
      };

      await this.distributorsService.agregarProductoCargado(this.operacionId, productoCargado);

      // Recargar productos cargados
      this.productosCargados = await this.distributorsService.getProductosCargados(
        this.operacionId
      );

      // Limpiar formulario
      this.productoCargadoForm = {
        productoId: '',
        nombre: '',
        cantidad: 1,
        precioUnitario: 0,
        total: 0,
      };

      this.calcularEstadisticas();
    } catch (error) {
      console.error('❌ Error agregando producto cargado:', error);
      alert('Error al agregar producto cargado');
    } finally {
      this.isLoading = false;
    }
  }

  async registrarProductoNoRetornado(): Promise<void> {
    if (
      !this.operacionId ||
      !this.productoNoRetornadoForm.productoId ||
      !this.productoNoRetornadoForm.cantidad
    ) {
      alert('Complete todos los campos requeridos');
      return;
    }

    const producto = this.productosDisponibles.find(
      (p) => p.id === this.productoNoRetornadoForm.productoId
    );
    if (!producto) return;

    this.isLoading = true;
    try {
      const productoNoRetornado: Omit<ProductoNoRetornado, 'id'> = {
        operacionId: this.operacionId!,
        productoId: this.productoNoRetornadoForm.productoId,
        nombre: producto.name,
        cantidad: this.productoNoRetornadoForm.cantidad,
        motivo: this.productoNoRetornadoForm.motivo,
        descripcion: this.productoNoRetornadoForm.descripcion,
        costoUnitario: this.productoNoRetornadoForm.costoUnitario,
        totalPerdida:
          this.productoNoRetornadoForm.cantidad * this.productoNoRetornadoForm.costoUnitario,
        fechaRegistro: new Date().toISOString(),
        registradoPor: 'admin',
      };

      await this.distributorsService.registrarProductoNoRetornado(
        this.operacionId,
        productoNoRetornado
      );

      // Recargar productos no retornados
      this.productosNoRetornados = await this.distributorsService.getProductosNoRetornados(
        this.operacionId
      );

      // Limpiar formulario
      this.productoNoRetornadoForm = {
        productoId: '',
        nombre: '',
        cantidad: 1,
        motivo: 'daño',
        descripcion: '',
        costoUnitario: 0,
        totalPerdida: 0,
      };

      this.calcularEstadisticas();
    } catch (error) {
      console.error('❌ Error registrando producto no retornado:', error);
      alert('Error al registrar producto no retornado');
    } finally {
      this.isLoading = false;
    }
  }

  async registrarProductoRetornado(): Promise<void> {
    if (
      !this.operacionId ||
      !this.productoRetornadoForm.productoId ||
      !this.productoRetornadoForm.cantidad
    ) {
      alert('Complete todos los campos requeridos');
      return;
    }

    const producto = this.productosDisponibles.find(
      (p) => p.id === this.productoRetornadoForm.productoId
    );
    if (!producto) return;

    this.isLoading = true;
    try {
      const productoRetornado: Omit<ProductoRetornado, 'id'> = {
        operacionId: this.operacionId!,
        productoId: this.productoRetornadoForm.productoId,
        nombre: producto.name,
        cantidad: this.productoRetornadoForm.cantidad,
        estado: this.productoRetornadoForm.estado,
        observaciones: this.productoRetornadoForm.observaciones,
        fechaRegistro: new Date().toISOString(),
        registradoPor: 'admin',
      };

      await this.distributorsService.registrarProductoRetornado(
        this.operacionId,
        productoRetornado
      );

      // Recargar productos retornados
      this.productosRetornados = await this.distributorsService.getProductosRetornados(
        this.operacionId
      );

      // Limpiar formulario
      this.productoRetornadoForm = {
        productoId: '',
        nombre: '',
        cantidad: 1,
        estado: 'bueno',
        observaciones: '',
      };

      this.calcularEstadisticas();
    } catch (error) {
      console.error('❌ Error registrando producto retornado:', error);
      alert('Error al registrar producto retornado');
    } finally {
      this.isLoading = false;
    }
  }

  // === GESTIÓN DE GASTOS ===

  async registrarGastoOperativo(): Promise<void> {
    if (!this.operacionId || !this.gastoForm.monto || !this.gastoForm.descripcion) {
      alert('Complete todos los campos requeridos');
      return;
    }

    this.isLoading = true;
    try {
      const gasto: Omit<GastoOperativo, 'id'> = {
        operacionId: this.operacionId!,
        tipo: this.gastoForm.tipo,
        descripcion: this.gastoForm.descripcion,
        monto: this.gastoForm.monto,
        fechaGasto: new Date().toISOString(),
        registradoPor: 'admin',
      };

      await this.distributorsService.registrarGastoOperativo(this.operacionId, gasto);

      // Recargar gastos operativos
      this.gastosOperativos = await this.distributorsService.getGastosOperativos(this.operacionId);

      // Limpiar formulario
      this.gastoForm = {
        tipo: 'gasolina',
        descripcion: '',
        monto: 0,
      };

      this.calcularEstadisticas();
    } catch (error) {
      console.error('❌ Error registrando gasto operativo:', error);
      alert('Error al registrar gasto operativo');
    } finally {
      this.isLoading = false;
    }
  }

  // === GESTIÓN DE FACTURAS ===

  async crearFacturaPendiente(): Promise<void> {
    if (
      !this.operacionId ||
      !this.facturaForm.cliente ||
      !this.facturaForm.monto ||
      !this.facturaForm.fechaVencimiento
    ) {
      alert('Complete todos los campos requeridos');
      return;
    }

    this.isLoading = true;
    try {
      const factura: Omit<FacturaPendiente, 'id'> = {
        operacionId: this.operacionId!,
        cliente: this.facturaForm.cliente,
        numeroFactura: this.facturaForm.numeroFactura,
        monto: this.facturaForm.monto,
        fechaVencimiento: this.facturaForm.fechaVencimiento,
        estado: 'pendiente',
        observaciones: this.facturaForm.observaciones,
        fechaRegistro: new Date().toISOString(),
        registradoPor: 'admin',
      };

      await this.distributorsService.crearFacturaPendiente(this.operacionId, factura);

      // Recargar facturas pendientes
      this.facturasPendientes = await this.distributorsService.getFacturasPendientes(
        this.operacionId
      );

      // Limpiar formulario
      this.facturaForm = {
        cliente: '',
        numeroFactura: '',
        monto: 0,
        fechaVencimiento: '',
        observaciones: '',
      };

      this.calcularEstadisticas();
    } catch (error) {
      console.error('❌ Error creando factura pendiente:', error);
      alert('Error al crear factura pendiente');
    } finally {
      this.isLoading = false;
    }
  }

  // === CIERRE DE OPERACIÓN ===

  async cerrarOperacion(): Promise<void> {
    if (!this.operacionId || !this.cierreForm.dineroEntregado) {
      alert('Debe ingresar el dinero entregado');
      return;
    }

    if (!confirm('¿Está seguro de cerrar la operación? Esta acción no se puede deshacer.')) {
      return;
    }

    this.isLoading = true;
    try {
      // Calcular estadísticas finales
      const estadisticas = await this.distributorsService.calcularEstadisticasOperacion(
        this.operacionId
      );

      const resumenDiario: ResumenDiario = {
        operacionId: this.operacionId!,
        totalVentas: estadisticas.resumen.ingresos,
        totalGastos: estadisticas.resumen.egresos,
        totalPerdidas: estadisticas.resumen.perdidas,
        dineroEsperado: estadisticas.resumen.gananciaNeta + this.operacionActual!.montoInicial,
        dineroEntregado: this.cierreForm.dineroEntregado,
        diferencia:
          this.cierreForm.dineroEntregado -
          (estadisticas.resumen.gananciaNeta + this.operacionActual!.montoInicial),
        productosCargados: this.productosCargados.length,
        productosRetornados: this.productosRetornados.length,
        productosNoRetornados: this.productosNoRetornados.length,
        facturasGeneradas: this.facturasPendientes.length,
        observaciones: this.cierreForm.observaciones,
        fechaCierre: new Date().toISOString(),
        cerradoPor: 'admin',
      };

      await this.distributorsService.cerrarOperacionDiaria(this.operacionId, resumenDiario);

      // Actualizar estado local
      if (this.operacionActual) {
        this.operacionActual.estado = 'cerrada';
        this.operacionActual.fechaCierre = new Date().toISOString();
        this.operacionActual.cerradoPor = 'admin';
      }

      this.activeSection = 'historial';
      this.dayClosed.emit(resumenDiario);

      alert('Operación cerrada correctamente');
    } catch (error) {
      console.error('❌ Error cerrando operación:', error);
      alert('Error al cerrar la operación. Intente nuevamente.');
    } finally {
      this.isLoading = false;
    }
  }

  // === ESTADÍSTICAS Y ALERTAS ===

  private async calcularEstadisticas(): Promise<void> {
    if (!this.operacionId) return;

    try {
      this.estadisticasOperacion = await this.distributorsService.calcularEstadisticasOperacion(
        this.operacionId
      );
      this.generarAlertas();
    } catch (error) {
      console.error('❌ Error calculando estadísticas:', error);
    }
  }

  private generarAlertas(): void {
    this.alertas = [];

    if (!this.estadisticasOperacion) return;

    // Calcular diferencia usando los datos locales
    const dineroEsperado = this.getDineroEsperado();
    const dineroEntregado = this.cierreForm.dineroEntregado || 0;
    const diferencia = dineroEntregado - dineroEsperado;

    // Alerta por diferencia de dinero
    if (Math.abs(diferencia) > 1000) {
      this.alertas.push({
        tipo: 'diferencia_dinero',
        prioridad: Math.abs(diferencia) > 5000 ? 'critica' : 'alta',
        distribuidorId: this.distribuidorId,
        fecha: this.getTodayDate(),
        mensaje: `Diferencia de dinero detectada: ${diferencia.toLocaleString()} COP`,
        valorEsperado: dineroEsperado,
        valorReal: dineroEntregado,
        diferencia: diferencia,
        estado: 'activa',
        fechaCreacion: new Date().toISOString(),
      });
    }

    // Alerta por productos no retornados
    if (this.productosNoRetornados.length > 0) {
      this.alertas.push({
        tipo: 'productos_no_retornados',
        prioridad: 'media',
        distribuidorId: this.distribuidorId,
        fecha: this.getTodayDate(),
        mensaje: `${this.productosNoRetornados.length} productos registrados como no retornados`,
        estado: 'activa',
        fechaCreacion: new Date().toISOString(),
      });
    }

    // Alerta por facturas vencidas
    const facturasVencidas = this.facturasPendientes.filter(
      (f) => new Date(f.fechaVencimiento) < new Date()
    );
    if (facturasVencidas.length > 0) {
      this.alertas.push({
        tipo: 'facturas_vencidas',
        prioridad: 'alta',
        distribuidorId: this.distribuidorId,
        fecha: this.getTodayDate(),
        mensaje: `${facturasVencidas.length} facturas han vencido`,
        estado: 'activa',
        fechaCreacion: new Date().toISOString(),
      });
    }
  }

  // === UTILIDADES ===

  setActiveSection(
    section: 'apertura' | 'productos' | 'gastos' | 'facturas' | 'cierre' | 'historial'
  ): void {
    this.activeSection = section;
  }

  getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  getFechaHace30Dias(): string {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - 30);
    return fecha.toISOString().split('T')[0];
  }

  getStatusClass(estado: string): string {
    switch (estado) {
      case 'activa':
        return 'alert-success';
      case 'cerrada':
        return 'alert-info';
      case 'cancelada':
        return 'alert-danger';
      default:
        return 'alert-secondary';
    }
  }

  getStatusText(estado: string): string {
    switch (estado) {
      case 'activa':
        return 'Activa';
      case 'cerrada':
        return 'Cerrada';
      case 'cancelada':
        return 'Cancelada';
      default:
        return 'Sin Estado';
    }
  }

  getStatusIcon(estado: string): string {
    switch (estado) {
      case 'activa':
        return 'fas fa-play-circle';
      case 'cerrada':
        return 'fas fa-check-circle';
      case 'cancelada':
        return 'fas fa-times-circle';
      default:
        return 'fas fa-question-circle';
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

  // Cálculos para el resumen
  getTotalProductosCargados(): number {
    return this.productosCargados.reduce((sum, p) => sum + p.total, 0);
  }

  getTotalPerdidas(): number {
    return this.productosNoRetornados.reduce((sum, p) => sum + p.totalPerdida, 0);
  }

  getTotalGastos(): number {
    return this.gastosOperativos.reduce((sum, g) => sum + g.monto, 0);
  }

  getDineroEsperado(): number {
    if (!this.operacionActual) return 0;
    return (
      this.operacionActual.montoInicial +
      this.getTotalProductosCargados() -
      this.getTotalPerdidas() -
      this.getTotalGastos()
    );
  }

  getDiferenciaDinero(): number {
    if (!this.cierreForm.dineroEntregado) return 0;
    return this.cierreForm.dineroEntregado - this.getDineroEsperado();
  }

  // Remover items de listas
  async removeProductoCargado(index: number): Promise<void> {
    // TODO: Implementar eliminación en Firestore
    this.productosCargados.splice(index, 1);
    this.calcularEstadisticas();
  }

  async removeProductoNoRetornado(index: number): Promise<void> {
    // TODO: Implementar eliminación en Firestore
    this.productosNoRetornados.splice(index, 1);
    this.calcularEstadisticas();
  }

  async removeProductoRetornado(index: number): Promise<void> {
    // TODO: Implementar eliminación en Firestore
    this.productosRetornados.splice(index, 1);
    this.calcularEstadisticas();
  }

  async removeGasto(index: number): Promise<void> {
    // TODO: Implementar eliminación en Firestore
    this.gastosOperativos.splice(index, 1);
    this.calcularEstadisticas();
  }

  async removeFactura(index: number): Promise<void> {
    // TODO: Implementar eliminación en Firestore
    this.facturasPendientes.splice(index, 1);
    this.calcularEstadisticas();
  }

  // Método para ver detalle de operación
  verDetalleOperacion(operacion: OperacionDiaria): void {
    console.log('Ver detalle de operación:', operacion);
    // TODO: Implementar modal de detalle
    alert('Funcionalidad de detalle próximamente disponible');
  }

  // Actualizar total del producto cargado automáticamente
  actualizarTotalProductoCargado(): void {
    this.productoCargadoForm.total =
      this.productoCargadoForm.cantidad * this.productoCargadoForm.precioUnitario;
  }

  // Actualizar total de pérdida automáticamente
  actualizarTotalPerdida(): void {
    this.productoNoRetornadoForm.totalPerdida =
      this.productoNoRetornadoForm.cantidad * this.productoNoRetornadoForm.costoUnitario;
  }

  // Seleccionar producto y autocompletar nombre
  onProductoCargadoChange(): void {
    const producto = this.productosDisponibles.find(
      (p) => p.id === this.productoCargadoForm.productoId
    );
    if (producto) {
      this.productoCargadoForm.nombre = producto.name;
    }
  }

  onProductoNoRetornadoChange(): void {
    const producto = this.productosDisponibles.find(
      (p) => p.id === this.productoNoRetornadoForm.productoId
    );
    if (producto) {
      this.productoNoRetornadoForm.nombre = producto.name;
    }
  }

  onProductoRetornadoChange(): void {
    const producto = this.productosDisponibles.find(
      (p) => p.id === this.productoRetornadoForm.productoId
    );
    if (producto) {
      this.productoRetornadoForm.nombre = producto.name;
    }
  }
}
