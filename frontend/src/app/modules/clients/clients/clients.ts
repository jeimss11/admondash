import { DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { Cliente } from '../../../shared/models/cliente.model';
import { ClientsService } from './clients.service';

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [ReactiveFormsModule],
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

  constructor(
    private clientsService: ClientsService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private authService: AuthService // Agrega el servicio de autenticación
  ) {
    this.form = this.fb.group({
      nombre: ['', Validators.required],
      direccion: ['', Validators.required],
      telefono: ['', Validators.required],
      local: [''],
    });
  }

  ngOnInit() {
    this.clientsService.getClientes().subscribe(
      (clientes) => {
        this.clientes = clientes;
        this.cdr.detectChanges(); // Asegura que Angular detecte los cambios
      },
      (error) => {
        this.error = error.message || 'Error al cargar clientes';
      }
    );
  }

  startNew() {
    this.editing = null;
    this.form.reset();
  }

  startEdit(cliente: Cliente) {
    this.editing = cliente;
    this.form.patchValue({
      nombre: cliente.local,
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
      ultima_modificacion: new Date(),
    };
    delete data.nombre; // Elimina el campo nombre ya que no es parte del modelo Cliente
    try {
      if (this.editing && this.editing.local) {
        await this.clientsService.updateCliente({ ...this.editing, ...data });
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
}
