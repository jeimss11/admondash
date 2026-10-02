# Guía de Uso de Campos de Fecha en Ventas

## 📋 Contexto

Las ventas en Firestore tienen dos campos de fecha:

- `fecha`: Formato `dd-mm-yyyy` (ejemplo: `22-12-2025`)
- `fecha2`: Formato `yyyy-mm-dd` (ejemplo: `2025-12-22`)

## ⚠️ REGLA IMPORTANTE

**SIEMPRE usar `fecha2` para operaciones de filtrado, comparación y consultas.**

El campo `fecha` es únicamente para visualización en la interfaz de usuario.

## 🔍 ¿Por qué?

1. **Formato incompatible**: El formato `dd-mm-yyyy` de `fecha` no es compatible con comparaciones de strings ni con consultas de Firestore.

   ❌ Incorrecto: `"25-12-2025" < "26-01-2025"` retorna `false` (pero debería ser `true`)

   ✅ Correcto: `"2025-12-25" < "2025-01-26"` retorna `false` (correcto)

2. **Formato ISO 8601**: El formato `yyyy-mm-dd` de `fecha2` es el estándar ISO 8601, compatible con:
   - Comparaciones de strings
   - Consultas de Firestore (`where`, `orderBy`)
   - Conversión a objetos `Date`
   - Ordenamiento natural

## 📖 Ejemplos de Uso Correcto

### ✅ Filtrado por Fecha

```typescript
// CORRECTO - Usar fecha2
const ventasHoy = ventas.filter((venta) => venta.fecha2 === '2025-12-22');
const ventasRecientes = ventas.filter((venta) => venta.fecha2 >= '2025-12-01');

// INCORRECTO - NO usar fecha para filtrado
const ventasHoy = ventas.filter((venta) => venta.fecha === '22-12-2025'); // ❌ NO HACER ESTO
```

### ✅ Consultas de Firestore

```typescript
// CORRECTO - Usar fecha2 en queries
const q = query(
  ventasCollection,
  where('fecha2', '>=', '2025-12-01'),
  where('fecha2', '<', '2025-12-31')
);

// INCORRECTO - NO usar fecha
const q = query(
  ventasCollection,
  where('fecha', '>=', '01-12-2025') // ❌ NO HACER ESTO
);
```

### ✅ Visualización en Templates

```html
<!-- CORRECTO - Usar fecha para mostrar al usuario -->
<td>{{ venta.fecha }}</td>

<!-- También funciona, pero fecha es más legible para el usuario -->
<td>{{ venta.fecha2 }}</td>
```

### ✅ Creación de Nuevas Ventas

```typescript
// CORRECTO - Generar ambos campos
const fechaActual = new Date();
const nuevaVenta = {
  // Para visualización (formato dd-mm-yyyy)
  fecha: fechaActual.toLocaleDateString('es-ES').replace(/\//g, '-'),
  // Para operaciones (formato yyyy-mm-dd)
  fecha2: fechaActual.toISOString().split('T')[0],
  // ... otros campos
};
```

## 📁 Archivos Actualizados

Los siguientes archivos ya implementan correctamente el uso de `fecha2`:

### Servicios

- ✅ `frontend/src/app/modules/sales/services/sales.service.ts`

  - `getVentasHoy()` - usa `fecha2`
  - `getEstadisticasVentas()` - usa `fecha2`
  - `addVenta()` - genera ambos campos correctamente

- ✅ `frontend/src/app/modules/distributors/services/distributors.service.ts`
  - `getVentasDistribuidoresHoyOptimizado()` - usa `fecha2`
  - `getVentasDistribuidoresHoySimple()` - usa `fecha2`

### Componentes

- ✅ `frontend/src/app/modules/distributors/distributor-dashboard/distributor-dashboard.component.ts`
  - `loadDistributorStatistics()` - usa `fecha2`
  - `calculateLast7DaysSales()` - usa `fecha2`

### Modelos

- ✅ `frontend/src/app/modules/sales/services/sales.service.ts` (interfaz `Venta`)
- ✅ `frontend/src/app/modules/distributors/models/distributor.models.ts` (interfaz `DistribuidorVenta`)

## 🚨 Qué NO Hacer

```typescript
// ❌ NO convertir fecha a Date para comparar
const fechaVenta = new Date(venta.fecha); // Formato incorrecto, puede fallar

// ❌ NO usar fecha en operaciones de filtrado
const ventasFiltradas = ventas.filter((v) => v.fecha > '01-12-2025');

// ❌ NO usar fecha en consultas de Firestore
where('fecha', '>=', fechaInicio);
```

## ✅ Qué SÍ Hacer

```typescript
// ✅ Usar fecha2 para todas las operaciones
const fechaVenta = new Date(venta.fecha2); // Formato correcto ISO 8601

// ✅ Usar fecha2 en operaciones de filtrado
const ventasFiltradas = ventas.filter(v => v.fecha2 >= '2025-12-01');

// ✅ Usar fecha2 en consultas de Firestore
where('fecha2', '>=', fechaInicio)

// ✅ Usar fecha solo para mostrar en la UI
<span>{{ venta.fecha }}</span>
```

## 📝 Nota sobre Operaciones Diarias

Las operaciones de gestión diaria (`gestionDiaria` collection) tienen su propio campo `fecha` que SÍ usa formato `yyyy-mm-dd` y puede usarse para filtrado. Este es un caso diferente al de las ventas.

```typescript
// ✅ En operaciones diarias, el campo 'fecha' usa formato correcto
const q = query(
  operacionesRef,
  where('fecha', '==', '2025-12-22') // ✅ Correcto para operaciones diarias
);
```

## 🔗 Referencias

- [ISO 8601 Date Format](https://en.wikipedia.org/wiki/ISO_8601)
- [Firestore Query Operators](https://firebase.google.com/docs/firestore/query-data/queries)

---

**Última actualización**: Diciembre 22, 2025
