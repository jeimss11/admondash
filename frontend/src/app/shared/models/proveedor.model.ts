export interface Proveedor {
  id?: string;
  nombre: string;
  contacto: string;
  telefono: string;
  direccion: string;
  productosSuministrados: Array<string>;
  eliminado: boolean;
  ultima_modificacion: Date | string;
}
