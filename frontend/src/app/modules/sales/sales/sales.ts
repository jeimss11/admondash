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
import { SaleModalComponent } from '../sale-modal/sale-modal.component';
import { SalesService, Venta } from '../services/sales.service';

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, SaleModalComponent],
  templateUrl: './sales.html',
  styleUrl: './sales.scss',
})
export class Sales implements OnInit {
  ventas: Venta[] = [];
  filteredVentas: Venta[] = [];
  paginatedVentas: Venta[] = [];
  searchTerm: string = '';

  // Variables de paginación
  currentPage: number = 1;
  itemsPerPage: number = 5;
  totalPages: number = 0;

  // Estadísticas
  estadisticas = {
    ventasHoy: 0,
    totalHoy: 0,
    ventasMes: 0,
    totalMes: 0,
  };

  form: FormGroup;
  editing: Venta | null = null;
  loading = true;
  error: string | null = null;

  constructor(
    private salesService: SalesService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router
  ) {
    this.form = this.fb.group({
      factura: ['', Validators.required],
      cliente: [''],
      productos: [[]],
      descuento: ['0.00'],
    });
  }

  ngOnInit() {
    this.loadVentas();
    this.loadEstadisticas();
  }

  private loadVentas() {
    this.loading = true;
    this.salesService.getVentas().subscribe(
      (ventas) => {
        this.ventas = ventas;
        this.filteredVentas = ventas;
        this.totalPages = Math.ceil(this.filteredVentas.length / this.itemsPerPage);
        this.updatePaginatedVentas();
        this.loading = false;
        this.cdr.detectChanges();
      },
      (error) => {
        this.error = error.message || 'Error al cargar ventas';
        this.loading = false;
        this.cdr.detectChanges();
      }
    );
  }

  private async loadEstadisticas() {
    try {
      this.estadisticas = await this.salesService.getEstadisticasVentas();
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
    }
  }

  updatePaginatedVentas() {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.paginatedVentas = this.filteredVentas.slice(startIndex, endIndex);
  }

  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePaginatedVentas();
    }
  }

  filterVentas() {
    const term = this.searchTerm.toLowerCase();
    this.filteredVentas = this.ventas.filter(
      (venta) =>
        venta.factura.toLowerCase().includes(term) ||
        venta.cliente.toLowerCase().includes(term) ||
        venta.productos.some((p) => p.nombre.toLowerCase().includes(term))
    );
    this.totalPages = Math.ceil(this.filteredVentas.length / this.itemsPerPage);
    this.currentPage = 1;
    this.updatePaginatedVentas();
  }

  startNew() {
    this.editing = null;
    this.form.reset();
  }

  startEdit(venta: Venta) {
    this.editing = venta;
    this.form.patchValue({
      factura: venta.factura,
      cliente: venta.cliente,
      productos: venta.productos,
      descuento: venta.descuento,
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
        await this.salesService.updateVenta({ ...this.editing, ...data });
        alert('Venta actualizada correctamente');
      } else {
        await this.salesService.addVenta(data);
        alert('Venta agregada correctamente');
      }
      this.startNew();
      this.loadVentas();
      this.loadEstadisticas();
    } catch (error: any) {
      alert('Error al guardar la venta: ' + (error.message || 'Desconocido'));
    }
  }

  async deleteVenta(id: string) {
    if (confirm('¿Estás seguro de que deseas eliminar esta venta?')) {
      try {
        await this.salesService.deleteVenta(id);
        alert('Venta eliminada correctamente');
        this.loadVentas();
        this.loadEstadisticas();
      } catch (error: any) {
        alert('Error al eliminar la venta: ' + (error.message || 'Desconocido'));
      }
    }
  }

  // Nuevos métodos para el template mejorado
  goBack() {
    this.router.navigate(['/sales']);
  }

  refreshData() {
    this.loadVentas();
    this.loadEstadisticas();
  }

  getTotalVentas(): number {
    return this.ventas.length;
  }

  getTotalIngresos(): number {
    // Calcular total sumando todos los productos de todas las ventas
    return this.ventas.reduce((total, venta) => {
      const ventaTotal = venta.productos.reduce(
        (prodSum, prod) => prodSum + parseFloat(prod.total),
        0
      );
      return total + ventaTotal;
    }, 0);
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

  // Métodos para calcular subtotal y total de una venta específica
  getSubtotal(venta: Venta): number {
    return venta.productos.reduce((sum, prod) => sum + parseFloat(prod.subtotal), 0);
  }

  getTotal(venta: Venta): number {
    const subtotal = this.getSubtotal(venta);
    const descuento = parseFloat(venta.descuento);
    return subtotal - descuento;
  }

  exportData() {
    alert('Funcionalidad de exportación próximamente disponible');
  }

  // Método para abrir el modal de nueva venta
  nuevaVenta() {
    // El modal se abre automáticamente con data-bs-toggle
    console.log('Abriendo modal de nueva venta');
  }

  // Método para manejar cuando se guarda una venta desde el modal
  onVentaGuardada() {
    this.loadVentas();
    this.loadEstadisticas();
  }

  editarVenta(venta: Venta) {
    this.startEdit(venta);
  }
}
