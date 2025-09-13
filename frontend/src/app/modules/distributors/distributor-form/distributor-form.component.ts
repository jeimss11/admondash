import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
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
export class DistributorFormComponent implements OnInit {
  @Input() isEditing = false;
  @Input() distributorToEdit: Distribuidor | null = null;
  @Output() distributorAdded = new EventEmitter<Distribuidor>();
  @Output() distributorUpdated = new EventEmitter<Distribuidor>();
  @Output() closeModal = new EventEmitter<void>();

  distributorForm: FormGroup;
  isSubmitting = false;
  errorMessage = '';
  hasAvailableRoles = true;
  isAssigningRole = false;

  constructor(private fb: FormBuilder, private distributorsService: DistributorsService) {
    this.distributorForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(2)]],
      tipo: ['interno', Validators.required],
      role: [{ value: '', disabled: false }], // Validación condicional: requerido solo para internos
      estado: ['activo', Validators.required],
      email: ['', [Validators.email]],
      telefono: [''],
      direccion: [''],
      notas: [''],
    });
  }

  ngOnInit(): void {
    if (this.isEditing && this.distributorToEdit) {
      this.initializeEditForm();
    } else {
      // Modo creación
      this.initializeCreateForm();
    }
  }

  private initializeCreateForm(): void {
    // Asignar rol automáticamente al inicializar (solo para internos)
    this.assignRoleAutomatically();

    // Cambiar role cuando cambia el tipo
    this.distributorForm.get('tipo')?.valueChanges.subscribe((tipo) => {
      this.assignRoleAutomatically();
      this.updateRoleValidation(tipo);
    });

    // Validación inicial
    this.updateRoleValidation('interno');
  }

  private initializeEditForm(): void {
    if (!this.distributorToEdit) return;

    // Llenar el formulario con los datos del distribuidor
    this.distributorForm.patchValue({
      nombre: this.distributorToEdit.nombre,
      tipo: this.distributorToEdit.tipo,
      role: this.distributorToEdit.role,
      estado: this.distributorToEdit.estado,
      email: this.distributorToEdit.email || '',
      telefono: this.distributorToEdit.telefono || '',
      direccion: this.distributorToEdit.direccion || '',
      notas: this.distributorToEdit.notas || '',
    });

    // Configurar campos editables según el tipo
    this.configureEditableFields();
  }

  private configureEditableFields(): void {
    const tipo = this.distributorForm.get('tipo')?.value;

    if (tipo === 'interno') {
      // Para internos: habilitar nombre, estado, email, telefono, direccion, notas
      // Bloquear: tipo, role
      this.distributorForm.get('tipo')?.enable();
      this.distributorForm.get('role')?.disable();
      this.distributorForm.get('nombre')?.enable();
      this.distributorForm.get('estado')?.enable();
      this.distributorForm.get('email')?.enable();
      this.distributorForm.get('telefono')?.enable();
      this.distributorForm.get('direccion')?.enable();
      this.distributorForm.get('notas')?.enable();
    } else if (tipo === 'externo') {
      // Para externos: habilitar estado, email, telefono, direccion, notas
      // Bloquear: tipo, role, nombre (ya que nombre es el rol)
      this.distributorForm.get('tipo')?.disable();
      this.distributorForm.get('role')?.disable();
      this.distributorForm.get('nombre')?.disable(); // Nombre no editable para externos
      this.distributorForm.get('estado')?.enable();
      this.distributorForm.get('email')?.enable();
      this.distributorForm.get('telefono')?.enable();
      this.distributorForm.get('direccion')?.enable();
      this.distributorForm.get('notas')?.enable();
    }
  }

  async onSubmit() {
    if (this.distributorForm.valid) {
      this.isSubmitting = true;
      this.errorMessage = '';

      try {
        const formValue = this.distributorForm.value;

        if (this.isEditing && this.distributorToEdit) {
          // Modo edición
          await this.updateDistributor(formValue);
        } else {
          // Modo creación
          await this.createDistributor(formValue);
        }
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

  private async createDistributor(formValue: any): Promise<void> {
    // Para externos, usar el nombre como rol
    const roleToUse = formValue.tipo === 'externo' ? formValue.nombre : formValue.role;

    // Crear el objeto distribuidor sin campos undefined
    const nuevoDistribuidor: any = {
      nombre: formValue.nombre,
      tipo: formValue.tipo,
      role: roleToUse,
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
  }

  private async updateDistributor(formValue: any): Promise<void> {
    if (!this.distributorToEdit) return;

    // IMPORTANTE: Mantener el role original, no cambiarlo
    // Para externos, el role es el nombre original y no debe cambiar
    const roleToUse = this.distributorToEdit.role; // Mantener el role original

    // Para externos, el nombre no debe cambiar (es el role)
    // Para internos, sí puede cambiar
    const nombreToUse =
      this.distributorToEdit.tipo === 'externo'
        ? this.distributorToEdit.nombre // Mantener nombre original para externos
        : formValue.nombre; // Usar el del formulario para internos

    // El tipo nunca debe cambiar durante la edición, mantener el original
    const tipoToUse = this.distributorToEdit.tipo;

    // Crear el objeto distribuidor actualizado manteniendo el role original
    const distribuidorActualizado: any = {
      ...this.distributorToEdit,
      nombre: nombreToUse,
      tipo: tipoToUse, // Mantener el tipo original
      role: roleToUse, // Mantener el role original
      estado: formValue.estado,
    };

    // Actualizar campos opcionales
    distribuidorActualizado.email =
      formValue.email && formValue.email.trim() ? formValue.email.trim() : null;
    distribuidorActualizado.telefono =
      formValue.telefono && formValue.telefono.trim() ? formValue.telefono.trim() : null;
    distribuidorActualizado.direccion =
      formValue.direccion && formValue.direccion.trim() ? formValue.direccion.trim() : null;
    distribuidorActualizado.notas =
      formValue.notas && formValue.notas.trim() ? formValue.notas.trim() : null;

    // Actualizar en Firebase
    await this.distributorsService.updateDistribuidor(distribuidorActualizado);

    // Emitir evento para actualizar la lista en el componente padre
    this.distributorUpdated.emit(distribuidorActualizado);
    this.closeModal.emit();
  }

  private async assignRoleAutomatically() {
    const tipo = this.distributorForm.get('tipo')?.value;
    this.isAssigningRole = true;

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
        // Para externos, no asignar rol automáticamente - se usará el nombre
        this.distributorForm.patchValue({ role: '' });
        this.hasAvailableRoles = true;
        this.errorMessage = ''; // Limpiar mensaje de error
      }
    } catch (error) {
      console.error('Error asignando rol automáticamente:', error);
      // Fallback: asignar valores por defecto
      const fallbackRole = tipo === 'interno' ? 'seller1' : '';
      this.distributorForm.patchValue({ role: fallbackRole });
      this.hasAvailableRoles = true;
    } finally {
      this.isAssigningRole = false;
    }
  }

  private updateRoleValidation(tipo: string) {
    const roleControl = this.distributorForm.get('role');
    if (tipo === 'interno') {
      roleControl?.setValidators([Validators.required]);
    } else {
      roleControl?.clearValidators();
    }
    roleControl?.updateValueAndValidity();
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
    // Reasignar rol automáticamente después del reset (solo para internos)
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
