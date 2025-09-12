import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Distribuidor } from '../models/distributor.models';
import { DistributorsService } from '../services/distributors.service';

@Component({
  selector: 'app-distributor-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './distributor-form.component.html',
  styleUrls: ['./distributor-form.component.scss'],
})
export class DistributorFormComponent {
  @Output() distributorAdded = new EventEmitter<Distribuidor>();
  @Output() closeModal = new EventEmitter<void>();

  distributorForm: FormGroup;
  isSubmitting = false;
  rolesInternos = ['seller1', 'seller2', 'seller3', 'seller4'];

  constructor(private fb: FormBuilder, private distributorsService: DistributorsService) {
    this.distributorForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(2)]],
      tipo: ['interno', Validators.required],
      role: ['seller1', Validators.required],
      estado: ['activo', Validators.required],
      email: ['', [Validators.email]],
      telefono: [''],
      direccion: [''],
      notas: [''],
    });

    // Cambiar role cuando cambia el tipo
    this.distributorForm.get('tipo')?.valueChanges.subscribe((tipo) => {
      if (tipo === 'interno') {
        this.distributorForm.patchValue({ role: 'seller1' });
      } else {
        // Para externos, generamos un role automáticamente
        this.generateExternalRole();
      }
    });
  }

  async onSubmit() {
    if (this.distributorForm.valid) {
      this.isSubmitting = true;

      try {
        const formValue = this.distributorForm.value;

        // Crear el objeto distribuidor sin campos undefined
        const nuevoDistribuidor: any = {
          nombre: formValue.nombre,
          tipo: formValue.tipo,
          role: formValue.role,
          estado: formValue.estado,
        };

        // Solo agregar campos opcionales si tienen valor
        if (formValue.email && formValue.email.trim()) {
          nuevoDistribuidor.email = formValue.email.trim();
        }
        if (formValue.telefono && formValue.telefono.trim()) {
          nuevoDistribuidor.telefono = formValue.telefono.trim();
        }
        if (formValue.direccion && formValue.direccion.trim()) {
          nuevoDistribuidor.direccion = formValue.direccion.trim();
        }
        if (formValue.notas && formValue.notas.trim()) {
          nuevoDistribuidor.notas = formValue.notas.trim();
        }

        // Guardar en Firebase
        await this.distributorsService.addDistribuidor(nuevoDistribuidor);

        // Emitir evento para actualizar la lista en el componente padre
        this.distributorAdded.emit({
          ...nuevoDistribuidor,
          id: '',
          fechaRegistro: new Date().toISOString().split('T')[0],
        });
        this.closeModal.emit();
        this.resetForm();
      } catch (error) {
        console.error('❌ Error al guardar distribuidor:', error);
      } finally {
        this.isSubmitting = false;
      }
    } else {
      this.markFormGroupTouched();
    }
  }

  private async generateExternalRole() {
    try {
      const nuevoRole = await this.distributorsService.generarRoleExterno();
      this.distributorForm.patchValue({ role: nuevoRole });
    } catch (error) {
      console.error('Error generando role externo:', error);
    }
  }

  private markFormGroupTouched() {
    Object.keys(this.distributorForm.controls).forEach((key) => {
      const control = this.distributorForm.get(key);
      control?.markAsTouched();
    });
  }

  private resetForm() {
    this.distributorForm.reset({
      nombre: '',
      tipo: 'interno',
      role: 'seller1',
      estado: 'activo',
      email: '',
      telefono: '',
      direccion: '',
      notas: '',
    });
  }

  onCancel() {
    this.closeModal.emit();
  }

  // Getters para validación en template
  get nombre() {
    return this.distributorForm.get('nombre');
  }
  get email() {
    return this.distributorForm.get('email');
  }
}
