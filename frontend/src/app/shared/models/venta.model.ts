export interface Venta {
  id?: string;
  cantidad: number;
  cliente: string;
  eliminado: boolean;
  factura: string;
  fecha: string;
  fecha2: string;
  libre1?: string;
  libre2?: string;
  libre3?: string;
  libre4?: string;
  modificadoLocalmente: number;
  producto: string;
  sincronizado: number;
  total: number;
  ultimaModificacionMillis: number;
  ultima_modificacion: Date | string;
}
