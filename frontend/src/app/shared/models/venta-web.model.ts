export interface VentaWeb {
  id?: string;
  productoId: string;
  clienteId: string;
  cantidad: number;
  total: number;
  fecha: string;
  factura: string;
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta' | string;
  observaciones?: string;
  eliminado: boolean;
  ultima_modificacion: Date | string;
}
