import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { canonicalStockQuantity, stockQuantityChange } from '../services/web-sale-stock.policy';

@Component({
  selector: 'app-sale-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './sale-modal.component.html',
  styleUrl: './sale-modal.component.scss',
})
export class SaleModalComponent implements OnInit, OnChanges {
  private readonly destroyRef = inject(DestroyRef);
  @Input() open = false;
  @Output() ventaGuardada = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
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
  saving = false;
  productoSeleccionado: Producto | null = null;
  cantidadSeleccionada: number = 1;
  formError: string | null = null;
  catalogError: string | null = null;

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
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['open']?.currentValue === true) this.resetDraft();
  }

  private async loadProductosDisponibles() {
    this.loading = true;
    this.catalogError = null;
    this.inventoryService.getProductos().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(
      (productos) => {
        // Unknown stock remains visible, but cannot fund a stock-decrementing sale.
        this.productosDisponibles = productos.filter(
          (p) => !p.eliminado && (!this.hasKnownStock(p) || this.getStockDisponible(p) > 0)
        );
        this.filtrarProductos();
        if (this.productoSeleccionado) {
          this.productoSeleccionado = this.productosDisponibles.find(p => p.codigo === this.productoSeleccionado!.codigo) ?? null;
        }
        this.loading = false;
        this.cdr.detectChanges();
      },
      (error) => {
        console.error('Error cargando productos:', error);
        this.loading = false;
        this.catalogError = 'No fue posible cargar el catálogo. Cierra y vuelve a abrir la venta para reintentar.';
        this.cdr.detectChanges();
      }
    );
  }

  private async generarNumeroFactura() {
    try {
      const numeroFactura = await this.salesService.generarNumeroFactura();
      this.ventaForm.patchValue({ factura: numeroFactura });
    } catch (error) {
      console.error('Error generando número de factura:', error);
      this.formError = 'No fue posible generar la factura. Cierra y vuelve a abrir el formulario.';
    } finally {
      this.cdr.markForCheck();
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
    if (!this.productoSeleccionado || !this.puedeAgregarAlCarrito()) return;
    this.formError = null;

    const productoExistente = this.carrito.find(
      (p) => p.codigo === this.productoSeleccionado!.codigo
    );

    if (productoExistente) {
      const nuevaCantidad = stockQuantityChange(productoExistente.cantidad, String(this.cantidadSeleccionada), 'add');
      const precioUnitario = parseFloat(productoExistente.precio);
      productoExistente.cantidad = String(nuevaCantidad);
      productoExistente.subtotal = String(Number(nuevaCantidad) * precioUnitario);
      productoExistente.total = String(Number(nuevaCantidad) * precioUnitario);
    } else {
      const precioUnitario = Number(this.productoSeleccionado.valor);
      const nuevoProducto: any = {
        nombre: this.productoSeleccionado.nombre,
        cantidad: String(this.cantidadSeleccionada),
        precio: String(precioUnitario),
        subtotal: String(this.cantidadSeleccionada * precioUnitario),
        total: String(this.cantidadSeleccionada * precioUnitario),
        codigo: this.productoSeleccionado.codigo,
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
    this.formError = null;
    this.calcularTotales();
  }

  onDescuentoTipoChange() {
    this.calcularTotales();
  }

  async guardarVenta() {
    if (this.saving) return;
    if (this.carrito.length === 0) {
      this.formError = 'Agrega al menos un producto al carrito antes de guardar.';
      return;
    }

    if (this.ventaForm.invalid) {
      this.ventaForm.markAllAsTouched();
      this.formError = 'No se pudo generar el número de factura. Cierra y vuelve a abrir el formulario.';
      return;
    }

    if (!Number.isFinite(this.descuento) || this.descuento < 0 || (this.descuentoTipo === 'porcentaje' && this.descuento > 100) ||
      (this.descuentoTipo === 'valor' && this.descuento > this.subtotal)) {
      this.formError = 'El descuento debe estar entre cero y el total de la venta.';
      return;
    }

    this.saving = true;
    this.formError = null;
    try {
      // Preparar productos con la estructura correcta para Firestore
      const productosPreparados = this.carrito.map((item) => ({
        codigo: item.codigo,
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
        discountType: this.descuentoTipo === 'porcentaje' ? 'percentage' as const : 'amount' as const,
        discountAmount: String(this.subtotal - this.total),
        subtotal: String(this.subtotal),
        total: String(this.total),
      };

      const result = await this.salesService.addVenta(ventaData);

      this.ventaGuardada.emit();
      this.cerrarModal();
    } catch (error: any) {
      console.error('Error guardando venta:', error);
      this.formError = 'No fue posible guardar la venta. ' + (error.message || 'Inténtalo de nuevo.');
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  cerrarModal() {
    this.closed.emit();
  }

  limpiarCarrito() {
    this.carrito = [];
    this.calcularTotales();
  }

  getStockDisponible(producto: Producto): number {
    return Number(producto.cantidad);
  }

  hasKnownStock(producto: Producto): boolean {
    try { canonicalStockQuantity(producto.cantidad); return true; }
    catch { return false; }
  }

  stockLabel(producto: Producto): string {
    return this.hasKnownStock(producto) ? canonicalStockQuantity(producto.cantidad) : 'No informado';
  }

  puedeAgregarAlCarrito(): boolean {
    if (!this.productoSeleccionado) return false;
    if (!Number.isFinite(this.cantidadSeleccionada) || this.cantidadSeleccionada <= 0) return false;
    if (!Number.isFinite(Number(this.productoSeleccionado.valor)) || Number(this.productoSeleccionado.valor) < 0) return false;
    if (!this.hasKnownStock(this.productoSeleccionado)) return false;
    const existingQuantity = this.carrito.find(p => p.codigo === this.productoSeleccionado!.codigo)?.cantidad;
    try {
      const available = existingQuantity
        ? stockQuantityChange(this.productoSeleccionado.cantidad, existingQuantity, 'subtract')
        : this.productoSeleccionado.cantidad;
      stockQuantityChange(available, String(this.cantidadSeleccionada), 'subtract');
      return true;
    } catch { return false; }
  }

  private resetDraft(): void {
    this.carrito = [];
    this.searchTerm = '';
    this.productoSeleccionado = null;
    this.cantidadSeleccionada = 1;
    this.descuento = 0;
    this.descuentoTipo = 'porcentaje';
    this.subtotal = 0;
    this.total = 0;
    this.formError = null;
    this.catalogError = null;
    this.ventaForm.reset({ factura: '', cliente: '' });
    this.generarNumeroFactura();
  }
}
