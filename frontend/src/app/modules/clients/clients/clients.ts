import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Cliente } from '../../../shared/models/cliente.model';
import { ClientsService } from './clients.service';

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './clients.html',
  styleUrl: './clients.scss',
})
export class Clients implements OnInit {
  clientes: Cliente[] = [];
  loading = false;
  error: string | null = null;

  constructor(private clientsService: ClientsService) {}

  ngOnInit() {
    this.fetchClientes();
  }

  async fetchClientes() {
    this.loading = true;
    this.error = null;
    try {
      this.clientes = await this.clientsService.getClientes();
    } catch (e: any) {
      this.error = e.message || 'Error al cargar clientes';
    } finally {
      this.loading = false;
    }
  }
}
