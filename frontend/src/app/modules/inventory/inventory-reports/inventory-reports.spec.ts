import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es-CO';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { SalesService } from '../../sales/services/sales.service';
import { InventoryConfigurationService } from '../services/inventory-configuration.service';
import { DEFAULT_INVENTORY_CONFIGURATION } from '../services/inventory-configuration.policy';
import { InventoryLedgerService } from '../services/inventory-ledger.service';
import { InventoryService } from '../services/inventory.service';
import { InventoryReportsComponent } from './inventory-reports.component';

describe('InventoryReportsComponent integrity', () => {
  const owner = { status: 'ready', ownerUid: 'owner-test', actorUid: 'owner-test' };
  let business: BehaviorSubject<any>;
  let products: Subject<any[]>;
  let configuration: BehaviorSubject<any>;
  let ledger: BehaviorSubject<any[]>;
  beforeEach(async () => {
    registerLocaleData(localeEs);
    business = new BehaviorSubject(owner);
    products = new Subject();
    configuration = new BehaviorSubject({ ...DEFAULT_INVENTORY_CONFIGURATION, lowStockThreshold: 8 });
    ledger = new BehaviorSubject<any[]>([]);
    await TestBed.configureTestingModule({ imports: [InventoryReportsComponent], providers: [
      provideZonelessChangeDetection(), provideRouter([]),
      { provide: BusinessContextService, useValue: { context$: business, context: signal(owner) } },
      { provide: InventoryService, useValue: { getProductos: () => products } },
      { provide: InventoryConfigurationService, useValue: { watch: () => configuration } },
      { provide: InventoryLedgerService, useValue: { watch: () => ledger, enabled: false } },
      { provide: SalesService, useValue: { getVentas: () => of([]) } },
    ] }).compileComponents();
  });
  it('updates the configured alert threshold without counting unknown stock as zero', async () => {
    const fixture = TestBed.createComponent(InventoryReportsComponent);
    fixture.detectChanges();
    products.next([{ codigo: 'P1', nombre: 'Known', cantidad: '7.5', valor: '10' }, { codigo: 'P2', nombre: 'Unknown', valor: '10' }]);
    await fixture.whenStable();
    expect(fixture.componentInstance.lowStockProducts.length).toBe(1);
    expect(fixture.componentInstance.outOfStockProducts.length).toBe(0);
    configuration.next({ ...DEFAULT_INVENTORY_CONFIGURATION, lowStockThreshold: 5 });
    await fixture.whenStable();
    expect(fixture.componentInstance.lowStockProducts.length).toBe(0);
    fixture.destroy();
  });
  it('does not expose partial balances from malformed movements', async () => {
    const fixture = TestBed.createComponent(InventoryReportsComponent);
    fixture.detectChanges();
    ledger.next([{ id: 'bad', kind: 'load', quantity: 'broken' }]);
    await fixture.whenStable();
    expect(fixture.componentInstance.locationBalances).toEqual([]);
    expect(fixture.componentInstance.error).toContain('incompatibles');
    business.next({ status: 'signed-out' });
    await fixture.whenStable();
    expect(fixture.componentInstance.ledgerMovements).toEqual([]);
    fixture.destroy();
  });
});
