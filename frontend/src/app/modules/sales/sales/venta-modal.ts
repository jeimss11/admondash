import { CurrencyPipe, NgForOf, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';

@Component({
  selector: 'venta-modal',
  standalone: true,
  imports: [
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    NgForOf,
    NgIf,
    FormsModule,
    CurrencyPipe,
  ],
  templateUrl: './venta-modal.html',
})
export class VentaModal {
  data = inject(MAT_DIALOG_DATA) as { productos: any[]; clientes: any[] };
  dialogRef = inject(MatDialogRef<VentaModal>);

  productoSeleccionado: any = null;
  cantidad: number = 1;
  clienteSeleccionado: any = null;
  productosVenta: any[] = [];
  subtotal: number = 0;
  descuento: number = 0;

  agregarProducto() {
    if (this.productoSeleccionado && this.cantidad > 0) {
      this.productosVenta.push({ ...this.productoSeleccionado, cantidad: this.cantidad });
      this.calcularSubtotal();
      this.productoSeleccionado = null;
      this.cantidad = 1;
    }
  }

  calcularSubtotal() {
    this.subtotal = this.productosVenta.reduce((acc, p) => acc + p.valor * p.cantidad, 0);
  }

  guardarVenta() {
    this.dialogRef.close({
      productos: this.productosVenta,
      cliente: this.clienteSeleccionado,
      subtotal: this.subtotal,
      descuento: this.descuento,
      total: this.subtotal - this.descuento,
    });
  }

  imprimir() {
    // Acción futura: imprimir recibo
    alert('Función de imprimir próximamente');
  }

  descontar() {
    // Acción futura: aplicar descuento
    alert('Función de descuento próximamente');
  }
}
