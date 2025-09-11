import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';

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

  // Datos de ejemplo
  salesData = {
    today: 1250,
    month: 8500,
    pendingInvoices: 2,
    productsSold: 45,
  };

  // Propiedades para "Abrir Día"
  selectedDate: string = new Date().toISOString().split('T')[0];
  initialProducts: any[] = [
    { name: 'Producto A', initialQuantity: 100, unitPrice: 10.5 },
    { name: 'Producto B', initialQuantity: 50, unitPrice: 15 },
    { name: 'Producto C', initialQuantity: 75, unitPrice: 8.25 },
  ];

  availableProducts: any[] = [
    { id: 1, name: 'Producto A' },
    { id: 2, name: 'Producto B' },
    { id: 3, name: 'Producto C' },
    { id: 4, name: 'Producto D' },
  ];

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

  constructor(private route: ActivatedRoute, private router: Router) {
    Chart.register(...registerables);
  }

  ngOnInit(): void {
    const distributorId = this.route.snapshot.paramMap.get('id');
    if (distributorId) {
      // Aquí cargarías los datos del distribuidor desde un servicio
      this.distributor = {
        id: distributorId,
        name: 'Distribuidor Ejemplo',
        contact: '123456789',
        totalSales: 15000,
        status: 'Activo',
      };
    }
    this.loadDayData();
    this.loadInvoices();
  }

  ngAfterViewInit(): void {
    this.initializeCharts();
  }

  initializeCharts(): void {
    this.createSalesChart();
    this.createProductsChart();
  }

  createSalesChart(): void {
    const ctx = document.getElementById('salesChart') as HTMLCanvasElement;
    if (ctx) {
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
          datasets: [
            {
              label: 'Ventas Diarias',
              data: [1200, 1900, 3000, 5000, 2000, 3000, 1250],
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
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Producto A', 'Producto B', 'Producto C', 'Producto D'],
          datasets: [
            {
              data: [30, 25, 20, 25],
              backgroundColor: ['#007bff', '#28a745', '#ffc107', '#dc3545'],
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

  loadDayData(): void {
    // Aquí cargarías los datos del día desde un servicio
    // Por ahora, inicializamos con datos de ejemplo
    this.soldProducts = [];
    this.dayInvoices = [];
    this.calculateSummary();
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
    // En una aplicación real, aquí cargarías las facturas desde un servicio
    this.filteredInvoices = [...this.allInvoices];
    this.applyFilters(); // Aplicar filtros iniciales
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
            (invoice) => !invoice.isPaid && this.getDaysPending(invoice.date) > 30
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

  getDaysPending(dateString: string): number {
    const invoiceDate = new Date(dateString);
    const today = new Date();
    const diffTime = today.getTime() - invoiceDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  getDaysPendingClass(dateString: string): string {
    const days = this.getDaysPending(dateString);
    if (days > 30) return 'critical';
    if (days > 15) return 'warning';
    return 'normal';
  }

  getPendingInvoicesCount(): number {
    return this.filteredInvoices.filter((invoice) => !invoice.isPaid).length;
  }

  getOverdueInvoicesCount(): number {
    return this.filteredInvoices.filter(
      (invoice) => !invoice.isPaid && this.getDaysPending(invoice.date) > 30
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
