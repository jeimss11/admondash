import { CurrencyPipe, NgForOf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
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
    FormsModule,
    CurrencyPipe,
    MatAutocompleteModule,
  ],
  templateUrl: './venta-modal.component.html',
  styleUrls: ['./venta-modal.component.scss'],
})
export class VentaModalComponent {
  data = inject(MAT_DIALOG_DATA) as { productos: any[]; clientes: any[] };
  dialogRef = inject(MatDialogRef<VentaModalComponent>);

  productoSeleccionado: any = null;
  cantidad: number = 1;
  clienteSeleccionado: any = null;
  productosVenta: any[] = [];
  subtotal: number = 0;
  descuento: number = 0;
  busquedaProducto: string = '';
  precio: number = 0;
  total: number = 0;

  productos = [
    { id: 1, nombre: 'Producto A', precio: 100.0, stock: 10 },
    { id: 2, nombre: 'Producto B', precio: 150.0, stock: 5 },
    { id: 3, nombre: 'Galletas Oreo', precio: 25.5, stock: 20 },
    { id: 4, nombre: 'Coca Cola 1L', precio: 35.0, stock: 15 },
    { id: 5, nombre: 'Pan Integral', precio: 45.0, stock: 8 },
  ];

  clientes = [
    { id: 1, nombre: 'Cliente General', email: 'general@cliente.com' },
    { id: 2, nombre: 'Juan Pérez', email: 'juan@email.com' },
    { id: 3, nombre: 'María García', email: 'maria@email.com' },
  ];

  productosFiltrados = this.productos;

  filtrarProductos(valor: string) {
    const filtro = valor ? valor.toLowerCase() : '';
    this.productosFiltrados = this.productos.filter((p) => p.nombre.toLowerCase().includes(filtro));
  }

  seleccionarProducto(nombre: string) {
    const prod = this.productos.find((p) => p.nombre === nombre);
    if (prod) {
      this.productoSeleccionado = prod;
      this.onProductoChange();
    }
  }

  onProductoChange() {
    if (this.productoSeleccionado) {
      this.precio = this.productoSeleccionado.precio;
      this.calcularTotal();
    }
  }

  onCantidadChange() {
    this.calcularTotal();
  }

  calcularTotal() {
    this.total = this.precio * this.cantidad;
  }

  agregarProducto() {
    if (this.productoSeleccionado && this.cantidad > 0) {
      const productoExistente = this.productosVenta.find(
        (p) => p.id === this.productoSeleccionado.id
      );

      if (productoExistente) {
        productoExistente.cantidad += this.cantidad;
        productoExistente.total = productoExistente.precio * productoExistente.cantidad;
      } else {
        this.productosVenta.push({
          ...this.productoSeleccionado,
          cantidad: this.cantidad,
          total: this.precio * this.cantidad,
        });
      }

      this.calcularSubtotal();
      this.limpiarFormulario();
    }
  }

  eliminarProducto(index: number) {
    this.productosVenta.splice(index, 1);
    this.calcularSubtotal();
  }

  limpiarFormulario() {
    this.productoSeleccionado = null;
    this.cantidad = 1;
    this.precio = 0;
    this.total = 0;
    this.busquedaProducto = '';
  }

  calcularSubtotal() {
    this.subtotal = this.productosVenta.reduce((acc, p) => acc + p.total, 0);
  }

  get totalFinal() {
    return this.subtotal - this.descuento;
  }

  guardarVenta() {
    this.dialogRef.close({
      productos: this.productosVenta,
      cliente: this.clienteSeleccionado,
      subtotal: this.subtotal,
      descuento: this.descuento,
      total: this.totalFinal,
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
