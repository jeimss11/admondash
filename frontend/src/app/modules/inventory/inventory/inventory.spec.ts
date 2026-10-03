import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { InventoryConfigurationService } from '../services/inventory-configuration.service';
import { DEFAULT_INVENTORY_CONFIGURATION } from '../services/inventory-configuration.policy';

import { InventoryComponent } from './inventory.component';
import { InventoryService } from '../services/inventory.service';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

describe('InventoryComponent', () => {
  let component: InventoryComponent;
  let fixture: ComponentFixture<InventoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InventoryComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([]),
        { provide: BusinessContextService, useValue: { context$: of({ status: 'signed-out' }) } },
        { provide: InventoryConfigurationService, useValue: { watch: () => of(DEFAULT_INVENTORY_CONFIGURATION) } },
        { provide: InventoryService, useValue: { getProductos: () => of([]), sharedProductWritesEnabled: false } }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InventoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  it('preserves fractional quantity in the form', () => {
    component.form.patchValue({ codigo: 'P1', nombre: 'Producto', cantidad: '1.25', valor: '1200' });
    expect(component.form.valid).toBeTrue();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
