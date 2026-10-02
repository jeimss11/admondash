# Auditoría inicial: proveedores, pagos y distribuidores

Fecha: 2026-09-25. Alcance de lectura: servicios actuales del escritorio. No se modifican documentos existentes ni la app móvil.

## Resultado

Los cálculos financieros de proveedores y pagos **no son todavía una fuente fiable para decisiones de negocio**. El módulo de distribuidores mezcla rutas administrativas con escrituras en la colección móvil `ventas`; se debe aislar antes de ampliar su interfaz.

## Hallazgos prioritarios: proveedores y pagos

1. `SupplierInvoicesService.addPayment` intenta leer una factura mediante una colección creada desde una ruta de documento. Esa lectura no representa una factura válida y puede fallar antes de registrar el pago.
2. El pago lee fuera de una transacción, duplica pagos en un arreglo embebido y actualiza totales con `increment`. Dos pagos simultáneos pueden calcular el mismo saldo y producir pagos/totales inconsistentes.
3. No existe límite que impida registrar un pago mayor al saldo pendiente. El cálculo de `pendiente` cambia según el tipo declarado de pago, no según el importe validado.
4. La deuda se calcula desde dos fuentes: campos agregados del proveedor (`deuda_total`, `pagado`, `pendiente`) y facturas. Las dos pueden divergir tras reintentos, borrados o concurrencia.
5. Borrar un proveedor es físico y puede dejar facturas huérfanas. Borrar una factura también elimina pagos y altera agregados sin bitácora.
6. Fechas y pagos tienen variantes: algunos valores provienen de Timestamp y otros de `new Date()`; no existe esquema ni idempotencia de operación.

## Hallazgos prioritarios: distribuidores

1. El servicio actual escribe ventas internas y externas directamente en `usuarios/{uid}/ventas` con IDs automáticos. Esto no cumple el patrón de documento/factura que consume el móvil.
2. Hay consultas de ventas de distribuidores que descargan colecciones completas como alternativa, además de filtros por `role`. El campo `role` es operativo móvil, no autorización web.
3. El módulo crea distribuidores desde ventas y contiene productos de ejemplo; abrir o consultar no debe crear datos ni presentar inventario ficticio.
4. `gestionDiaria`, `dias` y subcolecciones de cargas, retornos, gastos y facturas son administrativos, pero carecen de una separación formal de operación, conciliación y cierre inmutable.
5. El servicio de distribuidores tiene cambios locales preexistentes de otro trabajo. No se editará hasta aislar el conjunto de cambios y acordar la corrección.

## Orden de corrección

1. Definir un libro administrativo de facturas/pagos con un saldo derivado de movimientos inmutables, operación idempotente y transacción/backend para aceptar un pago.
2. Convertir borrados de proveedores y facturas en estados administrativos/auditoría; no borrar pagos como efecto lateral.
3. Sustituir cálculos de interfaz por un lector único que derive saldos de los movimientos confirmados.
4. Separar distribuidores de `ventas` móviles: conservar lectura compatible, pero no crear ni editar ventas móviles desde el módulo administrativo.
5. Diseñar la conciliación de operación diaria antes de habilitar cierre o métricas financieras como definitivas.

Hasta completar estos pasos, las pantallas pueden mostrar datos como históricos/operativos, pero no deben afirmar saldos, pagos, caja ni inventario exactos.
