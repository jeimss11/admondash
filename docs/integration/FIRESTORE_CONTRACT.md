# Contrato de Firestore observado

Actualización posterior: por decisión del dueño, nuevas ventas web descuentan `productos/{codigo}.cantidad` transaccionalmente, conservando evidencia en `ventas_appweb`; las anulaciones compensan una sola vez. No se reescribieron históricos ni se cambió el contrato móvil. Ver [INVENTORY_MODEL_AND_WEB_STOCK](INVENTORY_MODEL_AND_WEB_STOCK.md). Las descripciones iniciales siguientes que hablan de venta web sin stock reflejan la auditoría original.

Versión de este documento: 1. Referencia móvil: `17412892aba3989925fe13cb877fd2796f67bd58`, 2026-09-22. Contrato extraído del código local, no de una exportación de producción.

## Identidad del negocio

El dato compartido vive bajo `usuarios/{ownerUid}`. Hoy ambos clientes forman esa ruta con el UID autenticado. Para el dueño se mantiene el mismo UID. Para un colaborador futuro, `auth.uid` será distinto de `ownerUid`; el escritorio deberá resolver la membresía y consultar la ruta del dueño. Las reglas deberán verificar esa relación, sin confiar en el valor recibido del navegador.

El correo sirve para invitaciones y presentación, no como clave de documentos de negocio. Un cambio de correo no debe mover el negocio. `role` en ventas/gastos es una etiqueta operativa del móvil, no una concesión de permisos.

## Cuenta, suscripción, dispositivo y vendedor móviles

Fuentes adicionales revisadas: `viewmodel/SingInViewModel.kt`, `ui/SignFragment.kt`, `viewmodel/SyncMenuViewModel.kt`, `Utilities/FirestoreManagement.kt` y búsquedas en `FragmentsUI/Others/SuscriptionsFragment.java`.

1. `SignFragment` obtiene el estado de suscripción del almacenamiento local y habilita el formulario según ese estado.
2. `SingInViewModel.iniciarSesionConVerificacion` autentica por correo/contraseña con Firebase; consulta compras de Google Play mediante BillingClient y obtiene el primer `purchaseToken` disponible en esa respuesta.
3. Para un token no vacío, consulta sesiones activas con **ese token** bajo el UID compartido. Si pertenecen al mismo `device_id`, intenta liberar las sesiones antiguas; si pertenecen a otro dispositivo, rechaza el acceso y cierra la sesión Auth. Hay un respaldo por modelo del dispositivo para sesiones antiguas sin `device_id`. El flujo también contempla token vacío, sin esa comprobación.
4. Registra la sesión bajo `usuarios/{ownerUid}/sesiones`, con token, dispositivo y estado. Esto permite tokens diferentes dentro de la misma cuenta; no equivale a un UID Firebase por suscripción.
5. La selección de vendedor es otra dimensión. El código local ofrece `admon`, `seller1`, `seller2`, `seller3`; administra ocupación por dispositivo en `active_sellers`. No crear vendedores web adicionales en esta configuración ni suponer que el móvil admite un catálogo ilimitado.
6. Logout móvil libera sesión de suscripción y vendedor. El logout web debe cerrar únicamente su sesión web y cancelar sus consultas.

Las subcuentas web tienen identidades y permisos independientes. No consumen ni liberan una suscripción móvil, no reutilizan tokens Google Play y no se registran como vendedores activos. La licencia comercial del escritorio, si se requiere, es una decisión separada que no se infiere del número de sesiones móviles. Esta revisión describe el código de control de acceso local; no certifica validez de compras ni validación de licencias en servidor.

Limitación de identidad existente: quien conozca la contraseña principal puede autenticarse con el UID principal. Las reglas no distinguen al dueño humano de un operador móvil que use esas mismas credenciales. Los permisos de subcuentas se aplican a UIDs de colaboradores, no reducen el poder de la contraseña principal compartida. Si se necesita distinguirlos con una garantía más fuerte, se deberá diseñar una protección adicional del acceso administrativo; no imponer MFA global a la cuenta existente sin comprobar compatibilidad móvil.

