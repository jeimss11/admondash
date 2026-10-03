# Prompt para evolucionar `impresora`: inventario conjunto web + móvil

**Revisión necesaria antes de usar este prompt histórico:** el dueño pidió posteriormente descuento web directo sobre `productos.cantidad`, ya implementado en el escritorio. La propuesta vigente está en [INVENTORY_MODEL_AND_WEB_STOCK](INVENTORY_MODEL_AND_WEB_STOCK.md): ubicación independiente del canal y del usuario, global calculado y transición móvil por fases. Las rutas de libro aquí son propuestas; contrastarlas con el libro actual de escritorio en `negocios/{ownerUid}/inventario_movimientos` antes de implementar. No activar dos bases de stock ni emitir movimientos que vuelvan a descontar una venta ya aplicada. Ninguna edición del móvil se realizó en esta tarea.

Usa este prompt únicamente cuando se vaya a modificar el repositorio móvil `impresora`. Antes de hacerlo, crea una rama y revisa el código real que genera ventas, sincroniza productos y maneja `sync_inventory`.

```text
Necesito adaptar la app Android impresora para que comparta el modelo de inventario administrativo del escritorio web, sin romper sus ventas, impresión, sincronización existente, sesiones de suscripción ni active_sellers.

Contexto obligatorio:
- Firestore compartido actual: usuarios/{ownerUid}/productos/{codigo}. El código es la clave estable del producto; nunca relaciones stock por nombre.
- La app actual puede subir productos.cantidad como saldo absoluto y puede omitir cantidad cuando sync_inventory está desactivado. No conviertas una cantidad ausente en cero y no escribas deltas sobre productos.cantidad.
- Ventas móviles existentes se conservan en usuarios/{ownerUid}/ventas/{factura}; ventas web se conservan en ventas_appweb. No las copies ni las migres.
- No cambies reglas, índices, Functions, datos existentes ni la configuración Firebase. Entrega por separado una lista de cambios manuales que el dueño pueda aplicar si fuera necesaria.
- No alteres login, tokens de suscripción, sesiones ni app_mobile_settings/active_sellers.

Objetivo de inventario:
1. Fábrica es una ubicación física separada y nunca se mezcla con los distribuidores.
2. La mercancía que sale de fábrica puede ir a:
   - bolsa compartida: varios distribuidores usan una existencia común, o
   - distribuidor individual: saldo asignado a un distribuidor por su identificador estable (role actual o un ID nuevo documentado).
3. Cada movimiento debe identificarse por codigo de producto, cantidad decimal, fecha/hora, operación/origen, usuario autenticado y ubicaciones explícitas; el nombre solo sirve de presentación.

Contrato aditivo propuesto (no desplegarlo ni activarlo automáticamente):
usuarios/{ownerUid}/inventario_movimientos/{movementId}
  - operationId: string
  - sourceId: string idempotente del evento original
  - kind: factory-receipt | load | return | loss
  - productCode: string
  - productName: string de presentación
  - quantity: number decimal positiva
  - sourceLocation: factory | shared-distributors | distributor:{id}
  - destinationLocation: factory | shared-distributors | distributor:{id}, ausente solo en loss
  - distributorId: string opcional para factory-receipt; requerido para movimientos de distribución
  - ownerUid, actorUid, createdAt

Reglas de significado:
- factory-receipt: externo -> factory.
- load: factory -> shared-distributors o distributor:{id}.
- return: shared-distributors o distributor:{id} -> factory.
- loss: una ubicación -> sin destino de inventario; requiere motivo/auditoría.
- No calcules un nuevo productos.cantidad restando las ventas. La cantidad absoluta histórica del móvil puede llegar tarde o sobrescribir el dato.
- Mantén los movimientos inmutables e idempotentes: reintentar el mismo sourceId no duplica el movimiento.

Ventas:
- Asegura que toda nueva línea de venta móvil guarde productCode/codigo junto al nombre, cantidad decimal y el importe completo de línea. Conserva lectura de ventas históricas sin código y márcalas como no atribuibles automáticamente al inventario.
- Conserva el formato actual de factura timestamp-consecutivo. No modifiques facturas históricas ni las del escritorio.

Entrega requerida:
1. Auditoría de los archivos que hoy escriben productos, ventas y sincronización.
2. Implementación aditiva, compatible hacia atrás, con migración solo de lectura para históricos.
3. Pruebas unitarias de carga, devolución, pérdida, bolsa compartida, distribuidor individual, cantidades fraccionarias, reintento y ausencia de cantidad.
4. Informe claro de los cambios manuales de Firebase que serían necesarios; no ejecutarlos.
5. Confirmación de que login, suscripción, sesiones, impresión y active_sellers permanecen sin cambios.
```

El esquema es intencionalmente aditivo: el móvil puede empezar a emitir movimientos nuevos sin alterar `productos` ni reinterpretar la historia. Antes de activar escrituras contra el proyecto real, el dueño debe revisar manualmente las reglas e índices que correspondan.
