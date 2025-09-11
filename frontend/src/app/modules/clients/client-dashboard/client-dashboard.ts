import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import {
  AfterViewChecked,
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { Cliente } from '../../../shared/models/cliente.model';
import { ClientsService } from '../clients/clients.service';

@Component({
  selector: 'app-client-dashboard',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe],
  templateUrl: './client-dashboard.html',
  styleUrl: './client-dashboard.scss',
})
export class ClientDashboardComponent implements OnInit, AfterViewInit, AfterViewChecked {
  client: Cliente | null = null;
  loading = true;
  error: string | null = null;
  activeTab = 'overview';
  private chartsInitialized = false;

  // Mock data for demonstration
  recentPurchases = [
    { date: new Date(), amount: 1500, status: 'Completado' },
    { date: new Date(Date.now() - 86400000), amount: 2300, status: 'Pendiente' },
    { date: new Date(Date.now() - 172800000), amount: 800, status: 'Completado' },
  ];

  paymentHistory = [
    { date: new Date(), amount: 1500, method: 'Transferencia' },
    { date: new Date(Date.now() - 86400000), amount: 2300, method: 'Efectivo' },
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private clientsService: ClientsService,
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
    const local = this.route.snapshot.paramMap.get('local');
    if (local) {
      this.loadClient(local);
    } else {
      this.error = 'Cliente no encontrado';
      this.loading = false;
    }
  }

  ngAfterViewInit() {
    // Los gráficos se inicializarán después de que el cliente se cargue
  }

  ngAfterViewChecked() {
    // Debug logging
    console.log('ngAfterViewChecked - Estado:', {
      loading: this.loading,
      error: this.error,
      client: !!this.client,
      activeTab: this.activeTab,
      chartsInitialized: this.chartsInitialized,
    });

    // Initialize charts only when DOM is ready and we're on the overview tab
    if (
      !this.loading &&
      !this.error &&
      this.client &&
      this.activeTab === 'overview' &&
      !this.chartsInitialized
    ) {
      console.log('Condiciones cumplidas, inicializando gráficos...');

      // Check if canvas elements exist before initializing
      const salesCanvas = document.getElementById('salesChart');
      const paymentsCanvas = document.getElementById('paymentsChart');

      if (salesCanvas && paymentsCanvas) {
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

  private tryInitializeCharts() {
    // Este método ya no se usa, pero lo mantenemos por compatibilidad
  }

  private loadClient(local: string) {
    console.log('Iniciando carga del cliente con local:', local);

    // Verificar si el usuario está autenticado
    try {
      // Usar el método público del servicio si existe, o acceder directamente
      const userId = this.clientsService['auth']?.currentUser?.uid;
      console.log('UserId obtenido:', userId);

      if (!userId) {
        console.warn('Usuario no autenticado');
        this.error = 'Usuario no autenticado. Por favor, inicia sesión nuevamente.';
        this.loading = false;
        return;
      }

      console.log('Usuario autenticado:', userId);
      console.log('Buscando cliente con local:', local);

      this.clientsService.getClientes().subscribe(
        (clients) => {
          console.log('Clientes cargados desde Firestore:', clients);
          console.log('Número de clientes:', clients.length);

          // Buscar por local o por id
          this.client = clients.find((c) => c.local === local || c.id === local) || null;

          console.log('Cliente encontrado:', this.client);

          if (this.client) {
            console.log('Cliente cargado exitosamente');
            this.loading = false;
            this.cdr.detectChanges(); // Force change detection to update the view
            // Charts will be initialized in ngAfterViewChecked when DOM is ready
          } else {
            console.warn('Cliente no encontrado con local:', local);
            this.error = `Cliente con identificador "${local}" no encontrado en la base de datos`;
            this.loading = false;
          }
        },
        (error) => {
          console.error('Error al cargar clientes desde Firestore:', error);
          this.error = `Error al cargar datos: ${error.message || 'Error desconocido'}`;
          this.loading = false;
        }
      );
    } catch (err) {
      console.error('Error al verificar autenticación:', err);
      this.error = 'Error de autenticación. Por favor, recarga la página.';
      this.loading = false;
    }
  }

  private initializeCharts() {
    console.log('Inicializando gráficos...');

    // Only initialize if we're on the overview tab
    if (this.activeTab !== 'overview') {
      console.log('No estamos en la pestaña overview, saltando inicialización de gráficos');
      return;
    }

    console.log('Verificando elementos canvas...');
    const salesCanvas = document.getElementById('salesChart');
    const paymentsCanvas = document.getElementById('paymentsChart');
    console.log('Canvas salesChart encontrado:', !!salesCanvas);
    console.log('Canvas paymentsChart encontrado:', !!paymentsCanvas);

    try {
      this.createSalesChart();
      this.createPaymentsChart();
      this.chartsInitialized = true;
      console.log('Gráficos inicializados exitosamente');
    } catch (error) {
      console.error('Error al inicializar gráficos:', error);
      // Reset flag so we can try again
      this.chartsInitialized = false;
    }
  }

  private createSalesChart() {
    console.log('Creando gráfico de ventas...');
    const ctx = document.getElementById('salesChart') as HTMLCanvasElement;
    if (!ctx) {
      console.warn(
        'Canvas salesChart no encontrado, esperando al próximo ciclo de detección de cambios'
      );
      return;
    }

    // Check if canvas has a valid 2D context
    const context = ctx.getContext('2d');
    if (!context) {
      console.error('No se pudo obtener el contexto 2D del canvas salesChart');
      return;
    }

    try {
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
          datasets: [
            {
              data: [1200, 1900, 3000, 5000, 2000, 3000],
              label: 'Compras',
              borderColor: '#42A5F5',
              backgroundColor: 'rgba(66, 165, 245, 0.1)',
              tension: 0.4,
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: true } },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function (value) {
                  return '$' + Number(value).toLocaleString();
                },
              },
            },
          },
        },
      });
      console.log('Gráfico de ventas creado exitosamente');
    } catch (error) {
      console.error('Error al crear gráfico de ventas:', error);
      throw error;
    }
  }

  private createPaymentsChart() {
    console.log('Creando gráfico de pagos...');
    const ctx = document.getElementById('paymentsChart') as HTMLCanvasElement;
    if (!ctx) {
      console.warn(
        'Canvas paymentsChart no encontrado, esperando al próximo ciclo de detección de cambios'
      );
      return;
    }

    // Check if canvas has a valid 2D context
    const context = ctx.getContext('2d');
    if (!context) {
      console.error('No se pudo obtener el contexto 2D del canvas paymentsChart');
      return;
    }

    try {
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Pagado', 'Pendiente'],
          datasets: [
            {
              data: [80, 20],
              backgroundColor: ['#4CAF50', '#FF9800'],
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom' } },
        },
      });
      console.log('Gráfico de pagos creado exitosamente');
    } catch (error) {
      console.error('Error al crear gráfico de pagos:', error);
      throw error;
    }
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
    // Reset charts initialization flag when switching tabs
    if (tab === 'overview' && !this.chartsInitialized) {
      // Charts will be initialized in ngAfterViewChecked
    }
  }

  goBack() {
    this.router.navigate(['/clients']);
  }

  exportData() {
    alert('Funcionalidad de exportación próximamente disponible');
  }

  trackByDate(index: number, item: any): any {
    return item.date;
  }
}
