# Descubrimiento de Distribuidores — sin cambios funcionales

Fecha: 2026-09-26. Esta revisión solo lee el módulo existente; no modifica datos, reglas, Firebase ni `impresora`.

## Rutas observadas

| Ruta | Uso actual | Decisión propuesta |
| --- | --- | --- |
| `usuarios/{ownerUid}/ventas` | Lectura de ventas móviles y también creación/edición de ventas internas/externas desde el escritorio. | Conservar solo lectura compatible; detener nuevas escrituras administrativas incompatibles. |
| `usuarios/{ownerUid}/roleData` | Catálogo administrativo de distribuidores, basado en etiquetas `role`. | Mantener como dato administrativo, sin tratar `role` como permiso. |
| `usuarios/{ownerUid}/dias` | Modelo antiguo de apertura/cierre. | Inventariar y leer histórico; no ampliarlo. |
| `usuarios/{ownerUid}/gestionDiaria/{operacionId}` y subcolecciones | Operación diaria, cargas, retornos, pérdidas, gastos, facturas pendientes y resumen. | Elegirlo como candidato administrativo, tras normalizar auditoría y cierre. |

## Uso real de los dos esquemas

La pantalla vigente `day-management` trabaja exclusivamente con `gestionDiaria`: consulta la operación activa y el historial de operaciones cerradas, crea una operación y la cierra mediante ese esquema. No tiene consumidores fuera del servicio para los métodos de `dias` (`getHistorialDias`, `crearDia` y `cerrarDia`).

Por ello, desde este momento de análisis se clasifica `dias` como histórico heredado: se conserva tal cual y puede leerse para una futura conciliación, pero no será el punto de partida de funciones nuevas. Esta clasificación no migra datos, no cambia la interfaz actual ni modifica escrituras existentes.

## Riesgos confirmados

1. `addVentaInterna` y `addVentaExterna` crean documentos con auto-ID en `ventas`. El móvil usa la factura completa como identificador y puede reemplazar documentos; estas escrituras no son seguras para nuevas ventas web.
2. `role` se usa para separar distribuidores, pero en móvil es una etiqueta operativa (`admon`, `seller1`, etc.), no una identidad ni permiso de escritorio.
3. Existen dos esquemas solapados: `dias` y `gestionDiaria`. Sus fórmulas y estados no son equivalentes.
4. El servicio todavía tiene un método de productos de ejemplo y creación derivada de distribuidores desde ventas. Consultar una pantalla no debe inventar datos administrativos.
5. El cierre actual guarda un resumen calculado. Debe conservar insumos, autor, hora y diferencias para que un cierre se pueda explicar, sin editar ventas móviles.
6. El identificador actual de una operación es `${distribuidorId}_${fecha}`. Solo permite una operación por distribuidor y fecha civil; una reapertura debe ser una revisión vinculada, no otra operación con la misma clave ni una sobrescritura silenciosa.

## Plan de transición propuesto

1. Poner las escrituras a `ventas` detrás de una barrera explícita y convertir sus pantallas en consulta de ventas móviles mientras se construye el flujo web en `ventas_appweb`.
2. Definir `gestionDiaria` como libro administrativo: una operación tiene dueño, distribuidor administrativo, fecha civil Colombia, estado y auditoría.
3. Registrar carga, devolución, pérdida, gasto y cobro como movimientos administrativos con referencia al origen. No actualizar `productos.cantidad` móvil automáticamente.
4. Tratar la venta móvil como evidencia observada: se puede asociar a una operación solo si existe una relación no ambigua; si no, queda pendiente de conciliación.
5. Hacer el cierre inmutable después de aprobación; una corrección posterior será un ajuste/auditoría, no editar el cierre ni las ventas observadas.

## Decisiones confirmadas por el dueño

- Un distribuidor **interno** representa a un vendedor móvil existente. Un distribuidor **externo** representa a un revendedor y no se interpreta como vendedor/sesión móvil.
- Solo un administrador abre, cierra, reabre y aprueba operaciones o diferencias.
- Los cobros a clientes se registran desde el escritorio. El móvil no tiene aún un flujo de crédito, por lo que no se infiere cobro móvil ni se escribe crédito en ventas móviles.
- Una venta móvil que llegue después de un cierre puede motivar la reapertura y ajuste del cierre. La reapertura exige nota obligatoria, identidad del administrador, fecha/hora y conserva el cierre anterior como historial.

## Propuesta de evolución aditiva (pendiente de aprobar el cambio concreto)

1. Agregar campos y documentos administrativos compatibles para distinguir `tipoDistribuidor: interno | externo`, conservando los documentos actuales y la referencia de vendedor móvil solo para internos.
2. Agregar revisiones de cierre vinculadas. Una reapertura futura no sobrescribirá el cierre existente: registrará motivo obligatorio, administrador y nuevo resumen/estado.
3. Agregar cobros como movimientos administrativos referenciados a la operación y, cuando corresponda, a la venta observada; nunca como una mutación de la venta móvil.
4. Mostrar ventas móviles tardías como novedades pendientes. El administrador podrá asociarlas a una reapertura con motivo; no se modificará automáticamente ningún cierre.

No se migrará, borrará, ocultará ni deshabilitará el flujo actual de Distribuidores en esta etapa. Antes de sustituir una escritura existente o activar una pantalla nueva, se presentará el cambio concreto para aprobación del dueño.
