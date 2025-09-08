import { NgForOf, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';

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

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    NgForOf,
    NgIf,
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
export class Dashboard {
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

  alerts: string[] = ['Inventario bajo en Producto 1', 'Pago pendiente a Distribuidor B'];

  displayedColumns: string[] = ['distributor', 'amount', 'dueDate', 'actions'];

  constructor(private dialog: MatDialog, private snackBar: MatSnackBar) {}

  toggleAmountVisibility(index: number) {
    this.paymentAmountVisible[index] = !this.paymentAmountVisible[index];
  }

  openPaymentsModal() {
    this.dialog.open(PaymentsDialog, {
      data: this.payments,
      width: '500px',
    });
  }

  showAlert(msg: string) {
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
