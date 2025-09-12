export interface Producto {
  id?: string;
  codigo: string;
  nombre: string;
  cantidad: string;
  valor: string;
  eliminado: boolean;
  ultima_modificacion: Date | string;
}
