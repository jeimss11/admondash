# Auditoría, correcciones y condición de entrega

Informe histórico. Consultar primero el [cierre actualizado de pendientes](PENDING_COMPLETION_REPORT.md), que sustituye cifras y condiciones pendientes de este corte, incluido el timeout del emulador Functions ya resuelto en las pruebas posteriores.

Actualización posterior a este corte: el dueño pidió descuento web directo y se implementó transacción venta + `productos.cantidad`, con compensación en anulación y pruebas aisladas. El pendiente 1 de este informe histórico ya no describe esa función actual; continúa pendiente el inventario global por ubicaciones y la integración móvil. Ver [estado vigente](INVENTORY_MODEL_AND_WEB_STOCK.md).

Fecha: 2026-10-02, sesión local extendida al 2026-10-03 UTC.

## Resultado ejecutivo

Se implementaron correcciones, no solo documentación, en sesión, caché, inventario, ventas, clientes, proveedores y distribuidores. Las pruebas automatizadas enumeradas abajo pasan. Esto mejora la versión para pruebas controladas, pero **no certifica un lanzamiento completo de todos los módulos**.

No se ejecutaron escrituras, despliegues, migraciones ni cambios de reglas/índices en Firebase real. No se modificó la aplicación móvil. No se eliminaron ni reconciliaron documentos históricos del dueño.

## Correcciones implementadas

| Área | Problemas corregidos |
| --- | --- |
| Sesión | Selección operativa vinculada al UID; respuestas de reautenticación tardías no restauran una cuenta abandonada; eliminado método de registro Auth sin consumidores. Login evita envíos repetidos y no registra credenciales en consola. |
| Caché y contexto | Caché particionada por dueño y actor; al cambiar sesión se invalida también el resultado de cargas pendientes. Proveedores/facturas no conservan señales ni respuestas tardías del negocio anterior. |
| Inventario | Referencias de movimientos no sobrescriben evidencia anterior. Reintento idéntico no cambia su Timestamp; conflicto rechaza escritura. Correcciones comprueban el movimiento original. Cantidad ausente sigue desconocida. Exportación CSV real y protección de fórmulas. |
| Ventas y reportes | Validación de códigos, cantidades fraccionarias, importes y descuentos; total neto consistente; histórico ambiguo no se convierte en cero. Reintentos apuntan a la misma factura web. Detalle abre realmente; retirado Editar sin flujo implementado. Listeners cancelables y filtros conservados. |
| Clientes | Crear sobre un identificador existente no sobrescribe el documento móvil. |
| Proveedores | Facturas nuevas con identidad estable; pagos validan anulaciones, saldo y referencia. Una recarga fallida posterior al guardado no informa falsamente que la escritura falló. Deuda antigua no desaparece por un corte arbitrario de 30 días. Fechas Timestamp y pagos parciales se interpretan para balances. |
| Distribuidores | Corregidos prefijos de facturas y acumulación de abonos; pagos transaccionales con recibos de auditoría. Operación cerrada rechaza cambios administrativos. Revisión concurrente de operación verificada al cerrar. Facturas móviles del día observadas en tiempo real, incluidas las pagadas; errores de lectura bloquean el cierre. Flechas de cantidad avanzan unidades sin impedir fracciones manuales. Reapertura incrementa revisión y conciliaciones conservan historial. Los cierres históricos usan exclusivamente su resumen guardado; si falta, muestran No disponible en lugar de aproximaciones con apertura o ventas actuales. |
| Presentación y pruebas | Reparadas pruebas Angular con proveedores sintéticos y modo zoneless. Errores de dashboard/gastos no se presentan como métricas cero. Moneda inicial predeterminada COP junto a locale es-CO; no se reinterpretó el histórico ni se añadió otro país. |

## Verificación ejecutada

| Comprobación | Resultado |
| --- | --- |
| TypeScript aplicación, `tsc -p tsconfig.app.json --noEmit` | Aprobado |
| TypeScript pruebas, `tsc -p tsconfig.spec.json --noEmit` | Aprobado |
| Contratos/políticas frontend | 63 de 63 aprobados |
| Angular con ChromeHeadless y mocks sintéticos | 26 de 26 aprobados |
| Pagos distribuidores contra implementación real en Auth/Firestore emulados | 5 de 5 aprobados |
| Reglas candidatas del emulador | 6 de 6 aprobados; no valida las reglas de producción |
| Política auxiliar de membresías | 2 de 2 aprobados; flujo no activado en producción |
| Compilación TypeScript funciones | Aprobada; no se desplegaron funciones |
| Build Angular de producción | Aprobado; sin publicación |

