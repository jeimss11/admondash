import { CurrencyPipe, NgForOf } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { Venta } from '../../../shared/models/venta.model';

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [MatTableModule, MatButtonModule, MatIconModule, NgForOf, CurrencyPipe],
  templateUrl: './sales.html',
  styleUrl: './sales.scss',
})
export class Sales {
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

  nuevaVenta() {
    // Aquí se abrirá el modal de nueva venta
    alert('Abrir modal de nueva venta (próximo paso)');
  }

  editarVenta(venta: Venta) {
    // Aquí se abrirá el modal de edición
    alert('Editar venta: ' + venta.factura);
  }
}
