import { CommonModule, CurrencyPipe } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { Subscription, catchError, of, switchMap } from 'rxjs';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { InventoryConfigurationService } from '../services/inventory-configuration.service';
import { exportObservedInventory } from '../services/inventory-export';
import { InventoryService, Producto } from '../services/inventory.service';

@Component({
  selector: 'app-inventory-dashboard',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, RouterLink],
  templateUrl: './inventory-dashboard.html',
  styleUrl: './inventory-dashboard.scss',
})
export class InventoryDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly subscriptions = new Subscription();
  private readonly context = inject(BusinessContextService);
  private readonly configuration = inject(InventoryConfigurationService);
  private productSubscription = new Subscription();
  private disposed = false;
  private chartRetry: ReturnType<typeof setTimeout> | null = null;
  productos: Producto[] = [];
  loading = true;
  error: string | null = null;
  activeTab = 'dashboard';

  // ViewChild para acceder a los elementos canvas
  @ViewChild('stockChart', { static: false }) stockChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('valueChart', { static: false }) valueChartCanvas!: ElementRef<HTMLCanvasElement>;

  // Instancias de gráficos para poder destruirlos
  private stockChart: Chart | null = null;
  private valueChart: Chart | null = null;

  // Métricas del dashboard
  totalProductos = 0;
  valorTotalInventario = 0;
  productosStockBajo = 0;
  productosSinStock = 0;
  productosConCantidadNegativa = 0;
  productosConSaldoNoInformado = 0;

  // Configuración de stock bajo
  lowStockThreshold = 5;

  constructor(
    private router: Router,
    private inventoryService: InventoryService,
    private cdr: ChangeDetectorRef
  ) {
    console.log('Constructor - Registrando Chart.js...');
    try {
      Chart.register(...registerables);
      console.log('Chart.js registrado exitosamente');
    } catch (error) {
      console.error('Error al registrar Chart.js:', error);
    }
  }

  ngOnInit() {
    this.subscriptions.add(this.context.context$.pipe(switchMap((context) => {
      return context.status === 'signed-out' ? of(null) : this.configuration.watch(context.ownerUid).pipe(catchError(() => {
        this.error = 'No fue posible consultar el umbral administrativo de inventario.'; return of(null);
      }));
    })).subscribe((configuration) => {
      this.lowStockThreshold = configuration?.lowStockThreshold ?? 5;
      this.calculateMetrics(); this.cdr.markForCheck();
      if (!this.loading) this.updateCharts();
    }));
    this.loadProductos();
  }

  ngAfterViewInit() {
    // Los gráficos se inicializarán después de que los productos se carguen
  }

  ngOnDestroy() {
    this.disposed = true;
    this.subscriptions.unsubscribe();
    this.productSubscription.unsubscribe();
    if (this.chartRetry !== null) clearTimeout(this.chartRetry);
    // Destruir gráficos para evitar memory leaks
    if (this.stockChart) {
      this.stockChart.destroy();
    }
    if (this.valueChart) {
      this.valueChart.destroy();
    }
  }

  private loadProductos() {
    console.log('Iniciando carga de productos...');
    this.loading = true;

    this.error = null;
    this.productSubscription.unsubscribe();
    this.productSubscription = this.inventoryService.getProductos().subscribe(
      (productos) => {
        this.productos = productos;
        if (productos.length === 0) {
          this.stockChart?.destroy(); this.stockChart = null;
          this.valueChart?.destroy(); this.valueChart = null;
          if (this.chartRetry !== null) { clearTimeout(this.chartRetry); this.chartRetry = null; }
        }
        this.calculateMetrics();
        this.loading = false;
        this.cdr.detectChanges();

        // Inicializar gráficos después de cargar los datos
        if (this.activeTab === 'dashboard') {
          this.initializeCharts();
        }

        console.log('Productos cargados exitosamente');
      },
      (error) => {
        console.error('Error al cargar productos:', error);
        this.error = `Error al cargar productos: ${error.message || 'Error desconocido'}`;
        this.loading = false;
        this.productos = []; this.calculateMetrics();
        this.stockChart?.destroy(); this.stockChart = null;
        this.valueChart?.destroy(); this.valueChart = null;
        this.cdr.detectChanges();
      }
    );
  }

  private calculateMetrics() {
    this.totalProductos = this.productos.length;
    this.productosConCantidadNegativa = this.productos.filter(
      (producto) => this.knownQuantity(producto) !== null && this.knownQuantity(producto)! < 0
    ).length;
    this.productosConSaldoNoInformado = this.productos.filter(
      (producto) => this.knownQuantity(producto) === null
    ).length;
    this.valorTotalInventario = this.productos.reduce((total, producto) => {
      const quantity = this.knownQuantity(producto);
      const price = Number(producto.valor);
      return quantity !== null && quantity >= 0 && Number.isFinite(price) ? total + quantity * price : total;
    }, 0);

    this.productosStockBajo = this.productos.filter(
      (producto) =>
        this.knownQuantity(producto) !== null && this.knownQuantity(producto)! > 0 && this.knownQuantity(producto)! <= this.lowStockThreshold
    ).length;

    this.productosSinStock = this.productos.filter(
      (producto) => this.knownQuantity(producto) === 0
    ).length;
  }

  private initializeCharts() {
    if (this.disposed) return;
    console.log('Inicializando gráficos...');

    // Only initialize if we're on the dashboard tab and have data
    if (this.activeTab !== 'dashboard' || !this.productos || this.productos.length === 0) {
      console.log('No se pueden inicializar gráficos: tab incorrecto o sin datos');
      return;
    }

    // Verificar que los ViewChild estén disponibles
    if (!this.stockChartCanvas || !this.valueChartCanvas) {
      console.log('ViewChild no disponibles, esperando al próximo ciclo...');
      if (this.chartRetry !== null) clearTimeout(this.chartRetry);
      this.chartRetry = setTimeout(() => this.initializeCharts(), 100);
      return;
    }

    try {
      this.createStockChart();
      this.createValueChart();
      console.log('Gráficos inicializados exitosamente');
    } catch (error) {
      console.error('Error al inicializar gráficos:', error);
      this.error = 'Error al cargar los gráficos del dashboard';
    }
  }

  private createStockChart() {
    console.log('Creando gráfico de distribución de stock...');

    if (!this.stockChartCanvas) {
      console.warn('Canvas stockChart no disponible');
      return;
    }

    const ctx = this.stockChartCanvas.nativeElement.getContext('2d');
    if (!ctx) {
      console.error('No se pudo obtener el contexto 2D del canvas stockChart');
      return;
    }

    // Destruir gráfico anterior si existe
    if (this.stockChart) {
      this.stockChart.destroy();
    }

    // Get top 10 products by stock quantity
    const topProducts = this.productos
      .filter((product) => this.knownQuantity(product) !== null && this.knownQuantity(product)! >= 0)
      .sort((a, b) => Number(b.cantidad) - Number(a.cantidad))
      .slice(0, 10);

    try {
      this.stockChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: topProducts.map((p) =>
            p.nombre.length > 15 ? p.nombre.substring(0, 15) + '...' : p.nombre
          ),
          datasets: [
            {
              label: 'Cantidad en Stock',
              data: topProducts.map((p) => Number(p.cantidad)),
              backgroundColor: 'rgba(13, 110, 253, 0.8)', // Bootstrap primary más vibrante
              borderColor: 'rgba(13, 110, 253, 1)', // Bootstrap primary sólido
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: true },
            title: {
              display: true,
              text: 'Top 10 Productos por Cantidad',
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                precision: 0,
              },
            },
          },
        },
      });
      console.log('Gráfico de stock creado exitosamente');
    } catch (error) {
      console.error('Error al crear gráfico de stock:', error);
      throw error;
    }
  }

  private createValueChart() {
    console.log('Creando gráfico de distribución de valor...');

    if (!this.valueChartCanvas) {
      console.warn('Canvas valueChart no disponible');
      return;
    }

    const ctx = this.valueChartCanvas.nativeElement.getContext('2d');
    if (!ctx) {
      console.error('No se pudo obtener el contexto 2D del canvas valueChart');
      return;
    }

    // Destruir gráfico anterior si existe
    if (this.valueChart) {
      this.valueChart.destroy();
    }

    // Calculate stock status distribution
    const normalStock = this.productos.filter(
      (p) => this.knownQuantity(p) !== null && this.knownQuantity(p)! > this.lowStockThreshold
    ).length;
    const lowStock = this.productosStockBajo;
    const outOfStock = this.productosSinStock;
    const invalidStock = this.productosConCantidadNegativa + this.productosConSaldoNoInformado;

    try {
      this.valueChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Stock Normal', 'Stock Bajo', 'Sin Stock', 'Cantidad no informada o inválida'],
          datasets: [
            {
              data: [normalStock, lowStock, outOfStock, invalidStock],
              backgroundColor: [
                'rgba(25, 135, 84, 0.9)', // Bootstrap success - verde más vibrante
                'rgba(255, 193, 7, 0.9)', // Bootstrap warning - amarillo más vibrante
                'rgba(220, 53, 69, 0.9)', // Bootstrap danger - rojo más vibrante
                'rgba(108, 117, 125, 0.9)', // Bootstrap secondary - dato inválido
              ],
              borderColor: [
                'rgba(25, 135, 84, 1)', // Bootstrap success sólido
                'rgba(255, 193, 7, 1)', // Bootstrap warning sólido
                'rgba(220, 53, 69, 1)', // Bootstrap danger sólido
                'rgba(108, 117, 125, 1)', // Bootstrap secondary sólido
              ],
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'bottom' },
            title: {
              display: true,
              text: 'Estado del Inventario',
            },
          },
        },
      });
      console.log('Gráfico de valor creado exitosamente');
    } catch (error) {
      console.error('Error al crear gráfico de valor:', error);
      throw error;
    }
  }

  private updateCharts() {
    // Destruir gráficos anteriores y crear nuevos
    if (this.stockChart) {
      this.stockChart.destroy();
      this.stockChart = null;
    }
    if (this.valueChart) {
      this.valueChart.destroy();
      this.valueChart = null;
    }
    this.initializeCharts();
  }

  setActiveTab(tab: string) {
    const destination: Record<string, string> = {
      dashboard: '/inventory',
      products: '/inventory/products',
      reports: '/inventory/reports',
      settings: '/inventory/settings',
    };
    this.router.navigate([destination[tab] ?? '/inventory']);
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  refreshData() {
    this.loadProductos();
  }

  exportData() {
    if (!this.loading && !this.error) exportObservedInventory(this.productos);
  }

  getStockStatusClass(producto: Producto): string {
    const cantidad = this.knownQuantity(producto);
    if (cantidad === null) {
      return 'bg-secondary';
    } else if (cantidad < 0) {
      return 'bg-dark';
    } else if (cantidad === 0) {
      return 'bg-danger';
    } else if (cantidad <= this.lowStockThreshold) {
      return 'bg-warning';
    } else {
      return 'bg-success';
    }
  }

  getStockStatusText(producto: Producto): string {
    const cantidad = this.knownQuantity(producto);
    if (cantidad === null) {
      return 'No informado';
    } else if (cantidad < 0) {
      return 'Cantidad inválida';
    } else if (cantidad === 0) {
      return 'Sin Stock';
    } else if (cantidad <= this.lowStockThreshold) {
      return 'Stock Bajo';
    } else {
      return 'Normal';
    }
  }

  private knownQuantity(producto: Producto): number | null {
    if (producto.cantidad === undefined || producto.cantidad === null || String(producto.cantidad).trim() === '') return null;
    const quantity = Number(producto.cantidad);
    return Number.isFinite(quantity) ? quantity : null;
  }
}
