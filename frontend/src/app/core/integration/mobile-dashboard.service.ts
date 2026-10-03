import { Injectable, inject } from '@angular/core';
import { combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';
import { BusinessContextService } from './business-context.service';
import { colombiaBusinessDate } from './business-date';
import {
  MobileFirestoreRepository,
  type MobileCollectionResult,
} from './mobile-firestore.repository';
import type { MobileClient, MobileExpense, MobileProduct, MobileSale } from './mobile-contract';
import { WebSalesReportRepository } from './web-sales-report.repository';
import type { WebSaleReportRecord } from './web-sales-report.contract';

export interface DashboardMetric {
  label: string;
  value: string;
  detail: string;
}

export interface MobileDashboardSnapshot {
  businessDate: string;
  metrics: DashboardMetric[];
  topProducts: { name: string; sales: number }[];
  inventory: {
    totalProducts: number;
    productsWithReportedStock: number;
    productsWithUnknownStock: number;
  };
  contractWarnings: number;
}

export type MobileDashboardState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'ready'; snapshot: MobileDashboardSnapshot }
  | { status: 'error'; message: string };

/**
 * Read model for the owner dashboard. It intentionally observes, but never
 * repairs or writes, mobile records. Sales and expenses are constrained to the
 * current business day; catalogue screens will own their own pagination.
 */
@Injectable({ providedIn: 'root' })
export class MobileDashboardService {
  private readonly context = inject(BusinessContextService);
  private readonly repository = inject(MobileFirestoreRepository);
  private readonly webSales = inject(WebSalesReportRepository);

