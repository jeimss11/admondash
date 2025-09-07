export interface Gasto {
  id?: string;
  descripcion: string;
  categoria: string;
  monto: number;
  fecha: string;
  proveedor?: string;
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta' | string;
  observaciones?: string;
  eliminado: boolean;
  ultima_modificacion: Date | string;
}
