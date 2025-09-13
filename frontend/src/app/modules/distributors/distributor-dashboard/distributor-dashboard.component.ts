import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { DistributorsService } from '../services/distributors.service';

@Component({
  selector: 'app-distributor-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './distributor-dashboard.component.html',
  styleUrls: ['./distributor-dashboard.component.scss'],
})
export class DistributorDashboardComponent implements OnInit, AfterViewInit {
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
    private distributorsService: DistributorsService
  ) {
    Chart.register(...registerables);
  }

  async ngOnInit(): Promise<void> {
    const distributorRole = this.route.snapshot.paramMap.get('role');
    if (distributorRole) {
      await this.loadDistributorData(distributorRole);
    } else {
      console.error('❌ No se proporcionó un role de distribuidor');
      this.goBack();
    }
    await this.loadDayData();
    await this.loadInvoices();
    await this.loadProductos();
  }

  ngAfterViewInit(): void {
    this.initializeCharts();
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

      // Obtener todas las ventas del distribuidor
      const ventas = await this.distributorsService.getVentasByDistribuidorRole(role);

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

      // Ventas del mes actual
      const mesActual = hoy.getMonth();
      const anioActual = hoy.getFullYear();
      const ventasMes = ventas.filter((venta) => {
        const fechaVenta = new Date(venta.fecha2);
        return fechaVenta.getMonth() === mesActual && fechaVenta.getFullYear() === anioActual;
      });
      const totalVentasMes = ventasMes.reduce((sum, venta) => {
        const total =
          typeof venta.total === 'number'
            ? venta.total
            : parseFloat(venta.total?.toString() || '0');
        return sum + total;
      }, 0);

      // Contar productos vendidos (suma de cantidades de todos los productos)
      const productosVendidos = ventasHoy.reduce((sum, venta) => {
        if (venta.productos && Array.isArray(venta.productos)) {
          return (
            sum +
            venta.productos.reduce((prodSum, producto) => {
              return prodSum + (producto.cantidad ? parseInt(producto.cantidad.toString()) : 0);
            }, 0)
          );
        }
        return sum;
      }, 0);

      // Contar facturas pendientes usando el campo 'pagado' (boolean)
      const facturasPendientes = ventas.filter((venta) => {
        // Considerar pendiente si pagado es false o undefined (por compatibilidad)
        const estaPendiente = venta.pagado === false || venta.pagado === undefined;
        if (!estaPendiente) return false;

        // Solo contar las del mes actual
        const fechaVenta = new Date(venta.fecha2);
        return fechaVenta.getMonth() === mesActual && fechaVenta.getFullYear() === anioActual;
      }).length;

      // Actualizar las estadísticas del componente
      this.salesData = {
        today: totalVentasHoy,
        month: totalVentasMes,
        pendingInvoices: facturasPendientes,
        productsSold: productosVendidos,
      };

      // Actualizar el total de ventas del distribuidor
      if (this.distributor) {
        this.distributor.totalSales = totalVentasMes;
      }

      console.log('✅ Estadísticas cargadas:', {
        ventasTotales: ventas.length,
        ventasHoy: ventasHoy.length,
        totalHoy: totalVentasHoy,
        totalMes: totalVentasMes,
        productosVendidos,
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

  private getLast7DaysSalesData(): { labels: string[]; data: number[] } {
    const labels: string[] = [];
    const data: number[] = [];

    // Generar las últimas 7 fechas
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayName = date.toLocaleDateString('es-ES', { weekday: 'short' });
      const dateString = date.toISOString().split('T')[0];

      labels.push(dayName);

      // Calcular ventas para esta fecha específica
      // Esto debería hacerse con los datos reales del distribuidor
      // Por ahora, devolver 0 hasta que integremos completamente
      data.push(0);
    }

    return { labels, data };
  }

  private getProductDistributionData(): { labels: string[]; data: number[] } {
    // Aquí deberíamos calcular la distribución real de productos
    // basándonos en las ventas del distribuidor
    // Por ahora, devolver datos por defecto
    return {
      labels: ['Sin datos'],
      data: [1],
    };
  }

  initializeCharts(): void {
    this.createSalesChart();
    this.createProductsChart();
  }

  createSalesChart(): void {
    const ctx = document.getElementById('salesChart') as HTMLCanvasElement;
    if (ctx) {
      // Obtener datos de ventas de los últimos 7 días
      const salesData = this.getLast7DaysSalesData();

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
    }
  }

  createProductsChart(): void {
    const ctx = document.getElementById('productsChart') as HTMLCanvasElement;
    if (ctx) {
      // Obtener datos de distribución de productos
      const productData = this.getProductDistributionData();

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
    }
  }

  async loadDayData(): Promise<void> {
    try {
      if (this.distributor?.id) {
        // Cargar datos del día actual desde Firestore
        const fechaHoy = new Date().toISOString().split('T')[0];

        // Obtener ventas del día actual para este distribuidor
        const ventasHoy = await this.distributorsService.getVentasByDistribuidorRole(
          this.distributor.id
        );
        const ventasDelDia = ventasHoy.filter((venta) => venta.fecha2 === fechaHoy);

        // Convertir ventas del día a formato de productos vendidos
        this.soldProducts = ventasDelDia.flatMap(
          (venta) =>
            venta.productos
              ?.filter(
                (producto) =>
                  producto &&
                  producto.nombre &&
                  producto.cantidad !== undefined &&
                  producto.precio !== undefined &&
                  producto.total !== undefined
              )
              .map((producto) => ({
                productName: producto.nombre || 'Producto sin nombre',
                quantity: parseInt(producto.cantidad?.toString() || '0'),
                unitPrice: parseFloat(producto.precio?.toString() || '0'),
                total: parseFloat(producto.total?.toString() || '0'),
              })) || []
        );

        // Las facturas del día se manejan por separado
        this.dayInvoices = [];

        console.log('✅ Datos del día cargados:', {
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
  async loadInvoices(): Promise<void> {
    try {
      if (this.distributor?.id) {
        // Cargar facturas reales desde Firestore basadas en el distribuidor
        const ventas = await this.distributorsService.getVentasByDistribuidorRole(
          this.distributor.id
        );

        // Convertir las ventas a formato de facturas para mostrar en la UI
        this.allInvoices = ventas.map((venta, index) => ({
          id: index + 1,
          number: venta.factura,
          date: venta.fecha2,
          amount: parseFloat(venta.total?.toString() || '0'),
          isPaid: venta.pagado === true, // Usar el campo pagado de la venta
          notes: `Cliente: ${venta.cliente}`,
        }));

        console.log('✅ Facturas cargadas desde Firestore:', this.allInvoices.length);
      } else {
        // Si no hay distribuidor cargado, usar datos vacíos
        this.allInvoices = [];
      }

      this.filteredInvoices = [...this.allInvoices];
      this.applyFilters(); // Aplicar filtros iniciales
    } catch (error) {
      console.error('❌ Error cargando facturas:', error);
      // En caso de error, usar array vacío
      this.allInvoices = [];
      this.filteredInvoices = [];
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

  markAsPaid(invoice: any): void {
    if (confirm(`¿Marcar la factura ${invoice.number} como pagada?`)) {
      invoice.isPaid = true;
      invoice.notes = `${invoice.notes || ''}\nPagada el ${new Date().toLocaleDateString()}`;
      this.applyFilters(); // Recargar filtros para actualizar la vista
      alert('Factura marcada como pagada correctamente');
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

  deleteInvoice(invoice: any, index: number): void {
    if (confirm(`¿Estás seguro de que deseas eliminar la factura ${invoice.number}?`)) {
      const actualIndex = this.allInvoices.findIndex((inv) => inv.id === invoice.id);
      if (actualIndex !== -1) {
        this.allInvoices.splice(actualIndex, 1);
        this.applyFilters();
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
  }

  goBack(): void {
    this.router.navigate(['/distributors']);
  }
}
