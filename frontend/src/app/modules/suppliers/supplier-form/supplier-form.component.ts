import { CommonModule } from '@angular/common';
import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CreateSupplierDto, Supplier, UpdateSupplierDto } from '../models/supplier.models';
import { SuppliersService } from '../services/suppliers.service';

@Component({
  selector: 'app-supplier-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './supplier-form.component.html',
  styleUrls: ['./supplier-form.component.scss'],
})
export class SupplierFormComponent {
  private fb = inject(FormBuilder);
  private suppliersService = inject(SuppliersService);
  private router = inject(Router);

  // Inputs
  supplier = input<Supplier>();

  // Outputs
  supplierCreated = output<Supplier>();
  supplierUpdated = output<Supplier>();
  cancel = output<void>();

  // Signals
  isSubmitting = signal(false);
  errors = signal<string[]>([]);

  // Formulario reactivo
  form = this.fb.group({
    proveedor: ['', [Validators.required, Validators.minLength(2)]],
    contacto: ['', [Validators.required]],
    email: ['', [Validators.email]],
    telefono: [''],
    direccion: this.fb.group({
      calle: [''],
      ciudad: [''],
      departamento: [''],
      codigo_postal: [''],
      pais: ['Colombia'],
    }),
  });

  constructor() {
    // Efecto para cargar datos cuando se edita un proveedor
    effect(() => {
      const supplier = this.supplier();
      if (supplier) {
        this.loadSupplierData(supplier);
      }
    });
  }

  private loadSupplierData(supplier: Supplier): void {
    this.form.patchValue({
      proveedor: supplier.proveedor,
      contacto: supplier.contacto,
      email: supplier.email || '',
      telefono: supplier.telefono || '',
      direccion: supplier.direccion
        ? {
            calle: supplier.direccion.calle || '',
            ciudad: supplier.direccion.ciudad || '',
            departamento: supplier.direccion.departamento || '',
            codigo_postal: supplier.direccion.codigo_postal || '',
            pais: supplier.direccion.pais || 'Colombia',
          }
        : {
            calle: '',
            ciudad: '',
            departamento: '',
            codigo_postal: '',
            pais: 'Colombia',
          },
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.markFormGroupTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errors.set([]);

    try {
      const formValue = this.form.value;
      const supplier = this.supplier();

      if (supplier) {
        // Actualizar proveedor existente
        const updateDto: UpdateSupplierDto = {
          proveedor: formValue.proveedor!,
          contacto: formValue.contacto!,
        };

        // Agregar campos opcionales solo si tienen valor
        if (formValue.email && formValue.email.trim()) {
          updateDto.email = formValue.email.trim();
        }
        if (formValue.telefono && formValue.telefono.trim()) {
          updateDto.telefono = formValue.telefono.trim();
        }
        if (formValue.direccion?.calle && formValue.direccion.calle.trim()) {
          updateDto.direccion = formValue.direccion as any;
        }

        await this.suppliersService.updateSupplier(supplier.id, updateDto);
        const updatedSupplier = { ...supplier, ...updateDto };
        this.supplierUpdated.emit(updatedSupplier);
      } else {
        // Crear nuevo proveedor
        const createDto: CreateSupplierDto = {
          proveedor: formValue.proveedor!,
          contacto: formValue.contacto!,
        };

        // Agregar campos opcionales solo si tienen valor
        if (formValue.email && formValue.email.trim()) {
          createDto.email = formValue.email.trim();
        }
        if (formValue.telefono && formValue.telefono.trim()) {
          createDto.telefono = formValue.telefono.trim();
        }
        if (formValue.direccion?.calle && formValue.direccion.calle.trim()) {
          createDto.direccion = formValue.direccion as any;
        }

        const supplierId = await this.suppliersService.createSupplier(createDto);
        const newSupplier: Supplier = {
          id: supplierId,
          proveedor: createDto.proveedor,
          contacto: createDto.contacto,
          email: createDto.email,
          telefono: createDto.telefono,
          direccion: createDto.direccion,
          estado: 'activo',
          deuda_total: 0,
          pagado: 0,
          pendiente: 0,
          eliminado: false,
          ultima_modificacion: new Date(),
        };
        this.supplierCreated.emit(newSupplier);
      }
    } catch (error: any) {
      console.error('Error saving supplier:', error);
      this.errors.set([error.message || 'Error al guardar el proveedor']);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onCancel(): void {
    this.cancel.emit();
  }

  goBack(): void {
    this.router.navigate(['/suppliers']);
  }

  private markFormGroupTouched(): void {
    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      control?.markAsTouched();
    });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.form.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  getFieldError(fieldName: string): string {
    const field = this.form.get(fieldName);
    if (field && field.errors && field.touched) {
      if (field.errors['required']) {
        return 'Este campo es requerido';
      }
      if (field.errors['email']) {
        return 'Email inválido';
      }
      if (field.errors['minlength']) {
        return `Mínimo ${field.errors['minlength'].requiredLength} caracteres`;
      }
    }
    return '';
  }
}
