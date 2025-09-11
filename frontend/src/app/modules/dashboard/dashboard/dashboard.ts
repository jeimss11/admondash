import { CurrencyPipe, DatePipe, NgForOf, NgIf } from '@angular/common';
import { AfterViewInit, Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { Chart, registerables } from 'chart.js';

interface Kpi {
  title: string;
  value: string;
  icon: string;
  color: string;
}

interface Payment {
  distributor: string;
  amount: number;
  dueDate: string;
}

interface Product {
  name: string;
  sales: number;
}

interface Activity {
  icon: string;
  text: string;
  time: string;
}

interface Alert {
  type: string;
  message: string;
  time: string;
}

interface LowStockItem {
  name: string;
  stock: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    NgForOf,
    NgIf,
    RouterLink,
    CurrencyPipe,
    DatePipe,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatSnackBarModule,
    MatDividerModule,
    MatListModule,
    MatProgressBarModule,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit, AfterViewInit {
  // Propiedades principales
  currentDate = new Date();
  activeTab: string = 'overview';

  kpis: Kpi[] = [
    { title: 'Ventas Hoy', value: '$2,500', icon: 'attach_money', color: '#43a047' },
    { title: 'Gastos Hoy', value: '$1,200', icon: 'money_off', color: '#e53935' },
    { title: 'Clientes', value: '120', icon: 'group', color: '#1e88e5' },
    { title: 'Inventario Bajo', value: '5', icon: 'warning', color: '#fbc02d' },
  ];

  payments: Payment[] = [
    { distributor: 'Distribuidor A', amount: 800, dueDate: '2025-09-10' },
    { distributor: 'Distribuidor B', amount: 450, dueDate: '2025-09-12' },
    { distributor: 'Distribuidor C', amount: 1200, dueDate: '2025-09-15' },
  ];

  paymentAmountVisible: boolean[] = [false, false, false];

  topProducts: Product[] = [
    { name: 'Producto 1', sales: 120 },
    { name: 'Producto 2', sales: 95 },
    { name: 'Producto 3', sales: 80 },
  ];

  // Nuevas propiedades para el diseño moderno
  recentActivities: Activity[] = [
    {
      icon: 'fa-shopping-cart',
      text: 'Nueva venta registrada - $250',
      time: 'Hace 5 min',
    },
    {
      icon: 'fa-user-plus',
      text: 'Cliente nuevo registrado',
      time: 'Hace 15 min',
    },
    {
      icon: 'fa-exclamation-triangle',
      text: 'Producto con stock bajo',
      time: 'Hace 1 hora',
    },
    {
      icon: 'fa-credit-card',
      text: 'Pago recibido de Distribuidor A',
      time: 'Hace 2 horas',
    },
  ];

  alerts: Alert[] = [
    {
      type: 'warning',
      message: 'Inventario bajo en Producto 1',
      time: 'Hace 30 min',
    },
    {
      type: 'danger',
      message: 'Pago pendiente a Distribuidor B vence mañana',
      time: 'Hace 1 hora',
    },
    {
      type: 'info',
      message: 'Nueva orden de compra recibida',
      time: 'Hace 2 horas',
    },
  ];

  lowStockItems: LowStockItem[] = [
    { name: 'Producto X', stock: 3 },
    { name: 'Producto Y', stock: 5 },
    { name: 'Producto Z', stock: 2 },
  ];

  displayedColumns: string[] = ['distributor', 'amount', 'dueDate', 'actions'];

  constructor(private dialog: MatDialog, private snackBar: MatSnackBar, private router: Router) {
    Chart.register(...registerables);
  }

  ngOnInit(): void {
    this.initializeCharts();
  }

  ngAfterViewInit(): void {
    // Charts are initialized in ngOnInit
  }

  initializeCharts(): void {
    this.createSalesChart();
    this.createMonthlySalesChart();
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
              data: [1200, 1900, 3000, 5000, 2000, 3000, 2500],
              borderColor: '#007bff',
              backgroundColor: 'rgba(0, 123, 255, 0.1)',
              tension: 0.4,
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'top',
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function (value) {
                  return '$' + value.toLocaleString();
                },
              },
            },
          },
        },
      });
    }
  }

  createMonthlySalesChart(): void {
    const ctx = document.getElementById('monthlySalesChart') as HTMLCanvasElement;
    if (ctx) {
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep'],
          datasets: [
            {
              label: 'Ventas Mensuales',
              data: [12000, 15000, 18000, 22000, 25000, 28000, 32000, 35000, 45230],
              backgroundColor: '#28a745',
              borderColor: '#28a745',
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'top',
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function (value) {
                  return '$' + Number(value) / 1000 + 'k';
                },
              },
            },
          },
        },
      });
    }
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  refreshData(): void {
    // Simular refresh de datos
    this.showAlert('Datos actualizados correctamente');
    // Aquí podrías recargar datos desde servicios
  }

  toggleAmountVisibility(index: number): void {
    this.paymentAmountVisible[index] = !this.paymentAmountVisible[index];
  }

  getPaymentStatusClass(payment: Payment): string {
    const daysRemaining = this.getDaysRemaining(payment);
    if (daysRemaining < 0) return 'overdue';
    if (daysRemaining <= 3) return 'urgent';
    return '';
  }

  getDaysClass(payment: Payment): string {
    const days = this.getDaysRemaining(payment);
    if (days < 0) return 'overdue';
    if (days <= 3) return 'urgent';
    if (days <= 7) return 'warning';
    return 'normal';
  }

  getDaysRemaining(payment: Payment): number {
    const today = new Date();
    const dueDate = new Date(payment.dueDate);
    const diffTime = dueDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  getPaymentStatus(payment: Payment): string {
    const days = this.getDaysRemaining(payment);
    if (days < 0) return 'overdue';
    if (days <= 3) return 'urgent';
    return 'normal';
  }

  getPaymentStatusText(payment: Payment): string {
    const days = this.getDaysRemaining(payment);
    if (days < 0) return 'Vencido';
    if (days === 0) return 'Vence hoy';
    if (days === 1) return 'Vence mañana';
    if (days <= 3) return `${days} días`;
    return 'Al día';
  }

  markPaymentAsPaid(payment: Payment, index: number): void {
    this.showAlert(`Pago a ${payment.distributor} marcado como realizado`);
    // Aquí podrías actualizar el estado del pago
  }

  openPaymentsModal(): void {
    this.dialog.open(PaymentsDialog, {
      data: this.payments,
      width: '600px',
    });
  }

  showAlert(msg: string): void {
    this.snackBar.open(msg, 'Cerrar', { duration: 3000 });
  }
}

@Component({
  selector: 'payments-dialog',
  standalone: true,
  imports: [MatDialogModule, MatTableModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Pagos Pendientes a Distribuidores</h2>
    <mat-dialog-content>
      <table mat-table [dataSource]="data" class="mat-elevation-z1" style="width:100%">
        <ng-container matColumnDef="distributor">
          <th mat-header-cell *matHeaderCellDef>Distribuidor</th>
          <td mat-cell *matCellDef="let p">{{ p.distributor }}</td>
        </ng-container>
        <ng-container matColumnDef="amount">
          <th mat-header-cell *matHeaderCellDef>Monto</th>
          <td mat-cell *matCellDef="let p">{{ '$' + p.amount }}</td>
        </ng-container>
        <ng-container matColumnDef="dueDate">
          <th mat-header-cell *matHeaderCellDef>Vence</th>
          <td mat-cell *matCellDef="let p">{{ p.dueDate }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="['distributor', 'amount', 'dueDate']"></tr>
        <tr mat-row *matRowDef="let row; columns: ['distributor', 'amount', 'dueDate']"></tr>
      </table>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cerrar</button>
    </mat-dialog-actions>
  `,
})
export class PaymentsDialog {
  data = inject(MAT_DIALOG_DATA) as Payment[];
}
