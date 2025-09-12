import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { InventoryService, Producto } from '../services/inventory.service';

@Component({
  selector: 'app-inventory-reports',
  standalone: true,
  imports: [CommonModule, CurrencyPipe],
  templateUrl: './inventory-reports.html',
  styleUrl: './inventory-reports.scss',
})
export class InventoryReportsComponent implements OnInit {
  productos: Producto[] = [];
  loading = true;
  error: string | null = null;

  // Reportes
  lowStockProducts: Producto[] = [];
  outOfStockProducts: Producto[] = [];
  topValueProducts: Producto[] = [];
  recentMovements: any[] = [];

  // Estadísticas
  totalProducts = 0;
  totalValue = 0;
  averageValue = 0;
  stockDistribution: { [key: string]: number } = {};

  constructor(private inventoryService: InventoryService, private router: Router) {}

  ngOnInit() {
    this.loadData();
  }

  private loadData() {
    this.loading = true;

    this.inventoryService.getProductos().subscribe(
      (productos) => {
        this.productos = productos;
        this.generateReports();
        this.loading = false;
      },
      (error) => {
        this.error = `Error al cargar datos: ${error.message || 'Error desconocido'}`;
        this.loading = false;
      }
    );
  }

  private generateReports() {
    // Productos con stock bajo
    this.lowStockProducts = this.productos
      .filter((p) => Number(p.cantidad) > 0 && Number(p.cantidad) <= 5)
      .sort((a, b) => Number(a.cantidad) - Number(b.cantidad));

    // Productos sin stock
    this.outOfStockProducts = this.productos.filter((p) => Number(p.cantidad) === 0);

    // Productos de mayor valor
    this.topValueProducts = this.productos
      .map((p) => ({ ...p, totalValue: Number(p.cantidad) * Number(p.valor) }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10);

    // Estadísticas generales
    this.totalProducts = this.productos.length;
    this.totalValue = this.productos.reduce(
      (sum, p) => sum + Number(p.cantidad) * Number(p.valor),
      0
    );
    this.averageValue = this.totalProducts > 0 ? this.totalValue / this.totalProducts : 0;

    // Distribución de stock
    this.stockDistribution = {
      'Sin Stock': this.outOfStockProducts.length,
      'Stock Bajo (1-5)': this.productos.filter(
        (p) => Number(p.cantidad) >= 1 && Number(p.cantidad) <= 5
      ).length,
      'Stock Normal (6-20)': this.productos.filter(
        (p) => Number(p.cantidad) >= 6 && Number(p.cantidad) <= 20
      ).length,
      'Stock Alto (>20)': this.productos.filter((p) => Number(p.cantidad) > 20).length,
    };
  }

  goBack() {
    this.router.navigate(['/inventory']);
  }

  refreshData() {
    this.loadData();
  }

  exportReport() {
    alert('Funcionalidad de exportación próximamente disponible');
  }

  getStockStatusClass(cantidad: number): string {
    if (cantidad === 0) return 'bg-danger';
    if (cantidad <= 5) return 'bg-warning text-dark';
    return 'bg-success';
  }

  getStockStatusText(cantidad: number): string {
    if (cantidad === 0) return 'Sin Stock';
    if (cantidad <= 5) return 'Stock Bajo';
    if (cantidad <= 20) return 'Stock Normal';
    return 'Stock Alto';
  }

  getStockDistributionKeys(): string[] {
    return Object.keys(this.stockDistribution);
  }

  getCategoryColorClass(category: string): string {
    switch (category) {
      case 'Sin Stock':
        return 'text-danger';
      case 'Stock Bajo (1-5)':
        return 'text-warning';
      case 'Stock Normal (6-20)':
        return 'text-success';
      case 'Stock Alto (>20)':
        return 'text-primary';
      default:
        return 'text-secondary';
    }
  }
}
