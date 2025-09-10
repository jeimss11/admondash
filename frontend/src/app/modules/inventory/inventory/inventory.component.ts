import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { InventoryService, Producto } from '../services/inventory.service';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.scss',
})
export class InventoryComponent implements OnInit {
  productos: Producto[] = [];
  loading = true;
  error: string | null = null;
  form: FormGroup;

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
        this.loading = false;
        this.cdr.detectChanges(); // Asegura que Angular detecte los cambios
      },
      (error) => {
        this.error = error.message || 'Error al cargar productos';
        this.loading = false;
        this.cdr.detectChanges();
      }
    );
  }

  async editProducto(producto: Producto) {
    const nuevoNombre = prompt('Editar nombre del producto:', producto.nombre);
    if (nuevoNombre !== null && nuevoNombre.trim() !== '') {
      const updatedProducto = { ...producto, nombre: nuevoNombre };
      try {
        await this.inventoryService.updateProducto(updatedProducto);
        alert('Producto actualizado correctamente');
        this.loadProductos();
      } catch (error: any) {
        alert('Error al actualizar el producto: ' + (error.message || 'Desconocido'));
      }
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

  async addProducto() {
    if (this.form.invalid) {
      alert('Por favor, completa todos los campos correctamente.');
      return;
    }

    const nuevoProducto = this.form.value;
    try {
      await this.inventoryService.addProducto(nuevoProducto);
      alert('Producto agregado correctamente');
      this.form.reset();
      this.loadProductos();
    } catch (error: any) {
      alert('Error al agregar el producto: ' + (error.message || 'Desconocido'));
    }
  }
}
