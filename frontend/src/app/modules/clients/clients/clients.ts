import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { Cliente } from '../../../shared/models/cliente.model';
import { ClientsService } from './clients.service';

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, CommonModule],
  templateUrl: './clients.html',
  styleUrl: './clients.scss',
})
export class Clients implements OnInit {
  clientes: Cliente[] = [];
  loading = false;
  error: string | null = null;
  form: FormGroup;
  editing: Cliente | null = null;
  saving = false;
  searchTerm = '';
  filteredClientes: Cliente[] = [];

  constructor(
    private clientsService: ClientsService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private authService: AuthService,
    private router: Router
  ) {
    this.form = this.fb.group({
      nombre: ['', Validators.required],
      direccion: ['', Validators.required],
      telefono: ['', Validators.required],
      local: ['', Validators.required],
    });
  }

  ngOnInit() {
    this.loading = true;
    this.clientsService.getClientes().subscribe(
      (clientes) => {
        this.clientes = clientes;
        this.filterClientes();
        this.loading = false;
        this.cdr.detectChanges(); // Asegura que Angular detecte los cambios
      },
      (error) => {
        this.error = error.message || 'Error al cargar clientes';
        this.loading = false;
      }
    );
  }

  filterClientes() {
    const term = this.searchTerm.trim().toLowerCase();
    this.filteredClientes = this.clientes.filter((cliente) =>
      [cliente.cliente, cliente.local, cliente.telefono, cliente.direccion].some((value) =>
        (value ?? '').toLowerCase().includes(term)
      )
    );
  }

  startNew() {
    this.editing = null;
    this.form.reset();
  }

  startEdit(cliente: Cliente) {
    this.editing = cliente;
    this.form.patchValue({
      nombre: cliente.cliente,
      direccion: cliente.direccion,
      telefono: cliente.telefono,
      local: cliente.local,
    });
  }

  async save() {
    if (this.form.invalid) return;
    this.saving = true;
    const data = {
      ...this.form.value,
      cliente: this.form.value.nombre, // Mapea el campo nombre al campo cliente
      eliminado: false,
    };
    delete data.nombre; // Elimina el campo nombre ya que no es parte del modelo Cliente
    try {
      if (this.editing && this.editing.local) {
        // `local` is the document ID used by impresora. Renaming it would create
        // an inconsistent client identity for the mobile incremental sync.
        await this.clientsService.updateCliente({ ...this.editing, ...data, local: this.editing.local });
      } else {
        await this.clientsService.addCliente(data);
      }
      this.startNew();
    } catch (e: any) {
      this.error = e.message || 'Error al guardar cliente';
    } finally {
      this.saving = false;
    }
  }

  async deleteCliente(id?: string) {
    if (!id) return;
    if (!confirm('¿Seguro que deseas eliminar este cliente?')) return;
    this.saving = true;
    try {
      await this.clientsService.deleteCliente(id);
    } catch (e: any) {
      this.error = e.message || 'Error al eliminar cliente';
    } finally {
      this.saving = false;
    }
  }

  viewDashboard(cliente: Cliente) {
    this.router.navigate(['/clients/dashboard', cliente.local]);
  }
}
