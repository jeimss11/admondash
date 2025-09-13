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

// 🆕 MODELOS PARA GESTIÓN FINANCIERA Y CONTROL DE DÍA

export interface AperturaDia {
  id?: string;
  distribuidorId: string; // role del distribuidor
  fecha: string; // YYYY-MM-DD
  horaApertura: string; // HH:mm:ss
  montoInicial: number; // Dinero entregado al inicio del día
  productosIniciales: ProductoInventario[];
  observaciones?: string;
  estado: 'abierto' | 'cerrado';
  creadoPor: string;
  fechaCreacion: string;
}

export interface CierreDia {
  id?: string;
  distribuidorId: string;
  fecha: string;
  horaCierre: string;
  montoInicial: number; // Monto con el que se abrió el día
  ventasTotales: number; // Total de ventas del día
  dineroEntregado: number; // Dinero entregado al final del día
  diferencia: number; // dineroEntregado - (montoInicial + ventasTotales)
  productosVendidos: ProductoVendido[];
  productosDefectuosos: ProductoDefectuoso[];
  productosCaducados: ProductoCaducado[];
  ajustes: AjusteDinero[];
  observaciones?: string;
  estado: 'completado' | 'pendiente_revision';
  revisadoPor?: string;
  fechaRevision?: string;
  creadoPor: string;
  fechaCreacion: string;
}

export interface ProductoInventario {
  productoId: string;
  nombre: string;
  cantidadInicial: number;
  precioUnitario: number;
  valorTotal: number;
}

export interface ProductoVendido {
  productoId: string;
  nombre: string;
  cantidadVendida: number;
  precioUnitario: number;
  valorTotal: number;
  fechaVenta: string;
}

export interface ProductoDefectuoso {
  id?: string;
  productoId: string;
  nombre: string;
  cantidad: number;
  motivo: 'defectuoso' | 'dañado' | 'otro';
  descripcion?: string;
  costoUnitario: number;
  costoTotal: number;
  fechaRegistro: string;
  registradoPor: string;
}

export interface ProductoCaducado {
  id?: string;
  productoId: string;
  nombre: string;
  cantidad: number;
  fechaCaducidad: string;
  lote?: string;
  costoUnitario: number;
  costoTotal: number;
  fechaRegistro: string;
  registradoPor: string;
}

export interface AjusteDinero {
  id?: string;
  tipo: 'ingreso' | 'egreso';
  monto: number;
  motivo: string;
  descripcion?: string;
  fechaRegistro: string;
  registradoPor: string;
  comprobante?: string; // URL o referencia a comprobante
}

export interface HistorialDia {
  id?: string;
  distribuidorId: string;
  fecha: string;
  apertura?: AperturaDia;
  cierre?: CierreDia;
  estado: 'abierto' | 'cerrado' | 'pendiente_cierre';
  resumen: {
    ventasTotales: number;
    productosVendidos: number;
    productosDefectuosos: number;
    productosCaducados: number;
    diferenciaDinero: number;
    observaciones?: string;
  };
}

export interface EstadisticasDia {
  distribuidorId: string;
  fecha: string;
  ventasTotales: number;
  productosVendidos: number;
  dineroInicial: number;
  dineroFinal: number;
  diferencia: number;
  productosDefectuosos: number;
  productosCaducados: number;
  ajustesTotales: number;
  estado: 'normal' | 'diferencia' | 'revision_requerida';
}

// 🆕 MODELOS PARA REPORTES Y ANÁLISIS

export interface ReporteDiario {
  fecha: string;
  distribuidorId: string;
  distribuidorNombre: string;
  apertura: {
    hora: string;
    montoInicial: number;
    productosIniciales: number;
  };
  ventas: {
    total: number;
    productosVendidos: number;
    transacciones: number;
  };
  cierre: {
    hora: string;
    dineroEntregado: number;
    diferencia: number;
  };
  productosEspeciales: {
    defectuosos: number;
    caducados: number;
    costoTotal: number;
  };
  ajustes: {
    ingresos: number;
    egresos: number;
    neto: number;
  };
  observaciones?: string;
}

export interface AlertaSistema {
  id?: string;
  tipo: 'diferencia_dinero' | 'productos_defectuosos' | 'productos_caducados' | 'cierre_pendiente';
  prioridad: 'baja' | 'media' | 'alta' | 'critica';
  distribuidorId: string;
  fecha: string;
  mensaje: string;
  valorEsperado?: number;
  valorReal?: number;
  diferencia?: number;
  estado: 'activa' | 'resuelta' | 'ignorada';
  fechaCreacion: string;
  resueltaPor?: string;
  fechaResolucion?: string;
}
