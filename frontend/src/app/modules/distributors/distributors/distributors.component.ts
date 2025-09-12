import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { Subscription } from 'rxjs';
import { DistribuidorEstadisticas } from '../models/distributor.models';
import { DistributorsService } from '../services/distributors.service';

@Component({
  selector: 'app-distributors',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  private estadisticasSubscription?: Subscription;

  // Lista de distribuidores (representación simplificada)
  distribuidores = [
    {
      id: 'seller1',
      name: 'Distribuidor Interno 1',
      type: 'interno',
      role: 'seller1',
      status: 'Activo',
    },
    {
      id: 'seller2',
      name: 'Distribuidor Interno 2',
      type: 'interno',
      role: 'seller2',
      status: 'Inactivo',
    },
    {
      id: 'seller3',
      name: 'Distribuidor Interno 3',
      type: 'interno',
      role: 'seller3',
      status: 'Inactivo',
    },
    {
      id: 'seller4',
      name: 'Distribuidor Interno 4',
      type: 'interno',
      role: 'seller4',
      status: 'Inactivo',
    },
  ];

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
  }

  ngOnDestroy(): void {
    // Limpiar suscripción para evitar memory leaks
    if (this.estadisticasSubscription) {
      this.estadisticasSubscription.unsubscribe();
    }
  }

  openDashboard(distributor: any): void {
    this.router.navigate(['/distributors/dashboard', distributor.id]);
  }

  editDistributor(distributor: any): void {
    // TODO: Implementar edición de distribuidor
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
    // Aquí se podría abrir un modal o navegar a un formulario
    // TODO: Implementar agregar nuevo distribuidor
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
}
