export interface Distribuidor {
  nombre: string;
  tipo: 'interno' | 'externo';
  role: string;
  estado: 'activo' | 'inactivo';
  email?: string;
  telefono?: string;
  direccion?: string;
  fechaRegistro: string;
  notas?: string;
}

export interface DistribuidorVenta {
  cliente: string;
  descuento: string;
  eliminado: boolean;
  factura: string;
  fecha: string;
  fecha2: string;
  productos: DistribuidorProducto[];
  ultima_modificacion: any;
  total: string;
  subtotal: string;
  role: string; // 'seller1', 'seller2', etc. para internos, 'clientSeller1', etc. para externos
  pagado?: boolean; // Indica si la venta/factura está pagada
}

export interface DistribuidorProducto {
  cantidad: string;
  nombre: string;
  precio: string;
  subtotal: string;
  total: string;
}

export interface DistribuidorEstadisticas {
  totalDistribuidoresInternos: number;
  totalDistribuidoresExternos: number;
  totalVentasInternas: number;
  totalVentasExternas: number;
  ventasHoyInternas: number;
  ventasHoyExternas: number;
  totalIngresosInternos: number;
  totalIngresosExternos: number;
}
