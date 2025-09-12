import { Component, EventEmitter, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Distribuidor } from '../models/distributor.models';
import { DistributorsService } from '../services/distributors.service';

@Component({
  selector: 'app-distributor-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './distributor-form.component.html',
  styleUrls: ['./distributor-form.component.scss']
})
export class DistributorFormComponent {
  @Output() distributorAdded = new EventEmitter<Distribuidor>();
  @Output() closeModal = new EventEmitter<void>();

  distributorForm: FormGroup;
  isSubmitting = false;
  rolesInternos = ['seller1', 'seller2', 'seller3', 'seller4'];

  constructor(
    private fb: FormBuilder,
    private distributorsService: DistributorsService
  ) {
    this.distributorForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(2)]],
      tipo: ['interno', Validators.required],
      rol: ['seller1', Validators.required],
      estado: ['activo', Validators.required],
      email: ['', [Validators.email]],
      telefono: [''],
      direccion: [''],
      notas: ['']
    });

    // Cambiar rol cuando cambia el tipo
    this.distributorForm.get('tipo')?.valueChanges.subscribe(tipo => {
      if (tipo === 'interno') {
        this.distributorForm.patchValue({ rol: 'seller1' });
      } else {
        // Para externos, generamos un rol automáticamente
        this.generateExternalRole();
      }
    });
  }

  async onSubmit() {
    if (this.distributorForm.valid) {
      this.isSubmitting = true;

      try {
        const formValue = this.distributorForm.value;
        const nuevoDistribuidor: Distribuidor = {
          nombre: formValue.nombre,
          tipo: formValue.tipo,
          rol: formValue.rol,
          estado: formValue.estado,
          email: formValue.email || undefined,
          telefono: formValue.telefono || undefined,
          direccion: formValue.direccion || undefined,
          fechaRegistro: new Date().toISOString().split('T')[0],
          notas: formValue.notas || undefined
        };

        // Aquí iría la lógica para guardar en la base de datos
        // Por ahora solo emitimos el evento
        this.distributorAdded.emit(nuevoDistribuidor);
        this.closeModal.emit();
        this.resetForm();

      } catch (error) {
        console.error('Error al guardar distribuidor:', error);
      } finally {
        this.isSubmitting = false;
      }
    } else {
      this.markFormGroupTouched();
    }
  }

  private async generateExternalRole() {
    try {
      const nuevoRol = await this.distributorsService.generarRoleExterno();
      this.distributorForm.patchValue({ rol: nuevoRol });
    } catch (error) {
      console.error('Error generando rol externo:', error);
    }
  }

  private markFormGroupTouched() {
    Object.keys(this.distributorForm.controls).forEach(key => {
      const control = this.distributorForm.get(key);
      control?.markAsTouched();
    });
  }

  private resetForm() {
    this.distributorForm.reset({
      nombre: '',
      tipo: 'interno',
      rol: 'seller1',
      estado: 'activo',
      email: '',
      telefono: '',
      direccion: '',
      notas: ''
    });
  }

  onCancel() {
    this.closeModal.emit();
  }

  // Getters para validación en template
  get nombre() { return this.distributorForm.get('nombre'); }
  get email() { return this.distributorForm.get('email'); }
}