import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { Expenses } from './expenses';
import { BusinessContext, BusinessContextService } from '../../../core/integration/business-context.service';
import { MobileFirestoreRepository } from '../../../core/integration/mobile-firestore.repository';

describe('Gastos aislados', () => {
  let context: BehaviorSubject<BusinessContext>;
  let watchExpenses: jasmine.Spy;
  beforeEach(async () => {
    registerLocaleData(localeEsCo);
    context = new BehaviorSubject<BusinessContext>({ status: 'signed-out' });
    watchExpenses = jasmine.createSpy('watchExpensesForBusinessDate').and.returnValue(
      of({ records: [], rejected: [] })
    );
    await TestBed.configureTestingModule({
      imports: [Expenses],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BusinessContextService, useValue: { context$: context } },
        { provide: MobileFirestoreRepository, useValue: { watchExpensesForBusinessDate: watchExpenses } },
      ],
    }).compileComponents();
  });

  it('no consulta Firestore sin sesión', () => {
    const fixture = TestBed.createComponent(Expenses);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Inicia sesión');
    expect(watchExpenses).not.toHaveBeenCalled();
  });

  it('muestra un fallo de consulta sin convertirlo en un total cero', () => {
    watchExpenses.and.returnValue(throwError(() => new Error('permission-denied')));
    context.next({ status: 'owner', ownerUid: 'synthetic-owner', actorUid: 'synthetic-owner', email: null });
    const fixture = TestBed.createComponent(Expenses);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No fue posible cargar');
    expect(fixture.nativeElement.querySelector('.expense-summary')).toBeNull();
  });

  it('retira los gastos al cerrar sesión', () => {
    context.next({ status: 'owner', ownerUid: 'synthetic-owner', actorUid: 'synthetic-owner', email: null });
    const fixture = TestBed.createComponent(Expenses);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay gastos para este día');
    context.next({ status: 'signed-out' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.expense-summary')).toBeNull();
  });
});
