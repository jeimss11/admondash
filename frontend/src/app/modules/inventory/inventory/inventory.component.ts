import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { InventoryService, Producto } from '../services/inventory.service';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.scss',
})
export class InventoryComponent implements OnInit {
  productos: Producto[] = [];
  filteredProductos: Producto[] = [];
  paginatedProductos: Producto[] = [];
  searchTerm: string = '';

  // Variables de paginación
  currentPage: number = 1;
  itemsPerPage: number = 5;
  totalPages: number = 0;

  // Umbral de stock bajo
  lowStockThreshold: number = 5;

  form: FormGroup;
  editing: Producto | null = null;
  loading = true;
  error: string | null = null;

  // Nuevas propiedades para ajustes de stock
  adjustmentType: 'entrada' | 'salida' = 'entrada';
  adjustmentQuantity: number = 1;
  adjustmentReason: string = '';
  historialMovimientos: any[] = [];

  constructor(
    private inventoryService: InventoryService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router
  ) {
    this.form = this.fb.group({
      codigo: ['', Validators.required],
      nombre: ['', Validators.required],
      cantidad: ['0', [Validators.required, Validators.pattern(/^[0-9]+$/)]],
      valor: ['0', [Validators.required, Validators.pattern(/^[0-9]+(\.[0-9]{1,2})?$/)]],
    });
  }

  ngOnInit() {
    this.loadProductos();
  }

  private loadProductos() {
    this.loading = true;
    this.inventoryService.getProductos().subscribe(
      (productos) => {
        this.productos = productos;
        this.filteredProductos = productos;
        this.totalPages = Math.ceil(this.filteredProductos.length / this.itemsPerPage);
        this.updatePaginatedProductos();
        this.loading = false;
        this.cdr.detectChanges();
      },
      (error) => {
        this.error = error.message || 'Error al cargar productos';
        this.loading = false;
        this.cdr.detectChanges();
      }
    );
  }

  updatePaginatedProductos() {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.paginatedProductos = this.filteredProductos.slice(startIndex, endIndex);
  }

  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePaginatedProductos();
    }
  }

  filterProductos() {
    const term = this.searchTerm.toLowerCase();
    this.filteredProductos = this.productos.filter(
      (producto) =>
        producto.nombre.toLowerCase().includes(term) || producto.codigo.toLowerCase().includes(term)
    );
    this.totalPages = Math.ceil(this.filteredProductos.length / this.itemsPerPage);
    this.currentPage = 1;
    this.updatePaginatedProductos();
  }

  startNew() {
    this.editing = null;
    this.form.reset();
  }

  startEdit(producto: Producto) {
    this.editing = producto;
    this.form.patchValue({
      codigo: producto.codigo,
      nombre: producto.nombre,
      cantidad: producto.cantidad,
      valor: producto.valor,
    });

    // Cargar historial de movimientos
    this.inventoryService.getHistorialMovimientos(producto.codigo).subscribe((movimientos) => {
      this.historialMovimientos = movimientos;
    });
  }

  startAdjustStock(producto: Producto) {
    this.editing = producto;
    this.adjustmentType = 'entrada';
    this.adjustmentQuantity = 1;
    this.adjustmentReason = '';

    // Cargar historial de movimientos
    this.inventoryService.getHistorialMovimientos(producto.codigo).subscribe((movimientos) => {
      this.historialMovimientos = movimientos;
    });
  }

  async save() {
    if (this.form.invalid) {
      alert('Por favor, completa todos los campos correctamente.');
      return;
    }

    const data = this.form.value;
    // Convertir los valores numéricos a strings para mantener consistencia con la interfaz
    const productoData = {
      ...data,
      cantidad: String(data.cantidad),
      valor: String(data.valor),
    };

    try {
      if (this.editing) {
        await this.inventoryService.updateProducto({ ...this.editing, ...productoData });
        alert('Producto actualizado correctamente');
      } else {
        await this.inventoryService.addProducto(productoData);
        alert('Producto agregado correctamente');
      }
      this.startNew();
      this.loadProductos();
    } catch (error: any) {
      alert('Error al guardar el producto: ' + (error.message || 'Desconocido'));
    }
  }

  async deleteProducto(codigo: string) {
    if (confirm('¿Estás seguro de que deseas eliminar este producto?')) {
      try {
        await this.inventoryService.deleteProducto(codigo);
        alert('Producto eliminado correctamente');
        this.loadProductos();
      } catch (error: any) {
        alert('Error al eliminar el producto: ' + (error.message || 'Desconocido'));
      }
    }
  }

  isLowStock(producto: Producto): boolean {
    return Number(producto.cantidad) < this.lowStockThreshold;
  }

  async adjustStock() {
    if (!this.editing) return;

    const currentQuantity = Number(this.editing.cantidad);
    const adjustment =
      this.adjustmentType === 'entrada' ? this.adjustmentQuantity : -this.adjustmentQuantity;

    const newQuantity = currentQuantity + adjustment;

    if (newQuantity < 0) {
      alert('El ajuste no puede resultar en un stock negativo.');
      return;
    }

    try {
      await this.inventoryService.adjustStock(
        this.editing.codigo,
        adjustment,
        this.adjustmentType,
        this.adjustmentReason
      );

      // Actualizar el producto en Firestore
      const updatedProducto: Producto = {
        ...this.editing,
        cantidad: String(newQuantity),
      };

      await this.inventoryService.updateProducto(updatedProducto);
      alert('Ajuste aplicado y producto actualizado correctamente');
      this.loadProductos();
      if (this.editing) {
        this.startAdjustStock(this.editing); // Actualizar historial
      }
    } catch (error: any) {
      alert(
        'Error al aplicar el ajuste o actualizar el producto: ' + (error.message || 'Desconocido')
      );
    }
  }

  // Nuevos métodos para el template mejorado
  goBack() {
    this.router.navigate(['/inventory']);
  }

  refreshData() {
    this.loadProductos();
  }

  getLowStockCount(): number {
    return this.productos.filter(
      (producto) =>
        Number(producto.cantidad) > 0 && Number(producto.cantidad) <= this.lowStockThreshold
    ).length;
  }

  getOutOfStockCount(): number {
    return this.productos.filter((producto) => Number(producto.cantidad) === 0).length;
  }

  getTotalValue(): number {
    return this.productos.reduce((total, producto) => {
      return total + Number(producto.cantidad) * Number(producto.valor);
    }, 0);
  }

  isOutOfStock(producto: Producto): boolean {
    return Number(producto.cantidad) === 0;
  }

  getStockBadgeClass(producto: Producto): string {
    const cantidad = Number(producto.cantidad);
    if (cantidad === 0) {
      return 'bg-danger';
    } else if (cantidad <= this.lowStockThreshold) {
      return 'bg-warning text-dark';
    } else {
      return 'bg-success';
    }
  }

  getStatusBadgeClass(producto: Producto): string {
    const cantidad = Number(producto.cantidad);
    if (cantidad === 0) {
      return 'bg-danger';
    } else if (cantidad <= this.lowStockThreshold) {
      return 'bg-warning text-dark';
    } else {
      return 'bg-success';
    }
  }

  getStatusText(producto: Producto): string {
    const cantidad = Number(producto.cantidad);
    if (cantidad === 0) {
      return 'Sin Stock';
    } else if (cantidad <= this.lowStockThreshold) {
      return 'Stock Bajo';
    } else {
      return 'Normal';
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  exportData() {
    alert('Funcionalidad de exportación próximamente disponible');
  }
}
