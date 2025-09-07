export interface Usuario {
  id?: string;
  nombre: string;
  email: string;
  telefono?: string;
  rol: 'administrador' | 'usuario' | string;
  activo: boolean;
  ultima_modificacion: Date | string;
}
