import { AsyncPipe, CurrencyPipe, NgForOf, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { catchError, map, of, shareReplay, startWith, switchMap } from 'rxjs';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { businessDate, DEFAULT_BUSINESS_LOCALE } from '../../../core/integration/business-date';
import { MobileFirestoreRepository } from '../../../core/integration/mobile-firestore.repository';
import type { MobileExpense } from '../../../core/integration/mobile-contract';

type ExpenseState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'error'; message: string }
  | { status: 'ready'; businessDate: string; expenses: MobileExpense[]; total: number; warnings: number };

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe, NgForOf, NgIf],
  templateUrl: './expenses.html',
  styleUrl: './expenses.scss',
})
export class Expenses {
  private readonly context = inject(BusinessContextService);
  private readonly repository = inject(MobileFirestoreRepository);
  readonly businessProfile = DEFAULT_BUSINESS_LOCALE;

  readonly state$ = this.context.context$.pipe(
    switchMap((context) => {
      if (context.status === 'signed-out') return of<ExpenseState>({ status: 'signed-out' });
      // `date2` is a civil business date in the mobile contract. It must use the
      // same central profile as other web readers, never the browser's local clock.
      const operationalDate = businessDate();
      return this.repository.watchExpensesForBusinessDate(context.ownerUid, operationalDate).pipe(
        map((result) => {
          const expenses = result.records
            .map(({ value }) => value)
            .filter((expense) => expense.deleted !== true)
            .sort((left, right) => left.description.localeCompare(right.description, this.businessProfile.locale));
          return {
            status: 'ready' as const,
            businessDate: operationalDate,
            expenses,
            total: expenses.reduce((sum, expense) => sum + expense.amount, 0),
            warnings:
              result.rejected.length + result.records.reduce((sum, record) => sum + record.issues.length, 0),
          };
        }),
        startWith({ status: 'loading' as const }),
        catchError(() => of<ExpenseState>({ status: 'error', message: 'No fue posible cargar los gastos del día.' }))
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  categoryLabel(category: string): string {
    const labels: Record<string, string> = {
      food: 'Alimentación', transport: 'Transporte', supplies: 'Insumos', services: 'Servicios',
      rent: 'Arriendo', utilities: 'Servicios públicos', other: 'Otros',
    };
    return labels[category.toLowerCase()] ?? (category || 'Sin categoría');
  }

  countryLabel(): string {
    return this.businessProfile.country === 'CO' ? 'Colombia' : this.businessProfile.country;
  }
}
