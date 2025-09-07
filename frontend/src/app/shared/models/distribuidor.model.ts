export interface Distribuidor {
  id?: string;
  nombre: string;
  productosDespachados: Array<{ productoId: string; cantidad: number }>;
  productosRetornados: Array<{ productoId: string; cantidad: number }>;
  totalDineroRecibido: number;
  totalDineroPorRecibir: number;
  facturasCobradas: Array<{ facturaId: string; monto: number; fecha: string }>;
  facturasPorCobrar: Array<{ facturaId: string; monto: number; fecha: string }>;
  diaAbierto: boolean;
  fechaApertura?: Date | string;
  fechaCierre?: Date | string;
  eliminado: boolean;
  ultima_modificacion: Date | string;
}
