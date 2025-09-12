import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { InventoryService, Producto } from '../../inventory/services/inventory.service';
import { SalesService } from '../services/sales.service';

@Component({
  selector: 'app-sale-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './sale-modal.component.html',
  styleUrl: './sale-modal.component.scss',
})
export class SaleModalComponent implements OnInit {
  @Output() ventaGuardada = new EventEmitter<void>();
  ventaForm: FormGroup;
  productosDisponibles: Producto[] = [];
  productosFiltrados: Producto[] = [];
  carrito: any[] = [];
  searchTerm: string = '';

  // Cálculos
  subtotal: number = 0;
  descuento: number = 0;
  descuentoTipo: 'porcentaje' | 'valor' = 'porcentaje';
  total: number = 0;

  // Estados
  loading = false;
  productoSeleccionado: Producto | null = null;
  cantidadSeleccionada: number = 1;

  constructor(
    private fb: FormBuilder,
    private salesService: SalesService,
    private inventoryService: InventoryService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {
    this.ventaForm = this.fb.group({
      factura: ['', Validators.required],
      cliente: [''],
    });
  }

  ngOnInit() {
    this.loadProductosDisponibles();
    this.generarNumeroFactura();
  }

  private async loadProductosDisponibles() {
    this.loading = true;
    this.inventoryService.getProductos().subscribe(
      (productos) => {
        this.productosDisponibles = productos.filter((p) => !p.eliminado && Number(p.cantidad) > 0);
        this.productosFiltrados = [...this.productosDisponibles];
        this.loading = false;
        this.cdr.detectChanges();
      },
      (error) => {
        console.error('Error cargando productos:', error);
        this.loading = false;
      }
    );
  }

  private async generarNumeroFactura() {
    try {
      const numeroFactura = await this.salesService.generarNumeroFactura();
      this.ventaForm.patchValue({ factura: numeroFactura });
    } catch (error) {
      console.error('Error generando número de factura:', error);
      const timestamp = Date.now();
      this.ventaForm.patchValue({ factura: `F${timestamp}` });
    }
  }

  filtrarProductos() {
    const term = this.searchTerm.toLowerCase();
    this.productosFiltrados = this.productosDisponibles.filter(
      (producto) =>
        producto.nombre.toLowerCase().includes(term) || producto.codigo.toLowerCase().includes(term)
    );
  }

  seleccionarProducto(producto: Producto) {
    this.productoSeleccionado = producto;
    this.cantidadSeleccionada = 1;
  }

  agregarAlCarrito() {
    if (!this.productoSeleccionado) return;

    const productoExistente = this.carrito.find(
      (p) => p.nombre === this.productoSeleccionado!.nombre
    );

    if (productoExistente) {
      const nuevaCantidad = parseInt(productoExistente.cantidad) + this.cantidadSeleccionada;
      const precioUnitario = parseFloat(productoExistente.precio);
      productoExistente.cantidad = String(nuevaCantidad);
      productoExistente.subtotal = String(nuevaCantidad * precioUnitario);
      productoExistente.total = String(nuevaCantidad * precioUnitario);
    } else {
      const precioUnitario = Number(this.productoSeleccionado.valor);
      const nuevoProducto: any = {
        nombre: this.productoSeleccionado.nombre,
        cantidad: String(this.cantidadSeleccionada),
        precio: String(precioUnitario),
        subtotal: String(this.cantidadSeleccionada * precioUnitario),
        total: String(this.cantidadSeleccionada * precioUnitario),
        productoCodigo: this.productoSeleccionado.codigo, // Guardar código para actualizar stock
      };
      this.carrito.push(nuevoProducto);
    }

    this.calcularTotales();
    this.productoSeleccionado = null;
    this.cantidadSeleccionada = 1;
  }

  eliminarDelCarrito(index: number) {
    this.carrito.splice(index, 1);
    this.calcularTotales();
  }

  private calcularTotales() {
    this.subtotal = this.carrito.reduce((sum, p) => sum + parseFloat(p.total), 0);

    if (this.descuentoTipo === 'porcentaje') {
      this.total = this.subtotal - (this.subtotal * this.descuento) / 100;
    } else {
      this.total = this.subtotal - this.descuento;
    }

    this.total = Math.max(0, this.total);
  }

  onDescuentoChange() {
    this.calcularTotales();
  }

  onDescuentoTipoChange() {
    this.calcularTotales();
  }

  async guardarVenta() {
    if (this.carrito.length === 0) {
      alert('Agregue al menos un producto al carrito');
      return;
    }

    if (this.ventaForm.invalid) {
      alert('Complete todos los campos requeridos');
      return;
    }

    try {
      // Preparar productos con la estructura correcta para Firestore
      const productosPreparados = this.carrito.map((item) => ({
        nombre: item.nombre,
        cantidad: item.cantidad,
        precio: item.precio,
        subtotal: item.subtotal,
        total: item.total,
      }));

      const ventaData = {
        factura: this.ventaForm.value.factura,
        cliente: this.ventaForm.value.cliente || 'Cliente General',
        productos: productosPreparados,
        descuento: String(this.descuento),
      };

      await this.salesService.addVenta(ventaData);

      // Actualizar stock de productos
      for (const item of this.carrito) {
        const producto = this.productosDisponibles.find((p) => p.nombre === item.nombre);
        if (producto) {
          const nuevaCantidad = Number(producto.cantidad) - parseInt(item.cantidad);
          await this.inventoryService.updateProducto({
            ...producto,
            cantidad: String(nuevaCantidad),
          });
        }
      }

      alert('Venta guardada exitosamente');
      this.ventaGuardada.emit();
      this.cerrarModal();
    } catch (error: any) {
      console.error('Error guardando venta:', error);
      alert('Error al guardar la venta: ' + (error.message || 'Desconocido'));
    }
  }

  cerrarModal() {
    // Cerrar el modal usando Bootstrap
    const modal = document.getElementById('saleModal');
    if (modal) {
      const bsModal = (window as any).bootstrap.Modal.getInstance(modal);
      bsModal?.hide();
    }
  }

  limpiarCarrito() {
    this.carrito = [];
    this.calcularTotales();
  }

  getStockDisponible(producto: Producto): number {
    return Number(producto.cantidad);
  }

  puedeAgregarAlCarrito(): boolean {
    if (!this.productoSeleccionado) return false;
    const stockDisponible = this.getStockDisponible(this.productoSeleccionado);
    return this.cantidadSeleccionada > 0 && this.cantidadSeleccionada <= stockDisponible;
  }
}
