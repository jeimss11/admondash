import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Cliente } from '../../../shared/models/cliente.model';
import { ClientsService } from '../clients/clients.service';

@Component({
  selector: 'app-client-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './client-dashboard.html',
  styleUrl: './client-dashboard.scss',
})
export class ClientDashboardComponent implements OnInit {
  client: Cliente | null = null;
  loading = true;
  error: string | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly clientsService: ClientsService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const local = this.route.snapshot.paramMap.get('local');
    if (!local) {
      this.error = 'No se encontró el cliente solicitado.';
      this.loading = false;
      return;
    }

    this.clientsService.getClientes().subscribe({
      next: (clients) => {
        this.client = clients.find((client) => client.local === local || client.id === local) ?? null;
        this.error = this.client ? null : 'El cliente ya no está disponible.';
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'No fue posible cargar la ficha del cliente.';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/clients']);
  }
}
