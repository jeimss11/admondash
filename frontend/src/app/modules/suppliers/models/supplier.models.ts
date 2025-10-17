export interface Supplier {
  readonly id: string;
  proveedor: string;
  contacto: string;
  email?: string;
  telefono?: string;
  direccion?: SupplierAddress;
  estado: SupplierStatus;
  ultima_modificacion: Date;
  deuda_total: number;
  pagado: number;
  pendiente: number;
  eliminado: boolean;
}

export interface SupplierAddress {
  calle: string;
  ciudad: string;
  departamento?: string;
  codigo_postal: string;
  pais: string;
}

export type SupplierStatus = 'activo' | 'inactivo';

export interface SupplierInvoice {
  readonly id: string;
  supplierId: string;
  number: string;
  amount: number;
  status: InvoiceStatus;
  dueDate: Date;
  issueDate: Date;
  payments: Payment[];
  products: InvoiceProduct[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type InvoiceStatus = 'pending' | 'partial' | 'paid' | 'overdue';

export interface Payment {
  readonly id: string;
  amount: number;
  date: Date;
  type: PaymentType;
  notes?: string;
  createdAt: Date;
}

export type PaymentType = 'full' | 'partial';

export interface InvoiceProduct {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  description?: string;
}

export interface SupplierStats {
  total_proveedores: number;
  proveedores_activos: number;
  deuda_total: number;
  pagado_mes: number;
  facturas_pendientes: number;
  facturas_vencidas: number;
}

export interface SupplierFilter {
  estado: SupplierStatus | 'todos';
  busqueda: string;
  ordenar_por: 'proveedor' | 'deuda_total' | 'ultima_modificacion';
  orden: 'asc' | 'desc';
}

export interface InvoiceFilter {
  status: InvoiceStatus | 'all';
  supplierId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search: string;
  sortBy: 'dueDate' | 'amount' | 'createdAt';
  sortOrder: 'asc' | 'desc';
}

// DTOs para formularios
export interface CreateSupplierDto {
  proveedor: string;
  contacto: string;
  email?: string;
  telefono?: string;
  direccion?: SupplierAddress;
}

export interface UpdateSupplierDto extends Partial<CreateSupplierDto> {
  estado?: SupplierStatus;
}

export interface CreateInvoiceDto {
  supplierId: string;
  number: string;
  amount: number;
  dueDate: Date;
  products: InvoiceProduct[];
  notes?: string;
}

export interface PaymentDto {
  invoiceId: string;
  amount: number;
  type: PaymentType;
  notes?: string;
}
