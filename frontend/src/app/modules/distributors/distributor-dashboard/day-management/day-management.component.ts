import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { InventoryService, Producto } from '../../../inventory/services/inventory.service';
import { InventoryLedgerService } from '../../../inventory/services/inventory-ledger.service';
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
import { OperationRevisionsService } from '../../services/operation-revisions.service';
import { OperationReconciliationService } from '../../services/operation-reconciliation.service';
import {
  ObservedMobileSale,
  salesForOperation,
} from '../../services/operation-reconciliation.policy';
import { calculateKnownExpectedCash } from '../../services/cash-reconciliation.policy';
import { BusinessContextService } from '../../../../core/integration/business-context.service';
import { OperatorSessionService } from '../../../../core/integration/operator-session.service';
import { colombiaBusinessDate, colombiaBusinessDateDaysAgo } from '../../../../core/integration/business-date';
import {
  AperturaOperacionComponent,
  AperturaOperacionData,
} from './components/apertura-operacion/apertura-operacion.component';
import {
  CierreOperacionComponent,
  CierreOperacionData,
} from './components/cierre-operacion/cierre-operacion.component';
import { EstadisticasOperacionComponent } from './components/estadisticas-operacion/estadisticas-operacion.component';
import {
  AbonoData,
  FacturaFormData,
  GestionFacturasComponent,
} from './components/gestion-facturas/gestion-facturas.component';
import { GestionGastosComponent } from './components/gestion-gastos/gestion-gastos.component';
import { HistorialOperacionesComponent } from './components/historial-operaciones/historial-operaciones.component';
import { DetalleOperacionModalComponent } from './detalle-operacion-modal/detalle-operacion-modal.component';

@Component({
  selector: 'app-day-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DetalleOperacionModalComponent,
    EstadisticasOperacionComponent,
    GestionGastosComponent,
    GestionFacturasComponent,
    AperturaOperacionComponent,
    HistorialOperacionesComponent,
    CierreOperacionComponent,
  ],
  templateUrl: './day-management.component.html',
  styleUrls: ['./day-management.component.scss'],
})
export class DayManagementComponent implements OnInit, OnChanges, OnDestroy {
  @Input() distribuidorId: string = '';
  @Input() distribuidorNombre: string = '';
  @Input() allDistributorSales: any[] = [];
  /** Ventas móviles de la fecha de la operación; independientes del resumen de 7 días. */
  private ventasMovilesOperacion: any[] = [];
  private ventasMovilesOperacionKey = '';
  @Output() dayClosed = new EventEmitter<ResumenDiario>();

  // ViewChild para acceder al campo de cantidad (PRODUCTOS - no movido a subcomponente)
  @ViewChild('cantidadInput', { static: false }) cantidadInput!: ElementRef;
  @ViewChild('cantidadNoRetornadoInput', { static: false }) cantidadNoRetornadoInput!: ElementRef;
  @ViewChild('cantidadRetornadoInput', { static: false }) cantidadRetornadoInput!: ElementRef;

  // Estados del componente
  isLoading = false;
  activeSection: 'apertura' | 'productos' | 'gastos' | 'facturas' | 'cierre' | 'historial' =
    'apertura';
  activeProductTab: 'cargados' | 'no-retornados' | 'retornados' = 'cargados';

  // Estado para sección de estadísticas collapsible
  isStatisticsCollapsed = false;

  // Nueva estructura: Operación Diaria
  operacionActual: OperacionDiaria | null = null;
  operacionId: string | null = null;

