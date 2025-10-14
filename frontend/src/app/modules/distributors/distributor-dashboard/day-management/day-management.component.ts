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
  productosSonEjemplo: boolean = false;

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

  private subscriptions: Subscription[] = [];

  constructor(
    private distributorsService: DistributorsService,
    private inventoryService: InventoryService,
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
          this.operacionActual = operacion;
          this.operacionId = operacion?.id || null;

          // Determinar sección activa basada en el estado
          if (operacion) {
            if (operacion.estado === 'activa') {
              this.activeSection = 'productos';
              this.inicializarSincronizacionDatosOperacion();
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
    if (!this.operacionId) return;

    console.log('🔄 Inicializando sincronización de datos para operación:', this.operacionId);

    // Limpiar subscriptions anteriores de datos de operación
    this.subscriptions = this.subscriptions.filter((sub) => {
      // Mantener solo las subscriptions principales (operación activa e históricas)
      return true; // Por ahora mantenemos todas, pero podríamos filtrar
    });

    // Suscripción para productos cargados
    this.subscriptions.push(
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
    this.subscriptions.push(
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
    this.subscriptions.push(
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
    this.subscriptions.push(
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
      this.subscriptions.push(
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
      this.subscriptions.push(
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
    } else {
      // Si no hay operación activa, solo cargar facturas específicas
      this.subscriptions.push(
        this.distributorsService.getFacturasPendientesRealtime(this.operacionId).subscribe({
          next: (facturas) => {
            console.log('🔄 Facturas pendientes actualizadas:', facturas.length);
            this.facturasPendientes = facturas;
            this.calcularEstadisticas();
            this.cdr.detectChanges();
          },
          error: (error) => {
            console.error('❌ Error en sincronización de facturas pendientes:', error);
            this.facturasPendientes = [];
            this.cdr.detectChanges();
          },
        })
      );
    }
  }

  private cargarProductosDisponibles(): void {
    console.log('🔄 Cargando productos disponibles desde InventoryService...');

    // Verificar si hay un usuario autenticado
    console.log('👤 Estado de autenticación:', this.inventoryService['auth'].currentUser);

    this.subscriptions.push(
      this.inventoryService.getProductos().subscribe({
        next: (productos) => {
          console.log('✅ Productos disponibles cargados:', productos.length);
          console.log('📦 Productos:', productos);
          this.productosDisponibles = productos;
          this.productosSonEjemplo = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ Error cargando productos disponibles:', error);
          console.error('🔍 Detalles del error:', error.message);

          // Si hay error de autenticación, cargar productos de ejemplo
          if (error.message?.includes('Usuario no autenticado')) {
            console.warn('⚠️ Usuario no autenticado, cargando productos de ejemplo...');
            this.cargarProductosEjemplo();
          } else {
            console.warn('⚠️ Error desconocido, cargando productos de ejemplo...');
            this.cargarProductosEjemplo();
          }
          this.cdr.detectChanges();
        },
      })
    );
  }

  /**
   * Carga productos de ejemplo cuando no hay autenticación o datos reales
   */
  private cargarProductosEjemplo(): void {
    console.log('🎭 Cargando productos de ejemplo...');

    this.productosDisponibles = [
      {
        codigo: 'PROD001',
        nombre: 'Producto de Ejemplo 1',
        cantidad: '100',
        valor: '15000',
        eliminado: false,
        ultima_modificacion: new Date().toISOString(),
      },
      {
        codigo: 'PROD002',
        nombre: 'Producto de Ejemplo 2',
        cantidad: '50',
        valor: '25000',
        eliminado: false,
        ultima_modificacion: new Date().toISOString(),
      },
      {
        codigo: 'PROD003',
        nombre: 'Producto de Ejemplo 3',
        cantidad: '75',
        valor: '12000',
        eliminado: false,
        ultima_modificacion: new Date().toISOString(),
      },
      {
        codigo: 'PROD004',
        nombre: 'Producto de Ejemplo 4',
        cantidad: '30',
        valor: '35000',
        eliminado: false,
        ultima_modificacion: new Date().toISOString(),
      },
    ];

    this.productosSonEjemplo = true;
    console.log('✅ Productos de ejemplo cargados:', this.productosDisponibles.length);
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
        uid: 'admin', // TODO: Obtener del usuario actual
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
      !this.productoCargadoForm.cantidad
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
        cargadoPor: 'admin', // TODO: Usuario actual
      };

      await this.distributorsService.agregarProductoCargado(this.operacionId, productoCargado);

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
      !this.productoNoRetornadoForm.cantidad
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
        registradoPor: 'admin',
      };

      await this.distributorsService.registrarProductoNoRetornado(
        this.operacionId,
        productoNoRetornado
      );

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
      !this.productoRetornadoForm.cantidad
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
        registradoPor: 'admin',
      };

      await this.distributorsService.registrarProductoRetornado(
        this.operacionId,
        productoRetornado
      );

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
      registradoPor: 'admin',
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
        registradoPor: 'admin',
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

    if (!confirm('¿Está seguro de cerrar la operación? Esta acción no se puede deshacer.')) {
      return;
    }

    this.isLoading = true;
    try {
      // ✅ NUEVA ARQUITECTURA: Los pagos y abonos ya están guardados en facturasPendientes
      // Al cerrar la operación, sincronizamos facturasPendientes -> ventas
      console.log('🔄 Sincronizando facturas pendientes con colección ventas...');

      // Obtener todas las facturas de esta operación desde facturasPendientes
      const facturasOperacion = await this.distributorsService.getFacturasPendientes(
        this.operacionId!
      );

      // Sincronizar cada factura con su venta correspondiente en la colección ventas
      for (const factura of facturasOperacion) {
        try {
          if (factura.estado === 'pagada') {
            console.log(`💳 Sincronizando factura pagada: ${factura.numeroFactura}`);
            // ✅ PASAR EL MONTO TOTAL para que se actualicen montoPagado y montoPendiente
            await this.distributorsService.markVentaAsPaid(factura.numeroFactura, factura.monto);
          } else if (factura.estado === 'parcial') {
            console.log(`� Sincronizando abono parcial: ${factura.numeroFactura}`);
            const montoPendiente = (factura.monto || 0) - (factura.montoPagado || 0);
            await this.distributorsService.markVentaAsAbonada(
              factura.numeroFactura,
              factura.montoPagado || 0,
              montoPendiente
            );
          }
        } catch (error) {
          console.error(`❌ Error sincronizando factura ${factura.numeroFactura}:`, error);
          // Continuar con las demás facturas aunque una falle
        }
      }

      console.log('✅ Sincronización de facturas completada');

      // Calcular estadísticas finales
      const estadisticas = await this.distributorsService.calcularEstadisticasOperacion(
        this.operacionId
      );

      // Calcular total de facturas pagas
      const totalFacturasPagas = this.facturasPendientes
        .filter((f) => f.estado === 'pagada')
        .reduce((total, f) => total + (f.monto || 0), 0);

      // Calcular total de ventas (todas las facturas, pagas y pendientes)
      const totalVentas = this.facturasPendientes.reduce((total, f) => total + (f.monto || 0), 0);

      const resumenDiario: ResumenDiario = {
        operacionId: this.operacionId!,
        totalVentas: this.getTotalVentas(), // Productos cargados - productos retornados
        totalGastos: this.getTotalGastos(),
        totalPerdidas: this.getTotalPerdidas(),
        totalFacturasPagas: totalFacturasPagas,
        dineroEsperado: this.getDineroEsperado(),
        dineroEntregado: this.cierreForm.dineroEntregado,
        diferencia: this.cierreForm.dineroEntregado - this.getDineroEsperado(),
        productosCargados: this.getCantidadProductosCargados(), // Suma de cantidades, no número de registros
        productosRetornados: this.getCantidadProductosRetornados(), // Suma de cantidades, no número de registros
        productosNoRetornados: this.getCantidadProductosNoRetornados(), // Suma de cantidades, no número de registros
        facturasGeneradas: this.facturasPendientes.length,
        observaciones: this.cierreForm.observaciones,
        fechaCierre: new Date().toISOString(),
        cerradoPor: 'admin',
      };

      await this.distributorsService.cerrarOperacionDiaria(this.operacionId, resumenDiario);

      // ❌ ELIMINADO - Ya no se usa estado local
      // this.facturasMovilesPagadasLocalmente.clear();
      // this.facturasMovilesAbonadasLocalmente.clear();

      // La sincronización automática se encargará de actualizar el estado de la operación
      // No necesitamos actualizar manualmente operacionActual

      this.dayClosed.emit(resumenDiario);

      alert('Operación cerrada correctamente. Facturas sincronizadas con la colección ventas.');
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

  setActiveSection(
    section: 'apertura' | 'productos' | 'gastos' | 'facturas' | 'cierre' | 'historial'
  ): void {
    this.activeSection = section;
  }

  setActiveProductTab(tab: 'cargados' | 'no-retornados' | 'retornados'): void {
    this.activeProductTab = tab;
  }

  // Método para alternar el estado de las estadísticas
  toggleStatistics(): void {
    this.isStatisticsCollapsed = !this.isStatisticsCollapsed;
  }

  getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  getFechaHace30Dias(): string {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - 30);
    return fecha.toISOString().split('T')[0];
  }

  getFechaHace10Dias(): string {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - 10);
    return fecha.toISOString().split('T')[0];
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
    return this.getTotalProductosCargados() - this.getTotalProductosRetornados();
  }

  getTotalGastos(): number {
    return this.gastosOperativos.reduce((sum, g) => sum + g.monto, 0);
  }

  getTotalFacturasPagas(): number {
    // Sumar SOLO el monto pagado/abonado en esta operación (montoDelDia)
    // NO el monto acumulado total, para evitar contar dinero de operaciones anteriores
    return this.facturasPendientes
      .filter((f) => f.montoDelDia && f.montoDelDia > 0)
      .reduce((total, f) => total + (f.montoDelDia || 0), 0);
  }

  getDineroEsperado(): number {
    if (!this.operacionActual) return 0;
    return (
      this.operacionActual.montoInicial +
      this.getTotalProductosCargados() -
      this.getTotalPerdidas() -
      this.getTotalGastos() -
      this.getTotalProductosRetornados() +
      this.getTotalFacturasPagas() // Sumar facturas pagas al dinero esperado
    );
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

  async cancelarFacturaPago(factura: FacturaPendiente, index: number): Promise<void> {
    if (
      !confirm(
        `¿Descartar la modificacion a la factura ${factura.numeroFactura}?\n\n⚠️ Esta acción NO se puede deshacer.`
      )
    ) {
      return;
    }

    this.isLoading = true;
    try {
      // Si es una factura de venta móvil (no es local)
      if (factura.isFacturaLocal === false) {
        // Verificar si existe una factura guardada en Firestore con este número
        const facturaEnFirestore = this.facturasPendientesOperacion.find(
          (f) => f.numeroFactura === factura.numeroFactura && f.id
        );

        if (facturaEnFirestore && facturaEnFirestore.id && this.operacionId) {
          // Si existe en Firestore, eliminarla físicamente
          await this.distributorsService.eliminarFacturaPendiente(
            this.operacionId,
            facturaEnFirestore.id
          );
          console.log(`✅ Factura de venta móvil eliminada de Firestore: ${factura.numeroFactura}`);
        } else {
          // Si no existe en Firestore, solo cambiar el estado localmente
          console.log(
            `ℹ️ Factura de venta móvil no existe en Firestore, cambiando estado localmente: ${factura.numeroFactura}`
          );
        }

        // Cambiar el estado a pendiente en la lista actual
        this.facturasPendientes[index].estado = 'pendiente';
        this.facturasPendientes[index].observaciones = `${
          this.facturasPendientes[index].observaciones || ''
        } [Pago cancelado]`;

        // ❌ ELIMINADO - Ya no se usa registro local
        // this.facturasMovilesPagadasLocalmente.delete(factura.numeroFactura);

        console.log('✅ Pago de factura de venta móvil cancelado localmente');
      } else if (factura.id && this.operacionId) {
        // Es una factura local de la operación, eliminar físicamente de Firestore
        await this.distributorsService.eliminarFacturaPendiente(this.operacionId, factura.id);

        // La sincronización automática se encargará de actualizar la lista
        console.log('✅ Factura local eliminada permanentemente de Firestore');
      } else {
        // Fallback: cambiar estado local si no hay ID o operación
        this.facturasPendientes[index].estado = 'pendiente';
        this.facturasPendientes[index].observaciones = `${
          this.facturasPendientes[index].observaciones || ''
        } [Pago cancelado]`;

        console.log('✅ Pago de factura cancelado localmente (fallback)');
      }

      // Recalcular estadísticas
      this.calcularEstadisticas();
      this.cdr.detectChanges();

      alert('Factura eliminada correctamente');
    } catch (error) {
      console.error('❌ Error eliminando factura:', error);
      alert('Error al eliminar la factura. Intente nuevamente.');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * ARQUITECTURA SIMPLIFICADA:
   * Marca una factura como pagada guardando SOLO en facturasPendientes.
   * La sincronización con la colección 'ventas' ocurre al cerrar la operación.
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
          registradoPor: 'sistema',
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
   * Confirma el abono y actualiza/crea SOLO en facturasPendientes.
   * La sincronización con la colección 'ventas' ocurre al cerrar la operación.
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
          registradoPor: 'sistema',
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
        registradoPor: 'sistema',
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
      const totalProductosCargados = productosCargados.reduce((sum, p) => sum + p.total, 0);
      const totalProductosRetornados = productosRetornados.reduce(
        (sum, p) => sum + (p.totalValor || 0),
        0
      );
      const totalPerdidas = productosNoRetornados.reduce((sum, p) => sum + p.totalPerdida, 0);
      const totalGastos = gastos.reduce((sum, g) => sum + g.monto, 0);
      const totalFacturasPagas = facturas
        .filter((f) => f.estado === 'pagada')
        .reduce((sum, f) => sum + (f.monto || 0), 0);

      // Calcular dinero esperado usando la fórmula completa
      const dineroEsperado =
        operacion.montoInicial +
        totalProductosCargados -
        totalPerdidas -
        totalGastos -
        totalProductosRetornados +
        totalFacturasPagas;

      console.log(`💰 Cálculo detallado para operación ${operacion.id}:`, {
        montoInicial: operacion.montoInicial,
        productosCargados: totalProductosCargados,
        perdidas: totalPerdidas,
        gastos: totalGastos,
        productosRetornados: totalProductosRetornados,
        facturasPagas: totalFacturasPagas,
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

          // Intentar primero con fechaCierre, luego con fecha original
          let resumen = await this.distributorsService.obtenerResumenDiario(
            this.distribuidorId,
            operacion.fechaCierre || operacion.fecha
          );

          // Si no se encontró con fechaCierre, intentar con fecha original
          if (!resumen && operacion.fechaCierre && operacion.fechaCierre !== operacion.fecha) {
            console.log(`🔄 Reintentando con fecha original para operación ${operacion.id}`);
            resumen = await this.distributorsService.obtenerResumenDiario(
              this.distribuidorId,
              operacion.fecha
            );
          }

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

      // PASO 2: Cargar facturas desde 'ventas' (solo NO pagadas)
      if (this.allDistributorSales && this.allDistributorSales.length > 0) {
        const ventasNoPagadas = this.allDistributorSales.filter((venta: any) => {
          // Solo facturas NO pagadas en Firestore
          const estaPendiente = !venta.pagado || venta.pagado === false;
          return estaPendiente && venta.factura && venta.fecha2 && venta.total;
        });

        ventasNoPagadas.forEach((venta: any) => {
          const numeroFactura = venta.factura;

          // PASO 3: Evitar duplicados - Si ya existe en 'facturasPendientes', omitir
          if (numerosFacturaEnPendientes.has(numeroFactura)) {
            console.log(
              `⚠️ Omitiendo factura ${numeroFactura} - Ya existe en 'facturasPendientes'`
            );
            return;
          }

          // Agregar factura desde ventas - ✅ LEER ESTADO Y MONTO PAGADO REAL
          const montoTotal = parseFloat(venta.total?.toString() || '0');
          const montoPagado = parseFloat(venta.montoPagado?.toString() || '0');
          const montoPendiente = parseFloat(venta.montoPendiente?.toString() || '0');

          // Determinar el estado real basado en los datos de la venta
          let estadoReal: 'pendiente' | 'parcial' | 'pagada' = 'pendiente';
          if (venta.estado && (venta.estado === 'parcial' || venta.estado === 'pagada')) {
            estadoReal = venta.estado;
          } else if (montoPagado > 0 && montoPagado < montoTotal) {
            estadoReal = 'parcial';
          } else if (montoPagado >= montoTotal) {
            estadoReal = 'pagada';
          }

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
          };

          facturasMap.set(numeroFactura, factura);
        });

        console.log(
          `✅ Paso 2: ${ventasNoPagadas.length} facturas no pagadas encontradas en 'ventas'`
        );
        console.log(
          `✅ Paso 3: ${
            facturasMap.size - numerosFacturaEnPendientes.size
          } facturas agregadas (sin duplicados)`
        );
      }

      // PASO 4: Verificación final - Revisar si facturas pendientes/parciales fueron pagadas en 'ventas'
      const facturasParaVerificar = Array.from(facturasMap.values()).filter(
        (f) => f.estado === 'pendiente' || f.estado === 'parcial'
      );

      for (const factura of facturasParaVerificar) {
        const ventaCorrespondiente = this.allDistributorSales?.find(
          (v: any) => v.factura === factura.numeroFactura
        );

        if (ventaCorrespondiente && ventaCorrespondiente.pagado === true) {
          // La factura fue pagada en 'ventas', eliminarla de la lista
          facturasMap.delete(factura.numeroFactura);
          console.log(
            `✅ Paso 4: Factura ${factura.numeroFactura} fue pagada - Eliminada de la lista`
          );
        }
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
