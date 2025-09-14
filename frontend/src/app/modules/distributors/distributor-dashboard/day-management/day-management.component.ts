import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
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

@Component({
  selector: 'app-day-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './day-management.component.html',
  styleUrls: ['./day-management.component.scss'],
})
export class DayManagementComponent implements OnInit, OnChanges {
  @Input() distribuidorId: string = '';
  @Input() distribuidorNombre: string = '';
  @Input() allDistributorSales: any[] = [];
  @Output() dayClosed = new EventEmitter<ResumenDiario>();

  // Estados del componente
  isLoading = false;
  activeSection: 'apertura' | 'productos' | 'gastos' | 'facturas' | 'cierre' | 'historial' =
    'apertura';
  activeProductTab: 'cargados' | 'no-retornados' | 'retornados' = 'cargados';

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
  facturasPendientesGlobales: FacturaPendiente[] = [];
  facturasPendientesOperacion: FacturaPendiente[] = [];

  // Registro de facturas de venta móvil marcadas como pagadas localmente
  // Se usa para persistir el estado entre reconstrucciones del array facturasPendientes
  facturasMovilesPagadasLocalmente: Set<string> = new Set();

  // Listas de productos disponibles
  productosDisponibles: Producto[] = [];
  productosSonEjemplo: boolean = false;

  // Estadísticas y alertas
  estadisticasOperacion: EstadisticasOperacion | null = null;
  alertas: AlertaSistema[] = [];

  // Historial
  operacionesHistoricas: OperacionDiaria[] = [];

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

    this.cargarProductosDisponibles();
    this.inicializarSincronizacionAutomatica();

