export interface Cliente {
  id?: string;
  nombre: string;
  direccion: string;
  eliminado: boolean;
  local: string;
  telefono: string;
  ultima_modificacion: Date | string;
}
