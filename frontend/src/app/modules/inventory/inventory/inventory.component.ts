import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
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

  form: FormGroup;
  editing: Producto | null = null;
  loading = true;
  error: string | null = null;

  constructor(
    private inventoryService: InventoryService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder
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
  }

  async save() {
    if (this.form.invalid) {
      alert('Por favor, completa todos los campos correctamente.');
      return;
    }

    const data = this.form.value;
    try {
      if (this.editing) {
        await this.inventoryService.updateProducto({ ...this.editing, ...data });
        alert('Producto actualizado correctamente');
      } else {
        await this.inventoryService.addProducto(data);
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
}