    // Actualizar facturas iniciales con datos de ventas móviles
    this.actualizarFacturasCombinadas();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Detectar cambios en allDistributorSales y actualizar facturas si es necesario
    if (changes['allDistributorSales'] && !changes['allDistributorSales'].firstChange) {
      console.log('🔄 allDistributorSales cambió, actualizando facturas...');
      this.actualizarFacturasCombinadas();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  /**
   * Inicializa la sincronización automática con Firestore
   */
  private inicializarSincronizacionAutomatica(): void {
    // Suscripción para operación activa
    this.subscriptions.push(
      this.distributorsService.getOperacionActivaRealtime(this.distribuidorId).subscribe({
        next: (operacion) => {
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
        error: (error) => {
          console.error('❌ Error en sincronización de operación activa:', error);
          this.activeSection = 'apertura';
          this.cdr.detectChanges();
        },
      })
    );

    // Suscripción para operaciones históricas
    this.subscriptions.push(
      this.distributorsService
        .getOperacionesPorDistribuidorRealtime(
          this.distribuidorId,
          this.getFechaHace30Dias(),
          this.getTodayDate()
        )
        .subscribe({
          next: (operaciones) => {
            console.log('🔄 Operaciones históricas actualizadas:', operaciones.length);
            this.operacionesHistoricas = operaciones;
            this.cdr.detectChanges();
          },
          error: (error) => {
            console.error('❌ Error en sincronización de operaciones históricas:', error);
            this.operacionesHistoricas = [];
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
              // Combinar con facturas específicas de la operación (se cargarán después)
              this.facturasPendientesGlobales = facturasGlobales;
              this.actualizarFacturasCombinadas();
            },
            error: (error) => {
              console.error('❌ Error cargando facturas globales por fecha:', error);
              this.facturasPendientesGlobales = [];
              this.actualizarFacturasCombinadas();
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
            this.actualizarFacturasCombinadas();
          },
          error: (error) => {
            console.error('❌ Error en sincronización de facturas de operación:', error);
            this.facturasPendientesOperacion = [];
            this.actualizarFacturasCombinadas();
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

  async abrirOperacion(): Promise<void> {
    if (!this.aperturaForm.montoInicial || this.aperturaForm.montoInicial <= 0) {
      alert('Debe ingresar un monto inicial válido');
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

    this.isLoading = true;
    try {
      const operacionId = await this.distributorsService.crearOperacionDiaria({
        uid: 'admin', // TODO: Obtener del usuario actual
        distribuidorId: this.distribuidorId,
        fecha: this.aperturaForm.fecha,
        montoInicial: this.aperturaForm.montoInicial,
        estado: 'activa',
      });

      // Limpiar el registro de facturas pagadas de operaciones anteriores
      this.facturasMovilesPagadasLocalmente.clear();

      // La sincronización automática se encargará de actualizar la UI
      // No necesitamos actualizar manualmente operacionActual ni operacionId

      // Limpiar formulario después de apertura exitosa
      this.aperturaForm = {
        fecha: this.getTodayDate(),
        montoInicial: 0,
        observaciones: '',
      };

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
        observaciones: this.productoRetornadoForm.observaciones,
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
        observaciones: '',
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

      // La sincronización automática se encargará de actualizar la lista
      // No necesitamos recargar manualmente

      // Limpiar formulario
      this.gastoForm = {
        tipo: 'gasolina',
        descripcion: '',
        monto: 0,
      };

      // Las estadísticas se recalcularán automáticamente por la sincronización
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
      // === SINCRONIZACIÓN DIFERIDA DE PAGOS ===
      // Antes de cerrar la operación, sincronizar los pagos locales con Firestore
      console.log('🔄 Iniciando sincronización diferida de pagos...');

      // Usar el registro confiable de facturas marcadas como pagadas localmente
      const facturasMovilesPagadas = Array.from(this.facturasMovilesPagadasLocalmente);

      console.log('🔍 Registro de facturas pagadas localmente:', {
        total: facturasMovilesPagadas.length,
        facturas: facturasMovilesPagadas,
      });

      if (facturasMovilesPagadas.length > 0) {
        console.log(
          `📋 Sincronizando ${facturasMovilesPagadas.length} pagos de ventas móviles con Firestore...`
        );

        for (const numeroFactura of facturasMovilesPagadas) {
          try {
            console.log(`💳 Sincronizando pago de factura: ${numeroFactura}`);
            await this.distributorsService.markVentaAsPaid(numeroFactura);
            console.log(`✅ Pago sincronizado correctamente: ${numeroFactura}`);
          } catch (error) {
            console.error(`❌ Error sincronizando pago de factura ${numeroFactura}:`, error);
            // Continuar con las demás facturas aunque una falle
          }
        }

        console.log('✅ Sincronización diferida de pagos completada');
      } else {
        console.log('ℹ️ No hay pagos de ventas móviles pendientes de sincronización');
      }

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

      // Limpiar el registro de facturas pagadas localmente después del cierre exitoso
      this.facturasMovilesPagadasLocalmente.clear();
      console.log('🧹 Registro de facturas pagadas localmente limpiado después del cierre');

      // La sincronización automática se encargará de actualizar el estado de la operación
      // No necesitamos actualizar manualmente operacionActual

      this.dayClosed.emit(resumenDiario);

      alert('Operación cerrada correctamente. Pagos sincronizados con Firestore.');
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
    if (!this.operacionId || !this.productosCargados[index] || !this.productosCargados[index].id) {
      alert('Error: No se puede eliminar el producto');
      return;
    }

    const producto = this.productosCargados[index];
    if (!confirm(`¿Está seguro de eliminar el producto "${producto.nombre}"?`)) {
      return;
    }

    this.isLoading = true;
    try {
      await this.distributorsService.eliminarProductoCargado(this.operacionId!, producto.id!);
      // La sincronización automática se encargará de actualizar la lista
      console.log('✅ Producto cargado eliminado correctamente');
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
    if (!confirm(`¿Está seguro de eliminar el producto "${producto.nombre}"?`)) {
      return;
    }

    this.isLoading = true;
    try {
      await this.distributorsService.eliminarProductoNoRetornado(this.operacionId!, producto.id!);
      // La sincronización automática se encargará de actualizar la lista
      console.log('✅ Producto no retornado eliminado correctamente');
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
    if (!confirm(`¿Está seguro de eliminar el producto "${producto.nombre}"?`)) {
      return;
    }

    this.isLoading = true;
    try {
      await this.distributorsService.eliminarProductoRetornado(this.operacionId!, producto.id!);
      // La sincronización automática se encargará de actualizar la lista
      console.log('✅ Producto retornado eliminado correctamente');
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
    if (!confirm(`¿Está seguro de eliminar el gasto "${gasto.descripcion}"?`)) {
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
    if (!confirm(`¿Cancelar el pago de la factura ${factura.numeroFactura}?`)) {
      return;
    }

    this.isLoading = true;
    try {
      // Si es una factura de venta móvil (no es local)
      if (factura.isFacturaLocal === false) {
        // Cambiar el estado a pendiente en la lista actual
        this.facturasPendientes[index].estado = 'pendiente';
        this.facturasPendientes[index].observaciones = `${
          this.facturasPendientes[index].observaciones || ''
        } [Pago cancelado]`;

        // Remover del registro de facturas pagadas localmente
        this.facturasMovilesPagadasLocalmente.delete(factura.numeroFactura);

        console.log(
          `🗑️ Removida factura ${factura.numeroFactura} del registro local de pagos`,
          `Total facturas registradas: ${this.facturasMovilesPagadasLocalmente.size}`
        );

        console.log('✅ Pago de factura de venta móvil cancelado localmente');
      } else if (factura.id && this.operacionId) {
        // Es una factura local de la operación, actualizar estado en Firestore
        await this.distributorsService.actualizarFacturaPendiente(this.operacionId, factura.id, {
          estado: 'pendiente',
          observaciones: `${factura.observaciones || ''} [Pago cancelado]`,
        });

        // La sincronización automática se encargará de actualizar la lista
        console.log('✅ Pago de factura local cancelado y actualizado en Firestore');
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

      alert('Pago de factura cancelado correctamente');
    } catch (error) {
      console.error('❌ Error cancelando pago de factura:', error);
      alert('Error al cancelar el pago de la factura. Intente nuevamente.');
    } finally {
      this.isLoading = false;
    }
  }

  async marcarFacturaComoPagada(factura: FacturaPendiente, index: number): Promise<void> {
    if (!confirm(`¿Marcar la factura ${factura.numeroFactura} como pagada?`)) {
      return;
    }

    this.isLoading = true;
    try {
      // Si es una factura de venta móvil (no es local)
      if (factura.isFacturaLocal === false) {
        // Marcar como pagada localmente y agregar marca para sincronización diferida
        this.facturasPendientes[index].estado = 'pagada';
        this.facturasPendientes[index].observaciones = `${
          this.facturasPendientes[index].observaciones || ''
        } [Pagada - Pendiente sincronización con ventas móviles]`;

        // Registrar en el Set para persistir el estado
        this.facturasMovilesPagadasLocalmente.add(factura.numeroFactura);

        console.log(
          `📝 Registrada factura ${factura.numeroFactura} en el registro local de pagos`,
          `Total facturas registradas: ${this.facturasMovilesPagadasLocalmente.size}`
        );

        console.log(
          '✅ Factura de venta móvil marcada como pagada localmente (sincronización diferida)'
        );
      } else if (factura.id && this.operacionId) {
        // Es una factura local de la operación, marcar como pagada en Firestore
        await this.distributorsService.actualizarFacturaPendiente(this.operacionId, factura.id, {
          estado: 'pagada',
          observaciones: `${factura.observaciones || ''} [Pagada]`,
        });

        // La sincronización automática se encargará de actualizar la lista
        console.log('✅ Factura local marcada como pagada en Firestore');
      } else {
        // Fallback: cambiar estado local si no hay ID o operación
        this.facturasPendientes[index].estado = 'pagada';
        this.facturasPendientes[index].observaciones = `${
          this.facturasPendientes[index].observaciones || ''
        } [Pagada]`;

        console.log('✅ Factura marcada como pagada localmente (fallback)');
      }

      // Recalcular estadísticas
      this.calcularEstadisticas();
      this.cdr.detectChanges();

      alert('Factura marcada como pagada correctamente');
    } catch (error) {
      console.error('❌ Error marcando factura como pagada:', error);
      alert('Error al marcar la factura como pagada. Intente nuevamente.');
    } finally {
      this.isLoading = false;
    }
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

  // Método para actualizar total cuando cambia la cantidad (productos cargados)
  onCantidadCargadoChange(): void {
    this.actualizarTotalProductoCargado();
  }

  // Método para actualizar total cuando cambia la cantidad (productos no retornados)
  onCantidadNoRetornadoChange(): void {
    this.actualizarTotalPerdida();
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
    }
  }

  onProductoRetornadoChange(): void {
    const producto = this.productosDisponibles.find(
      (p) => p.codigo === this.productoRetornadoForm.productoId
    );
    if (producto) {
      this.productoRetornadoForm.nombre = producto.nombre;
      // Para productos retornados, también podríamos mostrar el valor como referencia
      console.log(`Valor de referencia del producto: ${producto.valor}`);
    }
  }

  /**
   * Combina facturas globales por fecha con facturas específicas de la operación
   * y facturas pendientes de ventas móviles. Evita duplicados basándose en el ID de la factura
   * y da prioridad a las facturas locales sobre las de venta móvil cuando tienen el mismo número
   */
  private actualizarFacturasCombinadas(): void {
    // Crear un mapa para evitar duplicados
    const facturasMap = new Map<string, FacturaPendiente>();

    // Crear un conjunto de números de factura que ya existen en facturas locales
    const numerosFacturaLocales = new Set(
      this.facturasPendientesOperacion
        .filter((f) => f.isFacturaLocal === true)
        .map((f) => f.numeroFactura)
    );

    console.log('🔍 Números de factura en operaciones locales:', Array.from(numerosFacturaLocales));

    // 1. Agregar facturas pendientes de ventas móviles (filtradas)
    if (this.allDistributorSales && this.allDistributorSales.length > 0) {
      // Filtrar solo las ventas que NO están pagadas EN FIRESTORE
      // Pero incluir las que están marcadas como pagadas localmente para sincronización
      const facturasPendientesDeVentas = this.allDistributorSales.filter((venta: any) => {
        // Considerar pendiente si pagado es false, undefined o null EN FIRESTORE
        const estaPendienteEnFirestore =
          !venta.pagado ||
          venta.pagado === false ||
          venta.pagado === undefined ||
          venta.pagado === null;
        return estaPendienteEnFirestore && venta.factura && venta.fecha2 && venta.total;
      });

      // Filtrar facturas que NO tienen una versión local (evitar duplicados)
      const facturasVentasFiltradas = facturasPendientesDeVentas.filter((venta: any) => {
        const numeroFactura = venta.factura;
        const tieneVersionLocal = numerosFacturaLocales.has(numeroFactura);

        if (tieneVersionLocal) {
          console.log(
            `⚠️ Omitiendo factura de venta móvil ${numeroFactura} porque ya existe versión local`
          );
          return false;
        }

        return true;
      });

      facturasVentasFiltradas.forEach((venta: any) => {
        const facturaId = `venta-${venta.id || venta.factura}`;
        const numeroFactura = venta.factura;

        // Verificar si esta factura fue marcada como pagada localmente
        const estaPagadaLocalmente = this.facturasMovilesPagadasLocalmente.has(numeroFactura);

        if (estaPagadaLocalmente) {
          console.log(
            `🔄 Aplicando estado pagado a factura móvil ${numeroFactura} desde registro local`
          );
        }

        const factura: FacturaPendiente = {
          id: facturaId,
          operacionId: this.operacionId || '',
          cliente: venta.cliente || 'Cliente',
          numeroFactura: venta.factura,
          monto: parseFloat(venta.total?.toString() || '0'),
          fechaVencimiento: venta.fecha2,
          estado: estaPagadaLocalmente ? 'pagada' : 'pendiente', // Usar estado del registro local
          observaciones: estaPagadaLocalmente
            ? `Factura de venta móvil - Cliente: ${
                venta.cliente || 'N/A'
              } [Venta Móvil] [Pagada - Pendiente sincronización con ventas móviles]`
            : `Factura de venta móvil - Cliente: ${venta.cliente || 'N/A'} [Venta Móvil]`,
          fechaRegistro: venta.fecha2,
          registradoPor: 'sistema',
          isFacturaLocal: false, // Marcar como factura proveniente de datos de ventas móviles
        };

        facturasMap.set(facturaId, factura);
      });

      console.log(
        '📋 Facturas de venta móvil agregadas (sin duplicados):',
        facturasVentasFiltradas.length,
        'de',
        facturasPendientesDeVentas.length,
        'totales'
      );
    }

    // 2. Agregar facturas globales por fecha
    this.facturasPendientesGlobales.forEach((factura) => {
      if (factura.id) {
        // Verificar si ya existe una versión local con el mismo número de factura
        const tieneVersionLocal = numerosFacturaLocales.has(factura.numeroFactura);

        if (tieneVersionLocal) {
          console.log(
            `⚠️ Omitiendo factura global ${factura.numeroFactura} porque ya existe versión local`
          );
          return;
        }

        facturasMap.set(factura.id, {
          ...factura,
          // Marcar como factura global para diferenciarla
          observaciones: factura.observaciones ? `${factura.observaciones} [Global]` : `[Global]`,
        });
      }
    });

    // 3. Agregar facturas específicas de la operación (tienen máxima prioridad)
    this.facturasPendientesOperacion.forEach((factura) => {
      if (factura.id) {
        facturasMap.set(factura.id, {
          ...factura,
          // Marcar como factura de esta operación
          observaciones: factura.observaciones
            ? `${factura.observaciones} [Esta operación]`
            : `[Esta operación]`,
        });
      }
    });

    // Convertir el mapa a array
    this.facturasPendientes = Array.from(facturasMap.values());

    console.log('🔄 Facturas combinadas actualizadas:', {
      ventasMoviles: this.allDistributorSales?.filter((v: any) => !v.pagado).length || 0,
      globales: this.facturasPendientesGlobales.length,
      operacion: this.facturasPendientesOperacion.length,
      totalMostradas: this.facturasPendientes.length,
      duplicadosEvitados:
        (this.allDistributorSales?.filter((v: any) => !v.pagado).length || 0) +
        this.facturasPendientesGlobales.length -
        (this.facturasPendientes.length - this.facturasPendientesOperacion.length),
    });

    // Recalcular estadísticas y actualizar UI
    this.calcularEstadisticas();
    this.cdr.detectChanges();
  }
}
