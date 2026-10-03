import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { of, throwError } from 'rxjs';
import { Reports } from './reports';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { MobileFirestoreRepository } from '../../../core/integration/mobile-firestore.repository';
import { WebSalesReportRepository } from '../../../core/integration/web-sales-report.repository';

describe('Reports', () => {
  const mobile = { watchSalesForBusinessDate:() => of({ records:[],rejected:[] }), watchExpensesForBusinessDate:() => of({ records:[],rejected:[] }) };
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports:[Reports],providers:[provideZonelessChangeDetection(),
      { provide:BusinessContextService,useValue:{ context$:of({ status:'owner',ownerUid:'synthetic',actorUid:'synthetic' }) } },
      { provide:MobileFirestoreRepository,useValue:mobile },
      { provide:WebSalesReportRepository,useValue:{ watchSalesForBusinessDate:() => of([]) } },
    ] }).compileComponents();
  });
  it('renders a verified empty daily report without Firebase', () => {
    const fixture = TestBed.createComponent(Reports); fixture.detectChanges();
    let state:any; const sub = fixture.componentInstance.state$.subscribe(value => state = value);
    expect(state.status).toBe('ready'); expect(state.salesCount).toBe(0); expect(state.webSalesCount).toBe(0);
    sub.unsubscribe();
  });
  it('does not report zero totals when one source fails', () => {
    spyOn(mobile,'watchSalesForBusinessDate').and.returnValue(throwError(() => new Error('denied')));
    const fixture = TestBed.createComponent(Reports); fixture.detectChanges();
    let state:any; const sub = fixture.componentInstance.state$.subscribe(value => state = value);
    expect(state.status).toBe('error'); sub.unsubscribe();
  });
});
