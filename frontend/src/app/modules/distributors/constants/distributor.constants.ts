// Constantes para la gestión diaria de distribuidores
// Mantiene consistencia en tipos y valores permitidos

export const TIPOS_GASTO = {
  gasolina: 'Gasolina',
  alimentacion: 'Alimentación',
  transporte: 'Transporte',
  hospedaje: 'Hospedaje',
  otros: 'Otros',
} as const;

export const MOTIVOS_PRODUCTO_NO_RETORNADO = {
  daño: 'Daño',
  mal_funcionamiento: 'Mal funcionamiento',
  cambio: 'Cambio',
  robo: 'Robo',
  otro: 'Otro',
} as const;

export const ESTADOS_PRODUCTO_RETORNADO = {
  bueno: 'Bueno',
  defectuoso: 'Defectuoso',
  devuelto: 'Devuelto',
  dañado: 'Dañado',
} as const;

export const ESTADOS_FACTURA = {
  pendiente: 'Pendiente',
  parcial: 'Parcial',
  vencida: 'Vencida',
  pagada: 'Pagada',
} as const;

export const ESTADOS_OPERACION = {
  activa: 'Activa',
  cerrada: 'Cerrada',
  cancelada: 'Cancelada',
} as const;

export const PRIORIDADES_ALERTA = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
} as const;

export const TIPOS_ALERTA = {
  diferencia_dinero: 'Diferencia de dinero',
  productos_perdidos: 'Productos perdidos',
  facturas_vencidas: 'Facturas vencidas',
  cierre_pendiente: 'Cierre pendiente',
} as const;

// Configuraciones por defecto
export const CONFIGURACIONES_POR_DEFECTO = {
  alertas: {
    diferenciaMaximaPermitida: 1000, // $1,000
    productosPerdidosMaximos: 5, // 5%
    diasVencimientoFacturas: 7, // 7 días antes
  },
  notificaciones: {
    email: true,
    push: true,
    sms: false,
  },
};

// Tipos de datos para TypeScript
export type TipoGasto = keyof typeof TIPOS_GASTO;
export type MotivoProductoNoRetornado = keyof typeof MOTIVOS_PRODUCTO_NO_RETORNADO;
export type EstadoProductoRetornado = keyof typeof ESTADOS_PRODUCTO_RETORNADO;
export type EstadoFactura = keyof typeof ESTADOS_FACTURA;
export type EstadoOperacion = keyof typeof ESTADOS_OPERACION;
export type PrioridadAlerta = keyof typeof PRIORIDADES_ALERTA;
export type TipoAlerta = keyof typeof TIPOS_ALERTA;
