export interface Cliente {
  id?: string;
  cliente: string;
  direccion: string;
  eliminado: boolean;
  local: string;
  telefono: string;
  ultima_modificacion: Date | string;
}
