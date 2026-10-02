import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { MobileFirestoreRepository } from '../../../core/integration/mobile-firestore.repository';
import { WebSalesReportRepository } from '../../../core/integration/web-sales-report.repository';
import {
  businessDate,
  BusinessLocaleProfile,
  DEFAULT_BUSINESS_LOCALE,
} from '../../../core/integration/business-date';

type DailySaleRecord = {
  source: 'móvil' | 'escritorio';
  invoice: string | null;
  total: string | null;
  payment: 'pagada' | 'pendiente' | 'sin estado' | 'no aplica';
};

type ReportState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'; date: string; salesCount: number; salesWithTotal: number; salesTotal: string;
      expensesCount: number; expensesTotal: string; paidSales: number; unpaidSales: number;
      unknownPaymentSales: number; contractWarnings: number;
      webSalesCount: number; webSalesWithTotal: number; webSalesTotal: string; consolidatedSalesTotal: string;
      possibleDuplicateInvoices: string[]; records: DailySaleRecord[];
    };

/** Read-only daily report over records written by impresora. Desktop sales stay separate. */
@Component({
  selector: 'app-reports', standalone: true,
  imports: [CommonModule, AsyncPipe, FormsModule], templateUrl: './reports.html', styleUrl: './reports.scss',
})
export class Reports {
  private readonly context = inject(BusinessContextService);
  private readonly repository = inject(MobileFirestoreRepository);
  private readonly webSales = inject(WebSalesReportRepository);
  /** The initial profile remains Colombia until a per-business profile is enabled. */
  readonly businessProfile = DEFAULT_BUSINESS_LOCALE;
  private readonly selectedDate = new BehaviorSubject(businessDate());

  readonly state$ = combineLatest([this.context.context$, this.selectedDate]).pipe(
    switchMap(([context, date]) => {
      if (context.status === 'signed-out') return of<ReportState>({ status: 'signed-out' });
      return combineLatest({
        sales: this.repository.watchSalesForBusinessDate(context.ownerUid, date),
        expenses: this.repository.watchExpensesForBusinessDate(context.ownerUid, date),
        webSales: this.webSales.watchSalesForBusinessDate(context.ownerUid, date),
      }).pipe(
        map(({ sales, expenses, webSales }): ReportState => {
          const activeSales = sales.records.map(({ value }) => value).filter((sale) => sale.deleted !== true);
          const activeExpenses = expenses.records.map(({ value }) => value).filter((expense) => expense.deleted !== true);
          const completeSales = activeSales.filter((sale) => sale.total !== null);
          const activeWebSales = webSales.filter((sale) => !sale.deleted);
          const completeWebSales = activeWebSales.filter((sale) => sale.total !== null);
          const mobileInvoices = new Set(
            activeSales.map((sale) => sale.invoiceNumber).filter((invoice): invoice is string => invoice !== null)
          );
          const possibleDuplicateInvoices = [...new Set(
            activeWebSales
              .map((sale) => sale.invoiceNumber)
              .filter((invoice): invoice is string => invoice !== null && mobileInvoices.has(invoice))
          )];
          const records: DailySaleRecord[] = [
            ...activeSales.map((sale) => ({
              source: 'móvil' as const,
              invoice: sale.invoiceNumber,
              total: sale.total,
              payment: sale.paymentStatus === 'paid'
                ? 'pagada' as const
                : sale.paymentStatus === 'unpaid'
                  ? 'pendiente' as const
                  : 'sin estado' as const,
            })),
            ...activeWebSales.map((sale) => ({
              source: 'escritorio' as const,
              invoice: sale.invoiceNumber,
              total: sale.total,
              payment: 'no aplica' as const,
            })),
          ].sort((left, right) => (right.invoice ?? '').localeCompare(left.invoice ?? ''));
          const issues = sales.rejected.length + expenses.rejected.length
            + sales.records.reduce((total, record) => total + record.issues.length, 0)
            + expenses.records.reduce((total, record) => total + record.issues.length, 0);
          return {
            status: 'ready', date, salesCount: activeSales.length, salesWithTotal: completeSales.length,
            salesTotal: formatCurrency(completeSales.map((sale) => sale.total!), this.businessProfile), expensesCount: activeExpenses.length,
            expensesTotal: formatCurrency(activeExpenses.map((expense) => String(expense.amount)), this.businessProfile),
            paidSales: activeSales.filter((sale) => sale.paymentStatus === 'paid').length,
            unpaidSales: activeSales.filter((sale) => sale.paymentStatus === 'unpaid').length,
            unknownPaymentSales: activeSales.filter((sale) => sale.paymentStatus === 'unknown').length,
            contractWarnings: issues + (activeWebSales.length - completeWebSales.length),
            webSalesCount: activeWebSales.length,
            webSalesWithTotal: completeWebSales.length,
            webSalesTotal: formatCurrency(completeWebSales.map((sale) => sale.total!), this.businessProfile),
            consolidatedSalesTotal: formatCurrency([
              ...completeSales.map((sale) => sale.total!),
              ...completeWebSales.map((sale) => sale.total!),
            ], this.businessProfile),
            possibleDuplicateInvoices,
            records,
          };
        }),
        startWith<ReportState>({ status: 'loading' }),
        catchError(() => of<ReportState>({ status: 'error', message: 'No fue posible cargar el corte. Revise su sesión y los permisos de acceso.' }))
      );
    }), shareReplay({ bufferSize: 1, refCount: true })
  );

  get currentDate(): string { return this.selectedDate.value; }
  changeDate(value: string): void { if (/^\d{4}-\d{2}-\d{2}$/.test(value)) this.selectedDate.next(value); }
  formatAmount(value: string | null): string {
    return value === null ? 'Total no disponible' : formatCurrency([value], this.businessProfile);
  }

  countryLabel(): string {
    return this.businessProfile.country === 'CO' ? 'Colombia' : this.businessProfile.country;
  }
}

function formatCurrency(values: string[], profile: BusinessLocaleProfile): string {
  if (values.length === 0) return `${profile.currency} 0`;
  const parsed = values.map(parseDecimal); const scale = Math.max(0, ...parsed.map((value) => -value.power));
  const total = parsed.reduce((sum, value) => sum + value.sign * value.coefficient * 10n ** BigInt(value.power + scale), 0n);
  const negative = total < 0n; const digits = (negative ? -total : total).toString().padStart(scale + 1, '0');
  const integer = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? '' : digits.slice(-scale).replace(/0+$/, '');
  const parts = new Intl.NumberFormat(profile.locale, { useGrouping: true }).formatToParts(1234567.89);
  const group = parts.find((part) => part.type === 'group')?.value ?? ',';
  const decimal = parts.find((part) => part.type === 'decimal')?.value ?? '.';
  return `${profile.currency} ${negative ? '-' : ''}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, group)}${fraction ? `${decimal}${fraction}` : ''}`;
}
function parseDecimal(input: string): { sign: bigint; coefficient: bigint; power: number } {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(input);
  if (!match) throw new Error('A contract reader supplied an invalid decimal.');
  return { sign: match[1] === '-' ? -1n : 1n, coefficient: BigInt(`${match[2]}${match[3] ?? ''}`), power: Number(match[4] ?? 0) - (match[3]?.length ?? 0) };
}
