# Cierre de pendientes y condición de entrega

Corte: 2026-10-02, con verificaciones locales terminadas el 2026-10-03 UTC. Esta hoja prevalece sobre las cifras y pendientes de los cortes históricos anteriores; no autoriza despliegues ni cambios móviles.

## Resultado

Se trabajó en código y pruebas de sesión, navegación, ventas, inventario, distribuidores y proveedores. La versión tiene una base más sólida para aceptación controlada; **no se declara toda la aplicación lista para producción ni libre de riesgos**. No se usaron credenciales reales ni se ejecutaron formularios contra la cuenta del dueño.

No se modificaron datos, reglas, índices, funciones o configuración en Firebase real. No se modificó `impresora`. Los archivos de reglas/índices de producción retirados siguen retirados; `firebase.json` continúa siendo solo Hosting. Las reglas locales restantes pertenecen exclusivamente al emulador sintético `demo-admondash`.

## Cambios implementados en este bloque

| Área | Correcciones y comportamiento |
| --- | --- |
| Entornos | Validación antes de inicializar Firebase: producción no acepta excepciones de cuenta de prueba/emuladores; el entorno sintético exige `demo-admondash` y endpoints locales. No cambia el servidor remoto. |
| Sesión y navegación | Guard espera restauración inicial de Auth, ignora contexto del UID anterior y deja de esperar al cerrar sesión. Timeout de contexto sin conceder ruta restringida. Navbar reacciona a navegación sin dejar suscripciones. Logout muestra fallos, evita doble envío y solo libera selección tras salir correctamente. |
| Usuarios | Cambio operativo no permite otra selección/liberación durante verificación. Contraseña se limpia; errores de conexión y límite de intentos no se presentan falsamente como contraseña incorrecta. No se crean cuentas Firebase. |
| Centro de control | Importes de ventas/gastos incompatibles se muestran como No disponible, no cero ni suma parcial presentada como completa. Suma decimal exacta y límite de exponentes de históricos malformados. |
| Ventas | Se conserva descuento directo transaccional de stock por código, reintentos y anulación compensatoria única. Estadísticas usan la lista ya observada, descartan respuestas tardías y no conservan importes aparentemente válidos después de un error. |
| Inventario | Umbral coherente entre catálogo, tablero y reportes. Editarlo no reinicia país, moneda ni zona horaria. Cambio de modo bloqueado después del inicio del libro, con configuración y primer movimiento coordinados transaccionalmente. Reportes rechazan movimientos incompatibles, ofrecen reintento y actualizan vista zoneless. Código de producto no cambia al editar; consulta por ID. |
| Distribuidores | Recibos de cobro idempotentes, rechazo de reutilización con otro importe y reintento reconocido incluso tras cierre. No se cobra una factura cuyo estado móvil de pago sea desconocido. Movimientos administrativos conservan identidad y revisión; doble envío bloqueado. El cierre verifica los documentos móviles observados, además de la revisión administrativa. |
| Acciones incompletas | Exportación de facturas filtradas de distribuidores ahora genera CSV real con protección de fórmulas y estados desconocidos. Retirada acción de reporte ficticia y borrado vacío de distribuidores; su historial móvil no se borra. Logs de documentos completos retirados en esas pantallas. |
| Guardados parciales | Operación y reflejo en libro de inventario aún son dos transacciones. Si el primero se guarda y el segundo falla, el mensaje identifica lo persistido, conserva formulario/referencia y permite reintentar sin duplicar. No recargar ni crear otra referencia hasta resolverlo. |
| Proveedores | Pago transaccional probado con concurrencia, reintentos, saldo, cambio de sesión y proveedor inexistente. Fechas nuevas usan servidor en recibo y resumen `pagosPorId`, conservando `pagos[]` histórico. Modal protegido ante respuestas de otra factura y errores de lectura posteriores al guardado. Archivar ejecuta borrado lógico, no un botón ficticio. Crear factura devuelve evidencia persistida y no fechas/autor ficticios. |
| Recursos de interfaz | Bootstrap CSS/JS se sirve desde dependencia local; se retiraron las importaciones duplicadas del CDN. Sass usa carga compatible sin los avisos de `@import` anteriores. Título e idioma de la página corregidos. |

