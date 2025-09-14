# Gestión Diaria de Distribuidores - Documentación

## 📋 Estructura de Datos

### Operación Diaria

```typescript
operaciones/{operacionId}: {
  uid: string,           // ID del usuario
  distribuidorId: string, // ID del distribuidor
  fecha: timestamp,      // Fecha de la operación
  montoInicial: number,  // Monto inicial entregado
  estado: 'activa' | 'cerrada' | 'cancelada',
  createdAt: timestamp,
  updatedAt: timestamp,
  cerradoPor?: string,   // UID del usuario que cerró
  fechaCierre?: string
}
```

### Subcolecciones

#### 1. Productos Cargados

```typescript
operaciones/{operacionId}/productos_cargados/{productoId}: {
  productoId: string,
  nombre: string,
  cantidad: number,
  precioUnitario: number,
  total: number,
  fechaCarga: timestamp,
  cargadoPor: string
}
```

#### 2. Productos No Retornados

```typescript
operaciones/{operacionId}/productos_no_retornados/{itemId}: {
  productoId: string,
  nombre: string,
  cantidad: number,
  motivo: 'daño' | 'mal_funcionamiento' | 'cambio' | 'robo' | 'otro',
  descripcion?: string,
  costoUnitario: number,
  totalPerdida: number,
  fechaRegistro: timestamp,
  registradoPor: string
}
```

#### 3. Productos Retornados

```typescript
operaciones/{operacionId}/productos_retornados/{itemId}: {
  productoId: string,
  nombre: string,
  cantidad: number,
  estado: 'bueno' | 'defectuoso' | 'devuelto' | 'dañado',
  observaciones?: string,
  fechaRegistro: timestamp,
  registradoPor: string
}
```

#### 4. Gastos Operativos

```typescript
operaciones/{operacionId}/gastos/{gastoId}: {
  tipo: 'gasolina' | 'alimentacion' | 'transporte' | 'hospedaje' | 'otros',
  descripcion: string,
  monto: number,
  comprobante?: string,
  fechaGasto: timestamp,
  registradoPor: string
}
```

#### 5. Facturas Pendientes

```typescript
operaciones/{operacionId}/facturas_pendientes/{facturaId}: {
  cliente: string,
  numeroFactura: string,
  monto: number,
  fechaVencimiento: timestamp,
  estado: 'pendiente' | 'parcial' | 'vencida' | 'pagada',
  observaciones?: string,
  fechaRegistro: timestamp,
  registradoPor: string,
  fechaPago?: string,
  montoPagado?: number
}
```

#### 6. Resumen Diario

```typescript
operaciones/{operacionId}/resumen_diario: {
  totalVentas: number,
  totalGastos: number,
  totalPerdidas: number,
  dineroEsperado: number,
  dineroEntregado: number,
  diferencia: number,
  productosCargados: number,
  productosRetornados: number,
  productosNoRetornados: number,
  facturasGeneradas: number,
  observaciones?: string,
  fechaCierre: timestamp,
  cerradoPor: string
}
```

## 🚀 API del Servicio

### Gestión de Operaciones

#### Crear Operación Diaria

```typescript
const operacionId = await distributorsService.crearOperacionDiaria({
  uid: userId,
  distribuidorId: 'seller1',
  fecha: '2025-09-14',
  montoInicial: 50000,
  estado: 'activa',
});
```

#### Obtener Operación Activa

```typescript
const operacion = await distributorsService.getOperacionActiva('seller1');
```

#### Cerrar Operación

```typescript
await distributorsService.cerrarOperacionDiaria(operacionId, resumenDiario);
```

### Gestión de Productos

#### Agregar Producto Cargado

```typescript
await distributorsService.agregarProductoCargado(operacionId, {
  productoId: 'prod001',
  nombre: 'Producto A',
  cantidad: 10,
  precioUnitario: 1000,
  total: 10000,
  fechaCarga: new Date().toISOString(),
  cargadoPor: userId,
});
```

#### Registrar Producto No Retornado

```typescript
await distributorsService.registrarProductoNoRetornado(operacionId, {
  productoId: 'prod001',
  nombre: 'Producto A',
  cantidad: 2,
  motivo: 'daño',
  costoUnitario: 1000,
  totalPerdida: 2000,
  fechaRegistro: new Date().toISOString(),
  registradoPor: userId,
});
```

### Gestión de Gastos

#### Registrar Gasto Operativo

```typescript
await distributorsService.registrarGastoOperativo(operacionId, {
  tipo: 'gasolina',
  descripcion: 'Combustible para ruta',
  monto: 25000,
  fechaGasto: new Date().toISOString(),
  registradoPor: userId,
});
```

### Gestión de Facturas

#### Crear Factura Pendiente

```typescript
await distributorsService.crearFacturaPendiente(operacionId, {
  cliente: 'Cliente ABC',
  numeroFactura: 'FAC-001',
  monto: 15000,
  fechaVencimiento: '2025-09-30',
  estado: 'pendiente',
  fechaRegistro: new Date().toISOString(),
  registradoPor: userId,
});
```

### Estadísticas y Reportes

#### Calcular Estadísticas de Operación

```typescript
const estadisticas = await distributorsService.calcularEstadisticasOperacion(operacionId);
// Retorna: rendimiento, resumen financiero, alertas
```

#### Obtener Operaciones por Distribuidor

```typescript
const operaciones = await distributorsService.getOperacionesPorDistribuidor(
  'seller1',
  '2025-09-01',
  '2025-09-30'
);
```

## 📊 Cálculos Automáticos

### Dinero Esperado

```
dineroEsperado = montoInicial + totalVentas - totalGastos - totalPerdidas
```

### Diferencia

```
diferencia = dineroEntregado - dineroEsperado
```

### Rendimiento de Productos

```
porcentajeRetornados = (productosRetornados / productosCargados) * 100
porcentajeUtilizados = (productosNoRetornados / productosCargados) * 100
```

### Eficiencia Financiera

```
eficienciaFinanciera = (dineroEsperado / dineroEntregado) * 100
```

## ⚠️ Sistema de Alertas

### Tipos de Alertas

- **Diferencia de Dinero**: Cuando |diferencia| > $1,000
- **Productos Perdidos**: Cuando hay productos no retornados
- **Facturas Vencidas**: Cuando hay facturas con fecha de vencimiento pasada

### Configuración de Alertas

```typescript
const configuracion = {
  alertas: {
    diferenciaMaximaPermitida: 1000,
    productosPerdidosMaximos: 5, // porcentaje
    diasVencimientoFacturas: 7,
  },
  notificaciones: {
    email: true,
    push: true,
    sms: false,
  },
};
```

## 🔄 Próximos Pasos

1. **Fase 2**: Actualizar componente DayManagement con nueva UI
2. **Fase 3**: Implementar sistema de alertas en tiempo real
3. **Fase 4**: Crear reportes y dashboards de análisis
4. **Fase 5**: Implementar sincronización offline

---

_Esta documentación se actualizará conforme se implementen nuevas funcionalidades._