## Colecciones compartidas existentes

Todas las rutas de esta tabla son relativas a `usuarios/{ownerUid}`.

| Ruta | Identificador | Escritura móvil | Uso y compatibilidad |
| --- | --- | --- | --- |
| Documento raíz | UID autenticado | merge | `email`, `ultima_conexion`. No añadir permisos que el cliente pueda autoasignarse. |
| `productos/{codigo}` | Código del producto | set con merge; updates | `codigo`, `nombre`, `valor`, `cantidad?`, `eliminado`, `ultima_modificacion`. Valor/cantidad son strings en el modelo móvil. |
| `clientes/{local}` | Nombre/clave `local` | set sin merge; updates | `local`, `cliente`, `direccion`, `telefono`, `eliminado`, `ultima_modificacion`. No cambiar el ID por editar el nombre sin un procedimiento explícito. |
| `ventas/{factura}` | Número completo de factura | set sin merge; updates; existe método de delete físico | Cabecera y productos agrupados; ver contrato de ventas. |
| `gastos/{expense_id}` | `EXP-{prefijo}-{consecutivo}` generado localmente | set con merge; updates | Contrato de gastos independiente del modelo web en español. |
| `sesiones/{autoId}` | ID automático | add; batches de updates | Suscripción y sesión del dispositivo móvil. El web no comparte su ciclo de vida. |
| `app_mobile_settings/active_sellers_config/active_sellers/{seller}` | Etiqueta de vendedor | set merge; update; escucha | `is_active`, `device_id`, `ultima_modificacion`. Seleccionar/liberar un vendedor afecta a la app móvil. |

También existe código antiguo para `users/{user}/sells` y `users/{user}/products`. No se encontraron llamadas a sus helpers fuera de su definición mediante búsqueda del código Java/Kotlin. No se deduce de ello que esas rutas carezcan de datos históricos; no borrarlas ni migrarlas automáticamente.

## Ventas móviles

Fuentes: `data/repository/SellFirestoreRepository.java:31,100,155`, `data/repository/SellRepository.java:626`, `ui/PrintBill.java:2160`, `Utilities/FacturaUtils.java` dentro del paquete `apps/james1/Probadorimpresorabluetooth` del móvil.

Ejemplo **sintético** con dos unidades cuyo importe total de línea es 60:

```json
{
  "factura": "1720000000000-7",
  "cliente": "Cliente de prueba",
  "fecha": "22-09-2026",
  "fecha2": "2026-09-22",
  "role": "seller1",
  "eliminado": false,
  "pagado": false,
  "subtotal": "60.00",
  "descuento": "5.00",
  "total": "55.00",
  "productos": [{ "nombre": "Producto de prueba", "cantidad": "2.0", "precio": "60.0" }]
}
```

En Firestore también se escribe `ultima_modificacion` con `serverTimestamp()`. Se omite del JSON ilustrativo porque no es una cadena de fecha.

- `factura` coincide con el ID en el escritor móvil. El lector web debe conservar `documentId` y `factura` por separado para detectar documentos históricos inconsistentes.
- `cantidad` es texto decimal; existen cantidades fraccionarias. No usar `parseInt` para calcular cantidades.
- `precio` es el importe completo de la línea antes del descuento global, **no** el precio por unidad. El móvil suma `Sell.getTotal()` para obtener subtotal y vuelve a descargar `precio` a la columna SQLite `total`.
- `descuento` es un importe absoluto. El batch suma descuentos guardados en las filas y calcula `total = subtotal - descuento`.
- Los productos móviles no requieren `subtotal`, `total` ni `productoCodigo` por línea. No se puede reconstruir con seguridad un código de producto a partir de un nombre duplicado.
- `fecha2` es fecha de negocio `yyyy-MM-dd`; tratarla como fecha civil sin conversión UTC. El origen de la fecha visual puede variar por flujo/idioma. No reinterpretar una fecha ambigua para inferir el día.
- El móvil interpreta ausencia de `pagado` como `true` al descargar. Algunas pantallas web lo interpretan como pendiente. Hasta decidir la política histórica, conservar `unknown` en el dominio web e informar la ausencia; no crear cobros automáticamente.
- No agregar abonos o auditoría exclusivamente dentro del documento móvil: el próximo `set` puede quitarlos. Guardarlos en documentos administrativos separados enlazados por `documentId`.