  readonly state$ = this.context.context$.pipe(
    switchMap((context) => {
      if (context.status === 'signed-out') return of<MobileDashboardState>({ status: 'signed-out' });
      const businessDate = colombiaBusinessDate();

      return combineLatest({
        sales: this.repository.watchSalesForBusinessDate(context.ownerUid, businessDate),
        products: this.repository.watchProducts(context.ownerUid),
        clients: this.repository.watchClients(context.ownerUid),
        expenses: this.repository.watchExpensesForBusinessDate(context.ownerUid, businessDate),
        webSales: this.webSales.watchSalesForBusinessDate(context.ownerUid, businessDate),
      }).pipe(
        map((data) => ({ status: 'ready' as const, snapshot: buildSnapshot(data, businessDate) })),
        startWith({ status: 'loading' as const }),
        catchError(() =>
          of<MobileDashboardState>({
            status: 'error',
            message: 'No fue posible cargar los datos del negocio. Verifique su sesión y permisos.',
          })
        )
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );
}

export function buildSnapshot(
  data: {
  sales: MobileCollectionResult<MobileSale>;
  products: MobileCollectionResult<MobileProduct>;
  clients: MobileCollectionResult<MobileClient>;
  expenses: MobileCollectionResult<MobileExpense>;
  webSales: WebSaleReportRecord[];
  },
  businessDate: string
): MobileDashboardSnapshot {
  const activeSales = data.sales.records.map(({ value }) => value).filter((sale) => sale.deleted !== true);
  const activeExpenses = data.expenses.records
    .map(({ value }) => value)
    .filter((expense) => expense.deleted !== true);
  const activeProducts = data.products.records
    .map(({ value }) => value)
    .filter((product) => product.deleted !== true);
  const activeClients = data.clients.records
    .map(({ value }) => value)
    .filter((client) => client.deleted !== true);
  const salesToday = activeSales;
  const expensesToday = activeExpenses;
  const salesWithTotal = salesToday.filter((sale) => sale.total !== null);
  const activeWebSales = data.webSales.filter((sale) => !sale.deleted);
  const webSalesWithTotal = activeWebSales.filter((sale) => sale.total !== null);
  const missingSaleTotals = salesToday.length - salesWithTotal.length;
  const mobileSalesIncomplete = missingSaleTotals > 0 || data.sales.rejected.length > 0;
  const webSalesIncomplete = activeWebSales.length !== webSalesWithTotal.length;
  const topProducts = topProductsFor(activeSales);
  const contractWarnings = activeWebSales.length - webSalesWithTotal.length +
    data.sales.rejected.length +
    data.products.rejected.length +
    data.clients.rejected.length +
    data.expenses.rejected.length +
    data.sales.records.reduce((count, record) => count + record.issues.length, 0) +
    data.products.records.reduce((count, record) => count + record.issues.length, 0) +
    data.clients.records.reduce((count, record) => count + record.issues.length, 0) +
    data.expenses.records.reduce((count, record) => count + record.issues.length, 0);

  return {
    businessDate,
    metrics: [
      {
        label: 'Ventas consolidadas',
        value: mobileSalesIncomplete || webSalesIncomplete ? 'No disponible' : formatCop([...salesWithTotal.map((sale) => sale.total!), ...webSalesWithTotal.map((sale) => sale.total!)]),
        detail:
          mobileSalesIncomplete || webSalesIncomplete ? 'Hay ventas sin total verificable; consulta el detalle por origen.' : `${salesToday.length} móvil(es) + ${activeWebSales.length} de escritorio`,
      },
      {
        label: 'Ventas móviles',
        value: mobileSalesIncomplete ? 'No disponible' : formatCop(salesWithTotal.map((sale) => sale.total!)),
        detail: !mobileSalesIncomplete
          ? `${salesToday.length} venta(s) registrada(s)`
          : `${missingSaleTotals} venta(s) sin total y ${data.sales.rejected.length} registro(s) incompatible(s)`,
      },
      {
        label: 'Ventas escritorio',
        value: webSalesIncomplete ? 'No disponible' : formatCop(webSalesWithTotal.map((sale) => sale.total!)),
        detail: `${webSalesWithTotal.length} de ${activeWebSales.length} con total disponible`,
      },
      {
        label: 'Gastos del día',
        value: data.expenses.rejected.length > 0 ? 'No disponible' : formatCop(expensesToday.map((expense) => String(expense.amount))),
        detail: data.expenses.rejected.length > 0 ? 'Hay gastos incompatibles; el total no es verificable.' : `${expensesToday.length} gasto(s) móvil(es) registrado(s)`,
      },
      {
        label: 'Clientes activos',
        value: String(activeClients.length),
        detail: 'Clientes no marcados como eliminados',
      },
      {
        label: 'Inventario informado',
        value: String(activeProducts.filter((product) => product.stock !== null).length),
        detail: `${activeProducts.filter((product) => product.stock === null).length} producto(s) sin saldo informado`,
      },
    ],
    topProducts,
    inventory: {
      totalProducts: activeProducts.length,
      productsWithReportedStock: activeProducts.filter((product) => product.stock !== null).length,
      productsWithUnknownStock: activeProducts.filter((product) => product.stock === null).length,
    },
    contractWarnings,
  };
}

function topProductsFor(sales: MobileSale[]): { name: string; sales: number }[] {
  const counts = new Map<string, number>();
  for (const sale of sales) {
    for (const line of sale.lines) {
      const name = line.name.trim() || 'Producto sin nombre';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, sales]) => ({ name, sales }))
    .sort((left, right) => right.sales - left.sales || left.name.localeCompare(right.name, 'es-CO'))
    .slice(0, 5);
}

/** Exact addition of decimal strings; it never converts currency through Number. */
function formatCop(values: string[]): string {
  if (values.length === 0) return 'COP 0';
  const parsed = values.map(parseDecimal);
  const scale = Math.max(0, ...parsed.map((value) => -value.power));
  const total = parsed.reduce(
    (sum, value) => sum + value.sign * value.coefficient * powerOfTen(value.power + scale),
    0n
  );
  const negative = total < 0n;
  const digits = (negative ? -total : total).toString().padStart(scale + 1, '0');
  const integer = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? '' : digits.slice(-scale).replace(/0+$/, '');
  return `COP ${negative ? '-' : ''}${groupThousands(integer)}${fraction ? `,${fraction}` : ''}`;
}

function parseDecimal(input: string): { sign: bigint; coefficient: bigint; power: number } {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(input);
  if (!match) throw new Error('A contract reader supplied an invalid decimal.');
  const fractionalDigits = match[3]?.length ?? 0;
  const exponent = Number(match[4] ?? 0);
  // Covers Java Double's range while bounding work for corrupt historical strings.
  if (input.length > 2048 || !Number.isSafeInteger(exponent) || Math.abs(exponent) > 1024) {
    throw new Error('El importe supera el rango de presentación seguro.');
  }
  return {
    sign: match[1] === '-' ? -1n : 1n,
    coefficient: BigInt(`${match[2]}${match[3] ?? ''}`),
    power: exponent - fractionalDigits,
  };
}

function powerOfTen(exponent: number): bigint {
  if (exponent < 0) throw new Error('Internal decimal scale is invalid.');
  return 10n ** BigInt(exponent);
}

function groupThousands(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
