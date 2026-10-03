import { CommonModule, CurrencyPipe } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, catchError, of, switchMap } from 'rxjs';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { InventoryLedgerService } from '../services/inventory-ledger.service';
import { createInventoryReversal, summarizeInventoryLocations, summarizeInventoryMovements } from '../services/inventory-ledger.policy';
import type { InventoryAdministrativeBalance, InventoryLocationBalance, InventoryMovementInput } from '../services/inventory-ledger.policy';
import { InventoryService, Producto } from '../services/inventory.service';
import { SalesService } from '../../sales/services/sales.service';
import { exportObservedInventory } from '../services/inventory-export';
import { InventoryConfigurationService } from '../services/inventory-configuration.service';

interface WebSaleOutput {
  codigo: string;
  nombre: string;
  cantidad: number;
}

interface LedgerMovement extends InventoryMovementInput {
  id: string;
}

@Component({
  selector: 'app-inventory-reports',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, FormsModule],
  templateUrl: './inventory-reports.html',
  styleUrl: './inventory-reports.scss',
})
export class InventoryReportsComponent implements OnInit, OnDestroy {
  private readonly subscriptions = new Subscription();
  private dataSubscription = new Subscription();
  productos: Producto[] = [];
  loading = true;
  error: string | null = null;

  // Reportes
  lowStockProducts: Producto[] = [];
  outOfStockProducts: Producto[] = [];
  topValueProducts: Producto[] = [];
  ledgerMovements: LedgerMovement[] = [];
  recentMovements: LedgerMovement[] = [];
  administrativeBalances: InventoryAdministrativeBalance[] = [];
  locationBalances: InventoryLocationBalance[] = [];
  webSaleOutputs: WebSaleOutput[] = [];
  webLinesWithoutCode = 0;
  recordingFactoryReceipt = false;
  factoryReceiptError: string | null = null;
  factoryReceiptMessage: string | null = null;
  factoryReceiptForm = {
    productCode: '',
    quantity: null as number | null,
    reference: '',
    note: '',
  };
  correctionTarget: LedgerMovement | null = null;
  correctionReason = '';
  correctingMovement = false;
  correctionError: string | null = null;
  correctionMessage: string | null = null;
  readonly ledger = inject(InventoryLedgerService);
  private readonly context = inject(BusinessContextService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly configuration = inject(InventoryConfigurationService);
  lowStockThreshold = 5;

  // Estadísticas
  totalProducts = 0;
  totalValue = 0;
  averageValue = 0;
  stockDistribution: { [key: string]: number } = {};

  constructor(
    private inventoryService: InventoryService,
    private salesService: SalesService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadData();
  }

  /**
   * Outputs are informational, never another deduction from current stock.
   * New web sales already apply their stock impact atomically when saved.
   */
  private watchWebSaleOutputs(): void {
    this.dataSubscription.add(this.salesService.getVentas().subscribe({ next: (sales) => {
      const outputs = new Map<string, WebSaleOutput>();
      let missingCode = 0;
      for (const sale of sales) {
        for (const line of sale.productos) {
          const codigo = line.codigo?.trim();
          const cantidad = Number(line.cantidad);
          if (!codigo) {
            missingCode++;
            continue;
          }
          if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
          const current = outputs.get(codigo) ?? { codigo, nombre: line.nombre, cantidad: 0 };
          current.cantidad += cantidad;
          outputs.set(codigo, current);
        }
      }
      this.webSaleOutputs = [...outputs.values()].sort((left, right) => left.codigo.localeCompare(right.codigo));
      this.webLinesWithoutCode = missingCode;
      this.cdr.markForCheck();
    }, error: () => { this.webSaleOutputs = []; this.webLinesWithoutCode = 0; this.error = 'No fue posible consultar las salidas de ventas web.'; this.cdr.markForCheck(); } }));
  }

  private loadData() {
    this.loading = true;
    this.error = null;
    this.dataSubscription.unsubscribe();
    this.dataSubscription = new Subscription();
    this.watchWebSaleOutputs();
    this.dataSubscription.add(this.context.context$.pipe(switchMap((context) => {
      this.correctionTarget = null; this.correctionReason = ''; this.factoryReceiptForm = { productCode: '', quantity: null, reference: '', note: '' };
      return context.status === 'signed-out' ? of(null) : this.configuration.watch(context.ownerUid).pipe(catchError(() => {
        this.error = 'No fue posible consultar el umbral de inventario.'; return of(null);
      }));
    })).subscribe((configuration) => {
      this.lowStockThreshold = configuration?.lowStockThreshold ?? 5;
      this.generateReports(); this.cdr.markForCheck();
    }));

    this.dataSubscription.add(this.inventoryService.getProductos().subscribe(
      (productos) => {
        this.productos = productos;
        this.generateReports();
        this.loading = false;
        this.cdr.markForCheck();
      },
      (error) => {
        this.error = `Error al cargar datos: ${error.message || 'Error desconocido'}`;
        this.loading = false;
        this.productos = []; this.generateReports(); this.cdr.markForCheck();
      }
    ));
    this.dataSubscription.add(this.context.context$.pipe(
      switchMap((context) => {
        this.ledgerMovements = []; this.recentMovements = []; this.administrativeBalances = []; this.locationBalances = [];
        return context.status === 'signed-out' ? of([]) : this.ledger.watch(context.ownerUid).pipe(catchError(() => {
          this.error = 'No fue posible leer el libro administrativo de inventario. Revise el acceso antes de usar sus saldos.';
          return of([]);
        }));
      })
    ).subscribe((movements) => {
      this.ledgerMovements = movements;
      this.recentMovements = [...movements].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 8);
      try {
        this.locationBalances = summarizeInventoryLocations(movements);
        this.administrativeBalances = summarizeInventoryMovements(movements);
      } catch {
        this.administrativeBalances = []; this.locationBalances = [];
        this.error = 'El libro contiene movimientos incompatibles. No se presentan saldos parciales como inventario válido.';
      }
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void { this.subscriptions.unsubscribe(); this.dataSubscription.unsubscribe(); }

  private generateReports() {
    const known = this.productos.filter((product) => product.cantidad != null && String(product.cantidad).trim() !== '' && Number.isFinite(Number(product.cantidad)) && Number(product.cantidad) >= 0);
    // Productos con stock bajo
    this.lowStockProducts = known
      .filter((p) => Number(p.cantidad) > 0 && Number(p.cantidad) <= this.lowStockThreshold)
      .sort((a, b) => Number(a.cantidad) - Number(b.cantidad));

    // Productos sin stock
    this.outOfStockProducts = known.filter((p) => Number(p.cantidad) === 0);

    // Productos de mayor valor
    this.topValueProducts = known
      .filter((p) => Number.isFinite(Number(p.cantidad)) && Number.isFinite(Number(p.valor)))
      .map((p) => ({ ...p, totalValue: Number(p.cantidad) * Number(p.valor) }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10);

    // Estadísticas generales
    this.totalProducts = this.productos.length;
    this.totalValue = known.reduce(
      (sum, p) => Number.isFinite(Number(p.cantidad)) && Number.isFinite(Number(p.valor))
        ? sum + Number(p.cantidad) * Number(p.valor)
        : sum,
      0
    );
    this.averageValue = this.totalProducts > 0 ? this.totalValue / this.totalProducts : 0;

    // Distribución de stock
    this.stockDistribution = {
      'Sin Stock': this.outOfStockProducts.length,
      [`Stock Bajo (>0-${this.lowStockThreshold})`]: known.filter(
        (p) => Number(p.cantidad) > 0 && Number(p.cantidad) <= this.lowStockThreshold
      ).length,
      'Stock Normal': known.filter(
        (p) => Number(p.cantidad) > this.lowStockThreshold
      ).length,
      'No informado o inválido': this.productos.length - known.length,
    };
  }

  goBack() {
    this.router.navigate(['/inventory']);
  }

  refreshData() {
    this.loadData();
  }

  exportReport() {
    if (this.loading || this.error) return;
    exportObservedInventory(this.productos);
  }

  getStockStatusClass(cantidad: number): string {
    if (cantidad === 0) return 'bg-danger';
    if (cantidad <= this.lowStockThreshold) return 'bg-warning text-dark';
    return 'bg-success';
  }

  getStockStatusText(cantidad: number): string {
    if (cantidad === 0) return 'Sin Stock';
    if (cantidad <= this.lowStockThreshold) return 'Stock Bajo';
    return 'Stock Normal';
  }

  distributorPositions(balance: InventoryLocationBalance): string {
    return balance.distributors.length === 0
      ? '—'
      : balance.distributors.map((entry) => `${entry.distributorId}: ${entry.quantity}`).join(' · ');
  }

  get hasIncompleteFactoryBaseline(): boolean {
    return this.locationBalances.some((balance) => balance.factory < 0);
  }

  get locationReconciliationWarnings(): string[] {
    const warnings: string[] = [];
    for (const balance of this.locationBalances) {
      if (balance.factory < 0) warnings.push(`${balance.productCode}: fábrica sin línea base suficiente.`);
      if (balance.sharedDistributorPool < 0) warnings.push(`${balance.productCode}: bolsa compartida con movimientos por conciliar.`);
      for (const distributor of balance.distributors.filter((entry) => entry.quantity < 0)) {
        warnings.push(`${balance.productCode}: ${distributor.distributorId} tiene movimientos por conciliar.`);
      }
    }
    return warnings;
  }

  movementLabel(kind: string): string {
    const labels: Record<string, string> = {
      'factory-receipt': 'Recepción de fábrica',
      load: 'Carga a distribución',
      return: 'Devolución a fábrica',
      loss: 'Pérdida registrada',
      'adjustment-in': 'Ajuste de entrada',
      'adjustment-out': 'Ajuste de salida',
    };
    return labels[kind] ?? 'Movimiento administrativo';
  }

  async recordFactoryReceipt(): Promise<void> {
    if (this.recordingFactoryReceipt) return;
    this.factoryReceiptError = null;
    this.factoryReceiptMessage = null;
    const productCode = this.factoryReceiptForm.productCode.trim();
    const reference = this.factoryReceiptForm.reference.trim();
    const note = this.factoryReceiptForm.note.trim();
    const quantity = Number(this.factoryReceiptForm.quantity);
    const product = this.productos.find((candidate) => candidate.codigo === productCode);
    if (!product || !Number.isFinite(quantity) || quantity <= 0 || reference.length < 3 || note.length < 10) {
      this.factoryReceiptError = 'Seleccione un producto por código, indique una cantidad positiva, una referencia y una nota de al menos 10 caracteres.';
      return;
    }

    const business = this.context.context();
    if (business.status === 'signed-out') {
      this.factoryReceiptError = 'Debe iniciar sesión para registrar la recepción administrativa.';
      return;
    }

    this.recordingFactoryReceipt = true;
    try {
      await this.ledger.record({
        operationId: 'factory',
        sourceId: `receipt_${reference}_${productCode}`,
        kind: 'factory-receipt',
        productCode,
        productName: product.nombre,
        quantity,
        actorUid: business.actorUid,
        mode: 'central',
        note,
      });
      this.factoryReceiptForm = { productCode: '', quantity: null, reference: '', note: '' };
      this.factoryReceiptMessage = 'Recepción registrada en el libro administrativo de pruebas. El catálogo móvil no fue modificado.';
    } catch (error) {
      this.factoryReceiptError = error instanceof Error ? error.message : 'No fue posible registrar la recepción.';
    } finally {
      this.recordingFactoryReceipt = false;
      this.cdr.markForCheck();
    }
  }

  hasCorrection(movement: LedgerMovement): boolean {
    return this.ledgerMovements.some((candidate) => candidate.correctionOf === movement.id);
  }

  startCorrection(movement: LedgerMovement): void {
    this.correctionError = null;
    this.correctionMessage = null;
    if (movement.kind === 'factory-receipt' || movement.correctionOf) {
      this.correctionError = 'Una recepción de fábrica requiere una conciliación física específica; no se revierte desde este formulario.';
      return;
    }
    if (this.hasCorrection(movement)) {
      this.correctionError = 'Este movimiento ya tiene una corrección auditada.';
      return;
    }
    this.correctionTarget = movement;
    this.correctionReason = '';
  }

  cancelCorrection(): void {
    this.correctionTarget = null;
    this.correctionReason = '';
    this.correctionError = null;
  }

  async recordCorrection(): Promise<void> {
    if (!this.correctionTarget || this.correctingMovement) return;
    this.correctionError = null;
    this.correctionMessage = null;
    const business = this.context.context();
    if (business.status === 'signed-out') {
      this.correctionError = 'Debe iniciar sesión para corregir un movimiento administrativo.';
      return;
    }

    this.correctingMovement = true;
    try {
      const reversal = createInventoryReversal(this.correctionTarget, {
        sourceId: `reversal_${this.correctionTarget.id}`,
        actorUid: business.actorUid,
        reason: this.correctionReason,
      });
      await this.ledger.record(reversal);
      this.correctionMessage = 'Corrección registrada como movimiento inverso. El registro original permanece intacto.';
      this.correctionTarget = null;
      this.correctionReason = '';
    } catch (error) {
      this.correctionError = error instanceof Error ? error.message : 'No fue posible registrar la corrección.';
    } finally {
      this.correctingMovement = false;
      this.cdr.markForCheck();
    }
  }

  getStockDistributionKeys(): string[] {
    return Object.keys(this.stockDistribution);
  }

  getCategoryColorClass(category: string): string {
    if (category.startsWith('Stock Bajo')) return 'text-warning';
    switch (category) {
      case 'Sin Stock':
        return 'text-danger';
      case 'Stock Bajo (>0-5)':
        return 'text-warning';
      case 'Stock Normal (>5-20)':
        return 'text-success';
      case 'Stock Alto (>20)':
        return 'text-primary';
      default:
        return 'text-secondary';
    }
  }
}
