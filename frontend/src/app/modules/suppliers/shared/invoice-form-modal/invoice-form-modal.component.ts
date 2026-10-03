import { CommonModule } from '@angular/common';
import { Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CrearFacturaProveedorDto,
  FacturaProveedor,
} from '../../models/supplier.models';
import { SupplierInvoicesService } from '../../services/supplier-invoices.service';
import { SuppliersService } from '../../services/suppliers.service';
import { firstValueFrom, timeout } from 'rxjs';

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
    observaciones: [''],
  });

  constructor() {
    // Cargar proveedores si no están cargados
    this.loadSuppliersIfNeeded();

    // Generar número de factura automáticamente
    this.generateInvoiceNumber();

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
      const invoiceNumber = `SI-${timestamp}-${crypto.randomUUID().slice(0, 8)}`;
      this.form.get('numeroFactura')?.setValue(invoiceNumber);
    } catch (error) {
      console.error('Error generating invoice number:', error);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.isSubmitting()) return;
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
        estado: 'pendiente',
        montoPagado: 0,
        observaciones: formValue.observaciones || '',
        registradoPor: '', // The service supplies the authenticated UID, never a form label.
      };

      const invoiceId = await this.invoicesService.createInvoice(createDto);

      let newInvoice = this.invoicesService.facturas().find(invoice => invoice.id === invoiceId);
      if (!newInvoice) {
        try {
          newInvoice = await firstValueFrom(this.invoicesService.getFacturaById(invoiceId).pipe(timeout(15000))) ?? undefined;
        } catch {
          this.errors.set(['La factura se guardó, pero no pudo consultarse. Actualiza la lista; no necesitas registrarla de nuevo.']);
          return;
        }
      }
      if (!newInvoice) {
        this.errors.set(['La factura se guardó. Actualiza la lista para consultar su estado.']);
        return;
      }

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
