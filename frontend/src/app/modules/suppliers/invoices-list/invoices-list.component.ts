import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { FacturaProveedor, FiltroFacturaProveedor } from '../models/supplier.models';
import { SupplierInvoicesService } from '../services/supplier-invoices.service';
import { SuppliersService } from '../services/suppliers.service';
import { InvoiceDetailModalComponent } from '../shared/invoice-detail-modal/invoice-detail-modal.component';
import { InvoiceFormModalComponent } from '../shared/invoice-form-modal/invoice-form-modal.component';

@Component({
  selector: 'app-invoices-list',
  standalone: true,
  imports: [CommonModule, FormsModule, InvoiceDetailModalComponent, InvoiceFormModalComponent],
  templateUrl: './invoices-list.component.html',
  styleUrls: ['./invoices-list.component.scss'],
})
export class InvoicesListComponent implements OnInit {
  private invoicesService = inject(SupplierInvoicesService);
  private suppliersService = inject(SuppliersService);
  private router = inject(Router);

  // Signals para estado reactivo
  invoices = signal<FacturaProveedor[]>([]);
  loading = signal(false);
  searchTerm = signal('');
  selectedInvoice = signal<FacturaProveedor | null>(null);
  showInvoiceModal = signal(false);
  showFormModal = signal(false);

  // Filtros
  filter = signal<FiltroFacturaProveedor>({
    estado: 'todos',
    busqueda: '',
    ordenarPor: 'fechaVencimiento',
    orden: 'desc',
  });

  // Computed signals
  filteredInvoices = computed(() => {
    const invoices = this.invoices();
    const search = this.searchTerm().toLowerCase();
    const filter = this.filter();

    let filtered = invoices;

    // Filtro por búsqueda
    if (search) {
      filtered = filtered.filter(
        (factura) =>
          factura.numeroFactura.toLowerCase().includes(search) ||
          this.getSupplierName(factura.proveedorId).toLowerCase().includes(search) ||
          factura.monto.toString().includes(search)
      );
    }

    // Filtro por estado
    if (filter.estado !== 'todos') {
      filtered = filtered.filter((factura) => factura.estado === filter.estado);
    }

    // Filtro por fechas
    if (filter.fechaDesde) {
      filtered = filtered.filter(
        (factura) => factura.fechaVencimiento && factura.fechaVencimiento >= filter.fechaDesde!
      );
    }
    if (filter.fechaHasta) {
      filtered = filtered.filter(
        (factura) => factura.fechaVencimiento && factura.fechaVencimiento <= filter.fechaHasta!
      );
    }

    // Ordenamiento
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (filter.ordenarPor) {
        case 'fechaVencimiento':
          aValue = a.fechaVencimiento?.getTime() || 0;
          bValue = b.fechaVencimiento?.getTime() || 0;
          break;
        case 'monto':
          aValue = a.monto;
          bValue = b.monto;
          break;
        case 'fechaRegistro':
          aValue = a.fechaRegistro.getTime();
          bValue = b.fechaRegistro.getTime();
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

  // Computed signals para estadísticas
  stats = computed(() => {
    const invoices = this.filteredInvoices();
    return {
      total: invoices.length,
      paid: invoices.filter((i) => i.estado === 'pagada').length,
      pending: invoices.filter((i) => i.estado === 'pendiente').length,
      overdue: invoices.filter((i) => i.estado === 'vencida').length,
    };
  });

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
      // Cargar proveedores primero
      await this.suppliersService.loadSuppliers();
      // Cargar facturas de los últimos 30 días
      await this.loadRecentInvoices();
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      this.loading.set(false);
    }

    // Configurar búsqueda con debounce
    this.searchSubject.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => {
      // La búsqueda se maneja automáticamente por el computed signal
    });
  }

  private async loadRecentInvoices(): Promise<void> {
    // Cargar todas las facturas y filtrar las de los últimos 30 días
    await this.invoicesService.loadInvoices();
    const allInvoices = this.invoicesService.facturas();

    // Filtrar facturas de los últimos 30 días
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentInvoices = allInvoices.filter((factura) => factura.fechaRegistro >= thirtyDaysAgo);

    this.invoices.set(recentInvoices);
  }

  onSearchChange(term: string): void {
    this.searchTerm.set(term);
  }

  onFilterChange(newFilter: Partial<FiltroFacturaProveedor>): void {
    this.filter.update((current) => ({ ...current, ...newFilter }));
  }

  onSortChange(sortBy: FiltroFacturaProveedor['ordenarPor']): void {
    const currentFilter = this.filter();
    if (currentFilter.ordenarPor === sortBy) {
      // Cambiar dirección si es la misma columna
      this.filter.update((current) => ({
        ...current,
        orden: current.orden === 'asc' ? 'desc' : 'asc',
      }));
    } else {
      // Nueva columna, orden descendente por defecto
      this.filter.update((current) => ({
        ...current,
        ordenarPor: sortBy,
        orden: 'desc',
      }));
    }
  }

  viewInvoice(invoice: FacturaProveedor): void {
    this.selectedInvoice.set(invoice);
    this.showInvoiceModal.set(true);
  }

  onCloseInvoiceModal(): void {
    this.showInvoiceModal.set(false);
    this.selectedInvoice.set(null);
  }

  openFormModal(): void {
    this.showFormModal.set(true);
  }

  onCloseFormModal(): void {
    this.showFormModal.set(false);
  }

  onInvoiceCreated(invoice: FacturaProveedor): void {
    this.invoices.update((current) => [...current, invoice]);
    this.onCloseFormModal();
  }

  viewSupplierDashboard(invoice: FacturaProveedor): void {
    this.router.navigate(['/suppliers/dashboard', invoice.proveedorId]);
  }

  getSupplierName(supplierId: string): string {
    const supplier = this.suppliersService.suppliers().find((s) => s.id === supplierId);
    return supplier?.proveedor || 'Proveedor no encontrado';
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'pagada':
        return 'badge-success';
      case 'parcial':
        return 'badge-warning';
      case 'pendiente':
        return 'badge-secondary';
      case 'vencida':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'pagada':
        return 'Pagada';
      case 'parcial':
        return 'Parcial';
      case 'pendiente':
        return 'Pendiente';
      case 'vencida':
        return 'Vencida';
      default:
        return status;
    }
  }

  async refreshData(): Promise<void> {
    this.loading.set(true);
    try {
      await this.loadRecentInvoices();
    } catch (error) {
      console.error('Error refreshing invoices:', error);
    } finally {
      this.loading.set(false);
    }
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
    }).format(amount);
  }

  // Método para cargar todas las facturas si el usuario quiere ver más
  async loadAllInvoices(): Promise<void> {
    this.loading.set(true);
    try {
      await this.invoicesService.loadInvoices();
      this.invoices.set(this.invoicesService.facturas());
    } catch (error) {
      console.error('Error loading all invoices:', error);
    } finally {
      this.loading.set(false);
    }
  }

  isOverdue(invoice: FacturaProveedor): boolean {
    return (
      invoice.estado === 'vencida' ||
      (invoice.fechaVencimiento ? invoice.fechaVencimiento < new Date() : false)
    );
  }

  onDateFromChange(value: string): void {
    const date = value ? new Date(value) : undefined;
    this.onFilterChange({ fechaDesde: date });
  }

  onDateToChange(value: string): void {
    const date = value ? new Date(value) : undefined;
    this.onFilterChange({ fechaHasta: date });
  }
}
