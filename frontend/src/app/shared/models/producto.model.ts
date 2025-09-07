export interface Producto {
  id?: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  valor: number;
  eliminado: boolean;
  ultima_modificacion: Date | string;
}
