import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { AfterViewInit, Component, OnInit } from '@angular/core';
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
export class ClientDashboardComponent implements OnInit, AfterViewInit {
  client: Cliente | null = null;
  loading = true;
  error: string | null = null;
  activeTab = 'overview';

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
    private clientsService: ClientsService
  ) {
    Chart.register(...registerables);
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
    // Charts will be initialized after client is loaded
  }

  private loadClient(local: string) {
    this.clientsService.getClientes().subscribe(
      (clients) => {
        this.client = clients.find((c) => c.local === local) || null;
        if (this.client) {
          this.initializeCharts();
        } else {
          this.error = 'Cliente no encontrado';
        }
        this.loading = false;
      },
      (error) => {
        this.error = error.message || 'Error al cargar cliente';
        this.loading = false;
      }
    );
  }

  private initializeCharts() {
    this.createSalesChart();
    this.createPaymentsChart();
  }

  private createSalesChart() {
    const ctx = document.getElementById('salesChart') as HTMLCanvasElement;
    if (ctx) {
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
          plugins: {
            legend: { display: true },
          },
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
    }
  }

  private createPaymentsChart() {
    const ctx = document.getElementById('paymentsChart') as HTMLCanvasElement;
    if (ctx) {
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
          plugins: {
            legend: { position: 'bottom' },
          },
        },
      });
    }
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }

  goBack() {
    this.router.navigate(['/clients']);
  }

  exportData() {
    alert('Funcionalidad de exportación próximamente disponible');
  }
}
