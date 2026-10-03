# Inventario: descuento web vigente y propuesta por ubicaciones

Decisión del dueño: continuar pendientes y, por ahora, descontar la venta web directamente del inventario actual. Este documento sustituye las afirmaciones históricas de que las ventas web nunca cambian `productos.cantidad`.

## Implementado en el escritorio

- Cada venta nueva se guarda en `usuarios/{ownerUid}/ventas_appweb/{id}` y descuenta `usuarios/{ownerUid}/productos/{codigo}.cantidad` en una sola transacción.
- Código de producto, no nombre, determina el documento. Códigos repetidos en una venta se agrupan.
- Se lee la existencia vigente durante la transacción; cantidad desconocida, malformada, producto eliminado o stock insuficiente bloquean toda la venta. No se convierten datos ausentes en cero.
- Cantidades decimales se calculan exactamente y se guardan como texto; `ultima_modificacion` usa Timestamp del servidor. La precisión admitida es hasta 18 posiciones enteras y 18 decimales; formatos no admitidos se rechazan, no se redondean silenciosamente.
- Repetir la misma factura/contenido no descuenta otra vez. Reutilizarla con otro contenido o después de anularla genera conflicto.
- La venta conserva su evidencia `stockImpact` con cantidades y saldos antes/después. La anulación conserva el documento y agrega compensación una sola vez, validando esa evidencia contra las líneas originales.
- La compensación suma las cantidades al saldo vigente; **no restaura una foto anterior del saldo**, que borraría cambios concurrentes.
- Ventas históricas sin evidencia no provocan devoluciones ficticias ni descuentos retroactivos. Una venta nueva con descuento de stock no se edita: se anula y se registra una nueva.
- La interfaz informa el descuento, bloquea cantidad no informada y conserva carrito/factura si el guardado falla. El acumulado de salidas web es informativo: no se vuelve a restar del saldo.

Al probar manualmente en Firebase real, estas son las rutas que la aplicación escribirá. El agente no ejecutó esas escrituras: las pruebas utilizan únicamente el proyecto local `demo-admondash`.

Con las reglas owner-only que compartió el dueño estas rutas ya están autorizadas al UID principal. Este flujo no necesita cambiar reglas ni crear un índice compuesto: lee documentos por ID. No se cambió ninguna regla o índice remoto ni se habilitaron otros ajustes de catálogo/libro fuera de pruebas.

## Límite de esta etapa

El móvil existente sube cantidades absolutas y puede reemplazar un saldo después de una venta web. La transacción evita carreras entre escritores que participan en ese protocolo, pero no elimina esa sobrescritura posterior ni garantiza sincronización global offline. No desactivar automáticamente sincronización móvil ni modificar sus preferencias para resolverlo.

`productos.cantidad` es una existencia compartida observada; no se la renombra como «fábrica», «stock de seller1» o «total global» sin un conteo y decisión explícitos. Por ahora no se resta simultáneamente del libro administrativo: hacerlo sería mezclar dos bases aún no conciliadas.

## Propuesta futura: ubicación independiente del usuario y del canal

**Propuesta, no migración implementada ni decisión ya aprobada.** Mantener un catálogo por código y existencias por ubicación. Un usuario vende desde la ubicación asignada, usando móvil o web; la aplicación utilizada no crea otro inventario.

| Ubicación | Mercancía | Quién podría utilizarla |
| --- | --- | --- |
| Fábrica | Lo que sigue físicamente en casa | Administrador; venta directa si se permite explícitamente |
| Bolsa compartida | Mercancía que usan varios vendedores sin asignación individual | Vendedores móviles/web asignados a esa bolsa |
| Vendedor individual | Mercancía entregada y bajo responsabilidad de un vendedor | El mismo vendedor, tanto desde móvil como desde web |

El administrador puede consultar todas las ubicaciones, pero su perfil `admon` no significa que posea todo el stock. Su venta también necesita una ubicación origen explícita, con una predeterminada configurada. Igual criterio para cualquier futuro vendedor web.