Los cinco casos de pagos comprueban abonos simultáneos 30+40, doble pago completo, sobrepago concurrente, rechazo de operación cerrada y conservación del documento móvil. El proyecto usado fue exclusivamente `demo-admondash`, con Auth en localhost:9099 y Firestore en localhost:8080.

Las pruebas de interfaz no equivalen a un recorrido end-to-end completo de cada formulario. No se usaron credenciales reales ni se hizo un recorrido con escrituras en la cuenta del dueño. Las pruebas de reglas usan una propuesta local, no descargan ni certifican la configuración remota.

El emulador Functions no cargó sus definiciones dentro del timeout de descubrimiento. Por ello no se da por validada la suite de integración de membresías mediante Functions; ese flujo permanece desactivado y no se necesita para el selector operativo acordado.

El build conserva avisos no bloqueantes: imports Sass deprecados, bundle inicial aproximadamente 1.01 MB frente al aviso de 1 MB, y estilos de gestión diaria aproximadamente 12.93 kB frente al aviso de 10 kB. No se elevaron presupuestos para ocultar avisos.

## Pendientes que impiden anunciar todo como producción completa

1. **Inventario físico y venta web.** La venta web guarda en `ventas_appweb`, pero todavía no genera el descuento del libro físico administrativo. No debe presentarse como control completo del stock de fábrica/distribución. La app móvil sigue subiendo stock absoluto; falta su integración aditiva, en otra tarea y repositorio.
2. **Funciones protegidas para pruebas.** Edición del catálogo/stock compartido, libro y configuración de inventario, reapertura y conciliación siguen limitados al emulador o al UID de pruebas explícito. El build normal/producción no habilita ese UID. No se quitaron estas protecciones para aparentar funcionalidad.
3. **Ruta administrativa denegada con las reglas compartidas.** Configuración y libro de inventario usan `negocios/{ownerUid}/configuracion/inventario` y `negocios/{ownerUid}/inventario_movimientos`. Las reglas actuales del dueño permiten solamente `usuarios/{uid}/...`; por tanto esas lecturas/escrituras serán rechazadas. Requiere una decisión de contrato y aplicación manual del dueño, no un despliegue del agente.
4. **Permisos del selector.** Todos los operadores usan el mismo Firebase UID. El selector organiza navegación y responsabilidad, pero las reglas owner-only no separan permisos por operador ni garantizan auditoría inmutable frente a alguien con las credenciales del dueño. No es posible prometer aislamiento remoto por rol con ese modelo.
5. **Corte de caja móvil.** La revisión administrativa protege cambios web concurrentes, no impide que después del corte llegue una venta móvil offline. La diferencia se concilia; no se modifica ni congela la venta móvil. El efectivo esperado depende de evidencia de pagos, no de la valoración de mercancía cargada.
6. **Históricos y validación final.** Duplicados administrativos anteriores y registros incompatibles no fueron reparados en la nube. Falta contrastar con el dueño los datos reales y recorrer alta/venta/cobro/cierre/reapertura/stock en la cuenta de pruebas, agrupado al final como se acordó.

## Próximo bloque, sin perder continuidad

Prioridad: cerrar el contrato **venta web → movimiento administrativo de inventario**, con pruebas de concurrencia/reintentos y definición de qué ubicación vende. No mezclar fábrica con stock móvil ni descontar dos veces. Después resolver las protecciones y rutas que impedirían habilitar esos flujos, mediante una propuesta local explícita y recomendaciones manuales de Firebase. Finalmente ejecutar una única lista de aceptación con el dueño.

No está autorizado habilitar escrituras productivas, modificar Firebase ni editar impresora por esta hoja de ruta. Las recomendaciones de configuración se entregan en [FIREBASE_MANUAL](FIREBASE_MANUAL.md).

## Repetir pruebas locales

Desde `frontend`, con Node 22.15 o posterior:

```powershell
npm run test:contracts
node .\node_modules\typescript\bin\tsc -p tsconfig.app.json --noEmit
node .\node_modules\typescript\bin\tsc -p tsconfig.spec.json --noEmit
node .\node_modules\@angular\cli\bin\ng.js test --watch=false --browsers=ChromeHeadless
node .\node_modules\@angular\cli\bin\ng.js build --configuration production
```

Solo con Auth/Firestore del emulador `demo-admondash` encendidos, ejecutar secuencialmente (las pruebas de reglas limpian datos sintéticos): `npm run test:rules` desde raíz y `npm run test:payments:emulator` desde `frontend`. No ejecutarlas contra otro proyecto ni en paralelo sobre el mismo emulador.
