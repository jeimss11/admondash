import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { Subscription } from 'rxjs';
import { DistributorsService } from '../services/distributors.service';
import { DayManagementComponent } from './day-management/day-management.component';

@Component({
  selector: 'app-distributor-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, DayManagementComponent],
  templateUrl: './distributor-dashboard.component.html',
  styleUrls: ['./distributor-dashboard.component.scss'],
})
export class DistributorDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  distributor: any = null;
  activeTab: string = 'ventas';

  // Datos iniciales (se actualizarán con datos reales de Firestore)
  salesData = {
    today: 0,
    month: 0,
    pendingInvoices: 0,
    productsSold: 0,
  };

  // Propiedades para "Abrir Día"
  selectedDate: string = new Date().toISOString().split('T')[0];
  initialProducts: any[] = []; // Se cargarán desde Firestore
  availableProducts: any[] = []; // Se cargarán desde Firestore

  soldProducts: any[] = [];
  dayInvoices: any[] = [];

  newSoldProduct: any = {
    productId: '',
    quantity: 1,
    unitPrice: 0,
  };

  newInvoice: any = {
    number: '',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    isPaid: false,
  };

  daySummary: any = {
    totalSales: 0,
    pendingInvoices: 0,
    totalToReceive: 0,
    amountDelivered: 0,
  };

  // Propiedades para gestión de facturas
  allInvoices: any[] = [
    {
      id: 1,
      number: 'FAC-001',
      date: '2025-08-15',
      amount: 1250.0,
      isPaid: false,
      notes: 'Pago pendiente - Producto A',
    },
    {
      id: 2,
      number: 'FAC-002',
      date: '2025-08-20',
      amount: 850.0,
      isPaid: true,
      notes: 'Pagado el 25/08/2025',
    },
    {
      id: 3,
      number: 'FAC-003',
      date: '2025-07-10',
      amount: 2100.0,
      isPaid: false,
      notes: 'Factura vencida - Requiere atención inmediata',
    },
    {
      id: 4,
      number: 'FAC-004',
      date: '2025-09-01',
      amount: 450.0,
      isPaid: false,
      notes: 'Pago parcial realizado',
    },
    {
      id: 5,
      number: 'FAC-005',
      date: '2025-08-28',
      amount: 675.0,
      isPaid: true,
      notes: 'Pagado completamente',
    },
  ];

  // Propiedad para almacenar todas las ventas del distribuidor (una sola carga)
  allDistributorSales: any[] = [];

  // Propiedad para historial de ventas
  salesHistory: any[] = [];

  filteredInvoices: any[] = [];
  invoiceFilter: any = {
    status: 'all',
    search: '',
    startDate: '',
    endDate: '',
  };

  // Propiedades para modal de detalle
  selectedInvoice: any = null;
  showInvoiceDetail: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private distributorsService: DistributorsService,
    private cdr: ChangeDetectorRef
  ) {
    Chart.register(...registerables);
  }

  // Suscripción para listeners en tiempo real
  private ventasSubscription?: Subscription;

  async ngOnInit(): Promise<void> {
    const distributorRole = this.route.snapshot.paramMap.get('role');
    if (distributorRole) {
      await this.loadDistributorData(distributorRole);
    } else {
      console.error('❌ No se proporcionó un role de distribuidor');
      this.goBack();
    }

    // ✅ ACTUALIZAR TODAS LAS ESTADÍSTICAS DESPUÉS DE CARGAR DATOS
    await this.updateAllStatisticsFromRealtimeData();

    await this.loadDayData();
    await this.loadInvoices();
    await this.loadProductos();
    await this.loadSalesHistory();
  }

  async ngAfterViewInit(): Promise<void> {
    // Esperar a que el DOM esté completamente disponible
    setTimeout(async () => {
      await this.initializeCharts();
    }, 200);
  }

  private async loadDistributorData(role: string): Promise<void> {
    try {
      console.log('🔍 Cargando datos del distribuidor:', role);
      const distributorData = await this.distributorsService.getDistribuidorByRole(role);

      if (distributorData) {
        this.distributor = {
          id: distributorData.role,
          name: distributorData.nombre,
          contact: distributorData.email || distributorData.telefono || 'Sin contacto',
          totalSales: 0, // Se calculará después
          status: distributorData.estado === 'activo' ? 'Activo' : 'Inactivo',
        };

        console.log('✅ Distribuidor cargado:', this.distributor);

        // Cargar estadísticas específicas del distribuidor
        await this.loadDistributorStats(role);
      } else {
        console.error('❌ Distribuidor no encontrado:', role);
        alert('El distribuidor solicitado no existe o no está disponible.');
        this.goBack();
      }
    } catch (error) {
      console.error('❌ Error cargando datos del distribuidor:', error);
      alert('Error al cargar los datos del distribuidor. Intente nuevamente.');
      this.goBack();
    }
  }

  private async loadDistributorStats(role: string): Promise<void> {
    try {
      console.log('📊 Cargando estadísticas para distribuidor:', role);

      // Obtener las ventas de los últimos 7 días del distribuidor (OPTIMIZACIÓN)
      this.allDistributorSales = await this.distributorsService.getVentasByDistribuidorLast7Days(
        role
      );
      console.log('✅ Ventas de los últimos 7 días cargadas:', this.allDistributorSales.length);

      // Usar las ventas ya cargadas para calcular estadísticas
      const ventas = this.allDistributorSales;

      // Calcular estadísticas
      const hoy = new Date();
      const fechaHoy = hoy.toISOString().split('T')[0];

      // Ventas del día actual
      const ventasHoy = ventas.filter((venta) => venta.fecha2 === fechaHoy);
      const totalVentasHoy = ventasHoy.reduce((sum, venta) => {
        const total =
          typeof venta.total === 'number'
            ? venta.total
            : parseFloat(venta.total?.toString() || '0');
        return sum + total;
      }, 0);

      // Ventas de los últimos 7 días (reemplaza "ventas del mes")
      const fechaHace7Dias = new Date();
      fechaHace7Dias.setDate(fechaHace7Dias.getDate() - 7);
      const fechaHace7DiasStr = fechaHace7Dias.toISOString().split('T')[0];

      const ventasUltimos7Dias = ventas.filter((venta) => venta.fecha2 >= fechaHace7DiasStr);
      const totalVentasUltimos7Dias = ventasUltimos7Dias.reduce((sum, venta) => {
        const total =
          typeof venta.total === 'number'
            ? venta.total
            : parseFloat(venta.total?.toString() || '0');
        return sum + total;
      }, 0);

      // Contar facturas pendientes de los últimos 7 días
      const facturasPendientes = ventas.filter((venta) => {
        // Considerar pendiente si pagado es false o undefined (por compatibilidad)
        const estaPendiente =
          (venta as any).pagado === false || (venta as any).pagado === undefined;
        if (!estaPendiente) return false;

        // Solo contar las de los últimos 7 días
        return venta.fecha2 >= fechaHace7DiasStr;
      }).length;

      // Actualizar las estadísticas del componente
      this.salesData = {
        today: totalVentasHoy,
        month: totalVentasUltimos7Dias, // Ahora representa los últimos 7 días
        pendingInvoices: facturasPendientes,
        productsSold: 0, // Ya no se calcula, se removerá la card
      };

      // Actualizar el total de ventas del distribuidor
      if (this.distributor) {
        this.distributor.totalSales = totalVentasUltimos7Dias;
      }

      console.log('✅ Estadísticas calculadas usando datos de los últimos 7 días:', {
        ventasTotales: ventas.length,
        ventasHoy: ventasHoy.length,
        totalHoy: totalVentasHoy,
        totalUltimos7Dias: totalVentasUltimos7Dias,
        facturasPendientes,
      });
    } catch (error) {
      console.error('❌ Error cargando estadísticas:', error);
      // Mantener datos de ejemplo en caso de error
      this.salesData = {
        today: 0,
        month: 0,
        pendingInvoices: 0,
        productsSold: 0,
      };
    }
  }

  private async getLast7DaysSalesData(): Promise<{ labels: string[]; data: number[] }> {
    return await this.calculateLast7DaysSales();
  }

  private async calculateLast7DaysSales(): Promise<{ labels: string[]; data: number[] }> {
    const labels: string[] = [];
    const data: number[] = [];

    try {
      if (!this.distributor?.id) {
        // Si no hay distribuidor, devolver datos vacíos
        for (let i = 6; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dayName = date.toLocaleDateString('es-ES', { weekday: 'short' });
          labels.push(dayName);
          data.push(0);
        }
        return { labels, data };
      }

      // Usar las ventas ya cargadas en memoria (NO hacer nueva llamada a Firestore)
      const allVentas = this.allDistributorSales;
      console.log('📊 Calculando ventas semanales usando datos en memoria:', allVentas.length);

      // Crear mapa de ventas por fecha
      const ventasPorFecha = new Map<string, number>();

      // Procesar todas las ventas
      allVentas.forEach((venta: any) => {
        if (venta.fecha2 && venta.total) {
          const fecha = venta.fecha2;
          const total =
            typeof venta.total === 'number'
              ? venta.total
              : parseFloat(venta.total?.toString() || '0');

          if (ventasPorFecha.has(fecha)) {
            ventasPorFecha.set(fecha, ventasPorFecha.get(fecha)! + total);
          } else {
            ventasPorFecha.set(fecha, total);
          }
        }
      });

      // Generar datos para los últimos 7 días
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayName = date.toLocaleDateString('es-ES', { weekday: 'short' });
        const dateString = date.toISOString().split('T')[0];

        labels.push(dayName);
        data.push(ventasPorFecha.get(dateString) || 0);
      }

      console.log('📊 Ventas de los últimos 7 días calculadas:', { labels, data });
      return { labels, data };
    } catch (error) {
      console.error('❌ Error calculando ventas de los últimos 7 días:', error);

      // En caso de error, devolver datos vacíos
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayName = date.toLocaleDateString('es-ES', { weekday: 'short' });
        labels.push(dayName);
        data.push(0);
      }
      return { labels, data };
    }
  }

  private async getProductDistributionData(): Promise<{ labels: string[]; data: number[] }> {
    return await this.calculateProductDistribution();
  }

  private async calculateProductDistribution(): Promise<{ labels: string[]; data: number[] }> {
    try {
      if (!this.distributor?.id) {
        return {
          labels: ['Sin datos'],
          data: [1],
        };
      }

      // Usar las ventas ya cargadas en memoria (NO hacer nueva llamada a Firestore)
      const allVentas = this.allDistributorSales;
      console.log(
        '📊 Calculando distribución de productos usando datos en memoria:',
        allVentas.length
      );

      // Crear mapa de productos vendidos
      const productosVendidos = new Map<string, number>();

      // Procesar todas las ventas y contar productos
      allVentas.forEach((venta: any) => {
        if (venta.productos && Array.isArray(venta.productos)) {
          venta.productos.forEach((producto: any) => {
            if (producto.nombre && producto.cantidad) {
              const nombre = producto.nombre;
              const cantidad = parseInt(producto.cantidad?.toString() || '0');

              if (productosVendidos.has(nombre)) {
                productosVendidos.set(nombre, productosVendidos.get(nombre)! + cantidad);
              } else {
                productosVendidos.set(nombre, cantidad);
              }
            }
          });
        }
      });

      // Convertir a arrays para Chart.js
      const labels: string[] = [];
      const data: number[] = [];

      // Ordenar por cantidad vendida (descendente) y tomar los top 6
      const sortedProductos = Array.from(productosVendidos.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

      sortedProductos.forEach(([nombre, cantidad]) => {
        labels.push(nombre);
        data.push(cantidad);
      });

      // Si no hay productos, devolver datos por defecto
      if (labels.length === 0) {
        return {
          labels: ['Sin datos'],
          data: [1],
        };
      }

      console.log('📊 Distribución de productos calculada:', { labels, data });
      return { labels, data };
    } catch (error) {
      console.error('❌ Error calculando distribución de productos:', error);
      return {
        labels: ['Sin datos'],
        data: [1],
      };
    }
  }

  async initializeCharts(): Promise<void> {
    await Promise.all([this.createSalesChart(), this.createProductsChart()]);
  }

  async createSalesChart(): Promise<void> {
    const ctx = document.getElementById('salesChart') as HTMLCanvasElement;
    if (ctx) {
      // Destruir gráfico existente si hay uno
      const existingChart = Chart.getChart(ctx);
      if (existingChart) {
        existingChart.destroy();
      }

      // Obtener datos de ventas de los últimos 7 días
      const salesData = await this.getLast7DaysSalesData();

      new Chart(ctx, {
        type: 'line',
        data: {
          labels: salesData.labels,
          datasets: [
            {
              label: 'Ventas Diarias',
              data: salesData.data,
              borderColor: '#007bff',
              backgroundColor: 'rgba(0, 123, 255, 0.1)',
              tension: 0.4,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'top',
            },
            title: {
              display: true,
              text: 'Ventas de los Últimos 7 Días',
            },
          },
        },
      });

      console.log('✅ Gráfico de ventas creado con datos:', salesData);
    }
  }

  async createProductsChart(): Promise<void> {
    const ctx = document.getElementById('productsChart') as HTMLCanvasElement;
    if (ctx) {
      // Destruir gráfico existente si hay uno
      const existingChart = Chart.getChart(ctx);
      if (existingChart) {
        existingChart.destroy();
      }

      // Obtener datos de distribución de productos
      const productData = await this.getProductDistributionData();

      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: productData.labels,
          datasets: [
            {
              data: productData.data,
              backgroundColor: ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6f42c1', '#e83e8c'],
              hoverOffset: 4,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'bottom',
            },
            title: {
              display: true,
              text: 'Distribución de Productos Vendidos',
            },
          },
        },
      });

      console.log('✅ Gráfico de productos creado con datos:', productData);
    }
  }

  async loadDayData(): Promise<void> {
    try {
      if (this.distributor?.id) {
        // Cargar datos del día actual desde las ventas ya cargadas en memoria
        const fechaHoy = new Date().toISOString().split('T')[0];

        // Usar las ventas ya cargadas (NO hacer nueva llamada a Firestore)
        const ventasDelDia = this.allDistributorSales.filter((venta) => venta.fecha2 === fechaHoy);
        console.log('📅 Datos del día calculados usando datos en memoria:', ventasDelDia.length);

        // Convertir ventas del día a formato de productos vendidos
        this.soldProducts = ventasDelDia.flatMap(
          (venta) =>
            venta.productos
              ?.filter(
                (producto: any) =>
                  producto &&
                  producto.nombre &&
                  producto.cantidad !== undefined &&
                  producto.precio !== undefined &&
                  producto.total !== undefined
              )
              .map((producto: any) => ({
                productName: producto.nombre || 'Producto sin nombre',
                quantity: parseInt(producto.cantidad?.toString() || '0'),
                unitPrice: parseFloat(producto.precio?.toString() || '0'),
                total: parseFloat(producto.total?.toString() || '0'),
              })) || []
        );

        // Las facturas del día se manejan por separado
        this.dayInvoices = [];

        console.log('✅ Datos del día cargados desde memoria:', {
          productosVendidos: this.soldProducts.length,
          facturasDelDia: this.dayInvoices.length,
        });
      } else {
        // Si no hay distribuidor, inicializar vacío
        this.soldProducts = [];
        this.dayInvoices = [];
      }

      this.calculateSummary();
    } catch (error) {
      console.error('❌ Error cargando datos del día:', error);
      // En caso de error, inicializar vacío
      this.soldProducts = [];
      this.dayInvoices = [];
      this.calculateSummary();
    }
  }

  async loadProductos(): Promise<void> {
    try {
      // Cargar productos disponibles desde Firestore
      this.availableProducts = await this.distributorsService.getProductosDisponibles();

      // Inicializar productos del día con cantidades iniciales
      this.initialProducts = this.availableProducts.map((producto) => ({
        name: producto.name,
        initialQuantity: 100, // Cantidad inicial por defecto
        unitPrice: producto.precio,
      }));

      console.log('✅ Productos cargados:', this.availableProducts.length);
    } catch (error) {
      console.error('❌ Error cargando productos:', error);
      // En caso de error, usar arrays vacíos
      this.availableProducts = [];
      this.initialProducts = [];
    }
  }

  // Cargar historial de ventas para mostrar en la tabla
  async loadSalesHistory(): Promise<void> {
    try {
      if (!this.distributor?.id) {
        this.salesHistory = [];
        return;
      }

      // Usar las ventas ya cargadas en memoria (NO hacer nueva llamada a Firestore)
      const allVentas = this.allDistributorSales;
      console.log('📋 Cargando historial usando datos en memoria:', allVentas.length);

      // Convertir las ventas al formato para mostrar en la tabla
      this.salesHistory = allVentas.slice(0, 10).map((venta: any, index: number) => {
        // Obtener el primer producto de la venta para mostrar
        const primerProducto =
          venta.productos && venta.productos.length > 0 ? venta.productos[0] : null;

        // Calcular cantidad total de productos en la venta
        const cantidadTotal = venta.productos
          ? venta.productos.reduce(
              (sum: number, prod: any) => sum + parseInt(prod.cantidad?.toString() || '0'),
              0
            )
          : 0;

        return {
          id: index + 1,
          date: venta.fecha2,
          product: primerProducto?.nombre || 'Producto',
          quantity: cantidadTotal,
          unitPrice: primerProducto?.precio || 0,
          total: parseFloat(venta.total?.toString() || '0'),
          status: (venta as any).pagado ? 'Completada' : 'Pendiente',
          statusClass: (venta as any).pagado ? 'bg-success' : 'bg-warning',
        };
      });

      console.log('✅ Historial de ventas cargado desde memoria:', this.salesHistory.length);
    } catch (error) {
      console.error('❌ Error cargando historial de ventas:', error);
      this.salesHistory = [];
    }
  }

  addSoldProduct(): void {
    if (
      this.newSoldProduct.productId &&
      this.newSoldProduct.quantity > 0 &&
      this.newSoldProduct.unitPrice > 0
    ) {
      const selectedProduct = this.availableProducts.find(
        (p) => p.id == this.newSoldProduct.productId
      );
      const soldProduct = {
        productName: selectedProduct ? selectedProduct.name : 'Producto',
        quantity: this.newSoldProduct.quantity,
        unitPrice: this.newSoldProduct.unitPrice,
        total: this.newSoldProduct.quantity * this.newSoldProduct.unitPrice,
      };

      this.soldProducts.push(soldProduct);
      this.newSoldProduct = {
        productId: '',
        quantity: 1,
        unitPrice: 0,
      };
      this.calculateSummary();
    }
  }

  removeSoldProduct(index: number): void {
    if (confirm('¿Estás seguro de que deseas eliminar este producto vendido?')) {
      this.soldProducts.splice(index, 1);
      this.calculateSummary();
    }
  }

  addInvoice(): void {
    if (this.newInvoice.number && this.newInvoice.amount > 0) {
      this.dayInvoices.push({ ...this.newInvoice });
      this.newInvoice = {
        number: '',
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        isPaid: false,
      };
      this.calculateSummary();
    }
  }

  removeInvoice(index: number): void {
    if (confirm('¿Estás seguro de que deseas eliminar esta factura?')) {
      this.dayInvoices.splice(index, 1);
      this.calculateSummary();
    }
  }

  calculateSummary(): void {
    // Calcular total de ventas
    this.daySummary.totalSales = this.soldProducts.reduce((sum, product) => sum + product.total, 0);

    // Calcular facturas pendientes
    this.daySummary.pendingInvoices = this.dayInvoices
      .filter((invoice) => !invoice.isPaid)
      .reduce((sum, invoice) => sum + invoice.amount, 0);

    // Calcular total a recibir
    this.daySummary.totalToReceive = this.daySummary.totalSales - this.daySummary.pendingInvoices;
  }

  finalizeDay(): void {
    if (
      confirm('¿Estás seguro de que deseas finalizar el día? Esta acción no se puede deshacer.')
    ) {
      // Aquí guardarías todos los datos del día
      alert('Día finalizado correctamente');
      this.goBack();
    }
  }

  // Métodos para gestión de facturas
  loadInvoices(): void {
    if (this.distributor?.id) {
      // Limpiar suscripción anterior si existe
      if (this.ventasSubscription) {
        this.ventasSubscription.unsubscribe();
      }

      // Cargar datos iniciales desde memoria para mostrar inmediatamente
      this.loadInitialInvoicesFromMemory();

      // Suscribirse a cambios en tiempo real para mantener actualizado
      this.ventasSubscription = this.distributorsService
        .getVentasByDistribuidorRoleRealtime(this.distributor.id)
        .subscribe({
          next: async (ventas: any[]) => {
            // Actualizar los datos en memoria cuando llegan cambios del listener
            this.allDistributorSales = ventas;

            // ✅ ACTUALIZAR TODAS LAS ESTADÍSTICAS CON LOS NUEVOS DATOS
            await this.updateAllStatisticsFromRealtimeData();

            // Convertir las ventas a formato de facturas para mostrar en la UI
            this.allInvoices = ventas.map((venta, index) => ({
              id: index + 1,
              number: venta.factura,
              date: venta.fecha2,
              amount: parseFloat(venta.total?.toString() || '0'),
              isPaid: (venta as any).pagado === true, // Usar el campo pagado de la venta
              estado: (venta as any).estado || 'pendiente', // Nuevo campo para estado parcial
              montoPagado: parseFloat((venta as any).montoPagado?.toString() || '0'), // Nuevo campo
              montoPendiente: parseFloat((venta as any).montoPendiente?.toString() || '0'), // Nuevo campo
              notes: `Cliente: ${venta.cliente}`,
            }));

            console.log('🔄 Datos actualizados desde Firestore:', {
              ventas: this.allDistributorSales.length,
              facturas: this.allInvoices.length,
              estadisticas: this.salesData,
            });

            this.filteredInvoices = [...this.allInvoices];
            this.applyFilters();

            // Recargar gráficos con datos actualizados
            this.refreshCharts();
          },
          error: (error) => {
            console.error('❌ Error en listener de facturas:', error);
            // En caso de error, usar array vacío
            this.allInvoices = [];
            this.filteredInvoices = [];
          },
        });
    } else {
      // Si no hay distribuidor cargado, usar datos vacíos
      this.allInvoices = [];
      this.filteredInvoices = [];
    }
  }

  // Cargar facturas iniciales desde datos ya cargados en memoria
  private loadInitialInvoicesFromMemory(): void {
    if (this.allDistributorSales.length > 0) {
      // Convertir las ventas ya cargadas a formato de facturas
      this.allInvoices = this.allDistributorSales.map((venta, index) => ({
        id: index + 1,
        number: venta.factura,
        date: venta.fecha2,
        amount: parseFloat(venta.total?.toString() || '0'),
        isPaid: (venta as any).pagado === true,
        estado: (venta as any).estado || 'pendiente', // Nuevo campo para estado parcial
        montoPagado: parseFloat((venta as any).montoPagado?.toString() || '0'), // Nuevo campo
        montoPendiente: parseFloat((venta as any).montoPendiente?.toString() || '0'), // Nuevo campo
        notes: `Cliente: ${venta.cliente}`,
      }));

      console.log('📋 Facturas iniciales cargadas desde memoria:', this.allInvoices.length);
      this.filteredInvoices = [...this.allInvoices];
      this.applyFilters();
    }
  }

  // Refrescar gráficos cuando llegan datos actualizados
  private async refreshCharts(): Promise<void> {
    try {
      // Solo refrescar si los gráficos ya están inicializados y estamos en la pestaña de ventas
      if (this.activeTab === 'ventas') {
        console.log('🔄 Refrescando gráficos con datos actualizados...');
        // Usar setTimeout para asegurar que el DOM esté disponible
        setTimeout(async () => {
          await this.initializeCharts();
        }, 100);
      }
    } catch (error) {
      console.error('❌ Error refrescando gráficos:', error);
    }
  }

  // ✅ NUEVO: Actualizar todas las estadísticas cuando llegan datos en tiempo real
  private async updateAllStatisticsFromRealtimeData(): Promise<void> {
    try {
      const ventas = this.allDistributorSales;

      // Recalcular estadísticas de ventas
      const hoy = new Date();
      const fechaHoy = hoy.toISOString().split('T')[0];

      // Ventas del día actual
      const ventasHoy = ventas.filter((venta) => venta.fecha2 === fechaHoy);
      const totalVentasHoy = ventasHoy.reduce((sum, venta) => {
        const total =
          typeof venta.total === 'number'
            ? venta.total
            : parseFloat(venta.total?.toString() || '0');
        return sum + total;
      }, 0);

      // Ventas de los últimos 7 días (OPTIMIZACIÓN)
      const fechaHace7Dias = new Date();
      fechaHace7Dias.setDate(fechaHace7Dias.getDate() - 7);
      const fechaHace7DiasStr = fechaHace7Dias.toISOString().split('T')[0];

      const ventasUltimos7Dias = ventas.filter((venta) => venta.fecha2 >= fechaHace7DiasStr);
      const totalVentasUltimos7Dias = ventasUltimos7Dias.reduce((sum, venta) => {
        const total =
          typeof venta.total === 'number'
            ? venta.total
            : parseFloat(venta.total?.toString() || '0');
        return sum + total;
      }, 0);

      // Contar facturas pendientes de los últimos 7 días
      const facturasPendientes = ventas.filter((venta) => {
        const estaPendiente =
          (venta as any).pagado === false || (venta as any).pagado === undefined;
        if (!estaPendiente) return false;
        return venta.fecha2 >= fechaHace7DiasStr;
      }).length;

      // ✅ ACTUALIZAR ESTADÍSTICAS
      this.salesData = {
        today: totalVentasHoy,
        month: totalVentasUltimos7Dias, // Ahora representa los últimos 7 días
        pendingInvoices: facturasPendientes,
        productsSold: 0, // Ya no se calcula
      };

      // ✅ ACTUALIZAR TOTAL DEL DISTRIBUIDOR
      if (this.distributor) {
        this.distributor.totalSales = totalVentasUltimos7Dias;
      }

      // ✅ RECALCULAR HISTORIAL DE VENTAS
      await this.loadSalesHistory();

      // ✅ FORZAR DETECCIÓN DE CAMBIOS
      this.cdr.detectChanges();

      console.log('📊 Estadísticas actualizadas en tiempo real (últimos 7 días):', {
        ventasHoy: totalVentasHoy,
        ventasUltimos7Dias: totalVentasUltimos7Dias,
        facturasPendientes,
        totalVentas: ventas.length,
      });
    } catch (error) {
      console.error('❌ Error actualizando estadísticas en tiempo real:', error);
    }
  }

  applyFilters(): void {
    let filtered = [...this.allInvoices];

    // Filtro por estado
    if (this.invoiceFilter.status !== 'all') {
      switch (this.invoiceFilter.status) {
        case 'pending':
          filtered = filtered.filter((invoice) => !invoice.isPaid);
          break;
        case 'paid':
          filtered = filtered.filter((invoice) => invoice.isPaid);
          break;
        case 'overdue':
          filtered = filtered.filter(
            (invoice) => !invoice.isPaid && this.getDaysPending(invoice.date, invoice.isPaid) > 30
          );
          break;
      }
    }

    // Filtro por búsqueda
    if (this.invoiceFilter.search) {
      const searchTerm = this.invoiceFilter.search.toLowerCase();
      filtered = filtered.filter((invoice) => invoice.number.toLowerCase().includes(searchTerm));
    }

    // Filtro por fechas
    if (this.invoiceFilter.startDate) {
      filtered = filtered.filter((invoice) => invoice.date >= this.invoiceFilter.startDate);
    }
    if (this.invoiceFilter.endDate) {
      filtered = filtered.filter((invoice) => invoice.date <= this.invoiceFilter.endDate);
    }

    this.filteredInvoices = filtered;

    // Forzar detección de cambios después de aplicar filtros
    this.cdr.detectChanges();
  }

  getDaysPending(dateString: string, isPaid: boolean = false): number {
    // Si la factura está pagada, no hay días pendientes
    if (isPaid) {
      return 0;
    }

    const invoiceDate = new Date(dateString);
    const today = new Date();
    const diffTime = today.getTime() - invoiceDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  getDaysPendingClass(dateString: string, isPaid: boolean = false): string {
    // Si la factura está pagada, usar clase 'paid'
    if (isPaid) {
      return 'paid';
    }

    const days = this.getDaysPending(dateString, isPaid);
    if (days > 30) return 'critical';
    if (days > 15) return 'warning';
    return 'normal';
  }

  getPendingInvoicesCount(): number {
    return this.filteredInvoices.filter((invoice) => !invoice.isPaid).length;
  }

  getOverdueInvoicesCount(): number {
    return this.filteredInvoices.filter(
      (invoice) => !invoice.isPaid && this.getDaysPending(invoice.date, invoice.isPaid) > 30
    ).length;
  }

  getPendingAmount(): number {
    return this.filteredInvoices
      .filter((invoice) => !invoice.isPaid)
      .reduce((sum, invoice) => sum + invoice.amount, 0);
  }

  getAbonadoAmount(invoice: any): number {
    if (invoice.estado === 'parcial') {
      return invoice.montoPagado || 0;
    }
    return invoice.isPaid ? invoice.amount : 0;
  }

  getPendienteAmount(invoice: any): number {
    if (invoice.estado === 'parcial') {
      return invoice.montoPendiente || 0;
    }
    return invoice.isPaid ? 0 : invoice.amount;
  }

  getInvoiceStatusClass(invoice: any): string {
    if (invoice.estado === 'parcial') {
      return 'partial';
    }
    return invoice.isPaid ? 'paid' : 'pending';
  }

  getInvoiceStatusIcon(invoice: any): string {
    if (invoice.estado === 'parcial') {
      return 'fa-exclamation-triangle';
    }
    return invoice.isPaid ? 'fa-check-circle' : 'fa-clock';
  }

  getInvoiceStatusText(invoice: any): string {
    if (invoice.estado === 'parcial') {
      return 'Parcial';
    }
    return invoice.isPaid ? 'Pagada' : 'Pendiente';
  }

  async markAsPaid(invoice: any): Promise<void> {
    if (confirm(`¿Marcar la factura ${invoice.number} como pagada?`)) {
      try {
        // Actualizar en Firestore primero
        await this.distributorsService.markVentaAsPaid(invoice.number, invoice.amount);

        // Encontrar y actualizar la factura en allInvoices
        const invoiceIndex = this.allInvoices.findIndex((inv) => inv.id === invoice.id);
        if (invoiceIndex !== -1) {
          this.allInvoices[invoiceIndex].isPaid = true;
          this.allInvoices[invoiceIndex].notes = `${
            this.allInvoices[invoiceIndex].notes || ''
          }\nPagada el ${new Date().toLocaleDateString()}`;
        }

        // También actualizar el objeto pasado por referencia
        invoice.isPaid = true;
        invoice.notes = `${invoice.notes || ''}\nPagada el ${new Date().toLocaleDateString()}`;

        // Forzar actualización de la vista
        this.applyFilters();

        // Forzar detección de cambios en Angular
        this.cdr.detectChanges();

        // ✅ ACTUALIZAR ESTADÍSTICAS DESPUÉS DE MARCAR COMO PAGADA
        await this.updateAllStatisticsFromRealtimeData();

        // Si se está mostrando el modal de detalle, actualizar selectedInvoice también
        if (
          this.showInvoiceDetail &&
          this.selectedInvoice &&
          this.selectedInvoice.id === invoice.id
        ) {
          this.selectedInvoice.isPaid = true;
          this.selectedInvoice.notes = invoice.notes;
          // Forzar detección de cambios en el modal también
          this.cdr.detectChanges();
        }

        // Cerrar modal después de un delay si está abierto
        if (this.showInvoiceDetail && this.selectedInvoice === invoice) {
          setTimeout(() => {
            this.closeInvoiceDetail();
          }, 1500);
        }

        alert('Factura marcada como pagada correctamente');
      } catch (error) {
        console.error('❌ Error marcando factura como pagada:', error);
        alert('Error al marcar la factura como pagada. Intente nuevamente.');
      }
    }
  }

  viewInvoiceDetail(invoice: any): void {
    this.selectedInvoice = invoice;
    this.showInvoiceDetail = true;
  }

  closeInvoiceDetail(): void {
    this.selectedInvoice = null;
    this.showInvoiceDetail = false;
  }

  async deleteInvoice(invoice: any, index: number): Promise<void> {
    if (confirm(`¿Estás seguro de que deseas eliminar la factura ${invoice.number}?`)) {
      const actualIndex = this.allInvoices.findIndex((inv) => inv.id === invoice.id);
      if (actualIndex !== -1) {
        this.allInvoices.splice(actualIndex, 1);
        this.applyFilters();

        // ✅ ACTUALIZAR ESTADÍSTICAS DESPUÉS DE ELIMINAR FACTURA
        await this.updateAllStatisticsFromRealtimeData();

        alert('Factura eliminada correctamente');
      }
    }
  }

  exportInvoices(): void {
    // Simulación de exportación
    alert('Funcionalidad de exportación próximamente disponible');
  }

  generateReport(): void {
    // Simulación de generación de reporte
    alert('Funcionalidad de reporte próximamente disponible');
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
    if (tab === 'facturas') {
      this.applyFilters(); // Aplicar filtros cuando se abre la pestaña
    }

    // Inicializar gráficos cuando se cambia a la pestaña de ventas
    if (tab === 'ventas') {
      // Usar setTimeout para asegurar que el DOM esté disponible
      setTimeout(async () => {
        await this.initializeCharts();
      }, 100);
    }
  }

  goBack(): void {
    this.router.navigate(['/distributors']);
  }

  ngOnDestroy(): void {
    // Limpiar suscripción para evitar memory leaks
    if (this.ventasSubscription) {
      this.ventasSubscription.unsubscribe();
    }
  }

  // Método para manejar el cierre del día desde el componente de gestión
  onDayClosed(cierreDia: any): void {
    console.log('Día cerrado:', cierreDia);
    // Aquí puedes agregar lógica adicional cuando se cierra el día
    // Por ejemplo: actualizar estadísticas, mostrar notificación, etc.
    alert(`Día cerrado correctamente para ${this.distributor?.name}`);
  }
}