La vista «global» es un **total calculado**, no otra existencia física: fábrica + bolsa + saldos individuales + tránsito propio cuando exista. Los movimientos internos cambian ubicaciones sin cambiar el total; ventas, pérdidas y consumos sí reducen el total. No sumar dos veces mercancía entregada a un vendedor.

Ejemplo: fábrica 100 + bolsa 30 + vendedor A 20 = global 150. Transferir 10 de fábrica a A deja fábrica 90, A 30 y global 150. Vender 3 desde A deja A 27 y global 147.

Se pueden ofrecer tres políticas simples de asignación: todos venden desde una bolsa, cada vendedor usa su existencia, o una combinación explícita. El canal (`web`/`mobile`), el responsable (`role`/identidad) y la ubicación se registran por separado. El modo histórico `central` del libro actual significa bolsa de distribución compartida, no mezclarla con fábrica.

Para revendedores externos distinguir propiedad: mercancía ya vendida al revendedor deja de contar como stock propio; una entrega en consignación conserva propiedad del negocio y requiere ubicación y condiciones diferenciadas. No cambiar automáticamente esa interpretación por la etiqueta «externo».

## Integración móvil y transición necesarias

1. Acordar ubicaciones iniciales y asignaciones. Hacer un conteo inicial por código, sin copiar la misma cantidad a todas las ubicaciones ni repartir automáticamente el histórico.
2. Guardar movimientos únicos: recepción, transferencia/carga, venta, devolución, pérdida y ajuste con nota; cada uno enlazado a factura/operación, código, origen/destino, responsable y fecha del servidor.
3. Aplicar movimiento y saldo de la ubicación conjuntamente; repetir un identificador no aplica dos veces el movimiento. Vista global deriva de esas mismas ubicaciones.
4. Cambiar el móvil en una tarea independiente para emitir ese mismo contrato y dejar de reemplazar esos saldos con cantidades absolutas. No deducir movimientos automáticamente de ventas móviles históricas sin códigos verificables.
5. Para móviles offline, preferir existencias previamente asignadas al vendedor/dispositivo; compartir libremente las últimas unidades entre varios dispositivos offline no permite garantizar disponibilidad inmediata. Alternativamente, exigir conexión para confirmar una venta contra la bolsa compartida. Esa política requiere decisión del dueño.
6. Activar por fases, con fecha de corte y conciliación de cargas/ventas pendientes. Conservar modo original y evidencias históricas; no convertir retrospectivamente todo a un esquema nuevo.

Las rutas definitivas y cualquier recomendación de reglas se revisan con el dueño y se documentan en [FIREBASE_MANUAL](FIREBASE_MANUAL.md). Él aplica manualmente los cambios que apruebe. El repositorio móvil continúa siendo solo lectura en esta tarea.

## Verificación de este bloque

Pruebas nuevas de política, interfaz y transacción real en el emulador cubren cantidades fraccionarias, última unidad concurrente, reintento, fallo sin venta parcial, anulación concurrente, históricos, evidencia inconsistente y cambio de sesión. Resultados finales se registran en el plan de implementación.

Resultado del bloque: 67/67 contratos frontend, 30/30 pruebas Angular y 8/8 pruebas transaccionales de stock en el emulador aprobados; TypeScript app/spec y build de producción aprobados. El build mantiene los avisos Sass y presupuestos de tamaño descritos en el informe anterior. No equivale a aceptación end-to-end con el móvil ni a certificación de stock global.

Para repetir el bloque transaccional, iniciar Auth/Firestore locales de `demo-admondash` y ejecutar desde `frontend`: `npm run test:stock:emulator`. La suite utiliza datos sintéticos bajo un UID local propio, no credenciales reales. No ejecutar pruebas que limpien todo Firestore en paralelo sobre ese emulador.
