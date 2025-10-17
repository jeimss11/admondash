import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { DEFAULT_SUPPLIER_FILTER } from '../constants/suppliers.constants';
import { Supplier, SupplierFilter } from '../models/supplier.models';
import { SupplierAnalyticsService } from '../services/supplier-analytics.service';
import { SuppliersService } from '../services/suppliers.service';
import { SupplierFormComponent } from '../supplier-form/supplier-form.component';

@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [CommonModule, FormsModule, SupplierFormComponent],
  templateUrl: './suppliers.component.html',
  styleUrls: ['./suppliers.component.scss'],
})
export class SuppliersComponent implements OnInit {
  private suppliersService = inject(SuppliersService);
  private analyticsService = inject(SupplierAnalyticsService);
  private router = inject(Router);

  // Signals para estado reactivo
  suppliers = signal<Supplier[]>([]);
  loading = signal(false);
  searchTerm = signal('');
  showAddModal = signal(false);
  showEditModal = signal(false);
  supplierToEdit = signal<Supplier | null>(null);

  // Filtros
  filter = signal<SupplierFilter>(DEFAULT_SUPPLIER_FILTER);

  // Computed signals
  filteredSuppliers = computed(() => {
    const suppliers = this.suppliers();
    const search = this.searchTerm().toLowerCase();
    const filter = this.filter();

    let filtered = suppliers;

    // Filtro por búsqueda
    if (search) {
      filtered = filtered.filter(
        (supplier) =>
          supplier.proveedor.toLowerCase().includes(search) ||
          supplier.contacto.toLowerCase().includes(search) ||
          supplier.email?.toLowerCase().includes(search)
      );
    }

    // Filtro por estado
    if (filter.estado !== 'todos') {
      filtered = filtered.filter((supplier) => supplier.estado === filter.estado);
    }

    // Ordenamiento
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (filter.ordenar_por) {
        case 'proveedor':
          aValue = a.proveedor.toLowerCase();
          bValue = b.proveedor.toLowerCase();
          break;
        case 'deuda_total':
          aValue = a.deuda_total;
          bValue = b.deuda_total;
          break;
        case 'ultima_modificacion':
          aValue = a.ultima_modificacion.getTime();
          bValue = b.ultima_modificacion.getTime();
          break;
        default:
          return 0;
      }

      if (filter.orden === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  });

  // Estadísticas computadas
  stats = computed(() => this.analyticsService.supplierStats());

  // Subject para búsqueda con debounce
  private searchSubject = new Subject<string>();

  constructor() {
    // Efecto para manejar búsqueda con debounce
    effect(() => {
      this.searchSubject.next(this.searchTerm());
    });
  }

  async ngOnInit(): Promise<void> {
    this.loading.set(true);

    try {
      await this.suppliersService.loadSuppliers();
      this.suppliers.set(this.suppliersService.suppliers());
    } catch (error) {
      console.error('Error loading suppliers:', error);
    } finally {
      this.loading.set(false);
    }

    // Configurar búsqueda con debounce
    this.searchSubject.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => {
      // La búsqueda se maneja automáticamente por el computed signal
    });
  }

  onSearchChange(term: string): void {
    this.searchTerm.set(term);
  }

  onFilterChange(newFilter: Partial<SupplierFilter>): void {
    this.filter.update((current) => ({ ...current, ...newFilter }));
  }

  onSortChange(sortBy: SupplierFilter['ordenar_por']): void {
    const currentFilter = this.filter();
    if (currentFilter.ordenar_por === sortBy) {
      // Cambiar dirección si es la misma columna
      this.filter.update((current) => ({
        ...current,
        orden: current.orden === 'asc' ? 'desc' : 'asc',
      }));
    } else {
      // Nueva columna, orden ascendente
      this.filter.update((current) => ({
        ...current,
        ordenar_por: sortBy,
        orden: 'asc',
      }));
    }
  }

  viewSupplierDashboard(supplier: Supplier): void {
    this.router.navigate(['/suppliers/dashboard', supplier.id]);
  }

  editSupplier(supplier: Supplier): void {
    this.supplierToEdit.set(supplier);
    this.showEditModal.set(true);
  }

  async deleteSupplier(supplier: Supplier): Promise<void> {
    if (
      confirm(
        `¿Estás seguro de que deseas eliminar al proveedor "${supplier.proveedor}"? Esta acción marcará al proveedor como eliminado.`
      )
    ) {
      try {
        await this.suppliersService.deleteSupplier(supplier.id);
        // La lista se actualizará automáticamente porque el servicio recarga los datos
        // y filtra los proveedores eliminados
        this.suppliers.set(this.suppliersService.suppliers());
      } catch (error) {
        console.error('Error deleting supplier:', error);
        alert('Error al eliminar el proveedor. Inténtalo de nuevo.');
      }
    }
  }

  openAddModal(): void {
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
  }

  closeEditModal(): void {
    this.showEditModal.set(false);
    this.supplierToEdit.set(null);
  }

  onSupplierCreated(supplier: Supplier): void {
    this.suppliers.update((current) => [...current, supplier]);
    this.closeAddModal();
  }

  onSupplierUpdated(supplier: Supplier): void {
    this.suppliers.update((current) => current.map((s) => (s.id === supplier.id ? supplier : s)));
    this.closeEditModal();
  }

  getStatusBadgeClass(status: string): string {
    return status === 'activo' ? 'badge-active' : 'badge-inactive';
  }

  getStatusText(status: string): string {
    return status === 'activo' ? 'Activo' : 'Inactivo';
  }

  async refreshData(): Promise<void> {
    this.loading.set(true);
    try {
      await this.suppliersService.loadSuppliers();
      this.suppliers.set(this.suppliersService.suppliers());
    } catch (error) {
      console.error('Error refreshing suppliers:', error);
    } finally {
      this.loading.set(false);
    }
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  }
}
