import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SaleModalComponent } from './sale-modal.component';
import { SalesService } from '../services/sales.service';
import { InventoryService, Producto } from '../../inventory/services/inventory.service';

describe('SaleModal inventory deduction', () => {
  const sales = {
    generarNumeroFactura: () => Promise.resolve('1000-web'),
    addVenta: (_input: unknown) => Promise.resolve('created'),
  };
  const product = (cantidad: unknown) => ({ codigo: 'P1', nombre: 'Producto', valor: '100', cantidad,
    eliminado: false, ultima_modificacion: '' } as Producto);

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SaleModalComponent], providers: [
      provideZonelessChangeDetection(), provideRouter([]),
      { provide: SalesService, useValue: sales },
      { provide: InventoryService, useValue: { getProductos: () => of([]) } },
    ] }).compileComponents();
  });

  it('does not treat absent or empty quantity as stock available for sale', () => {
    const component = TestBed.createComponent(SaleModalComponent).componentInstance;
    for (const quantity of [undefined, null, '', ' ', 'NaN', '-1']) {
      component.seleccionarProducto(product(quantity));
      expect(component.hasKnownStock(component.productoSeleccionado!)).toBeFalse();
      expect(component.puedeAgregarAlCarrito()).toBeFalse();
    }
  });

  it('counts existing cart quantities against fractional stock', () => {
    const component = TestBed.createComponent(SaleModalComponent).componentInstance;
    component.seleccionarProducto(product('2.5'));
    component.cantidadSeleccionada = 1.5;
    component.agregarAlCarrito();
    component.seleccionarProducto(product('2.5'));
    component.cantidadSeleccionada = 1.1;
    expect(component.puedeAgregarAlCarrito()).toBeFalse();
    component.cantidadSeleccionada = 1;
    expect(component.puedeAgregarAlCarrito()).toBeTrue();
  });

  it('keeps the invoice and cart after the transaction rejects insufficient stock', async () => {
    const fixture = TestBed.createComponent(SaleModalComponent);
    const component = fixture.componentInstance;
    component.open = true;
    fixture.detectChanges();
    component.ventaForm.patchValue({ factura: '1000-web', cliente: 'Prueba' });
    component.seleccionarProducto(product('2'));
    component.agregarAlCarrito();
    spyOn(sales, 'addVenta').and.rejectWith(new Error('Stock insuficiente'));
    const emitted = spyOn(component.ventaGuardada, 'emit');
    await component.guardarVenta();
    expect(component.formError).toContain('Stock insuficiente');
    expect(component.ventaForm.value.factura).toBe('1000-web');
    expect(component.carrito.length).toBe(1);
    expect(component.saving).toBeFalse();
    expect(emitted).not.toHaveBeenCalled();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Stock insuficiente');
  });

  it('adds 0.1 and 0.2 without exceeding an exact stock of 0.3', () => {
    const component = TestBed.createComponent(SaleModalComponent).componentInstance;
    component.seleccionarProducto(product('0.3'));
    component.cantidadSeleccionada = 0.1;
    component.agregarAlCarrito();
    component.seleccionarProducto(product('0.3'));
    component.cantidadSeleccionada = 0.2;
    expect(component.puedeAgregarAlCarrito()).toBeTrue();
    component.agregarAlCarrito();
    expect(component.carrito[0].cantidad).toBe('0.3');
  });
});
