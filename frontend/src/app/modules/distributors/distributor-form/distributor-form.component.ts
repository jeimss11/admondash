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
  errorMessage = '';
  hasAvailableRoles = true;

  constructor(private fb: FormBuilder, private distributorsService: DistributorsService) {
    this.distributorForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(2)]],
      tipo: ['interno', Validators.required],
      role: [{ value: '', disabled: false }, Validators.required], // Se asignará automáticamente
      estado: ['activo', Validators.required],
      email: ['', [Validators.email]],
      telefono: [''],
      direccion: [''],
      notas: [''],
    });

    // Asignar rol automáticamente al inicializar
    this.assignRoleAutomatically();

    // Cambiar role cuando cambia el tipo
    this.distributorForm.get('tipo')?.valueChanges.subscribe((tipo) => {
      this.assignRoleAutomatically();
    });
  }

  async onSubmit() {
    if (this.distributorForm.valid && this.hasAvailableRoles) {
      this.isSubmitting = true;
      this.errorMessage = '';

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
      } catch (error: any) {
        console.error('❌ Error al guardar distribuidor:', error);
        this.errorMessage = error.message || 'Error al guardar el distribuidor';
      } finally {
        this.isSubmitting = false;
      }
    } else {
      this.markFormGroupTouched();
    }
  }

  private async assignRoleAutomatically() {
    const tipo = this.distributorForm.get('tipo')?.value;

    try {
      if (tipo === 'interno') {
        // Para internos, intentar asignar roles en orden: seller1, seller2, seller3, seller4
        const allRoles = ['seller1', 'seller2', 'seller3', 'seller4'];
        let roleToAssign = '';

        for (const role of allRoles) {
          const exists = await this.distributorsService.checkRoleExists(role);
          if (!exists) {
            roleToAssign = role;
            break;
          }
        }

        if (roleToAssign) {
          this.distributorForm.patchValue({ role: roleToAssign });
          this.hasAvailableRoles = true;
          this.errorMessage = ''; // Limpiar mensaje de error si había
        } else {
          // No hay roles disponibles
          this.distributorForm.patchValue({ role: 'No disponible' });
          this.hasAvailableRoles = false;
          this.errorMessage =
            'Se ha alcanzado el límite máximo de 4 distribuidores internos. No se pueden crear más distribuidores de este tipo.';
        }
      } else if (tipo === 'externo') {
        // Para externos, generar un nuevo rol automáticamente
        const nuevoRole = await this.distributorsService.generarRoleExterno();
        this.distributorForm.patchValue({ role: nuevoRole });
        this.hasAvailableRoles = true;
        this.errorMessage = ''; // Limpiar mensaje de error
      }
    } catch (error) {
      console.error('Error asignando rol automáticamente:', error);
      // Fallback: asignar valores por defecto
      const fallbackRole = tipo === 'interno' ? 'seller1' : 'clientSeller1';
      this.distributorForm.patchValue({ role: fallbackRole });
      this.hasAvailableRoles = true;
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
      role: '',
      estado: 'activo',
      email: '',
      telefono: '',
      direccion: '',
      notas: '',
    });
    this.errorMessage = '';
    // Reasignar rol automáticamente después del reset
    this.assignRoleAutomatically();
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
