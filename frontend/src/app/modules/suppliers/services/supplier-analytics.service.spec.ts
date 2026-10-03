import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { SupplierAnalyticsService } from './supplier-analytics.service';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { SuppliersService } from './suppliers.service';
import type { FacturaProveedor } from '../models/supplier.models';

describe('SupplierAnalyticsService business-period payments', () => {
  beforeEach(() => {
    jasmine.clock().install(); jasmine.clock().mockDate(new Date('2026-10-01T02:00:00Z'));
  });
  afterEach(() => jasmine.clock().uninstall());
  function service() {
    const invoices = [{id:'one',proveedorId:'supplier',monto:100,montoPagado:30,estado:'parcial',
      fechaEmision:new Date('2026-09-01T12:00:00Z'),pagos:[{id:'payment',monto:30,fecha:new Date('2026-10-01T01:00:00Z')}]}] as FacturaProveedor[];
    TestBed.configureTestingModule({providers:[
      provideZonelessChangeDetection(),
      {provide:SuppliersService,useValue:{suppliers:signal([])}},
      {provide:SupplierInvoicesService,useValue:{facturas:signal(invoices),getFacturasByProveedor:() => invoices,getFacturasVencidas:() => []}},
    ]});
    return TestBed.inject(SupplierAnalyticsService);
  }
  it('assigns an early-UTC October receipt to September in the business month', () => {
    const analytics = service();
    expect(analytics.supplierStats().pagadoMes).toBe(30);
    expect(analytics.getSupplierPaymentHistory('supplier').data.at(-1)).toBe(30);
  });
  it('assigns payment trends to the same civil day and rejects malformed periods', () => {
    const analytics = service();
    expect(analytics.getPaymentTrends(1).data).toEqual([30]);
    expect(() => analytics.getPaymentTrends(0)).toThrowError(/1 y 366/);
  });
});
