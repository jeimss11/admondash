import { CommonModule, CurrencyPipe } from '@angular/common';
import {
  AfterViewChecked,
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { InventoryService, Producto } from '../services/inventory.service';

@Component({
  selector: 'app-inventory-dashboard',
  standalone: true,
  imports: [CommonModule, CurrencyPipe],
  templateUrl: './inventory-dashboard.html',
  styleUrl: './inventory-dashboard.scss',
})
export class InventoryDashboardComponent implements OnInit, AfterViewInit, AfterViewChecked {
  productos: Producto[] = [];
  loading = true;
  error: string | null = null;
  activeTab = 'dashboard';
  private chartsInitialized = false;

  // Métricas del dashboard
  totalProductos = 0;
  valorTotalInventario = 0;
  productosStockBajo = 0;
  productosSinStock = 0;

  // Configuración de stock bajo
  lowStockThreshold = 5;

  constructor(
    private route: ActivatedRoute,
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
    this.loadProductos();
  }

  ngAfterViewInit() {
    // Los gráficos se inicializarán después de que los productos se carguen
  }

  ngAfterViewChecked() {
    // Initialize charts only when DOM is ready and we're on the dashboard tab
    if (
      !this.loading &&
      !this.error &&
      this.productos.length >= 0 &&
      this.activeTab === 'dashboard' &&
      !this.chartsInitialized
    ) {
      console.log('Condiciones cumplidas, inicializando gráficos...');

      // Check if canvas elements exist before initializing
      const stockChart = document.getElementById('stockChart');
      const valueChart = document.getElementById('valueChart');

      if (stockChart && valueChart) {
        console.log('Canvas elements encontrados, inicializando gráficos inmediatamente...');
        this.initializeCharts();
      } else {
        console.log('Canvas elements no encontrados, esperando con setTimeout...');
        // Use setTimeout to ensure DOM is fully rendered
        setTimeout(() => {
          this.initializeCharts();
        }, 100);
      }
    }
  }

  private loadProductos() {
    console.log('Iniciando carga de productos...');
    this.loading = true;

    this.inventoryService.getProductos().subscribe(
      (productos) => {
        console.log('Productos cargados desde Firestore:', productos);
        this.productos = productos;
        this.calculateMetrics();
        this.loading = false;
        this.cdr.detectChanges();
        console.log('Productos cargados exitosamente');
      },
      (error) => {
        console.error('Error al cargar productos:', error);
        this.error = `Error al cargar productos: ${error.message || 'Error desconocido'}`;
        this.loading = false;
        this.cdr.detectChanges();
      }
    );
  }

  private calculateMetrics() {
    this.totalProductos = this.productos.length;
    this.valorTotalInventario = this.productos.reduce((total, producto) => {
      return total + Number(producto.cantidad) * Number(producto.valor);
    }, 0);

    this.productosStockBajo = this.productos.filter(
      (producto) =>
        Number(producto.cantidad) > 0 && Number(producto.cantidad) <= this.lowStockThreshold
    ).length;

    this.productosSinStock = this.productos.filter(
      (producto) => Number(producto.cantidad) === 0
    ).length;
  }

  private initializeCharts() {
    console.log('Inicializando gráficos...');

    // Only initialize if we're on the dashboard tab
    if (this.activeTab !== 'dashboard') {
      console.log('No estamos en la pestaña dashboard, saltando inicialización de gráficos');
      return;
    }

    console.log('Verificando elementos canvas...');
    const stockCanvas = document.getElementById('stockChart');
    const valueCanvas = document.getElementById('valueChart');
    console.log('Canvas stockChart encontrado:', !!stockCanvas);
    console.log('Canvas valueChart encontrado:', !!valueCanvas);

    try {
      this.createStockChart();
      this.createValueChart();
      this.chartsInitialized = true;
      console.log('Gráficos inicializados exitosamente');
    } catch (error) {
      console.error('Error al inicializar gráficos:', error);
      // Reset flag so we can try again
      this.chartsInitialized = false;
    }
  }

  private createStockChart() {
    console.log('Creando gráfico de distribución de stock...');
    const ctx = document.getElementById('stockChart') as HTMLCanvasElement;
    if (!ctx) {
      console.warn(
        'Canvas stockChart no encontrado, esperando al próximo ciclo de detección de cambios'
      );
      return;
    }

    // Check if canvas has a valid 2D context
    const context = ctx.getContext('2d');
    if (!context) {
      console.error('No se pudo obtener el contexto 2D del canvas stockChart');
      return;
    }

    // Get top 10 products by stock quantity
    const topProducts = this.productos
      .sort((a, b) => Number(b.cantidad) - Number(a.cantidad))
      .slice(0, 10);

    try {
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: topProducts.map((p) =>
            p.nombre.length > 15 ? p.nombre.substring(0, 15) + '...' : p.nombre
          ),
          datasets: [
            {
              label: 'Cantidad en Stock',
              data: topProducts.map((p) => Number(p.cantidad)),
              backgroundColor: 'rgba(54, 162, 235, 0.6)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1,
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
    const ctx = document.getElementById('valueChart') as HTMLCanvasElement;
    if (!ctx) {
      console.warn(
        'Canvas valueChart no encontrado, esperando al próximo ciclo de detección de cambios'
      );
      return;
    }

    // Check if canvas has a valid 2D context
    const context = ctx.getContext('2d');
    if (!context) {
      console.error('No se pudo obtener el contexto 2D del canvas valueChart');
      return;
    }

    // Calculate stock status distribution
    const normalStock = this.productos.filter(
      (p) => Number(p.cantidad) > this.lowStockThreshold
    ).length;
    const lowStock = this.productosStockBajo;
    const outOfStock = this.productosSinStock;

    try {
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Stock Normal', 'Stock Bajo', 'Sin Stock'],
          datasets: [
            {
              data: [normalStock, lowStock, outOfStock],
              backgroundColor: [
                'rgba(75, 192, 192, 0.6)',
                'rgba(255, 206, 86, 0.6)',
                'rgba(255, 99, 132, 0.6)',
              ],
              borderColor: [
                'rgba(75, 192, 192, 1)',
                'rgba(255, 206, 86, 1)',
                'rgba(255, 99, 132, 1)',
              ],
              borderWidth: 1,
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

  setActiveTab(tab: string) {
    if (tab === 'products') {
      // Navegar directamente al componente de gestión de productos
      this.router.navigate(['/inventory/products']);
    } else {
      this.activeTab = tab;
      // Reinicializar gráficos si volvemos al dashboard
      if (tab === 'dashboard') {
        this.chartsInitialized = false;
        setTimeout(() => this.initializeCharts(), 100);
      }
    }
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  refreshData() {
    this.loadProductos();
    this.chartsInitialized = false; // Reset to reinitialize charts
  }

  exportData() {
    alert('Funcionalidad de exportación próximamente disponible');
  }

  getStockStatusClass(producto: Producto): string {
    const cantidad = Number(producto.cantidad);
    if (cantidad === 0) {
      return 'bg-danger';
    } else if (cantidad <= this.lowStockThreshold) {
      return 'bg-warning';
    } else {
      return 'bg-success';
    }
  }

  getStockStatusText(producto: Producto): string {
    const cantidad = Number(producto.cantidad);
    if (cantidad === 0) {
      return 'Sin Stock';
    } else if (cantidad <= this.lowStockThreshold) {
      return 'Stock Bajo';
    } else {
      return 'Normal';
    }
  }
}
