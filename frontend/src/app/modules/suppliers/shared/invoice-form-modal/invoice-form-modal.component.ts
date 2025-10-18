import { CommonModule } from '@angular/common';
import { Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CrearFacturaProveedorDto,
  EstadoFactura,
  FacturaProveedor,
} from '../../models/supplier.models';
import { SupplierInvoicesService } from '../../services/supplier-invoices.service';
import { SuppliersService } from '../../services/suppliers.service';

@Component({
  selector: 'app-invoice-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './invoice-form-modal.component.html',
  styleUrls: ['./invoice-form-modal.component.scss'],
})
export class InvoiceFormModalComponent {
  private fb = inject(FormBuilder);
  private invoicesService = inject(SupplierInvoicesService);
  private suppliersService = inject(SuppliersService);

  // Inputs
  show = input<boolean>(false);

  // Outputs
  invoiceCreated = output<FacturaProveedor>();
  close = output<void>();

  // Signals
  isSubmitting = signal(false);
  errors = signal<string[]>([]);

  // Lista de proveedores para el select
  suppliers = this.suppliersService.suppliers;

  // Formulario reactivo
  form = this.fb.group({
    proveedorId: ['', [Validators.required]],
    numeroFactura: [{ value: '', disabled: true }, [Validators.required]], // Solo lectura
    fechaEmision: ['', [Validators.required]], // Fecha de emisión (obligatoria)
    fechaVencimiento: [''], // Fecha de vencimiento (opcional)
    monto: [0, [Validators.required, Validators.min(0.01)]],
    estado: ['pendiente', [Validators.required]], // Estado de pago
    montoPagado: [0], // Monto abonado (solo si estado es 'parcial')
    observaciones: [''],
  });

  constructor() {
    // Cargar proveedores si no están cargados
    this.loadSuppliersIfNeeded();

    // Generar número de factura automáticamente
    this.generateInvoiceNumber();

    // Escuchar cambios en el estado para mostrar/ocultar campo de monto abonado
    this.form.get('estado')?.valueChanges.subscribe((estado) => {
      const montoPagadoControl = this.form.get('montoPagado');
      if (estado === 'parcial') {
        montoPagadoControl?.setValidators([Validators.required, Validators.min(0.01)]);
        // Validar que el monto abonado sea menor al total
        montoPagadoControl?.setValidators([
          Validators.required,
          Validators.min(0.01),
          Validators.max(this.form.get('monto')?.value || 0),
        ]);
      } else {
        montoPagadoControl?.clearValidators();
        montoPagadoControl?.setValue(0);
      }
      montoPagadoControl?.updateValueAndValidity();
    });

    // Escuchar cambios en el monto total para validar el monto abonado
    this.form.get('monto')?.valueChanges.subscribe((monto) => {
      const estado = this.form.get('estado')?.value;
      if (estado === 'parcial') {
        const montoPagadoControl = this.form.get('montoPagado');
        montoPagadoControl?.setValidators([
          Validators.required,
          Validators.min(0.01),
          Validators.max(monto || 0),
        ]);
        montoPagadoControl?.updateValueAndValidity();
      }
    });
  }

  private async loadSuppliersIfNeeded(): Promise<void> {
    // Si no hay proveedores cargados, intentar cargarlos
    if (this.suppliersService.suppliers().length === 0) {
      try {
        await this.suppliersService.loadSuppliers();
      } catch (error) {
        console.error('Error loading suppliers:', error);
      }
    }
  }

  private async generateInvoiceNumber(): Promise<void> {
    try {
      // Usar timestamp del cliente por ahora, pero en el servidor se usará serverTimestamp
      const timestamp = Date.now();
      const invoiceNumber = `SI-${timestamp}`;
      this.form.get('numeroFactura')?.setValue(invoiceNumber);
    } catch (error) {
      console.error('Error generating invoice number:', error);
    }
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

      const createDto: CrearFacturaProveedorDto = {
        proveedorId: formValue.proveedorId!,
        numeroFactura: this.form.get('numeroFactura')?.value!, // Obtener valor del control deshabilitado
        fechaEmision: new Date(formValue.fechaEmision!),
        fechaVencimiento: formValue.fechaVencimiento
          ? new Date(formValue.fechaVencimiento)
          : undefined,
        monto: formValue.monto!,
        estado: formValue.estado as EstadoFactura,
        montoPagado: formValue.estado === 'parcial' ? formValue.montoPagado! : 0,
        observaciones: formValue.observaciones || '',
        registradoPor: 'Usuario actual', // TODO: Obtener del auth service
      };

      const invoiceId = await this.invoicesService.createInvoice(createDto);

      // Crear objeto de factura para emitir
      const newInvoice: FacturaProveedor = {
        id: invoiceId,
        proveedorId: createDto.proveedorId,
        numeroFactura: createDto.numeroFactura,
        fechaEmision: createDto.fechaEmision,
        fechaVencimiento: createDto.fechaVencimiento,
        monto: createDto.monto,
        estado: createDto.estado,
        montoPagado: createDto.montoPagado,
        pagos: [],
        observaciones: createDto.observaciones,
        fechaRegistro: new Date(),
        ultimaModificacion: new Date(),
        registradoPor: createDto.registradoPor,
      };

      this.invoiceCreated.emit(newInvoice);
      this.onClose();
      this.resetForm();
    } catch (error: any) {
      console.error('Error creating invoice:', error);
      this.errors.set([error.message || 'Error al crear la factura']);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onClose(): void {
    this.close.emit();
  }

  private resetForm(): void {
    this.form.reset({
      proveedorId: '',
      numeroFactura: '',
      fechaEmision: '',
      fechaVencimiento: '',
      monto: 0,
      estado: 'pendiente',
      montoPagado: 0,
      observaciones: '',
    });

    // Generar nuevo número de factura
    this.generateInvoiceNumber();
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
      if (field.errors['min']) {
        return `El valor debe ser mayor a ${field.errors['min'].min}`;
      }
      if (field.errors['minlength']) {
        return `Mínimo ${field.errors['minlength'].requiredLength} caracteres`;
      }
    }
    return '';
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
    }).format(amount);
  }
}
