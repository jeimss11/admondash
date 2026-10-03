import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Clients } from './clients';
import { ClientsService } from './clients.service';
import { AuthService } from '../../../core/services/auth.service';

describe('Clients', () => {
  const service = { getClientes:() => of([]), addCliente:jasmine.createSpy('addCliente').and.resolveTo(), updateCliente:jasmine.createSpy('updateCliente').and.resolveTo() };
  beforeEach(async () => {
    service.addCliente.calls.reset(); service.updateCliente.calls.reset();
    await TestBed.configureTestingModule({ imports:[Clients], providers:[provideZonelessChangeDetection(), provideRouter([]),
      { provide:ClientsService,useValue:service }, { provide:AuthService,useValue:{} },
    ] }).compileComponents();
  });
  it('loads empty clients without Firebase', () => {
    const fixture = TestBed.createComponent(Clients); fixture.detectChanges();
    expect(fixture.componentInstance.loading).toBeFalse();
    expect(fixture.componentInstance.error).toBeNull();
  });
  it('preserves the existing document identity during editing', async () => {
    const fixture = TestBed.createComponent(Clients); fixture.detectChanges();
    const component = fixture.componentInstance;
    component.startEdit({ local:'Original',cliente:'Ana',direccion:'D',telefono:'1',eliminado:false,ultima_modificacion:'' });
    component.form.patchValue({ local:'Renombrado' });
    await component.save();
    expect(service.updateCliente.calls.mostRecent().args[0].local).toBe('Original');
    expect(service.addCliente).not.toHaveBeenCalled();
  });
  it('propagates a failed read', () => {
    spyOn(service,'getClientes').and.returnValue(throwError(() => new Error('Sin acceso')));
    const fixture = TestBed.createComponent(Clients); fixture.detectChanges();
    expect(fixture.componentInstance.error).toBe('Sin acceso');
  });
});