  // Formularios de apertura
  aperturaForm = {
    fecha: '',
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
    descripcion: '',
    costoUnitario: 0,
    totalValor: 0,
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

  // NOTA: Las propiedades del modal de abono (facturaAbono, montoAbono, modalAbonoInstance)
  // ahora se manejan en el subcomponente gestion-facturas

  // Listas de datos
  productosCargados: ProductoCargado[] = [];
  productosNoRetornados: ProductoNoRetornado[] = [];
  productosRetornados: ProductoRetornado[] = [];
  gastosOperativos: GastoOperativo[] = [];
  facturasPendientes: FacturaPendiente[] = [];
  facturasPendientesGlobales: FacturaPendiente[] = [];
  facturasPendientesOperacion: FacturaPendiente[] = [];

  // ❌ ELIMINADO - Ya no se usa estado local con nueva arquitectura
  // facturasMovilesPagadasLocalmente: Set<string> = new Set();
  // facturasMovilesAbonadasLocalmente: Map<string, { montoPagado: number; montoPendiente: number }> = new Map();

  // Cálculos detallados para operaciones históricas
  calculosDetallados: {
    [operacionId: string]: { dineroEsperado: number; dineroRecibido: number };
  } = {};

  // Listas de productos disponibles
  productosDisponibles: Producto[] = [];
  mensajeInventarioNoDisponible: string = '';

  // Estadísticas y alertas
  estadisticasOperacion: EstadisticasOperacion | null = null;
  alertas: AlertaSistema[] = [];

  // Historial
  operacionesHistoricas: OperacionDiaria[] = [];
  operacionesFiltradas: OperacionDiaria[] = [];
  filtroFechaDesde: string = '';
  filtroFechaHasta: string = '';
  resúmenesDiarios: { [operacionId: string]: ResumenDiario } = {};

  // Control de rango para consultas extendidas
  fechaLimiteRangoActual: string = ''; // Fecha límite de los datos cargados actualmente
  estaCargandoExtendido: boolean = false; // Estado de carga para consultas extendidas
  operacionParaReapertura: OperacionDiaria | null = null;
  motivoReapertura: string = '';
  operacionParaConciliacion: OperacionDiaria | null = null;
  ventasPendientesConciliacion: ObservedMobileSale[] = [];
  cargandoConciliacion = false;
  ventaParaIgnorar: ObservedMobileSale | null = null;
  motivoIgnorarVenta = '';

  private subscriptions: Subscription[] = [];
  private operationDataSubscriptions: Subscription[] = [];
  private synchronizedOperationId: string | null = null;

  constructor(
    private distributorsService: DistributorsService,
    private inventoryService: InventoryService,
    private inventoryLedger: InventoryLedgerService,
    private operationRevisions: OperationRevisionsService,
    private operationReconciliation: OperationReconciliationService,
    private businessContext: BusinessContextService,
    private operatorSession: OperatorSessionService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    console.log('🚀 DayManagementComponent inicializado');
    console.log('📥 Props recibidas:', {
      distribuidorId: this.distribuidorId,
      distribuidorNombre: this.distribuidorNombre,
    });

    // Inicializar fecha por defecto
    this.aperturaForm.fecha = this.getTodayDate();

    // Inicializar filtros de fecha con fecha actual
    this.filtroFechaDesde = this.getTodayDate();
    this.filtroFechaHasta = this.getTodayDate();

    this.cargarProductosDisponibles();
    this.inicializarSincronizacionAutomatica();

    // ✅ NUEVA ARQUITECTURA: Cargar facturas desde Firestore
    this.cargarFacturasDesdeFirestore();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Detectar cambios en allDistributorSales y actualizar facturas si es necesario
    if (changes['allDistributorSales'] && !changes['allDistributorSales'].firstChange) {
      console.log('🔄 allDistributorSales cambió, recargando facturas...');
      this.cargarFacturasDesdeFirestore();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.clearOperationDataSubscriptions();

    // NOTA: La limpieza del modal de abono ahora se maneja en el subcomponente gestion-facturas
  }

  /**
   * Inicializa la sincronización automática con Firestore
   */
  private inicializarSincronizacionAutomatica(): void {
    // Suscripción para operación activa
    this.subscriptions.push(
      this.distributorsService.getOperacionActivaOptimizada(this.distribuidorId).subscribe({
        next: (operaciones: OperacionDiaria[]) => {
          const operacion = operaciones.length > 0 ? operaciones[0] : null;
          console.log('🔄 Operación activa actualizada:', operacion);
          const nextOperationId = operacion?.id || null;
          if (nextOperationId !== this.operacionId) {
            this.clearOperationDataSubscriptions();
          }
          this.operacionActual = operacion;
          this.operacionId = nextOperationId;

          // Determinar sección activa basada en el estado
          if (operacion) {
            if (operacion.estado === 'activa') {
              this.activeSection = 'productos';
              this.inicializarSincronizacionDatosOperacion();
              void this.cargarVentasMovilesOperacion(operacion);
            } else if (operacion.estado === 'cerrada') {
              this.activeSection = 'historial';
            }
          } else {
            this.activeSection = 'apertura';
          }

          this.cdr.detectChanges();
        },
        error: (error: any) => {
          console.error('❌ Error en sincronización de operación activa:', error);
          this.activeSection = 'apertura';
          this.cdr.detectChanges();
        },
      })
    );

    // Suscripción para operaciones históricas
    this.subscriptions.push(
      this.distributorsService.getOperacionesCerradasParaHistorial(this.distribuidorId).subscribe({
        next: async (operaciones: OperacionDiaria[]) => {
          console.log('🔄 Operaciones cerradas obtenidas:', operaciones.length);
          // Filtrar por rango de fechas (últimos 10 días ya está aplicado en la consulta)
          const operacionesFiltradas = operaciones.filter((op: OperacionDiaria) => {
            const fechaOp = new Date(op.fecha);
            const fechaDesde = new Date(this.getFechaHace10Dias());
            const fechaHasta = new Date(this.getTodayDate());
            fechaHasta.setHours(23, 59, 59, 999); // Incluir todo el día

            return fechaOp >= fechaDesde && fechaOp <= fechaHasta;
          });

          console.log('🔄 Operaciones históricas filtradas:', operacionesFiltradas.length);
          this.operacionesHistoricas = operacionesFiltradas;

          // Guardar la fecha límite del rango actual (10 días atrás)
          this.fechaLimiteRangoActual = this.getFechaHace10Dias();

          // Cargar resúmenes diarios de las operaciones cerradas
          await this.cargarResúmenesDiarios();

          this.aplicarFiltros(); // Aplicar filtros cuando se actualicen las operaciones
          this.cdr.detectChanges();
        },
        error: (error: any) => {
          console.error('❌ Error en sincronización de operaciones históricas:', error);
          this.operacionesHistoricas = [];
          this.operacionesFiltradas = [];
          this.cdr.detectChanges();
        },
      })
    );
  }

  /**
   * Inicializa la sincronización de datos de la operación activa
   */
  private inicializarSincronizacionDatosOperacion(): void {
    if (!this.operacionId || this.synchronizedOperationId === this.operacionId) return;

    console.log('🔄 Inicializando sincronización de datos para operación:', this.operacionId);
    this.clearOperationDataSubscriptions();
    this.synchronizedOperationId = this.operacionId;

    // Suscripción para productos cargados
    this.operationDataSubscriptions.push(
      this.distributorsService.getProductosCargadosRealtime(this.operacionId).subscribe({
        next: (productos) => {
          console.log('🔄 Productos cargados actualizados:', productos.length);
          this.productosCargados = productos;
          this.calcularEstadisticas();
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ Error en sincronización de productos cargados:', error);
          this.productosCargados = [];
          this.cdr.detectChanges();
        },
      })
    );

    // Suscripción para productos no retornados
    this.operationDataSubscriptions.push(
      this.distributorsService.getProductosNoRetornadosRealtime(this.operacionId).subscribe({
        next: (productos) => {
          console.log('🔄 Productos no retornados actualizados:', productos.length);
          this.productosNoRetornados = productos;
          this.calcularEstadisticas();
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ Error en sincronización de productos no retornados:', error);
          this.productosNoRetornados = [];
          this.cdr.detectChanges();
        },
      })
    );

    // Suscripción para productos retornados
    this.operationDataSubscriptions.push(
      this.distributorsService.getProductosRetornadosRealtime(this.operacionId).subscribe({
        next: (productos) => {
          console.log('🔄 Productos retornados actualizados:', productos.length);
          this.productosRetornados = productos;
          this.calcularEstadisticas();
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ Error en sincronización de productos retornados:', error);
          this.productosRetornados = [];
          this.cdr.detectChanges();
        },
      })
    );

    // Suscripción para gastos operativos
    this.operationDataSubscriptions.push(
      this.distributorsService.getGastosOperativosRealtime(this.operacionId).subscribe({
        next: (gastos) => {
          console.log('🔄 Gastos operativos actualizados:', gastos.length);
          this.gastosOperativos = gastos;
          this.calcularEstadisticas();
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ Error en sincronización de gastos operativos:', error);
          this.gastosOperativos = [];
          this.cdr.detectChanges();
        },
      })
    );

    // Suscripción para facturas pendientes
    // Si hay una operación activa, cargar facturas por fecha + facturas específicas de la operación
    if (this.operacionActual?.fecha) {
      // Cargar facturas globales por fecha de la operación
      this.operationDataSubscriptions.push(
        this.distributorsService
          .getFacturasPendientesPorFechaRealtime(this.distribuidorId, this.operacionActual.fecha)
          .subscribe({
            next: (facturasGlobales) => {
              console.log('🔄 Facturas globales por fecha cargadas:', facturasGlobales.length);
              // ✅ NUEVA ARQUITECTURA: Recargar desde Firestore
              this.facturasPendientesGlobales = facturasGlobales;
              this.cargarFacturasDesdeFirestore();
            },
            error: (error) => {
              console.error('❌ Error cargando facturas globales por fecha:', error);
              this.facturasPendientesGlobales = [];
              this.cargarFacturasDesdeFirestore();
            },
          })
      );

      // También cargar facturas específicas de esta operación
      this.operationDataSubscriptions.push(
        this.distributorsService.getFacturasPendientesRealtime(this.operacionId).subscribe({
          next: (facturasOperacion) => {
            console.log(
              '🔄 Facturas específicas de operación actualizadas:',
              facturasOperacion.length
            );
            this.facturasPendientesOperacion = facturasOperacion;
            this.cargarFacturasDesdeFirestore();
          },
          error: (error) => {
            console.error('❌ Error en sincronización de facturas de operación:', error);
            this.facturasPendientesOperacion = [];
            this.cargarFacturasDesdeFirestore();
          },
        })
      );
    }
  }

  private async cargarVentasMovilesOperacion(operacion: OperacionDiaria): Promise<void> {
    const key = `${operacion.distribuidorId}:${operacion.fecha}`;
    if (this.ventasMovilesOperacionKey === key) return;
    this.ventasMovilesOperacionKey = key;

    try {
      this.ventasMovilesOperacion = await this.distributorsService.getVentasByDistribuidorRoleAndDate(
        operacion.distribuidorId,
        operacion.fecha
      );
      await this.cargarFacturasDesdeFirestore();
      this.cdr.detectChanges();
    } catch (error) {
      console.error('❌ Error leyendo ventas móviles de la fecha de operación:', error);
      this.ventasMovilesOperacion = [];
      this.cdr.detectChanges();
    }
  }

  private getVentasMovilesDeOperacion(): any[] {
    return this.ventasMovilesOperacion.length > 0
      ? this.ventasMovilesOperacion
      : this.allDistributorSales.filter(
          (venta) => venta.fecha2 === this.operacionActual?.fecha && venta.role === this.distribuidorId
        );
  }

  private clearOperationDataSubscriptions(): void {
    this.operationDataSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.operationDataSubscriptions = [];
    this.synchronizedOperationId = null;
  }

  private cargarProductosDisponibles(): void {
    console.log('🔄 Cargando productos disponibles desde InventoryService...');

    this.subscriptions.push(
      this.inventoryService.getProductos().subscribe({
        next: (productos) => {
          console.log('✅ Productos disponibles cargados:', productos.length);
          console.log('📦 Productos:', productos);
          this.productosDisponibles = productos;
          this.mensajeInventarioNoDisponible = '';
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ Error cargando productos disponibles:', error);
          console.error('🔍 Detalles del error:', error.message);

          this.productosDisponibles = [];
          this.mensajeInventarioNoDisponible =
            'No se pudo consultar el inventario real. No se permiten cargas hasta resolver la conexión.';
          this.cdr.detectChanges();
        },
      })
    );
  }

  // === APERTURA DE OPERACIÓN ===

  async abrirOperacion(aperturaData?: AperturaOperacionData): Promise<void> {
    // Si se recibe aperturaData del componente hijo, usarlo; sino usar el formulario local (legacy)
    const datosApertura = aperturaData || this.aperturaForm;

    if (datosApertura.montoInicial === null || datosApertura.montoInicial === undefined) {
      alert('Debe ingresar un monto inicial (puede ser 0)');
      return;
    }

    if (!datosApertura.fecha) {
      alert('Debe seleccionar una fecha para la operación');
      return;
    }

    // Validar que la fecha no sea futura
    const fechaSeleccionada = new Date(datosApertura.fecha);
    const fechaHoy = new Date();
    fechaHoy.setHours(0, 0, 0, 0);

    if (fechaSeleccionada > fechaHoy) {
      alert('No se puede abrir una operación para una fecha futura');
      return;
    }

    this.isLoading = true;
    try {
      // 🔍 VALIDACIÓN: Verificar si ya existe una operación para esta fecha
      console.log('🔍 Verificando si ya existe operación para fecha:', datosApertura.fecha);
      const verificacion = await this.distributorsService.verificarOperacionExistente(
        this.distribuidorId,
        datosApertura.fecha
      );

      if (verificacion.existe) {
        const operacionExistente = verificacion.operacion!;
        const mensaje =
          `No se puede abrir dos operaciones con la misma fecha.\n\n` +
          `Ya existe una operación para el día ${datosApertura.fecha} con estado: ${operacionExistente.estado}`;

        alert(mensaje);
        return;
      }

      // ✅ No existe operación para esta fecha, proceder con la creación
      console.log('✅ No existe operación para esta fecha, procediendo con la creación');
      const operacionId = await this.distributorsService.crearOperacionDiaria({
        uid: this.requireActorUid(),
        distribuidorId: this.distribuidorId,
        fecha: datosApertura.fecha,
        montoInicial: datosApertura.montoInicial,
        estado: 'activa',
      });

      // ❌ ELIMINADO - Ya no se usa estado local
      // this.facturasMovilesPagadasLocalmente.clear();

      // La sincronización automática se encargará de actualizar la UI
      // No necesitamos actualizar manualmente operacionActual ni operacionId

      // Limpiar formulario solo si se usó el formulario local
      if (!aperturaData) {
        this.aperturaForm = {
          fecha: this.getTodayDate(),
          montoInicial: 0,
          observaciones: '',
        };
      }

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
      !this.isValidPositiveQuantity(this.productoCargadoForm.cantidad)
    ) {
      alert('Complete todos los campos requeridos');
      return;
    }

    const producto = this.productosDisponibles.find(
      (p) => p.codigo === this.productoCargadoForm.productoId
    );
    if (!producto) return;

    this.isLoading = true;
    try {
      const productoCargado: Omit<ProductoCargado, 'id'> = {
        operacionId: this.operacionId!,
        productoId: this.productoCargadoForm.productoId,
        nombre: producto.nombre,
        cantidad: this.productoCargadoForm.cantidad,
        precioUnitario: this.productoCargadoForm.precioUnitario,
        total: this.productoCargadoForm.cantidad * this.productoCargadoForm.precioUnitario,
        fechaCarga: new Date().toISOString(),
        cargadoPor: this.requireActorUid(),
      };

      const sourceId = await this.distributorsService.agregarProductoCargado(this.operacionId, productoCargado);
      await this.recordInventoryMovement('load', sourceId, productoCargado.productoId, productoCargado.nombre, productoCargado.cantidad);

      // La sincronización automática se encargará de actualizar la lista
      // No necesitamos recargar manualmente

      // Limpiar formulario
      this.productoCargadoForm = {
        productoId: '',
        nombre: '',
        cantidad: 1,
        precioUnitario: 0,
        total: 0,
      };

      // Las estadísticas se recalcularán automáticamente por la sincronización
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
      !this.isValidPositiveQuantity(this.productoNoRetornadoForm.cantidad)
    ) {
      alert('Complete todos los campos requeridos');
      return;
    }

    const producto = this.productosDisponibles.find(
      (p) => p.codigo === this.productoNoRetornadoForm.productoId
    );
    if (!producto) return;

    this.isLoading = true;
    try {
      const productoNoRetornado: Omit<ProductoNoRetornado, 'id'> = {
        operacionId: this.operacionId!,
        productoId: this.productoNoRetornadoForm.productoId,
        nombre: producto.nombre,
        cantidad: this.productoNoRetornadoForm.cantidad,
        motivo: this.productoNoRetornadoForm.motivo,
        descripcion: this.productoNoRetornadoForm.descripcion,
        costoUnitario: this.productoNoRetornadoForm.costoUnitario,
        totalPerdida:
          this.productoNoRetornadoForm.cantidad * this.productoNoRetornadoForm.costoUnitario,
        fechaRegistro: new Date().toISOString(),
        registradoPor: this.requireActorUid(),
      };

      const sourceId = await this.distributorsService.registrarProductoNoRetornado(
        this.operacionId,
        productoNoRetornado
      );
      await this.recordInventoryMovement('loss', sourceId, productoNoRetornado.productoId, productoNoRetornado.nombre, productoNoRetornado.cantidad);

      // La sincronización automática se encargará de actualizar la lista
      // No necesitamos recargar manualmente

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

      // Las estadísticas se recalcularán automáticamente por la sincronización
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
      !this.isValidPositiveQuantity(this.productoRetornadoForm.cantidad)
    ) {
      alert('Complete todos los campos requeridos');
      return;
    }

    const producto = this.productosDisponibles.find(
      (p) => p.codigo === this.productoRetornadoForm.productoId
    );
    if (!producto) return;

    this.isLoading = true;
    try {
      const productoRetornado: Omit<ProductoRetornado, 'id'> = {
        operacionId: this.operacionId!,
        productoId: this.productoRetornadoForm.productoId,
        nombre: producto.nombre,
        cantidad: this.productoRetornadoForm.cantidad,
        estado: this.productoRetornadoForm.estado,
        costoUnitario: this.productoRetornadoForm.costoUnitario,
        totalValor: this.productoRetornadoForm.totalValor,
        observaciones: this.productoRetornadoForm.descripcion,
        fechaRegistro: new Date().toISOString(),
        registradoPor: this.requireActorUid(),
      };

      const sourceId = await this.distributorsService.registrarProductoRetornado(
        this.operacionId,
        productoRetornado
      );
      await this.recordInventoryMovement('return', sourceId, productoRetornado.productoId, productoRetornado.nombre, productoRetornado.cantidad);

      // La sincronización automática se encargará de actualizar la lista
      // No necesitamos recargar manualmente

      // Limpiar formulario
      this.productoRetornadoForm = {
        productoId: '',
        nombre: '',
        cantidad: 1,
        estado: 'bueno',
        descripcion: '',
        costoUnitario: 0,
        totalValor: 0,
      };

      // Las estadísticas se recalcularán automáticamente por la sincronización
    } catch (error) {
      console.error('❌ Error registrando producto retornado:', error);
      alert('Error al registrar producto retornado');
    } finally {
      this.isLoading = false;
    }
  }

  // === GESTIÓN DE GASTOS ===

  async registrarGastoOperativo(gastoData?: Omit<GastoOperativo, 'id'>): Promise<void> {
    // Si se recibe gastoData del componente hijo, usarlo; sino usar el formulario local (legacy)
    const gastoARegistrar = gastoData || {
      operacionId: this.operacionId!,
      tipo: this.gastoForm.tipo,
      descripcion: this.gastoForm.descripcion,
      monto: this.gastoForm.monto,
      fechaGasto: new Date().toISOString(),
      registradoPor: this.requireActorUid(),
    };

    if (!this.operacionId || !gastoARegistrar.monto || !gastoARegistrar.descripcion) {
      alert('Complete todos los campos requeridos');
      return;
    }

    this.isLoading = true;
    try {
      const gasto: Omit<GastoOperativo, 'id'> = {
        ...gastoARegistrar,
        operacionId: this.operacionId!,
        registradoPor: this.requireActorUid(),
      };

      await this.distributorsService.registrarGastoOperativo(this.operacionId, gasto);

      // La sincronización automática se encargará de actualizar la lista
      // No necesitamos recargar manualmente

      // Limpiar formulario solo si se usó el formulario local
      if (!gastoData) {
        this.gastoForm = {
          tipo: 'gasolina',
          descripcion: '',
          monto: 0,
        };
      }

      // Las estadísticas se recalcularán automáticamente por la sincronización
    } catch (error) {
      console.error('❌ Error registrando gasto operativo:', error);
      alert('Error al registrar gasto operativo');
    } finally {
      this.isLoading = false;
    }
  }

  // === GESTIÓN DE FACTURAS ===

  async crearFacturaPendiente(facturaData?: FacturaFormData): Promise<void> {
    // Si recibimos datos del componente hijo, actualizamos el formulario local
    if (facturaData) {
      this.facturaForm.cliente = facturaData.cliente;
      this.facturaForm.numeroFactura = facturaData.numeroFactura;
      this.facturaForm.monto = facturaData.monto;
      this.facturaForm.fechaVencimiento = facturaData.fechaVencimiento;
      this.facturaForm.observaciones = facturaData.observaciones;
    }

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
        registradoPor: this.requireActorUid(),
        isFacturaLocal: true, // Marcar como factura creada localmente
      };

      await this.distributorsService.crearFacturaPendiente(this.operacionId, factura);

      // La sincronización automática se encargará de actualizar la lista
      // No necesitamos recargar manualmente

      // Limpiar formulario
      this.facturaForm = {
        cliente: '',
        numeroFactura: '',
        monto: 0,
        fechaVencimiento: '',
        observaciones: '',
      };

      // Las estadísticas se recalcularán automáticamente por la sincronización
    } catch (error) {
      console.error('❌ Error creando factura pendiente:', error);
      alert('Error al crear factura pendiente');
    } finally {
      this.isLoading = false;
    }
  }

