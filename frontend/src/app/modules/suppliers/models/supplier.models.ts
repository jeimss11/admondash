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
  dueDate?: Date;
  issueDate: Date;
  paidAmount: number;
  payments: Payment[];
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

// Modelo en español para facturas de proveedores
export interface FacturaProveedor {
  readonly id: string;
  proveedorId: string;
  numeroFactura: string;
  monto: number;
  estado: EstadoFactura;
  fechaEmision: Date;
  fechaVencimiento?: Date;
  montoPagado: number;
  pagos: Pago[];
  observaciones?: string;
  fechaRegistro: Date;
  ultimaModificacion: Date;
  registradoPor: string;
  isFacturaLocal?: boolean;
  montoDelDia?: number;
  operacionId?: string;
}

export type EstadoFactura = 'pendiente' | 'parcial' | 'pagada' | 'vencida';

export interface Pago {
  readonly id: string;
  monto: number;
  fecha: Date;
  tipo: TipoPago;
  observaciones?: string;
  fechaRegistro: Date;
}

export type TipoPago = 'completo' | 'parcial';

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

// Estadísticas en español para proveedores
export interface EstadisticasProveedor {
  totalProveedores: number;
  proveedoresActivos: number;
  deudaTotal: number;
  pagadoMes: number;
  facturasPendientes: number;
  facturasVencidas: number;
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

// Filtros en español para facturas de proveedores
export interface FiltroFacturaProveedor {
  estado: EstadoFactura | 'todos';
  proveedorId?: string;
  fechaDesde?: Date;
  fechaHasta?: Date;
  busqueda: string;
  ordenarPor: 'fechaVencimiento' | 'monto' | 'fechaRegistro';
  orden: 'asc' | 'desc';
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
  issueDate: Date;
  dueDate?: Date;
  amount: number;
  status: InvoiceStatus;
  paidAmount: number;
  notes?: string;
}

export interface PaymentDto {
  invoiceId: string;
  amount: number;
  type: PaymentType;
  notes?: string;
}

// DTOs para formularios en español
export interface CrearFacturaProveedorDto {
  proveedorId: string;
  numeroFactura: string;
  fechaEmision: Date;
  fechaVencimiento?: Date;
  monto: number;
  estado: EstadoFactura;
  montoPagado: number;
  observaciones?: string;
  registradoPor: string;
  isFacturaLocal?: boolean;
  operacionId?: string;
}

export interface PagoDto {
  facturaId: string;
  monto: number;
  tipo: TipoPago;
  observaciones?: string;
}
