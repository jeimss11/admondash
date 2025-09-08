import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Cliente } from '../../../shared/models/cliente.model';
import { ClientsService } from './clients.service';

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule],
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

  constructor(private clientsService: ClientsService, private fb: FormBuilder) {
    this.form = this.fb.group({
      nombre: ['', Validators.required],
      direccion: ['', Validators.required],
      telefono: ['', Validators.required],
      local: [''],
    });
  }

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

  startNew() {
    this.editing = null;
    this.form.reset();
  }

  startEdit(cliente: Cliente) {
    this.editing = cliente;
    this.form.patchValue({
      nombre: cliente.nombre,
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
      eliminado: false,
      ultima_modificacion: new Date(),
    };
    try {
      if (this.editing && this.editing.id) {
        await this.clientsService.updateCliente({ ...this.editing, ...data });
      } else {
        await this.clientsService.addCliente(data);
      }
      this.startNew();
      await this.fetchClientes();
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
      await this.fetchClientes();
    } catch (e: any) {
      this.error = e.message || 'Error al eliminar cliente';
    } finally {
      this.saving = false;
    }
  }
}