  // === CIERRE DE OPERACIÓN ===

  async cerrarOperacion(cierreData?: CierreOperacionData): Promise<void> {
    if (!this.operacionId) {
      alert('No hay operación activa para cerrar');
      return;
    }

    // Si recibimos datos del componente hijo, actualizamos el formulario local
    if (cierreData) {
      this.cierreForm.dineroEntregado = cierreData.dineroEntregado;
      this.cierreForm.observaciones = cierreData.observaciones;
    }

    // Validar que dineroEntregado sea un número válido (permitir 0)
    if (this.cierreForm.dineroEntregado === null || this.cierreForm.dineroEntregado === undefined) {
      this.cierreForm.dineroEntregado = 0; // Valor por defecto si está vacío
    }

    if (!confirm('¿Cerrar la operación administrativa? Las ventas y sesiones de la app móvil no se modificarán.')) {
      return;
    }

    this.isLoading = true;
    try {
      // Los pagos se conservan dentro de facturas_pendientes de la operación.
      // No se actualiza usuarios/{ownerUid}/ventas: la app móvil no tiene flujo de crédito
      // y puede reemplazar sus documentos durante la sincronización.

      const resumenDiario: ResumenDiario = {
        operacionId: this.operacionId!,
        totalVentas: this.getTotalVentas(), // Productos cargados - productos retornados
        totalGastos: this.getTotalGastos(),
        totalPerdidas: this.getTotalPerdidas(),
        totalFacturasPagas: this.getTotalFacturasPagas(),
        dineroEsperado: this.getDineroEsperado(),
        dineroEntregado: this.cierreForm.dineroEntregado,
        diferencia: this.cierreForm.dineroEntregado - this.getDineroEsperado(),
        productosCargados: this.getCantidadProductosCargados(), // Suma de cantidades, no número de registros
        productosRetornados: this.getCantidadProductosRetornados(), // Suma de cantidades, no número de registros
        productosNoRetornados: this.getCantidadProductosNoRetornados(), // Suma de cantidades, no número de registros
        facturasGeneradas: this.facturasPendientes.length,
        observaciones: this.cierreForm.observaciones,
        fechaCierre: new Date().toISOString(),
        cerradoPor: this.requireActorUid(),
        cashFormula: 'known-cash-v1',
      };

      await this.distributorsService.cerrarOperacionDiaria(this.operacionId, resumenDiario);

      if (this.operationReconciliation.enabled && this.operacionActual) {
        try {
          await this.operationReconciliation.captureObservedSales(
            this.operacionId,
            this.getObservedMobileSales(this.operacionActual)
          );
        } catch (error) {
          // The operation is already closed. A later reconciliation must remain possible
          // even if capturing its reference snapshot temporarily failed.
          console.error('No se pudo guardar la referencia de ventas móviles observadas:', error);
        }
      }

      // ❌ ELIMINADO - Ya no se usa estado local
      // this.facturasMovilesPagadasLocalmente.clear();
      // this.facturasMovilesAbonadasLocalmente.clear();

      // La sincronización automática se encargará de actualizar el estado de la operación
      // No necesitamos actualizar manualmente operacionActual

      this.dayClosed.emit(resumenDiario);

      alert('Operación cerrada correctamente. Los pagos quedaron registrados en el escritorio.');
    } catch (error) {
      console.error('❌ Error cerrando operación:', error);
      alert('Error al cerrar la operación. Intente nuevamente.');
    } finally {
      this.isLoading = false;
    }
  }

  // === ESTADÍSTICAS Y ALERTAS ===

