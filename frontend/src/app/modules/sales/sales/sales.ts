// ...existing code...
// ...existing code...
import { CurrencyPipe } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { Venta } from '../../../shared/models/venta.model';
import { VentaModalComponent } from '../venta-modal/venta-modal.component';

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [MatTableModule, MatButtonModule, MatIconModule, CurrencyPipe],
  templateUrl: './sales.html',
  styleUrl: './sales.scss',
})
export class Sales {
  productosMock = [
    { id: 'p1', nombre: 'Arepa Queso', valor: 3700 },
    { id: 'p2', nombre: 'Arepa bandeja', valor: 3700 },
    { id: 'p3', nombre: 'Oblea x 10', valor: 1200 },
  ];
  clientesMock = [
    { id: 'c1', nombre: 'Juan' },
    { id: 'c2', nombre: 'Maria' },
  ];
  ventas: Venta[] = [
    {
      id: '1',
      cantidad: 2,
      cliente: 'Juan',
      eliminado: false,
      factura: 'F001',
      fecha: '2025-09-05',
      fecha2: '2025-09-05',
      modificadoLocalmente: 0,
      producto: 'Arepa Queso',
      sincronizado: 1,
      total: 7400,
      ultimaModificacionMillis: 0,
      ultima_modificacion: new Date(),
    },
    {
      id: '2',
      cantidad: 1,
      cliente: '',
      eliminado: false,
      factura: 'F002',
      fecha: '2025-09-06',
      fecha2: '2025-09-06',
      modificadoLocalmente: 0,
      producto: 'Arepa bandeja',
      sincronizado: 1,
      total: 3700,
      ultimaModificacionMillis: 0,
      ultima_modificacion: new Date(),
    },
  ];

  displayedColumns: string[] = [
    'factura',
    'fecha',
    'cliente',
    'producto',
    'cantidad',
    'total',
    'acciones',
  ];

  constructor(private dialog: MatDialog) {}

  nuevaVenta() {
    this.dialog.open(VentaModalComponent, {
      width: '500px',
      data: {
        productos: this.productosMock,
        clientes: this.clientesMock,
      },
    });
  }

  editarVenta(venta: Venta) {
    // Aquí se abrirá el modal de edición
    alert('Editar venta: ' + venta.factura);
  }
}