La lectura nueva preserva importes como texto decimal; no asume moneda ni escala y no usa esos valores para escribir. Registros malformados producen errores de contrato; no se convierten silenciosamente en ventas de importe cero.

### Diferencias actuales del escritorio

La separación `ventas` / `ventas_appweb` es deliberada según el dueño: el móvil es la entrada principal y el escritorio tiene su propia entrada de ventas. Se conserva esa separación en esta arquitectura. Ambas fuentes pueden alimentar un modelo de lectura agregado; no necesitan un DTO de escritura idéntico entre sí. La igualdad de nombres de campo no implica igualdad semántica.

- `SalesService` escribe en `ventas_appweb` usando IDs automáticos; su `idField: 'factura'` sustituye en lectura el número por el ID documental.
- El formulario `sale-modal` interpreta `precio` como unitario y escribe `subtotal`/`total` por línea; no guarda el tipo de descuento seleccionado. No se puede asumir que todo `descuento` web histórico sea absoluto.
- Las líneas nuevas de `ventas_appweb` conservan `codigo`, el mismo identificador estable de `productos/{codigo}`. El nombre es solo presentación. Las líneas web históricas sin `codigo` siguen siendo legibles, pero no se pueden atribuir a un movimiento de inventario automático.
- `DistributorsService` escribe en `ventas` con ID automático. Aunque tenga campos de cabecera parecidos, ese ID no cumple el contrato del escritor móvil.
- No mover `ventas_appweb` a `ventas`. Inventariar colisiones, descuento, códigos e impacto sobre stock para conciliación. La alternativa de una sola colección necesitaría una decisión posterior y pruebas del lector móvil; cambiar `role` a "usuario autorizado web" no incorpora autenticación verificable ni evita la descarga del móvil administrador.

Para nuevas ventas web, agregar en su esquema propio `createdByUid` obtenido de la identidad autenticada, `ownerUid`, origen y datos de auditoría validados por backend/reglas. No usar un nombre de vendedor como prueba de identidad. Las ventas existentes en `ventas` también pueden haber sido creadas por el escritorio de distribuidores, por lo que la colección demuestra el contrato/origen de lectura, no quién creó históricamente cada registro.

## Productos y clientes

Fuentes: `ProductFirestoreRepository.java:34,38,173`, `ProductRepository.java:321`, `ClientFirestoreRepository.java:29,32,127`, `model/Product.java`.

`sync_inventory` es una preferencia por dispositivo y vale `false` por defecto en `SyncMenuViewModel.kt:456`. Al subir un producto con esa preferencia desactivada se omite `cantidad` y se hace merge. Por tanto, cantidad ausente no significa stock cero ni error de negocio: significa cantidad no informada en ese documento.

Cuando se activa, el móvil escribe una **cantidad absoluta**, no un delta. La descarga de productos compara `ultima_modificacion` con SQLite; el borrado lógico se propaga. Las transacciones web protegen la concurrencia entre operaciones que participan de ese protocolo, pero no impiden una sobrescritura posterior del móvil con otra cantidad absoluta. Esto requiere una política explícita de inventario/conciliación.

Los clientes se suben reemplazando el documento. Metadatos exclusivos del escritorio deben vivir aparte. `eliminado` y `ultima_modificacion` deben conservarse para que los workers detecten cambios; el web debe preferir borrado lógico para datos compartidos.

## Gastos móviles

Fuentes: `ExpenseFirestoreRepository.kt:21,176`, `model/Expense.kt`, `Utilities/ExpenseCategoryUtils.kt` y `Utilities/ExpenseIdUtils.kt`.