  private calcularEstadisticas(): void {
    if (!this.operacionId) return;

    // Calcular estadísticas de forma síncrona con los datos locales
    // Las estadísticas se calculan automáticamente cuando cambian los datos
    this.generarAlertas();
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

  private requireActorUid(): string {
    const context = this.businessContext.context();
    if (context.status === 'signed-out') {
      throw new Error('Debe iniciar sesión antes de registrar una operación administrativa.');
    }
    if (!this.operatorSession.isAdministrator()) {
      throw new Error('Seleccione el usuario operativo Administrador para realizar esta acción.');
    }
    return context.actorUid;
  }

  /**
   * Crea una ficha administrativa de cobro para una venta leída del móvil.
   * Nunca actualiza el documento original de `ventas`: el estado móvil es solo
   * evidencia para que el administrador pueda detectar y corregir omisiones.
   */
  async registrarVentaMovilComoPendiente(factura: FacturaPendiente): Promise<void> {
    if (!this.operacionId || !factura.id?.startsWith('venta-')) {
      alert('La venta seleccionada ya no está disponible para esta operación.');
      return;
    }

    const documentPath =
      `usuarios/${this.requireActorUid()}/gestionDiaria/${this.operacionId}/facturas_pendientes/{facturaId}`;
    if (
      !confirm(
        `Se creará un seguimiento administrativo pendiente para la factura ${factura.numeroFactura}.\n\n` +
          `Se escribirá un documento nuevo en:\n${documentPath}\n\n` +
          'La venta original del móvil no será modificada. ¿Desea continuar?'
      )
    ) {
      return;
    }

    this.isLoading = true;
    try {
      const facturaPendiente: Omit<FacturaPendiente, 'id'> = {
        operacionId: this.operacionId,
        cliente: factura.cliente,
        numeroFactura: factura.numeroFactura,
        monto: factura.monto,
        fechaVencimiento: factura.fechaVencimiento,
        estado: 'pendiente',
        montoPagado: 0,
        montoDelDia: 0,
        observaciones:
          `${factura.observaciones || ''} ` +
          `[Seguimiento administrativo marcado como pendiente; estado móvil observado: ` +
          `${factura.estadoPagoMovilObservado || 'sin-confirmar'}]`,
        fechaRegistro: new Date().toISOString(),
        registradoPor: this.requireActorUid(),
        isFacturaLocal: false,
        ventaMovilId: factura.ventaMovilId,
      };

      await this.distributorsService.crearFacturaPendiente(this.operacionId, facturaPendiente);
      await this.cargarFacturasDesdeFirestore();
      alert('Seguimiento pendiente creado. La venta móvil permanece sin cambios.');
    } catch (error) {
      console.error('❌ Error creando seguimiento administrativo pendiente:', error);
      alert('No fue posible crear el seguimiento pendiente. Intente nuevamente.');
    } finally {
      this.isLoading = false;
    }
  }

  private async recordInventoryMovement(
    kind: 'load' | 'return' | 'loss',
    sourceId: string,
    productCode: string,
    productName: string,
    quantity: number
  ): Promise<void> {
    if (!this.operacionId || !this.inventoryLedger.enabled) return;
    await this.inventoryLedger.record({
      operationId: this.operacionId,
      sourceId,
      kind,
      productCode,
      productName,
      quantity,
      distributorId: this.distribuidorId,
      actorUid: this.requireActorUid(),
      // The configured mode will become the recorded source of truth with production activation.
      mode: 'by-seller',
    });
  }

  private getObservedMobileSales(operation: OperacionDiaria): ObservedMobileSale[] {
    const candidates = this.getVentasMovilesDeOperacion()
      .map((sale) => ({
        invoiceNumber: typeof sale?.factura === 'string' ? sale.factura.trim() : '',
        businessDate: typeof sale?.fecha2 === 'string' ? sale.fecha2 : '',
        sellerRole: typeof sale?.role === 'string' ? sale.role : '',
        total: typeof sale?.total === 'string' ? sale.total : null,
      }))
      .filter((sale) => sale.invoiceNumber.length > 0);
    return salesForOperation(candidates, operation);
  }

  setActiveSection(
    section: 'apertura' | 'productos' | 'gastos' | 'facturas' | 'cierre' | 'historial'
  ): void {
    this.activeSection = section;
  }

  setActiveProductTab(tab: 'cargados' | 'no-retornados' | 'retornados'): void {
    this.activeProductTab = tab;
  }

  get reaperturasHabilitadas(): boolean {
    return this.operationRevisions.enabled;
  }

  get conciliacionHabilitada(): boolean {
    return this.operationReconciliation.enabled;
  }

  solicitarReapertura(operacion: OperacionDiaria): void {
    try {
      this.requireActorUid();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No tiene permiso para reabrir una operación.');
      return;
    }
    if (!this.reaperturasHabilitadas) {
      alert(
        'La reapertura está disponible en el entorno administrativo de pruebas hasta aprobar su publicación en Firebase.'
      );
      return;
    }

    if (!operacion.id) {
      alert('No se puede identificar la operación que desea reabrir.');
      return;
    }

    this.operacionParaReapertura = operacion;
    this.motivoReapertura = '';
  }

  cancelarReapertura(): void {
    this.operacionParaReapertura = null;
    this.motivoReapertura = '';
  }

  async confirmarReapertura(): Promise<void> {
    if (!this.operacionParaReapertura?.id) return;

    this.isLoading = true;
    try {
      await this.operationRevisions.reopenClosedOperation({
        operationId: this.operacionParaReapertura.id,
        reason: this.motivoReapertura,
      });
      this.cancelarReapertura();
      this.activeSection = 'productos';
      alert('Operación reabierta. El cierre anterior quedó conservado en el historial administrativo.');
    } catch (error) {
      console.error('Error reabriendo operación:', error);
      alert(error instanceof Error ? error.message : 'No fue posible reabrir la operación.');
    } finally {
      this.isLoading = false;
    }
  }

  async abrirConciliacion(operacion: OperacionDiaria): Promise<void> {
    try {
      this.requireActorUid();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No tiene permiso para conciliar una operación.');
      return;
    }
    if (!this.conciliacionHabilitada) {
      alert('La conciliación está disponible en el entorno administrativo de pruebas hasta aprobar su publicación en Firebase.');
      return;
    }
    if (!operacion.id) {
      alert('No se puede identificar la operación que desea conciliar.');
      return;
    }

    this.operacionParaConciliacion = operacion;
    this.ventasPendientesConciliacion = [];
    this.cargandoConciliacion = true;
    try {
      const recorded = await this.operationReconciliation.getRecordedInvoiceNumbers(operacion.id);
      const decisions = await this.operationReconciliation.getDecisions(operacion.id);
      this.ventasPendientesConciliacion = this.getObservedMobileSales(operacion).filter(
        (sale) => !recorded.has(sale.invoiceNumber) && !decisions.has(sale.invoiceNumber)
      );
    } catch (error) {
      console.error('Error obteniendo pendientes de conciliación:', error);
      alert(error instanceof Error ? error.message : 'No fue posible revisar las ventas móviles.');
      this.cerrarConciliacion();
    } finally {
      this.cargandoConciliacion = false;
    }
  }

  cerrarConciliacion(): void {
    this.operacionParaConciliacion = null;
    this.ventasPendientesConciliacion = [];
    this.ventaParaIgnorar = null;
    this.motivoIgnorarVenta = '';
  }

  reabrirDesdeConciliacion(): void {
    const operation = this.operacionParaConciliacion;
    this.cerrarConciliacion();
    if (operation) this.solicitarReapertura(operation);
  }

  async asociarVentaPendiente(sale: ObservedMobileSale): Promise<void> {
    if (!this.operacionParaConciliacion?.id) return;
    this.cargandoConciliacion = true;
    try {
      await this.operationReconciliation.recordDecision(
        this.operacionParaConciliacion.id,
        sale,
        'asociada'
      );
      await this.abrirConciliacion(this.operacionParaConciliacion);
    } catch (error) {
      console.error('Error asociando venta pendiente:', error);
      alert(error instanceof Error ? error.message : 'No fue posible asociar la venta.');
    } finally {
      this.cargandoConciliacion = false;
    }
  }

  prepararIgnorarVenta(sale: ObservedMobileSale): void {
    this.ventaParaIgnorar = sale;
    this.motivoIgnorarVenta = '';
  }

  async confirmarIgnorarVenta(): Promise<void> {
    if (!this.operacionParaConciliacion?.id || !this.ventaParaIgnorar) return;
    this.cargandoConciliacion = true;
    try {
      await this.operationReconciliation.recordDecision(
        this.operacionParaConciliacion.id,
        this.ventaParaIgnorar,
        'ignorada',
        this.motivoIgnorarVenta
      );
      this.ventaParaIgnorar = null;
      this.motivoIgnorarVenta = '';
      await this.abrirConciliacion(this.operacionParaConciliacion);
    } catch (error) {
      console.error('Error ignorando venta pendiente:', error);
      alert(error instanceof Error ? error.message : 'No fue posible ignorar la venta.');
    } finally {
      this.cargandoConciliacion = false;
    }
  }

  // Método para alternar el estado de las estadísticas
  toggleStatistics(): void {
    this.isStatisticsCollapsed = !this.isStatisticsCollapsed;
  }

  getTodayDate(): string {
    return colombiaBusinessDate();
  }

  private isValidPositiveQuantity(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }

  getFechaHace30Dias(): string {
    return colombiaBusinessDateDaysAgo(30);
  }

  getFechaHace10Dias(): string {
    return colombiaBusinessDateDaysAgo(10);
  }

  getStatusClass(estado: string): string {
    switch (estado) {
      case 'activa':
        return 'border-success';
      case 'cerrada':
        return 'border-info';
      case 'cancelada':
        return 'border-warning';
      default:
        return 'border-secondary';
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
        return 'fas fa-play-circle text-success';
      case 'cerrada':
        return 'fas fa-check-circle text-info';
      case 'cancelada':
        return 'fas fa-times-circle text-warning';
      default:
        return 'fas fa-question-circle text-secondary';
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

  // Obtener CANTIDAD de productos cargados (no el valor en dinero)
  getCantidadProductosCargados(): number {
    return this.productosCargados.reduce((sum, p) => sum + p.cantidad, 0);
  }

  getTotalPerdidas(): number {
    return this.productosNoRetornados.reduce((sum, p) => sum + p.totalPerdida, 0);
  }

  // Obtener CANTIDAD de productos no retornados (no el valor en dinero)
  getCantidadProductosNoRetornados(): number {
    return this.productosNoRetornados.reduce((sum, p) => sum + p.cantidad, 0);
  }

  getTotalProductosRetornados(): number {
    return this.productosRetornados.reduce((sum, p) => sum + (p.totalValor || 0), 0);
  }

  // Obtener CANTIDAD de productos retornados (no el valor en dinero)
  getCantidadProductosRetornados(): number {
    return this.productosRetornados.reduce((sum, p) => sum + p.cantidad, 0);
  }

  getTotalVentas(): number {
    // Inventory valuation only. It is retained for the legacy daily summary,
    // but it is not evidence of cash collected.
    return this.getTotalProductosCargados() - this.getTotalProductosRetornados();
  }

  getTotalGastos(): number {
    return this.gastosOperativos.reduce((sum, g) => sum + g.monto, 0);
  }

  getTotalFacturasPagas(): number {
    // A cash reconciliation needs actual evidence of collection, never an
    // inventory valuation. A paid mobile sale is valid evidence for its own
    // business day; a desktop record contributes only its collection today.
    return this.facturasPendientes.reduce((total, factura) => {
      if (factura.montoDelDia && factura.montoDelDia > 0) {
        return total + factura.montoDelDia;
      }
      if (factura.isFacturaLocal === false && factura.estadoPagoMovilObservado === 'pagada') {
        return total + factura.monto;
      }
      return total;
    }, 0);
  }

  getDineroEsperado(): number {
    if (!this.operacionActual) return 0;
    return calculateKnownExpectedCash({
      openingAmount: this.operacionActual.montoInicial,
      confirmedCollections: this.getTotalFacturasPagas(),
      operatingExpenses: this.getTotalGastos(),
    });
  }

  getDiferenciaDinero(): number {
    if (!this.cierreForm.dineroEntregado) return 0;
    return this.cierreForm.dineroEntregado - this.getDineroEsperado();
  }

  // Remover items de listas
  async removeProductoCargado(index: number): Promise<void> {
    if (!this.operacionId || !this.productosCargados[index] || !this.productosCargados[index].id) {
      alert('Error: No se puede eliminar el producto');
      return;
    }

    const producto = this.productosCargados[index];
    if (
      !confirm(
        `¿Está seguro de eliminar permanentemente el producto "${producto.nombre}"?\n\n⚠️ Esta acción NO se puede deshacer.`
      )
    ) {
      return;
    }

    this.isLoading = true;
    try {
      await this.distributorsService.eliminarProductoCargadoFisico(this.operacionId!, producto.id!);
      // La sincronización automática se encargará de actualizar la lista
      console.log('✅ Producto cargado eliminado permanentemente:', producto.id);
    } catch (error) {
      console.error('❌ Error eliminando producto cargado:', error);
      alert('Error al eliminar el producto cargado. Intente nuevamente.');
    } finally {
      this.isLoading = false;
    }
  }

  async removeProductoNoRetornado(index: number): Promise<void> {
    if (
      !this.operacionId ||
      !this.productosNoRetornados[index] ||
      !this.productosNoRetornados[index].id
    ) {
      alert('Error: No se puede eliminar el producto');
      return;
    }

    const producto = this.productosNoRetornados[index];
    if (
      !confirm(
        `¿Está seguro de eliminar permanentemente el producto "${producto.nombre}"?\n\n⚠️ Esta acción NO se puede deshacer.`
      )
    ) {
      return;
    }

    this.isLoading = true;
    try {
      await this.distributorsService.eliminarProductoNoRetornadoFisico(
        this.operacionId!,
        producto.id!
      );
      // La sincronización automática se encargará de actualizar la lista
      console.log('✅ Producto no retornado eliminado permanentemente:', producto.id);
    } catch (error) {
      console.error('❌ Error eliminando producto no retornado:', error);
      alert('Error al eliminar el producto no retornado. Intente nuevamente.');
    } finally {
      this.isLoading = false;
    }
  }

  async removeProductoRetornado(index: number): Promise<void> {
    if (
      !this.operacionId ||
      !this.productosRetornados[index] ||
      !this.productosRetornados[index].id
    ) {
      alert('Error: No se puede eliminar el producto');
      return;
    }

    const producto = this.productosRetornados[index];
    if (
      !confirm(
        `¿Está seguro de eliminar permanentemente el producto "${producto.nombre}"?\n\n⚠️ Esta acción NO se puede deshacer.`
      )
    ) {
      return;
    }

    this.isLoading = true;
    try {
      await this.distributorsService.eliminarProductoRetornadoFisico(
        this.operacionId!,
        producto.id!
      );
      // La sincronización automática se encargará de actualizar la lista
      console.log('✅ Producto retornado eliminado permanentemente:', producto.id);
    } catch (error) {
      console.error('❌ Error eliminando producto retornado:', error);
      alert('Error al eliminar el producto retornado. Intente nuevamente.');
    } finally {
      this.isLoading = false;
    }
  }

  async removeGasto(index: number): Promise<void> {
    if (!this.operacionId || !this.gastosOperativos[index] || !this.gastosOperativos[index].id) {
      alert('Error: No se puede eliminar el gasto');
      return;
    }

    const gasto = this.gastosOperativos[index];
    if (
      !confirm(
        `¿Está seguro de eliminar permanentemente el gasto "${gasto.descripcion}"?\n\n⚠️ Esta acción NO se puede deshacer.`
      )
    ) {
      return;
    }

    this.isLoading = true;
    try {
      await this.distributorsService.eliminarGastoOperativo(this.operacionId!, gasto.id!);
      // La sincronización automática se encargará de actualizar la lista
      console.log('✅ Gasto operativo eliminado correctamente');
    } catch (error) {
      console.error('❌ Error eliminando gasto operativo:', error);
      alert('Error al eliminar el gasto operativo. Intente nuevamente.');
    } finally {
      this.isLoading = false;
    }
  }

  async cancelarFacturaPago(factura: FacturaPendiente, index: number, reason: string): Promise<void> {
    this.isLoading = true;
    try {
      const facturaAdministrativa = this.facturasPendientesOperacion.find(
        (candidate) => candidate.id === factura.id || (candidate.numeroFactura === factura.numeroFactura && candidate.id)
      );
      if (!facturaAdministrativa?.id || !this.operacionId) {
        throw new Error('No existe un cobro administrativo persistido para cancelar. La venta móvil no se modifica desde el escritorio.');
      }
      await this.distributorsService.cancelarPagoAdministrativo(
        this.operacionId,
        facturaAdministrativa.id,
        this.requireActorUid(),
        reason
      );
      await this.cargarFacturasDesdeFirestore();

      // Recalcular estadísticas
      this.calcularEstadisticas();
      this.cdr.detectChanges();

      alert('Cobro administrativo cancelado y auditado. La factura y la venta móvil se conservaron.');
    } catch (error) {
      console.error('❌ Error cancelando pago administrativo:', error);
      alert('Error al cancelar el pago administrativo. Intente nuevamente.');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * ARQUITECTURA SIMPLIFICADA:
   * Marca una factura como pagada guardando solo en facturasPendientes.
   * La venta móvil original se conserva sin cambios.
   */
  async marcarFacturaComoPagada(factura: FacturaPendiente, index: number): Promise<void> {
    if (!confirm(`¿Marcar la factura ${factura.numeroFactura} como pagada?`)) {
      return;
    }

    if (!this.operacionId) {
      alert('No hay operación activa');
      return;
    }

    this.isLoading = true;
    try {
      // Calcular cuánto se está pagando EN ESTA OPERACIÓN
      const montoPagadoPrevio = factura.montoPagado || 0;
      const montoDelDia = factura.monto - montoPagadoPrevio; // Lo que falta por pagar

      // Si la factura ya tiene ID en facturasPendientes, actualizar
      if (factura.id && factura.id.startsWith('factura-')) {
        await this.distributorsService.actualizarFacturaPendiente(this.operacionId, factura.id, {
          estado: 'pagada',
          montoPagado: factura.monto,
          montoDelDia: montoDelDia, // 💰 Guardar solo lo pagado HOY
          observaciones: `${
            factura.observaciones || ''
          } [Pagada el ${new Date().toLocaleDateString()}]`,
        });
        console.log(
          `✅ Factura ${factura.numeroFactura} actualizada en facturasPendientes (montoDelDia: $${montoDelDia})`
        );
      } else {
        // Si es factura de ventas (sin ID en facturasPendientes), crear nueva entrada
        const facturaPersistente: Omit<FacturaPendiente, 'id'> = {
          operacionId: this.operacionId,
          cliente: factura.cliente,
          numeroFactura: factura.numeroFactura,
          monto: factura.monto,
          fechaVencimiento: factura.fechaVencimiento,
          estado: 'pagada',
          montoPagado: factura.monto,
          montoDelDia: montoDelDia, // 💰 Guardar solo lo pagado HOY
          observaciones: `${
            factura.observaciones || ''
          } [Pagada el ${new Date().toLocaleDateString()}]`,
          fechaRegistro: new Date().toISOString(),
          registradoPor: this.requireActorUid(),
          isFacturaLocal: false,
        };

        await this.distributorsService.crearFacturaPendiente(this.operacionId, facturaPersistente);
        console.log(
          `✅ Factura ${factura.numeroFactura} creada en facturasPendientes como pagada (montoDelDia: $${montoDelDia})`
        );
      }

      // Recargar facturas desde Firestore para reflejar los cambios
      await this.cargarFacturasDesdeFirestore();

      // ✅ Éxito - ya no se muestra alert, los cambios se reflejan automáticamente
    } catch (error) {
      console.error('❌ Error marcando factura como pagada:', error);
      alert('Error al marcar la factura como pagada. Intente nuevamente.');
    } finally {
      this.isLoading = false;
    }
  }

  // === MÉTODOS PARA MODAL DE ABONO ===
  // NOTA: El modal de abono ahora se maneja en el subcomponente gestion-facturas

  /**
   * ARQUITECTURA SIMPLIFICADA:
   * Confirma el abono y actualiza/crea solo en facturasPendientes.
   * La venta móvil original se conserva sin cambios.
   *
   * Este método es llamado por el componente hijo gestion-facturas
   */
  async confirmarAbono(abonoData?: AbonoData): Promise<void> {
    // Validar que recibimos datos del componente hijo
    if (!abonoData) {
      console.error('❌ No se recibieron datos de abono del componente hijo');
      return;
    }

    const factura = abonoData.factura;
    const montoAbono = abonoData.montoAbono;

    if (!factura || !montoAbono || montoAbono <= 0) {
      alert('Debe ingresar un monto válido para el abono');
      return;
    }

    const montoPendiente = this.getMontoPendienteFactura(factura);
    if (montoAbono > montoPendiente) {
      alert(
        `El monto del abono no puede ser mayor al pendiente: $${montoPendiente.toLocaleString()}`
      );
      return;
    }

    if (
      !confirm(
        `¿Confirmar abono de $${montoAbono.toLocaleString()} a la factura ${factura.numeroFactura}?`
      )
    ) {
      return;
    }

    if (!this.operacionId) {
      alert('No hay operación activa');
      return;
    }

    this.isLoading = true;
    try {
      const nuevoMontoPagado = (factura.montoPagado || 0) + montoAbono;
      const nuevoEstado = nuevoMontoPagado >= (factura.monto || 0) ? 'pagada' : 'parcial';

      // Si la factura ya tiene ID en facturasPendientes, actualizar
      if (factura.id && factura.id.startsWith('factura-')) {
        // Obtener el montoDelDia existente y sumarlo al nuevo abono
        const montoDelDiaExistente = factura.montoDelDia || 0;
        const nuevoMontoDelDia = montoDelDiaExistente + montoAbono;

        await this.distributorsService.actualizarFacturaPendiente(this.operacionId, factura.id, {
          estado: nuevoEstado,
          montoPagado: nuevoMontoPagado,
          montoDelDia: nuevoMontoDelDia, // 💰 Acumular abonos del día
          observaciones: `${
            factura.observaciones || ''
          } [Abono: $${montoAbono.toLocaleString()} - ${new Date().toLocaleDateString()}]`,
        });
        console.log(
          `✅ Abono registrado en facturasPendientes para ${factura.numeroFactura} (montoDelDia: $${nuevoMontoDelDia})`
        );
      } else {
        // Si es factura de ventas (sin ID en facturasPendientes), crear nueva entrada
        const facturaPersistente: Omit<FacturaPendiente, 'id'> = {
          operacionId: this.operacionId,
          cliente: factura.cliente,
          numeroFactura: factura.numeroFactura,
          monto: factura.monto,
          fechaVencimiento: factura.fechaVencimiento,
          estado: nuevoEstado,
          montoPagado: nuevoMontoPagado,
          montoDelDia: montoAbono, // 💰 Primer abono del día
          observaciones: `${
            factura.observaciones || ''
          } [Abono: $${montoAbono.toLocaleString()} - ${new Date().toLocaleDateString()}]`,
          fechaRegistro: new Date().toISOString(),
          registradoPor: this.requireActorUid(),
          isFacturaLocal: false,
        };

        await this.distributorsService.crearFacturaPendiente(this.operacionId, facturaPersistente);
        console.log(
          `✅ Factura con abono creada en facturasPendientes: ${factura.numeroFactura} (montoDelDia: $${montoAbono})`
        );
      }

      // Recargar facturas desde Firestore para reflejar los cambios
      await this.cargarFacturasDesdeFirestore();

      // ✅ Éxito - ya no se muestra alert, los cambios se reflejan automáticamente
    } catch (error) {
      console.error('❌ Error registrando abono:', error);
      alert('Error al registrar el abono. Intente nuevamente.');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Calcula el monto pendiente de una factura
   */
  getMontoPendienteFactura(factura: FacturaPendiente | null): number {
    if (!factura) return 0;
    const montoTotal = factura.monto || 0;
    const montoPagado = factura.montoPagado || 0;
    return Math.max(0, montoTotal - montoPagado);
  }

  // ViewChild para el modal de detalle de operación
  @ViewChild('detalleOperacionModal') detalleOperacionModal: any;

  // Método para ver detalle de operación
  verDetalleOperacion(operacion: OperacionDiaria): void {
    console.log('Ver detalle de operación:', operacion);

    if (this.detalleOperacionModal) {
      this.detalleOperacionModal.abrirModal(operacion);
    } else {
      console.error('Modal de detalle no inicializado');
    }
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

  // Método para actualizar total cuando cambia la cantidad (productos cargados)
  onCantidadCargadoChange(): void {
    this.actualizarTotalProductoCargado();
  }

  // Método para actualizar total cuando cambia la cantidad (productos no retornados)
  onCantidadNoRetornadoChange(): void {
    this.actualizarTotalPerdida();
  }

  // Actualizar total de valor automáticamente (productos retornados)
  actualizarTotalValor(): void {
    this.productoRetornadoForm.totalValor =
      this.productoRetornadoForm.cantidad * this.productoRetornadoForm.costoUnitario;
  }

  // Método para actualizar total cuando cambia la cantidad (productos retornados)
  onCantidadRetornadoChange(): void {
    this.actualizarTotalValor();
  }

  // Seleccionar producto y autocompletar nombre y precio
  onProductoCargadoChange(): void {
    const producto = this.productosDisponibles.find(
      (p) => p.codigo === this.productoCargadoForm.productoId
    );
    if (producto) {
      this.productoCargadoForm.nombre = producto.nombre;
      this.productoCargadoForm.precioUnitario = Number(producto.valor) || 0;
      this.actualizarTotalProductoCargado();

      // Hacer foco automático en el campo de cantidad después de un pequeño delay
      setTimeout(() => {
        if (this.cantidadInput) {
          this.cantidadInput.nativeElement.focus();
          this.cantidadInput.nativeElement.select(); // Seleccionar todo el texto para facilitar la edición
        }
      }, 100);
    }
  }

  onProductoNoRetornadoChange(): void {
    const producto = this.productosDisponibles.find(
      (p) => p.codigo === this.productoNoRetornadoForm.productoId
    );
    if (producto) {
      this.productoNoRetornadoForm.nombre = producto.nombre;
      this.productoNoRetornadoForm.costoUnitario = Number(producto.valor) || 0;
      this.actualizarTotalPerdida();

      // Hacer foco automático en el campo de cantidad después de un pequeño delay
      setTimeout(() => {
        if (this.cantidadNoRetornadoInput) {
          this.cantidadNoRetornadoInput.nativeElement.focus();
          this.cantidadNoRetornadoInput.nativeElement.select();
        }
      }, 100);
    }
  }

  onProductoRetornadoChange(): void {
    const producto = this.productosDisponibles.find(
      (p) => p.codigo === this.productoRetornadoForm.productoId
    );
    if (producto) {
      this.productoRetornadoForm.nombre = producto.nombre;
      this.productoRetornadoForm.costoUnitario = Number(producto.valor) || 0;
      this.actualizarTotalValor();

      // Hacer foco automático en el campo de cantidad después de un pequeño delay
      setTimeout(() => {
        if (this.cantidadRetornadoInput) {
          this.cantidadRetornadoInput.nativeElement.focus();
          this.cantidadRetornadoInput.nativeElement.select();
        }
      }, 100);
    }
  }

  /**
   * Verifica si ya existe una factura con el mismo número de factura
   * (ya sea local o de venta móvil guardada en Firestore)
   */
  private async verificarFacturaLocalExiste(numeroFactura: string): Promise<boolean> {
    if (!this.operacionId) return false;

    try {
      // Buscar en las facturas de la operación actual (sin filtrar por isFacturaLocal)
      const existeEnOperacion = this.facturasPendientesOperacion.some(
        (f) => f.numeroFactura === numeroFactura
      );

      if (existeEnOperacion) {
        console.log(`📋 Factura ${numeroFactura} ya existe en la operación`);
        return true;
      }

      // También verificar en las facturas globales (sin filtrar por isFacturaLocal)
      const existeEnGlobales = this.facturasPendientesGlobales.some(
        (f) => f.numeroFactura === numeroFactura
      );

      if (existeEnGlobales) {
        console.log(`📋 Factura ${numeroFactura} ya existe en globales`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Error verificando existencia de factura:', error);
      return false;
    }
  }

  /**
   * Crea una factura persistente cuando se paga una factura de venta móvil
   * Mantiene isFacturaLocal: false para indicar que proviene de venta móvil
   */
  private async crearFacturaLocalDesdeVentaMovilPago(factura: FacturaPendiente): Promise<void> {
    if (!this.operacionId) return;

    try {
      // Verificar si ya existe una factura con el mismo número (sin importar si es local o de venta móvil)
      const yaExiste = await this.verificarFacturaLocalExiste(factura.numeroFactura);
      if (yaExiste) {
        console.log(
          `⚠️ Ya existe factura para ${factura.numeroFactura}, actualizando estado a pagada`
        );
        // Si ya existe, solo actualizar el estado a pagada
        const facturaExistente = this.facturasPendientesOperacion.find(
          (f) => f.numeroFactura === factura.numeroFactura
        );
        if (facturaExistente?.id) {
          await this.distributorsService.actualizarFacturaPendiente(
            this.operacionId,
            facturaExistente.id,
            {
              estado: 'pagada',
              observaciones: `${facturaExistente.observaciones || ''} [Pagada desde venta móvil]`,
            }
          );
        }
        return;
      }

      // Buscar la venta móvil original para obtener más detalles
      const ventaMovil = this.allDistributorSales?.find(
        (venta: any) => venta.factura === factura.numeroFactura
      );

      const facturaPersistente: Omit<FacturaPendiente, 'id'> = {
        operacionId: this.operacionId,
        cliente: factura.cliente,
        numeroFactura: factura.numeroFactura,
        monto: factura.monto,
        fechaVencimiento: factura.fechaVencimiento,
        estado: 'pagada', // Ya que se está pagando
        observaciones: `Factura de venta móvil - Cliente: ${factura.cliente} [Venta Móvil] [Pagada]`,
        fechaRegistro: new Date().toISOString(),
        registradoPor: this.requireActorUid(),
        isFacturaLocal: false, // MANTENER FALSE para indicar que proviene de venta móvil
        ventaMovilId: ventaMovil?.id || `venta-${factura.numeroFactura}`, // Referencia a la venta original
      };

      await this.distributorsService.crearFacturaPendiente(this.operacionId, facturaPersistente);
      console.log(`✅ Factura de venta móvil guardada en Firestore: ${factura.numeroFactura}`);
    } catch (error) {
      console.error('❌ Error guardando factura de venta móvil en Firestore:', error);
      throw error; // Re-lanzar para que sea manejado por el método que lo llama
    }
  }

  /**
   * MÉTODO DEPRECADO - La lógica de abonos ahora se maneja en confirmarAbono()
   * Mantener comentado por si se necesita referencia histórica
   */
  /*
  private async crearFacturaLocalDesdeVentaMovilAbono(
    factura: FacturaPendiente,
    nuevoMontoPagado: number,
    nuevoEstado: 'parcial' | 'pagada'
  ): Promise<void> {
    // Este método ha sido reemplazado por la lógica simplificada en confirmarAbono()
  }
  */

  // === MÉTODOS PARA HISTORIAL Y FILTROS ===

  /**
   * Aplica los filtros de fecha a las operaciones históricas
   * Detecta automáticamente cuándo usar filtrado avanzado
   */
  aplicarFiltros(): void {
    // Detectar si se necesita consulta extendida
    const necesitaConsultaExtendida = this.detectarConsultaExtendida();

    if (necesitaConsultaExtendida) {
      // Validar que el rango no exceda 35 días
      if (!this.validarRangoExtendido()) {
        alert(
          '⚠️ El rango de fechas no puede exceder 35 días. Por favor, reduce el rango de búsqueda.'
        );
        return;
      }

      // Aplicar consulta extendida
      this.aplicarFiltrosAvanzados();
      return;
    }

    // Filtrado en memoria (comportamiento normal - más eficiente)
    let operacionesFiltradas = [...this.operacionesHistoricas];

    // Filtrar por fecha desde
    if (this.filtroFechaDesde) {
      const fechaDesde = new Date(this.filtroFechaDesde);
      operacionesFiltradas = operacionesFiltradas.filter((operacion) => {
        const fechaOperacion = new Date(operacion.fecha);
        return fechaOperacion >= fechaDesde;
      });
    }

    // Filtrar por fecha hasta
    if (this.filtroFechaHasta) {
      const fechaHasta = new Date(this.filtroFechaHasta);
      fechaHasta.setHours(23, 59, 59, 999); // Incluir todo el día
      operacionesFiltradas = operacionesFiltradas.filter((operacion) => {
        const fechaOperacion = new Date(operacion.fecha);
        return fechaOperacion <= fechaHasta;
      });
    }

    // Ordenar por fecha descendente (más recientes primero)
    operacionesFiltradas.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    this.operacionesFiltradas = operacionesFiltradas;
    this.cdr.detectChanges();
  }

  /**
   * Detecta si el filtro actual requiere una consulta extendida
   */
  private detectarConsultaExtendida(): boolean {
    if (!this.fechaLimiteRangoActual) return false;

    // Si hay filtro de fecha desde y está antes del rango actual
    if (this.filtroFechaDesde) {
      const fechaFiltroDesde = new Date(this.filtroFechaDesde);
      const fechaLimite = new Date(this.fechaLimiteRangoActual);

      if (fechaFiltroDesde < fechaLimite) {
        console.log('🔍 Detectada consulta extendida - Fecha desde fuera del rango actual');
        return true;
      }
    }

    return false;
  }

  /**
   * Valida que el rango de fechas no exceda 35 días
   */
  private validarRangoExtendido(): boolean {
    if (!this.filtroFechaDesde || !this.filtroFechaHasta) return true;

    const fechaDesde = new Date(this.filtroFechaDesde);
    const fechaHasta = new Date(this.filtroFechaHasta);

    const diasDiferencia = Math.ceil(
      (fechaHasta.getTime() - fechaDesde.getTime()) / (1000 * 60 * 60 * 24)
    );

    console.log(`📏 Rango solicitado: ${diasDiferencia} días (límite: 35 días)`);

    return diasDiferencia <= 35;
  }

  /**
   * Aplica filtros avanzados haciendo una nueva consulta a Firestore
   * Útil cuando hay muchas operaciones y se quiere filtrar específicamente
   */
  private aplicarFiltrosAvanzados(): void {
    console.log('🔄 Aplicando filtros avanzados con consulta a Firestore...');

    this.estaCargandoExtendido = true;
    this.isLoading = true;

    this.distributorsService
      .getOperacionesCerradasConFiltros(
        this.distribuidorId,
        this.filtroFechaDesde || undefined,
        this.filtroFechaHasta || undefined
      )
      .subscribe({
        next: async (operaciones: OperacionDiaria[]) => {
          console.log('✅ Operaciones filtradas desde Firestore:', operaciones.length);
          this.operacionesFiltradas = operaciones;

          // Recargar resúmenes para las operaciones filtradas
          await this.cargarResúmenesDiarios();

          this.cdr.detectChanges();
        },
        error: (error: any) => {
          console.error('❌ Error aplicando filtros avanzados:', error);
          // Fallback al filtrado en memoria
          this.aplicarFiltros();
        },
        complete: () => {
          this.estaCargandoExtendido = false;
          this.isLoading = false;
        },
      });
  }

  /**
   * Aplica filtros usando consulta avanzada a Firestore
   * Método público para uso desde template si es necesario
   */
  aplicarFiltrosAvanzadosPublico(): void {
    // Forzar consulta extendida independientemente del rango
    this.aplicarFiltrosAvanzados();
  }

  /**
   * Aplica filtros usando filtrado en memoria (más rápido)
   * Método público para uso desde template si es necesario
   */
  aplicarFiltrosRapidos(): void {
    this.aplicarFiltros();
  }

  /**
   * Limpia todos los filtros aplicados
   */
  limpiarFiltros(): void {
    console.log('🧹 Limpiando filtros...');

    // Resetear filtros
    this.filtroFechaDesde = '';
    this.filtroFechaHasta = '';

    // Resetear estados de carga
    this.estaCargandoExtendido = false;
    this.isLoading = false;

    // Restaurar operaciones originales
    this.operacionesFiltradas = [...this.operacionesHistoricas];

    // Recargar resúmenes
    this.cargarResúmenesDiarios();

    this.cdr.detectChanges();
  }

  /**
   * Calcula el total de diferencias de las operaciones filtradas
   */
  getTotalDiferenciasFiltradas(): number {
    return this.operacionesFiltradas.reduce((total, operacion) => {
      return total + this.getDiferenciaOperacion(operacion);
    }, 0);
  }

  /**
   * Obtiene el dinero esperado para una operación histórica
   * Usa cálculos detallados si están disponibles
   */
  getDineroEsperadoOperacion(operacion: OperacionDiaria): number {
    // Primero verificar si tenemos un cálculo detallado
    const calculoDetallado = this.calculosDetallados[operacion.id || ''];
    if (calculoDetallado && calculoDetallado.dineroEsperado !== undefined) {
      return calculoDetallado.dineroEsperado;
    }

    // Intentar obtener el resumen diario si está disponible
    const resumen = this.resúmenesDiarios[operacion.id || ''];
    if (resumen && resumen.dineroEsperado !== undefined && resumen.dineroEsperado !== null) {
      return resumen.dineroEsperado;
    }

    // Si no hay resumen, devolver el monto inicial como aproximación
    console.log(`ℹ️ Usando aproximación para dinero esperado de operación ${operacion.id}`);
    return operacion.montoInicial || 0;
  }

  /**
   * Obtiene el dinero recibido para una operación histórica
   */
  getDineroRecibidoOperacion(operacion: OperacionDiaria): number {
    // Primero verificar si tenemos un cálculo detallado
    const calculoDetallado = this.calculosDetallados[operacion.id || ''];
    if (calculoDetallado && calculoDetallado.dineroRecibido !== undefined) {
      return calculoDetallado.dineroRecibido;
    }

    // Intentar obtener el resumen diario si está disponible
    const resumen = this.resúmenesDiarios[operacion.id || ''];
    if (resumen && resumen.dineroEntregado !== undefined && resumen.dineroEntregado !== null) {
      return resumen.dineroEntregado;
    }

    // Si no hay resumen, devolver el monto inicial como aproximación
    console.log(`ℹ️ Usando aproximación para dinero recibido de operación ${operacion.id}`);
    return operacion.montoInicial || 0;
  }

  /**
   * Calcula el dinero esperado para una operación histórica de manera detallada
   */
  private async calcularDineroEsperadoDetallado(operacion: OperacionDiaria): Promise<number> {
    if (!operacion.id) return operacion.montoInicial || 0;

    try {
      // Obtener todos los datos necesarios para el cálculo
      const [productosCargados, productosRetornados, productosNoRetornados, gastos, facturas] =
        await Promise.all([
          this.distributorsService.getProductosCargados(operacion.id),
          this.distributorsService.getProductosRetornados(operacion.id),
          this.distributorsService.getProductosNoRetornados(operacion.id),
          this.distributorsService.getGastosOperativos(operacion.id),
          this.distributorsService.getFacturasPendientes(operacion.id),
        ]);

      // Calcular totales
      // Inventory values are intentionally not added to cash. They remain
      // useful for reconciliation, but a load or loss is not a cash sale.
      const totalGastos = gastos.reduce((sum, g) => sum + g.monto, 0);
      const totalFacturasPagas = facturas.reduce((sum, factura) =>
        sum + (Number.isFinite(factura.montoDelDia) && (factura.montoDelDia || 0) > 0
          ? factura.montoDelDia || 0
          : 0), 0);

      const dineroEsperado = calculateKnownExpectedCash({
        openingAmount: operacion.montoInicial,
        confirmedCollections: totalFacturasPagas,
        operatingExpenses: totalGastos,
      });

      console.log(`💰 Cálculo detallado para operación ${operacion.id}:`, {
        montoInicial: operacion.montoInicial,
        gastos: totalGastos,
        cobrosAdministrativosConfirmados: totalFacturasPagas,
        dineroEsperado: dineroEsperado,
      });

      return dineroEsperado;
    } catch (error) {
      console.error(
        `❌ Error calculando dinero esperado detallado para operación ${operacion.id}:`,
        error
      );
      return operacion.montoInicial || 0;
    }
  }

  /**
   * Carga los resúmenes diarios de las operaciones históricas
   */
  private async cargarResúmenesDiarios(): Promise<void> {
    // Usar operacionesFiltradas si existen, sino usar operacionesHistoricas
    const operacionesParaProcesar =
      this.operacionesFiltradas.length > 0 ? this.operacionesFiltradas : this.operacionesHistoricas;

    console.log(
      '🔄 Iniciando carga de resúmenes diarios para',
      operacionesParaProcesar.length,
      'operaciones'
    );

    for (const operacion of operacionesParaProcesar) {
      if (operacion.id && operacion.estado === 'cerrada') {
        try {
          console.log(
            `📊 Cargando resumen para operación ${operacion.id} - Fecha: ${operacion.fecha}`
          );

          // El resumen es una subcolección de esta operación. Leerlo por su
          // ID evita confundir la fecha civil de la operación con la marca de
          // tiempo (ISO) en que se cerró.
          const resumen = await this.distributorsService.obtenerResumenDiarioPorOperacion(
            operacion.id
          );

          if (resumen) {
            this.resúmenesDiarios[operacion.id] = resumen;
            console.log(`✅ Resumen cargado para operación ${operacion.id}:`, {
              dineroEsperado: resumen.dineroEsperado,
              dineroEntregado: resumen.dineroEntregado,
              diferencia: resumen.diferencia,
            });
          } else {
            // Si no hay resumen, intentar calcular detalladamente
            console.log(
              `🔄 No hay resumen para operación ${operacion.id}, calculando detalladamente`
            );
            const dineroEsperado = await this.calcularDineroEsperadoDetallado(operacion);
            const dineroRecibido = operacion.montoInicial || 0; // Aproximación

            this.calculosDetallados[operacion.id] = {
              dineroEsperado: dineroEsperado,
              dineroRecibido: dineroRecibido,
            };

            console.log(`✅ Cálculo detallado completado para operación ${operacion.id}:`, {
              dineroEsperado: dineroEsperado,
              dineroRecibido: dineroRecibido,
            });
          }
        } catch (error) {
          console.error(`❌ Error cargando resumen diario para operación ${operacion.id}:`, error);
          // Continuar con las demás operaciones aunque una falle
        }
      } else {
        console.log(`⏭️ Saltando operación ${operacion.id} - Estado: ${operacion.estado}`);
      }
    }

    console.log(
      '✅ Carga de resúmenes diarios completada. Resúmenes cargados:',
      Object.keys(this.resúmenesDiarios).length
    );
    console.log('✅ Cálculos detallados completados:', Object.keys(this.calculosDetallados).length);
    this.cdr.detectChanges();
  }

  /**
   * Calcula la diferencia para una operación histórica
   */
  getDiferenciaOperacion(operacion: OperacionDiaria): number {
    return this.getDineroRecibidoOperacion(operacion) - this.getDineroEsperadoOperacion(operacion);
  }

  /**
   * NUEVA ARQUITECTURA SIMPLIFICADA:
   * Carga facturas directamente desde Firestore sin combinar ni mantener estado local.
   *
   * Flujo:
   * 1. Cargar facturas desde colección 'facturasPendientes' (prioridad 1)
   * 2. Cargar facturas desde colección 'ventas' (solo no pagadas)
   * 3. Evitar duplicados comparando por número de factura
   * 4. Verificación final: revisar si facturas pendientes/parciales ya fueron pagadas en 'ventas'
   */
  private async cargarFacturasDesdeFirestore(): Promise<void> {
    try {
      console.log('� Iniciando carga simplificada de facturas desde Firestore...');

      const facturasMap = new Map<string, FacturaPendiente>();
      const numerosFacturaEnPendientes = new Set<string>();

      // PASO 1: Cargar facturas desde 'facturasPendientes' (PRIORIDAD 1)
      if (this.operacionId) {
        const facturasDesdeFirestore = await this.distributorsService.getFacturasPendientes(
          this.operacionId
        );

        facturasDesdeFirestore.forEach((factura: FacturaPendiente) => {
          if (factura.id && factura.numeroFactura) {
            facturasMap.set(factura.numeroFactura, factura);
            numerosFacturaEnPendientes.add(factura.numeroFactura);
          }
        });

        console.log(
          `✅ Paso 1: ${facturasDesdeFirestore.length} facturas cargadas desde 'facturasPendientes'`
        );
      }

      // PASO 2: Mostrar todas las ventas móviles válidas del día como evidencia.
      // A missing `pagado` remains explicitly unconfirmed; it is not converted
      // into a debt until an administrator records an administrative status.
      const ventasOperacion = this.getVentasMovilesDeOperacion();
      if (ventasOperacion.length > 0) {
        const ventasDelDia = ventasOperacion.filter((venta: any) => {
          const total = Number.parseFloat(String(venta.total));
          return (
            typeof venta.factura === 'string' &&
            venta.factura.trim().length > 0 &&
            Boolean(venta.fecha2) &&
            Number.isFinite(total)
          );
        });

        ventasDelDia.forEach((venta: any) => {
          const numeroFactura = venta.factura;

          // PASO 3: Evitar duplicados - Si ya existe en 'facturasPendientes', omitir
          if (numerosFacturaEnPendientes.has(numeroFactura)) {
            console.log(
              `⚠️ Omitiendo factura ${numeroFactura} - Ya existe en 'facturasPendientes'`
            );
            return;
          }

          // Agregar factura desde ventas - ✅ LEER ESTADO Y MONTO PAGADO REAL
          const montoTotal = Number.parseFloat(String(venta.total));
          const montoPagadoLeido = Number.parseFloat(String(venta.montoPagado));
          const montoPagado = Number.isFinite(montoPagadoLeido) ? montoPagadoLeido : 0;

          const estadoObservado = venta.pagado === true
            ? 'pagada'
            : venta.pagado === false
              ? 'pendiente'
              : 'sin-confirmar';
          const estadoReal: 'pendiente' | 'parcial' | 'pagada' = estadoObservado === 'pagada'
            ? 'pagada'
            : montoPagado > 0 && montoPagado < montoTotal ? 'parcial' : 'pendiente';

          const factura: FacturaPendiente = {
            id: `venta-${venta.id || numeroFactura}`,
            operacionId: this.operacionId || '',
            cliente: venta.cliente || 'Cliente',
            numeroFactura: numeroFactura,
            monto: montoTotal,
            fechaVencimiento: venta.fecha2,
            estado: estadoReal,
            montoPagado: montoPagado,
            observaciones: `Cliente: ${venta.cliente || 'N/A'}`,
            fechaRegistro: venta.fecha2,
            registradoPor: 'sistema',
            isFacturaLocal: false,
            ventaMovilId: venta.id || `venta-${numeroFactura}`,
            estadoPagoMovilObservado: estadoObservado,
          };

          facturasMap.set(numeroFactura, factura);
        });

        console.log(
          `✅ Paso 2: ${ventasDelDia.length} ventas móviles observadas`
        );
        console.log(
          `✅ Paso 3: ${
            facturasMap.size - numerosFacturaEnPendientes.size
          } facturas agregadas (sin duplicados)`
        );
      }

      // Convertir a array y actualizar
      this.facturasPendientes = Array.from(facturasMap.values());

      console.log('✅ Carga completada:', {
        totalFacturas: this.facturasPendientes.length,
        desdePendientes: numerosFacturaEnPendientes.size,
        desdeVentas: this.facturasPendientes.length - numerosFacturaEnPendientes.size,
      });

      // Recalcular estadísticas y actualizar UI
      this.calcularEstadisticas();
      this.cdr.detectChanges();
    } catch (error) {
      console.error('❌ Error cargando facturas desde Firestore:', error);
      this.facturasPendientes = [];
    }
  }

  /**
   * MÉTODO DEPRECADO - Mantener por compatibilidad temporal
   * Será eliminado cuando se complete la migración
   */
  private actualizarFacturasCombinadas(): void {
    console.warn(
      '⚠️ actualizarFacturasCombinadas() está deprecado. Usar cargarFacturasDesdeFirestore()'
    );
    // Redirigir al nuevo método
    this.cargarFacturasDesdeFirestore();
  }

  /**
   * Getter para compatibilidad con templates que no pueden usar caracteres especiales
   */
  get resumenesDiariosGetter(): { [operacionId: string]: ResumenDiario } {
    return this.resúmenesDiarios;
  }
}
