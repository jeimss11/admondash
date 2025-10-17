import { InvoiceStatus, PaymentType, SupplierStatus } from '../models/supplier.models';

export const SUPPLIER_STATUS_OPTIONS: { value: SupplierStatus | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos los Proveedores' },
  { value: 'activo', label: 'Activos' },
  { value: 'inactivo', label: 'Inactivos' },
];

export const INVOICE_STATUS_OPTIONS: {
  value: InvoiceStatus | 'all';
  label: string;
  color: string;
}[] = [
  { value: 'all', label: 'Todas las Facturas', color: '#6c757d' },
  { value: 'pending', label: 'Pendientes', color: '#ffc107' },
  { value: 'partial', label: 'Parciales', color: '#17a2b8' },
  { value: 'paid', label: 'Pagadas', color: '#28a745' },
  { value: 'overdue', label: 'Vencidas', color: '#dc3545' },
];

export const PAYMENT_TYPE_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'partial', label: 'Pago Parcial' },
  { value: 'full', label: 'Pago Completo' },
];

export const SUPPLIER_SORT_OPTIONS = [
  { value: 'proveedor', label: 'Nombre' },
  { value: 'deuda_total', label: 'Deuda Total' },
  { value: 'ultima_modificacion', label: 'Fecha de Modificación' },
] as const;

export const INVOICE_SORT_OPTIONS = [
  { value: 'dueDate', label: 'Fecha de Vencimiento' },
  { value: 'amount', label: 'Monto' },
  { value: 'createdAt', label: 'Fecha de Creación' },
] as const;

export const SUPPLIER_COLLECTION = 'proveedores';
export const SUPPLIER_INVOICES_COLLECTION = 'supplier-invoices';
export const PAYMENTS_SUBCOLLECTION = 'payments';

export const DEFAULT_SUPPLIER_FILTER = {
  estado: 'todos' as const,
  busqueda: '',
  ordenar_por: 'proveedor' as const,
  orden: 'asc' as const,
};

export const DEFAULT_INVOICE_FILTER = {
  status: 'all' as const,
  search: '',
  sortBy: 'dueDate' as const,
  sortOrder: 'asc' as const,
};

export const INVOICE_STATUS_COLORS = {
  pending: '#ffc107',
  partial: '#17a2b8',
  paid: '#28a745',
  overdue: '#dc3545',
} as const;

export const SUPPLIER_STATUS_COLORS = {
  activo: '#28a745',
  inactivo: '#6c757d',
} as const;
