import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ActivatedRoute, provideRouter, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { ClientsService } from '../clients/clients.service';
import { ClientDashboardComponent } from './client-dashboard';

describe('ClientDashboardComponent', () => {
  let component: ClientDashboardComponent;
  let fixture: ComponentFixture<ClientDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClientDashboardComponent],
      providers:[provideZonelessChangeDetection(), provideRouter([]),
        { provide:ActivatedRoute,useValue:{ snapshot:{ paramMap:convertToParamMap({ local:'Missing' }) } } },
        { provide:ClientsService,useValue:{ getClientes:() => of([]) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ClientDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it('reports a missing client without fabricating its data', () => {
    expect(component.client).toBeNull();
    expect(component.error).toBe('El cliente ya no está disponible.');
  });
});