Las pruebas automatizadas comprueban estas condiciones concretas; no representan un recorrido end-to-end completo con la app móvil ni certifican reglas remotas.

## Pendientes que no se pueden cerrar unilateralmente

1. **Inventario físico global y por ubicación.** Está preparada la propuesta de fábrica separada, bolsa compartida de distribución y ubicaciones individuales; el global sería su suma, no un saldo adicional. Faltan confirmar asignaciones, conteo inicial y transición. No se inventaron repartos ni se migró información. Ver [modelo propuesto](INVENTORY_MODEL_AND_WEB_STOCK.md).
2. **Sincronización móvil.** El móvil puede subir cantidades absolutas y reemplazar el saldo descontado por la web. Una transacción web no elimina ese riesgo. Hace falta una tarea autorizada independiente para el móvil, con eventos/reintentos y política offline; no se implementó aquí. El [prompt móvil](MOBILE_INVENTORY_INTEGRATION_PROMPT.md) se debe revisar contra el contrato final antes de ejecutarlo.
3. **Habilitación administrativa fuera de pruebas.** Libro/configuración de inventario, ciertas ediciones de catálogo, reapertura y conciliación siguen protegidos. Las rutas `negocios/{ownerUid}/...` están denegadas por las reglas owner-only compartidas, que cubren únicamente `usuarios/{uid}/...`. Resolver contrato/rutas y revisar una diferencia manual precisa antes de habilitar esos flujos. No abrir toda la base ni quitar protecciones para aparentar entrega completa.
4. **Permisos remotos por operador.** Con una sola cuenta Auth todos comparten el mismo UID. El selector limita la interfaz e identifica autoría, pero no concede aislamiento seguro entre operadores ni auditoría inmutable frente a quien tenga esas credenciales. Resolverlo exigiría otro mecanismo de identidad/autorización aprobado; no crear nuevas cuentas contra el acuerdo vigente.
5. **Alta ilimitada de operadores.** El selector ofrece actualmente `admon`, `seller1`, `seller2`, `seller3`; el tipo de `role` y distribuidores no se limitan a tres. Aún falta el flujo aprobado para crear/configurar perfiles operativos adicionales y sus permisos sin alterar sesiones ni suscripciones móviles.
6. **Guardado compuesto de distribución.** Hace falta atomicidad de ficha operativa y libro físico, o recuperación persistente entre recargas. El reintento actual conserva su identidad solo mientras permanece la pantalla; el aviso de guardado parcial reduce duplicaciones, no equivale a esa garantía completa.
7. **Aceptación final e históricos.** Falta el recorrido conjunto con el dueño en su cuenta de prueba. No se repararon duplicados o importes históricos en la nube. Proveedores antiguos con saldos agregados ausentes/incompatibles requieren conciliación antes de crear, pagar o anular facturas; no se recalculan ni se asumen cero automáticamente. Ventas móviles que lleguen offline después de un cierre necesitan conciliación, no edición silenciosa del corte.

Compras con recepciones parciales, notas de crédito e impresión web adicional no se anuncian como implementadas. Son capacidades de producto que requieren especificar flujos; no deben confundirse con los pagos y ventas actuales.

## Lista final para el dueño

Estas pruebas reales se dejan juntas al final, según lo acordado. **Las ejecuta el dueño**, sabiendo que guardar en la configuración normal usa Firestore real; localhost no convierte una base real en un emulador.

1. Entrar con la cuenta de prueba, seleccionar operador, recargar, cambiar operador y salir; comprobar que no quedan datos de otra sesión.
2. Crear una venta web con un producto identificado por código y saldo informado; verificar factura y descuento exacto de stock. Reintentar sin cambiar referencia. Anular y comprobar devolución una sola vez; no esperar devolución de históricos sin impacto registrado.
3. Comparar reportes de ventas móvil/web, descuentos y estados pagado/no pagado/desconocido. Buscar factura por el sufijo después de `-`.
4. Abrir operación, registrar carga, devoluciones, pérdidas y gastos; comprobar facturas del día, cobros y efectivo esperado. La valoración de mercancía no es efectivo cobrado.
5. Cobrar parcialmente y cerrar con nota; revisar resumen histórico guardado. Reapertura/conciliación solo cuando estén autorizadas y habilitadas para esa cuenta.
6. Crear proveedor/factura, abonar dos veces y completar pago; probar rechazo de sobrepago y revisar deuda/recibos. Archivar proveedor conserva histórico.
7. Verificar consultas administrativas únicamente después de la revisión manual de rutas/reglas. Si aparece un índice faltante, entregar el error y consulta exactos; no crear índices indiscriminadamente.