| Campo | Tipo/formato |
| --- | --- |
| `expense_id` | String; usar ID documental como respaldo de lectura si falta |
| `description`, `notes` | Strings |
| `amount` | Número, a diferencia de los importes de ventas |
| `category` | Clave canónica en inglés; traducir solo en presentación |
| `date` | `yyyy-MM-dd HH:mm:ss` según modelo |
| `date2` | `yyyyMMdd` según modelo, distinto de `ventas.fecha2` |
| `role` | Etiqueta operativa; el lector móvil usa `admon` si falta |
| `eliminado` | Boolean |
| `ultima_modificacion` | Timestamp del servidor |

El modelo actual `shared/models/gasto.model.ts` (`descripcion`, `monto`, `categoria`, `fecha`) no es el DTO Firestore móvil. La pantalla de gastos todavía es un placeholder. Se requiere un adaptador de lectura y un escritor compatible, no cambiar el móvil para usar el modelo español.

No sumar `gastos` móviles y `gestionDiaria/.../gastos` administrativos indiscriminadamente: un mismo desembolso puede haberse registrado en ambos. Proponer vínculo por origen/documento y conciliación antes de unificar indicadores.

## Sincronización y consultas que deben seguir funcionando

- Productos: consulta `ultima_modificacion > último Timestamp`; listener de colección. Última sincronización local en preferencias.
- Clientes: lectura inicial de no eliminados; consulta incremental por Timestamp; listener de colección.
- Ventas: lectura total o incremental por Timestamp; filtros opcionales `role == selected_user`; sin filtro de role para `admon` o selección vacía. Listener de colección.
- Gastos: lectura total/incremental con filtro opcional de role y listener de colección.
- Sesiones: igualdad por `suscription_token` e `is_sesion_activa`; batches para liberar sesiones del dispositivo.
- Vendedores activos: lectura/escucha y escrituras de asignación bajo el UID principal.

Las reglas de seguridad no filtran resultados después de una consulta. Una nueva restricción por vendedor podría rechazar listeners completos que hoy necesita el móvil. Mantener explícitamente el acceso del UID principal a sus rutas móviles; no imponer claims, verificación de correo, campos nuevos ni App Check obligatorio como precondición de los flujos existentes sin validar la app distribuida.

## Nuevos datos administrativos propuestos

Propuesta, **no desplegada**:

- `negocios/{ownerUid}`: identidad y configuración del negocio (país, moneda, zona horaria y modo de inventario).
- `negocios/{ownerUid}/miembros/{memberUid}`: permisos, estado y datos mínimos de membresía; cambios autorizados por backend.
- Invitaciones y auditoría en colecciones administrativas explícitas; tokens no legibles por otros colaboradores.
- Metadatos/abonos web de una venta en documentos administrativos independientes, referenciando ruta/ID/origen de la venta.
- Datos móviles conservados en `usuarios/{ownerUid}/...`; no duplicarlos por colaborador.
- Ventas web conservadas en `usuarios/{ownerUid}/ventas_appweb`; no trasladarlas al móvil. Libro administrativo de movimientos con identificadores de producto por código e idempotencia. La fábrica física es una ubicación independiente; una carga parte de `factory` y llega a `shared-distributors` o `distributor:{id}`, una devolución retorna a fábrica y una pérdida no tiene destino de inventario. Este libro no sustituye ni recalcula `productos.cantidad` hasta que el móvil adopte el mismo contrato.

Las colecciones exclusivas ya existentes `roleData`, `dias`, `gestionDiaria` y sus subcolecciones, `proveedores`, `facturas-proveedor`/`pagos`, y `ventas_appweb` se inventariarán antes de cualquier reorganización. Mantener adaptadores para el histórico en lugar de cambiar todas sus rutas de una vez.

## Referencias externas

- [Condiciones de reglas de Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions): autenticación, permisos por documento y consultas compatibles.
- [Transacciones de Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions): unidades atómicas y reintentos. La sincronización SQLite propia de esta app se determina por su código, no por las garantías generales del SDK.
