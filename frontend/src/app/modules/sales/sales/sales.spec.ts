import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { Sales } from './sales';
import { SalesService, Venta } from '../services/sales.service';
import { InventoryService } from '../../inventory/services/inventory.service';
import { OperatorSessionService } from '../../../core/integration/operator-session.service';

describe('Sales', () => {
  const sales = new BehaviorSubject<Venta[]>([]);
  const service = { getVentas: () => sales.asObservable(), getEstadisticasVentas: () => Promise.resolve({ ventasHoy:0,totalHoy:0,ventasMes:0,totalMes:0 }) };
  beforeEach(async () => {
    sales.next([]);
    await TestBed.configureTestingModule({ imports:[Sales], providers:[provideZonelessChangeDetection(), provideRouter([]),
      { provide:SalesService,useValue:service },
      { provide:InventoryService,useValue:{ getProductos:() => of([]) } },
      { provide:OperatorSessionService,useValue:{ active:() => ({ id:'admon' }) } },
    ] }).compileComponents();
  });
  it('shows a real empty state without Firebase', () => {
    const fixture = TestBed.createComponent(Sales); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se encontraron ventas');
  });
  it('uses discounted header totals and keeps filters when the listener updates', () => {
    const fixture = TestBed.createComponent(Sales); fixture.detectChanges();
    const sale = { factura:'1000-123',cliente:'Ana',fecha:'01-10-2026',fecha2:'2026-10-01',descuento:'10',discountType:'percentage',discountAmount:'10',total:'90',subtotal:'100',eliminado:false,ultima_modificacion:'',productos:[{ nombre:'P',cantidad:'1',precio:'100',subtotal:'100',total:'100' }] } as Venta;
    fixture.componentInstance.searchTerm = 'Ana'; sales.next([sale,{ ...sale,cliente:'Otro' }]);
    expect(fixture.componentInstance.filteredVentas.length).toBe(1);
    expect(fixture.componentInstance.getTotal(sale)).toBe(90);
    fixture.componentInstance.editarVenta(sale); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();
  });
  it('shows load errors instead of an empty-success message', () => {
    spyOn(service,'getVentas').and.returnValue(throwError(() => new Error('Sin acceso')));
    const fixture = TestBed.createComponent(Sales); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin acceso');
    expect(fixture.nativeElement.textContent).not.toContain('No se encontraron ventas');
  });
});
