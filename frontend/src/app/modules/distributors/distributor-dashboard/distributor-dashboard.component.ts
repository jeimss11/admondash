import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';

@Component({
  selector: 'app-distributor-dashboard',
  standalone: true,
  imports: [CommonModule],
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

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  goBack(): void {
    this.router.navigate(['/distributors']);
  }
}
