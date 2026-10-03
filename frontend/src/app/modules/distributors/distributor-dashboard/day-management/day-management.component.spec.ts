import { DayManagementComponent } from './day-management.component';

describe('DayManagementComponent write integrity', () => {
  let component: DayManagementComponent;
  let service: jasmine.SpyObj<any>;

  beforeEach(() => {
    service = jasmine.createSpyObj('DistributorsService', ['agregarProductoCargado', 'registrarCobroFactura']);
    component = new DayManagementComponent(service, {} as any, { enabled: false } as any,
      {} as any, {} as any, { context: () => ({ status: 'owner', actorUid: 'owner', ownerUid: 'owner' }) } as any,
      { isAdministrator: () => true } as any, { detectChanges: () => {} } as any);
    component.operacionId = 'operation';
    component.productosDisponibles = [{ codigo: 'code', nombre: 'Product' } as any];
    component.productoCargadoForm = { productoId: 'code', nombre: 'Product', cantidad: 1.25, precioUnitario: 10, total: 12.5 };
    spyOn(window, 'alert');
    spyOn(window, 'confirm').and.returnValue(true);
  });

  it('blocks a second movement submission while the first is unresolved', async () => {
    let complete!: (id: string) => void;
    service.agregarProductoCargado.and.returnValue(new Promise<string>((resolve) => complete = resolve));
    const first = component.agregarProductoCargado();
    await component.agregarProductoCargado();
    expect(service.agregarProductoCargado).toHaveBeenCalledTimes(1);
    expect(service.agregarProductoCargado.calls.mostRecent().args[1].cantidad).toBe(1.25);
    complete('source');
    await first;
    expect(component.isLoading).toBeFalse();
  });

  it('reuses the movement reference when retrying an unacknowledged submission', async () => {
    service.agregarProductoCargado.and.rejectWith(new Error('synthetic timeout'));
    await component.agregarProductoCargado();
    const firstId = service.agregarProductoCargado.calls.mostRecent().args[2];
    service.agregarProductoCargado.and.resolveTo('source');
    await component.agregarProductoCargado();
    expect(service.agregarProductoCargado.calls.mostRecent().args[2]).toBe(firstId);
  });

  it('a stale paid row keeps its receipt reference until the observed balance changes', async () => {
    service.registrarCobroFactura.and.resolveTo();
    spyOn<any>(component, 'cargarFacturasDesdeFirestore').and.resolveTo();
    const invoice = { id: 'factura_1', numeroFactura: '1', monto: 100, montoPagado: 0 } as any;
    await component.confirmarAbono({ factura: invoice, montoAbono: 20 } as any);
    const firstId = service.registrarCobroFactura.calls.mostRecent().args[3];
    await component.confirmarAbono({ factura: invoice, montoAbono: 20 } as any);
    expect(service.registrarCobroFactura.calls.mostRecent().args[3]).toBe(firstId);
    await component.confirmarAbono({ factura: { ...invoice, montoPagado: 20 }, montoAbono: 20 } as any);
    expect(service.registrarCobroFactura.calls.mostRecent().args[3]).not.toBe(firstId);
  });

  it('reports partial persistence and keeps the same source request when the inventory reflection fails', async () => {
    service.agregarProductoCargado.and.resolveTo('saved-source');
    const ledger = jasmine.createSpyObj('InventoryLedger', ['record']);
    ledger.enabled = true;
    ledger.record.and.rejectWith(new Error('synthetic ledger failure'));
    (component as any).inventoryLedger = ledger;
    await component.agregarProductoCargado();
    const firstRequest = service.agregarProductoCargado.calls.mostRecent().args[2];
    expect(window.alert).toHaveBeenCalledWith(jasmine.stringMatching('ya está guardado.*saved-source'));
    expect(component.productoCargadoForm.productoId).toBe('code');
    expect(component.productoCargadoForm.cantidad).toBe(1.25);
    expect(component.isLoading).toBeFalse();
    ledger.record.and.resolveTo();
    await component.agregarProductoCargado();
    expect(service.agregarProductoCargado.calls.mostRecent().args[2]).toBe(firstRequest);
    expect(ledger.record.calls.mostRecent().args[0].sourceId).toBe('saved-source');
    expect(component.productoCargadoForm.productoId).toBe('');
  });
});
