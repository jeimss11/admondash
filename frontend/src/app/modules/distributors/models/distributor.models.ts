export interface DistribuidorVenta {
  id?: string;
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
}

export interface DistribuidorProducto {
  cantidad: string;
  nombre: string;
  precio: string;
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