No repetir intencionalmente pruebas simultáneas agresivas en datos reales: esos casos ya se prueban con datos sintéticos en emuladores.

## Firebase manual

Instrucciones y límites en [FIREBASE_MANUAL](FIREBASE_MANUAL.md). No hay un índice nuevo de producción demostrado necesario por estas pruebas. La transacción venta web + producto usa documentos por ID dentro de las rutas ya permitidas del dueño.

Además, `.firebaserc` tiene como proyecto CLI predeterminado `admondashboard`, mientras el SDK frontend apunta a `impresion-gratis`. No se cambió ni se publicó ninguno. Antes de un futuro Hosting, el dueño debe verificar explícitamente proyecto/destino; no asumir que el destino CLI es el de los datos.

## Evidencia de verificación

Los resultados finales se registran aquí y en [TEST_PLAN](TEST_PLAN.md). Ejecutar las suites que limpian el emulador de forma secuencial y solo con `demo-admondash`; nunca con producción.

| Verificación final | Resultado |
| --- | --- |
| TypeScript aplicación y specs | Aprobados |
| Contratos/políticas frontend | 79/79 |
| Angular ChromeHeadless con servicios sintéticos | 55/55 |
| Transacciones reales SDK en Auth/Firestore emulados | 28/28: stock 8, distribuidores 9, proveedores 6, inventario 5 |
| Reglas candidatas exclusivamente locales | 6/6 |
| Backend auxiliar de membresías | 6/6 integración emulada + 2/2 políticas; no activado en el producto ni desplegado |
| TypeScript Functions | Aprobado |
| Build Angular producción local | Aprobado, sin publicación |

Son 176 casos aprobados distribuidos entre estas suites, **no 176 recorridos reales de negocio**. Inicialmente fallaron proveedores de pruebas Angular por ausencia de modo zoneless; se corrigieron y la pasada final completa aprobó. Los mensajes de errores sintéticos emitidos en casos negativos no representan fallos pendientes de esa pasada.

Build: quedan avisos no bloqueantes de bundle inicial ~1.09 MB frente al aviso de 1 MB y estilos gestión diaria ~12.93 kB frente al aviso de 10 kB. No se elevaron presupuestos para ocultarlos. El CLI del emulador avisa sobre la versión del backend auxiliar `firebase-functions`; no se instaló una actualización potencialmente incompatible ni se cambió producción.

Al cerrar se detuvo el emulador iniciado por esta revisión y se comprobó que sus puertos no permanecían escuchando. El bundle de producción no contiene el UID de excepción de la cuenta local de pruebas. No se detuvo ningún servidor de desarrollo ajeno.

Comandos de repetición desde `frontend`:

```powershell
npm run test:contracts
node .\node_modules\typescript\bin\tsc -p tsconfig.app.json --noEmit
node .\node_modules\typescript\bin\tsc -p tsconfig.spec.json --noEmit
node .\node_modules\@angular\cli\bin\ng.js test --watch=false --browsers=ChromeHeadless
node .\node_modules\@angular\cli\bin\ng.js build --configuration production
```

Solo con el emulador demo encendido: `npm run test:stock:emulator`, `npm run test:payments:emulator`, `npm run test:suppliers:emulator`, `npm run test:inventory:emulator`. La suite de reglas raíz y Functions limpian datos sintéticos: no ejecutarlas junto con las anteriores. El backend auxiliar se verifica desde `functions` con `npm test` después de compilarlo y arrancar su emulador. No conectar estas pruebas a un proyecto real.
