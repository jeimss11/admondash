import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { Subscription } from 'rxjs';
import { DistributorFormComponent } from '../distributor-form/distributor-form.component';
import { Distribuidor, DistribuidorEstadisticas } from '../models/distributor.models';
import { DistributorsService } from '../services/distributors.service';

@Component({
  selector: 'app-distributors',
  standalone: true,
  imports: [CommonModule, FormsModule, DistributorFormComponent],
  templateUrl: './distributors.component.html',
  styleUrls: ['./distributors.component.scss'],
})
export class DistributorsComponent implements OnInit, OnDestroy {
  // Dashboard informativo
  estadisticas: DistribuidorEstadisticas = {
    totalDistribuidoresInternos: 0,
    totalDistribuidoresExternos: 0,
    totalVentasInternas: 0,
    totalVentasExternas: 0,
    ventasHoyInternas: 0,
    ventasHoyExternas: 0,
    totalIngresosInternos: 0,
    totalIngresosExternos: 0,
  };

  loading = false;
  refreshing = false;
  showAddModal = false;
  showEditModal = false;
  distributorToEdit: Distribuidor | null = null;

  private estadisticasSubscription?: Subscription;

  // Lista de distribuidores (cargada desde Firebase)
  distribuidores: Distribuidor[] = [];
  distribuidoresFiltrados: Distribuidor[] = [];
  searchTerm: string = '';
  distribuidoresSubscription?: Subscription;

  constructor(
    private router: Router,
    private distributorsService: DistributorsService,
    private cdr: ChangeDetectorRef
  ) {
    Chart.register(...registerables);
  }

  ngOnInit(): void {
    this.loading = true;
    // Mantener suscripción activa para actualizaciones automáticas
    this.estadisticasSubscription = this.distributorsService.getEstadisticasGenerales().subscribe({
      next: (nuevasEstadisticas) => {
        this.estadisticas = nuevasEstadisticas;
        this.loading = false;
        this.cdr.detectChanges(); // Forzar detección de cambios
      },
      error: (error) => {
        console.error('❌ Error cargando estadísticas:', error);
        this.loading = false;
        this.cdr.detectChanges(); // Forzar detección de cambios
        // Mantener valores por defecto si hay error
      },
    });

    // Cargar distribuidores desde Firebase
    this.distribuidoresSubscription = this.distributorsService.getDistribuidores().subscribe({
      next: (distribuidores) => {
        this.distribuidores = distribuidores;
        this.filterDistribuidores(); // Aplicar filtro inicial
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ Error cargando distribuidores:', error);
        this.cdr.detectChanges();
      },
    });

    // Crear distribuidores internos por defecto si no existen
    this.distributorsService.createDefaultSellersIfNotExist();
  }

  ngOnDestroy(): void {
    // Limpiar suscripción para evitar memory leaks
    if (this.estadisticasSubscription) {
      this.estadisticasSubscription.unsubscribe();
    }
    if (this.distribuidoresSubscription) {
      this.distribuidoresSubscription.unsubscribe();
    }
  }

  openDashboard(distributor: any): void {
    this.router.navigate(['/distributors/dashboard', distributor.role]);
  }

  editDistributor(distributor: Distribuidor): void {
    this.distributorToEdit = distributor;
    this.showEditModal = true;
    this.cdr.detectChanges();
  }

  deleteDistributor(distributor: any): void {
    // TODO: Implementar eliminación de distribuidor
  }

  // Método para refrescar datos
  refreshData(): void {
    this.refreshing = true;
    // Como tenemos una suscripción activa, esperamos un momento y luego desactivamos el estado de refreshing
    // Los datos se actualizarán automáticamente cuando Firestore notifique cambios
    setTimeout(() => {
      this.refreshing = false;
      this.cdr.detectChanges();
    }, 1000);
  }

  // Método para agregar nuevo distribuidor
  addNewDistributor(): void {
    this.showAddModal = true;
    this.cdr.detectChanges();
  }

  onDistributorAdded(distribuidor: Distribuidor): void {
    // Los distribuidores se actualizan automáticamente desde Firebase
    // Solo necesitamos cerrar el modal
    this.closeAddModal();
  }

  onDistributorUpdated(distribuidor: Distribuidor): void {
    // Los distribuidores se actualizan automáticamente desde Firebase
    // Solo necesitamos cerrar el modal
    this.closeEditModal();
  }

  closeAddModal(): void {
    this.showAddModal = false;
    this.cdr.detectChanges();
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.distributorToEdit = null;
    this.cdr.detectChanges();
  }

  // Método para obtener el total de distribuidores
  getTotalDistribuidores(): number {
    const total =
      this.estadisticas.totalDistribuidoresInternos + this.estadisticas.totalDistribuidoresExternos;
    return total;
  }

  // Método para obtener el total de ventas
  getTotalVentas(): number {
    const total = this.estadisticas.totalVentasInternas + this.estadisticas.totalVentasExternas;
    return total;
  }

  // Método para obtener el total de ingresos
  getTotalIngresos(): number {
    return this.estadisticas.totalIngresosInternos + this.estadisticas.totalIngresosExternos;
  }

  // Método para filtrar distribuidores por término de búsqueda
  filterDistribuidores(): void {
    if (!this.searchTerm.trim()) {
      this.distribuidoresFiltrados = [...this.distribuidores];
    } else {
      const term = this.searchTerm.toLowerCase();
      this.distribuidoresFiltrados = this.distribuidores.filter(
        (distribuidor) =>
          distribuidor.nombre.toLowerCase().includes(term) ||
          distribuidor.role.toLowerCase().includes(term) ||
          distribuidor.tipo.toLowerCase().includes(term) ||
          distribuidor.estado.toLowerCase().includes(term) ||
          (distribuidor.email && distribuidor.email.toLowerCase().includes(term))
      );
    }
  }
}
