import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Dashboard } from './dashboard';
import { MobileDashboardService, MobileDashboardState } from '../../../core/integration/mobile-dashboard.service';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { OperatorSessionService } from '../../../core/integration/operator-session.service';

describe('Dashboard aislado', () => {
  let state: BehaviorSubject<MobileDashboardState>;
  beforeEach(async () => {
    state = new BehaviorSubject<MobileDashboardState>({ status: 'loading' });
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: MobileDashboardService, useValue: { state$: state } },
        { provide: BusinessContextService, useValue: { context: signal({ status: 'owner' }), can: () => true } },
        { provide: OperatorSessionService, useValue: { active: signal(null) } },
      ],
    }).compileComponents();
  });

  it('distingue un fallo de carga de un tablero con ventas cero', () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Preparando el centro de control');
    state.next({ status: 'error', message: 'No hay acceso a esta consulta.' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay acceso a esta consulta.');
    expect(fixture.nativeElement.querySelector('.metrics-grid')).toBeNull();
  });

  it('solicita seleccionar operador sin inventar ventas o stock', () => {
    state.next({ status: 'ready', snapshot: {
      businessDate: '2026-10-02', metrics: [], topProducts: [], contractWarnings: 0,
      inventory: { totalProducts: 2, productsWithReportedStock: 0, productsWithUnknownStock: 2 },
    } });
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Elige el usuario operativo');
    expect(fixture.nativeElement.textContent).toContain('Un saldo ausente no es cero');
    expect(fixture.nativeElement.querySelector('a[href="/users"]')).toBeTruthy();
  });
});
