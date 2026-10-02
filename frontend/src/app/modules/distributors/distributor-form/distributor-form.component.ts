import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { MobileFirestoreRepository } from '../../../core/integration/mobile-firestore.repository';
import { Distribuidor } from '../models/distributor.models';
import { DistributorsService } from '../services/distributors.service';
import { colombiaBusinessDate } from '../../../core/integration/business-date';

@Component({
  selector: 'app-distributor-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './distributor-form.component.html',
  styleUrls: ['./distributor-form.component.scss'],
})
export class DistributorFormComponent implements OnInit, OnDestroy {
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
  existingDistributors: Distribuidor[] = [];
  roleExistsMessage = '';
  mobileRoles: string[] = [];
  mobileRolesLoading = true;
  private mobileRolesSubscription?: Subscription;

  constructor(
    private fb: FormBuilder,
    private distributorsService: DistributorsService,
    private businessContext: BusinessContextService,
    private mobileRepository: MobileFirestoreRepository
  ) {
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
    // Cargar distribuidores existentes para validación
    this.loadExistingDistributors();
    this.loadMobileRoles();

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
      // Limpiar mensaje de role duplicado al cambiar tipo
      this.roleExistsMessage = '';
    });

    // Validación en tiempo real del role (para internos)
    this.distributorForm.get('role')?.valueChanges.subscribe((role) => {
      if (this.distributorForm.get('tipo')?.value === 'interno') {
        this.validateRole(role);
      }
    });

    // Validación inicial
    this.updateRoleValidation('interno');
  }

  private async loadExistingDistributors(): Promise<void> {
    try {
      this.distributorsService.getDistribuidores().subscribe({
        next: (distribuidores) => {
          this.existingDistributors = distribuidores;
          this.assignRoleAutomatically();
        },
        error: (error) => {
          console.error('Error cargando distribuidores existentes:', error);
        },
      });
    } catch (error) {
      console.error('Error cargando distribuidores existentes:', error);
    }
  }

  private validateRole(roleValue: string): void {
    if (!roleValue || roleValue.trim() === '' || roleValue === 'No disponible') {
      this.roleExistsMessage = '';
      return;
    }

    // Verificar si el role ya existe (excluyendo el distribuidor actual en modo edición)
    const roleExists = this.existingDistributors.some((distribuidor) => {
      // En modo edición, permitir el role actual del distribuidor
      if (
        this.isEditing &&
        this.distributorToEdit &&
        distribuidor.role === this.distributorToEdit.role
      ) {
        return false;
      }
      return distribuidor.role === roleValue.trim();
    });

    if (roleExists) {
      this.roleExistsMessage = `El role "${roleValue.trim()}" ya está siendo utilizado por otro distribuidor.`;
      console.log('🚫 Role duplicado detectado:', roleValue.trim());
    } else {
      this.roleExistsMessage = '';
      console.log('✅ Role válido:', roleValue.trim());
    }
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
      this.distributorForm.get('tipo')?.disable();
      this.distributorForm.get('role')?.disable();
      this.distributorForm.get('nombre')?.enable();
      this.distributorForm.get('estado')?.enable();
      this.distributorForm.get('email')?.enable();
      this.distributorForm.get('telefono')?.enable();
      this.distributorForm.get('direccion')?.enable();
      this.distributorForm.get('notas')?.enable();
    } else if (tipo === 'externo') {
      // Para externos: el identificador web no representa una sesión móvil.
      // Se permite corregir su nombre sin cambiar ese identificador estable.
      this.distributorForm.get('tipo')?.disable();
      this.distributorForm.get('role')?.disable();
      this.distributorForm.get('nombre')?.enable();
      this.distributorForm.get('estado')?.enable();
      this.distributorForm.get('email')?.enable();
      this.distributorForm.get('telefono')?.enable();
      this.distributorForm.get('direccion')?.enable();
      this.distributorForm.get('notas')?.enable();
    }
  }

  async onSubmit() {
    // Verificar validación del formulario
    if (!this.distributorForm.valid) {
      this.markFormGroupTouched();
      return;
    }

    // Verificar si hay mensaje de role duplicado
    if (this.roleExistsMessage) {
      console.log('🚫 Intento de crear distribuidor con role duplicado bloqueado');
      return;
    }

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
      // Mostrar el error del servicio como mensaje de error general
      this.errorMessage = error.message || 'Error al guardar el distribuidor';
    } finally {
      this.isSubmitting = false;
    }
  }

  private async createDistributor(formValue: any): Promise<void> {
    const roleToUse =
      formValue.tipo === 'externo' ? this.createExternalWebId() : formValue.role;

    // Verificación adicional de role duplicado antes de enviar al servicio
    const roleExists = this.existingDistributors.some(
      (distribuidor) => distribuidor.role === roleToUse.trim()
    );

    if (roleExists) {
      throw new Error(
        `El role "${roleToUse.trim()}" ya está siendo utilizado por otro distribuidor.`
      );
    }

    // Crear el objeto distribuidor sin campos undefined
    const nuevoDistribuidor: any = {
      nombre: formValue.nombre,
      tipo: formValue.tipo,
      role: roleToUse,
      estado: formValue.estado,
      origen: formValue.tipo === 'interno' ? 'movil' : 'escritorio',
      vendedorMovilRole: formValue.tipo === 'interno' ? roleToUse : null,
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
      fechaRegistro: colombiaBusinessDate(),
    });
    this.closeModal.emit();
    this.resetForm();
  }

  private async updateDistributor(formValue: any): Promise<void> {
    if (!this.distributorToEdit) return;

    // IMPORTANTE: Mantener el role original, no cambiarlo
    // Para externos, el identificador web es estable y no debe cambiar.
    const roleToUse = this.distributorToEdit.role; // Mantener el role original

    const nombreToUse = formValue.nombre;

    // El tipo nunca debe cambiar durante la edición, mantener el original
    const tipoToUse = this.distributorToEdit.tipo;

    // Crear el objeto distribuidor actualizado manteniendo el role original
    const distribuidorActualizado: any = {
      ...this.distributorToEdit,
      nombre: nombreToUse,
      tipo: tipoToUse, // Mantener el tipo original
      role: roleToUse, // Mantener el role original
      estado: formValue.estado,
      origen:
        (this.distributorToEdit as any).origen ||
        (tipoToUse === 'interno' ? 'movil' : 'escritorio'),
      vendedorMovilRole:
        tipoToUse === 'interno'
          ? (this.distributorToEdit as any).vendedorMovilRole || roleToUse
          : null,
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

  private createExternalWebId(): string {
    const suffix = globalThis.crypto?.randomUUID?.().replaceAll('-', '').slice(0, 12);
    if (!suffix) {
      throw new Error('No fue posible generar el identificador administrativo del revendedor.');
    }
    return `web_ext_${suffix}`;
  }

  ngOnDestroy(): void {
    this.mobileRolesSubscription?.unsubscribe();
  }

  private loadMobileRoles(): void {
    try {
      const ownerUid = this.businessContext.requireOwnerUid();
      this.mobileRolesSubscription = this.mobileRepository.watchSales(ownerUid).subscribe({
        next: ({ records }) => {
          this.mobileRoles = [
            ...new Set(
              records
                .map(({ value: sale }) => sale.sellerRole?.trim())
                // Los roles móviles no tienen un límite ni una nomenclatura fija.
                // Solo se excluye el rol administrativo del dueño: no representa un
                // distribuidor interno asignable.
                .filter(
                  (role): role is string =>
                    typeof role === 'string' &&
                    role.length > 0 &&
                    role.toLocaleLowerCase() !== 'admon'
                )
            ),
          ].sort();
          this.mobileRolesLoading = false;
          this.assignRoleAutomatically();
        },
        error: () => {
          this.mobileRoles = [];
          this.mobileRolesLoading = false;
          this.assignRoleAutomatically();
        },
      });
    } catch {
      this.mobileRoles = [];
      this.mobileRolesLoading = false;
    }
  }

  private async assignRoleAutomatically() {
    const tipo = this.distributorForm.get('tipo')?.value;
    this.isAssigningRole = true;

    try {
      if (tipo === 'interno') {
        const assignedRoles = new Set(this.existingDistributors.map((distributor) => distributor.role));
        const roleToAssign = this.mobileRoles.find((role) => !assignedRoles.has(role)) || '';

        if (roleToAssign) {
          this.distributorForm.patchValue({ role: roleToAssign });
          this.hasAvailableRoles = true;
          this.errorMessage = ''; // Limpiar mensaje de error si había
          // Ejecutar validación después de asignar el role
          this.validateRole(roleToAssign);
        } else {
          // No hay roles disponibles
          this.distributorForm.patchValue({ role: 'No disponible' });
          this.hasAvailableRoles = false;
          this.errorMessage =
            'No hay un vendedor móvil disponible para vincular. Registre primero una venta desde la app con ese vendedor.';
          this.roleExistsMessage = '';
        }
      } else if (tipo === 'externo') {
        // Para externos, no asignar un rol móvil.
        this.distributorForm.patchValue({ role: '' });
        this.hasAvailableRoles = true;
        this.errorMessage = ''; // Limpiar mensaje de error
        this.roleExistsMessage = ''; // Limpiar mensaje de role duplicado
      }
    } catch (error) {
      console.error('Error asignando rol automáticamente:', error);
      this.distributorForm.patchValue({ role: '' });
      this.hasAvailableRoles = tipo !== 'interno';
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
    this.roleExistsMessage = ''; // Limpiar mensaje de role duplicado
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
