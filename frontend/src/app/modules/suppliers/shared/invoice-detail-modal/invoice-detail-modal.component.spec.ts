import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { of, throwError } from 'rxjs';
import { InvoiceDetailModalComponent } from './invoice-detail-modal.component';
import { SupplierInvoicesService } from '../../services/supplier-invoices.service';
import type { FacturaProveedor } from '../../models/supplier.models';

describe('InvoiceDetailModalComponent payment integrity', () => {
  const invoice = (id: string): FacturaProveedor => ({id, proveedorId:'supplier',numeroFactura:id,
    monto:100,montoPagado:0,estado:'pendiente',pagos:[],fechaEmision:new Date(),
    fechaRegistro:new Date(),ultimaModificacion:new Date(),registradoPor:'owner'});
  let service: {addPayment:jasmine.Spy;getFacturaById:jasmine.Spy;deleteInvoice:jasmine.Spy};
  beforeEach(async () => {
    service = {addPayment:jasmine.createSpy().and.resolveTo(),getFacturaById:jasmine.createSpy().and.returnValue(of(invoice('one'))),deleteInvoice:jasmine.createSpy().and.resolveTo()};
    await TestBed.configureTestingModule({imports:[InvoiceDetailModalComponent],providers:[
      provideZonelessChangeDetection(), {provide:SupplierInvoicesService,useValue:service},
    ]}).compileComponents();
  });
  function view() {
    const fixture = TestBed.createComponent(InvoiceDetailModalComponent);
    fixture.componentRef.setInput('invoice',invoice('one')); fixture.componentRef.setInput('show',true);
    fixture.detectChanges();
    return fixture;
  }
  it('reuses its operation key after a saved payment cannot be refreshed', async () => {
    const fixture = view(), component = fixture.componentInstance;
    service.getFacturaById.and.returnValue(throwError(() => new Error('Error de consulta')));
    component.onAddPayment(); component.paymentAmount.set(20);
    await component.onConfirmPayment();
    const firstKey = service.addPayment.calls.mostRecent().args[1].operationId;
    expect(component.errors().length).toBe(1);
    await component.onConfirmPayment();
    expect(service.addPayment.calls.mostRecent().args[1].operationId).toBe(firstKey);
  });
  it('does not publish a late payment result into another invoice view', async () => {
    const fixture = view(), component = fixture.componentInstance;
    let resolvePayment!: () => void;
    service.addPayment.and.returnValue(new Promise<void>(resolve => resolvePayment = resolve));
    const published = jasmine.createSpy(); component.invoiceUpdated.subscribe(published);
    component.onAddPayment(); component.paymentAmount.set(20);
    const payment = component.onConfirmPayment();
    fixture.componentRef.setInput('invoice',invoice('two')); fixture.detectChanges();
    resolvePayment(); await payment;
    expect(service.getFacturaById).not.toHaveBeenCalled(); expect(published).not.toHaveBeenCalled();
    expect(component.paymentOperationId()).toBeNull(); expect(component.isProcessingPayment()).toBeFalse();
  });
  it('prevents closing or starting another action while payment is in flight', async () => {
    const fixture = view(), component = fixture.componentInstance;
    let resolvePayment!: () => void;
    service.addPayment.and.returnValue(new Promise<void>(resolve => resolvePayment = resolve));
    const closed = jasmine.createSpy(); component.close.subscribe(closed);
    component.onAddPayment(); component.paymentAmount.set(20);
    const key = component.paymentOperationId(); const payment = component.onConfirmPayment();
    component.onClose(); component.onAddPayment(); await component.onDeleteInvoice();
    expect(closed).not.toHaveBeenCalled(); expect(service.deleteInvoice).not.toHaveBeenCalled();
    expect(component.paymentOperationId()).toBe(key);
    resolvePayment(); await payment;
  });
  it('permits the final decimal payment using the transaction tolerance', async () => {
    const fixture = view(), component = fixture.componentInstance;
    fixture.componentRef.setInput('invoice',{...invoice('one'),monto:0.3,montoPagado:0.2,estado:'parcial'});
    fixture.detectChanges(); component.onAddPayment(); component.paymentAmount.set(0.1);
    expect(component.canConfirmPayment()).toBeTrue();
    await component.onConfirmPayment();
    expect(service.addPayment.calls.mostRecent().args[1].monto).toBe(0.1);
  });
});
