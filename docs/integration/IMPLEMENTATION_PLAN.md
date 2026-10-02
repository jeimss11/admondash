# Plan de implementación

Estado: propuesta concreta basada en código; etapa 1 terminada y etapa 2 en curso. El dashboard ya tiene lectura móvil de solo consulta para el día de negocio; no es una declaración de que la aplicación esté lista para producción. Alcance y evidencia en [README](README.md).

> Regla permanente: Firebase es administrado manualmente por el dueño. El trabajo del escritorio no desplegará ni modificará reglas, índices, funciones, migraciones, configuración o datos de Firebase. Cualquier revisión de esos elementos será únicamente consultiva y se entregará como instrucciones para que el dueño las aplique por su cuenta.

> Fechas y expansión regional: `ultima_modificacion` y demás metadatos de sincronización se escriben con Timestamp del servidor. La fecha de negocio (`fecha2`/`date2`) es una fecha civil usada para operar y consultar; el perfil inicial es Colombia (`es-CO`, `COP`, `America/Bogota`). El código admite perfiles futuros por negocio, pero activar un país nuevo requerirá una decisión controlada que preserve la interpretación de los datos históricos.

## Plan operativo vigente — acordado antes de nuevos ajustes

Esta hoja de ruta reemplaza cualquier prioridad histórica de este documento que la contradiga. Antes de abrir un bloque se revisarán los comentarios del dueño y las pantallas relacionadas; no se harán cambios aislados que rompan otro flujo.

> Decisión de validación: las pruebas que requieren intervención del dueño, una cuenta real de pruebas o creación manual de datos se agrupan para el bloque 10 de validación y entrega. Hasta ese corte se avanzará con análisis estático, pruebas de contrato, compilación y datos sintéticos aislados; el agente no generará datos, clics de escritura ni cambios en Firebase por cuenta propia.

| Bloque | Objetivo | Entregable y condición para pasar al siguiente |
| --- | --- | --- |
| 0. Prueba controlada | Recorrer el escritorio con la cuenta real aislada y reunir todos los cambios solicitados. | Lista única de incidencias, mejoras y decisiones de producto, priorizada por el dueño. No se cargan datos automáticos ni se toca la cuenta productiva. |
| 1. Fundamentos transversales | Corregir navegación, estados de carga/error/vacío, permisos visuales por rol, fechas Colombia y coherencia entre páginas. | Cada ruta conserva contexto al navegar y comunica claramente origen/limitación de sus datos. |
| 2. Usuarios y operación | Consolidar el inicio con la misma cuenta del móvil, selector de `admon`/vendedores, revalidación de contraseña y cierre de sesión web. | El selector no modifica sesiones, suscripciones ni `active_sellers`; futuros roles se admiten como identificadores sin inventar cuentas Auth. |
| 3. Catálogo y clientes | Completar productos, clientes y búsquedas usando códigos estables, borrado lógico e historial administrativo separado. | En pruebas, un producto creado/ajustado conserva el DTO móvil; fuera de pruebas no se habilitan escrituras compartidas sin una decisión explícita. |
| 4. Inventario físico | Finalizar la experiencia de fábrica, bolsa compartida y distribuidores individuales: inventario inicial, recepción, carga, devolución, pérdida, ajuste, conciliación y alertas. | Todo movimiento identifica producto por `codigo`, ubicación de origen/destino y responsable; fábrica nunca se mezcla con distribución ni se descuenta ciegamente `productos.cantidad`. |
| 5. Ventas y reportes | Guiar la venta web, asegurar su numeración, clientes, pagos, descuentos, idempotencia y reportes con separación móvil/web. | Una venta web queda solo en `ventas_appweb`, conserva `codigo` por línea y los reportes explican origen, totales y alertas de datos incompletos. |
| 6. Distribuidores y caja | Completar apertura, carga, devoluciones, gastos, cobros, cierre, reapertura con nota e historial de auditoría. | Administrador controla el ciclo; vendedores internos y revendedores externos no se confunden; ventas móviles se observan y concilian, no se modifican. |
| 7. Finanzas operativas | Corregir proveedores, facturas, pagos, gastos y saldos para que tengan una fuente verificable. | Sin montos ficticios ni doble conteo; pagos concurrentes y anulaciones tienen validaciones claras. |
| 8. Ajustes de interfaz y experiencia | Aplicar en conjunto las mejoras visuales y de facilidad de uso que se recojan durante la prueba: portátil, escritorio y tablet. | Navegación lateral consistente, formularios guiados, tablas/filtros/modales homogéneos y acciones comprensibles. |
| 9. Integración móvil futura | Aplicar, en una tarea separada sobre `impresora`, el contrato aditivo de inventario y códigos por línea descrito en `MOBILE_INVENTORY_INTEGRATION_PROMPT.md`. | Web y móvil emiten movimientos compatibles sin cambiar facturas, sesiones, suscripción ni datos históricos. El repositorio móvil no se modifica dentro de este proyecto. |
| 10. Validación y entrega | Repetir recorridos de prueba, pruebas de contrato, tipos, build y revisión de regresiones. | Lista de cambios resuelta, riesgos residuales explícitos y guía de uso; cualquier ajuste Firebase se entrega para aplicación manual del dueño. |

### Orden de trabajo después de la prueba

1. El dueño entrega todas las observaciones de la prueba en mensajes o una lista; se agrupan por bloque y se aclaran solo las decisiones que cambien datos o flujos.
2. Se implementa un bloque completo a la vez, revisando antes rutas, modelos y pantallas dependientes.
3. Se verifica ese bloque y se muestra en el navegador local antes de pasar al siguiente.
4. La aplicación móvil se aborda únicamente después de cerrar el diseño del bloque de inventario y con una tarea independiente, usando el prompt de integración ya preparado.

### Límites no negociables del plan

- El usuario de prueba solo permite probar acciones manuales de la interfaz con datos aislados. No autoriza cargas automáticas, migraciones ni escrituras desde scripts hacia Firebase real.
- El modo `start:real-test` está limitado al UID de pruebas configurado y nunca forma parte del build de producción.
- No se editan, compilan ni publican cambios desde el repositorio móvil durante el trabajo del escritorio.

## Decisiones de arquitectura

1. El contrato de `impresora` se conserva. La normalización ocurre dentro del escritorio; escribir un documento compartido exige un DTO compatible y pruebas explícitas.
2. Separar identidad de usuario (`auth.uid`), negocio (`ownerUid`) y vendedor (`role`). Nunca inferir permisos desde `role`, correo editable, parámetros de URL o un documento que el colaborador pueda modificar.
3. Una sola inicialización de Firebase para web; contexto de sesión reactivo y un solo layout controlado por router. Al cambiar usuario/negocio, cancelar consultas y vaciar cachés; toda clave incluye negocio y filtros. Una respuesta pendiente del negocio anterior no debe repoblar la caché nueva.
4. Separar DTO Firestore, modelo de dominio y vista. Importes de ventas y cantidades móviles siguen siendo strings al escribir; gastos siguen siendo números. El dominio debe usar aritmética decimal y la escala de moneda elegida, sin redondear cantidades fraccionarias por accidente.
5. El escritorio comienza con lectura integrada verificable. Activar escrituras por flujo solo después de comprobar compatibilidad, permisos e idempotencia. Una pantalla de lectura no crea vendedores ni documentos como efecto secundario.
6. Mantener datos administrativos que el móvil desconoce en documentos separados. No depender de que sobrevivan a un `set` móvil.
7. En esta etapa no se crean cuentas, invitaciones ni membresías nuevas en Firebase Auth. La sesión autenticada del dueño selecciona un `role` operativo compatible con el móvil; el cambio de selección revalida la contraseña y el navegador solo conserva la selección local. Una futura arquitectura de colaboradores con identidades separadas requerirá una decisión de producto y un backend aprobado.
8. `ventas_appweb` conserva las ventas del escritorio, con autor UID y origen verificables; `ventas` conserva el contrato usado por el móvil. La vista de negocio integra ambas fuentes. Los colaboradores web y las suscripciones/vendedores móviles son poblaciones independientes.
9. Configuración inicial de país: Colombia, COP, `es-CO`, `America/Bogota`. Persistir moneda y fecha de negocio en nuevos eventos administrativos. Preparar configuración por país para México y futuros mercados; un cambio de configuración no convierte ventas históricas ni sustituye requisitos fiscales de cada país.

## Selección operativa solicitada por el dueño

Flujo propuesto:

1. El dueño entra con su cuenta Firebase existente; su negocio corresponde a su UID.
2. En Usuarios selecciona el perfil operativo (`role`) que ya utiliza el móvil. Los perfiles iniciales conocidos son `admon`, `seller1`, `seller2` y `seller3`; el modelo admite futuros roles como texto sin inventar identificadores móviles.
3. Elegir o cambiar el perfil exige revalidar la contraseña de la misma cuenta Firebase. La contraseña no se guarda ni se escribe en Firestore.
4. El navegador conserva únicamente el `role` seleccionado en almacenamiento local; si se borra, se vuelve a pedir la selección. No se escribe en `active_sellers`, sesiones, tokens ni suscripciones móviles.
5. Esta selección organiza la interfaz y la auditoría del escritorio, pero no constituye una barrera de seguridad de Firestore porque todos comparten la misma identidad Firebase. Colaboradores con permisos realmente independientes quedan para una fase futura explícitamente aprobada.

No usar `createUserWithEmailAndPassword` en la sesión del dueño para crear colaboradores, pues cambia el usuario autenticado del cliente. La creación se hace exclusivamente desde una Function con Admin SDK y nunca desde el navegador.

Matriz inicial propuesta, ajustable por el dueño antes de activar colaboradores reales:

| Capacidad | Dueño | Administrador delegado | Operador | Consulta |
| --- | --- | --- | --- | --- |
| Consultar negocio | Sí | Sí | Según módulos asignados | Según módulos asignados |
| Ventas/clientes | Sí | Sí | Según permiso explícito | Lectura |
| Ajustar stock, cobros y gastos | Sí | Sí | Según permiso explícito | No |
| Proveedores/cierres | Sí | Sí | Según permiso explícito | Según módulos asignados |
| Exportar | Sí | Permiso específico | Permiso específico | Permiso específico |
| Invitar/revocar/cambiar permisos | Sí | No inicialmente | No | No |
| Sesiones/suscripciones del móvil | Acceso móvil legado | No | No | No |

Un permiso de lectura Firestore devuelve el documento completo: no se pueden ocultar con reglas campos financieros de un documento ya autorizado. Si se necesitan vistas parciales por empleado, crear proyecciones sanitizadas o servirlas por backend. El primer corte admite permisos por módulo/colección, no promete aislamiento por vendedor dentro del mismo UID móvil.

Las distintas suscripciones móviles controlan sesiones/dispositivos bajo el mismo UID; no crean membresías web. Al asignar un colaborador web no escribir en `sesiones` ni `active_sellers`. Registrar autorías web con su UID real. La contraseña principal compartida sigue otorgando la identidad del dueño; los permisos por subcuenta no resuelven esa limitación de identidad existente.

## Etapa 1 — Auditoría y línea base

Hecho: localizar ambos repositorios; registrar revisiones y cambios existentes; comparar configuración Firebase; inspeccionar escritores/lectores móviles; localizar pantallas de ejemplo, defectos y dependencias compartidas.

Pendiente antes de cerrar la auditoría de producción: contrastar versión distribuida y reglas/índices desplegados; revisar muestras anonimizadas y volumen. No confundir reglas locales públicas con prueba de exposición efectiva del proyecto remoto.

Entrega: contrato, matriz de diferencias, backlog de módulos y pruebas reproducibles. Sin conexiones a datos reales durante el análisis inicial.

## Etapa 2 — Contrato común dentro del escritorio

Orden de trabajo:

1. Lectores puros de ventas, productos, clientes y gastos con errores de contrato visibles y fixtures sintéticos. Primera parte de esta entrega.
2. Contexto `BusinessContext` con estados de carga/sin sesión/sin acceso/negocio activo. Capturar UID de negocio al iniciar cada operación.
3. Repositorios web por dominio, con consultas paginadas y conversión centralizada de Timestamp/fechas decimales. Nada de descargas completas por cada KPI.
4. Unir lectura de ventas móviles y web manteniendo el origen, sin contar dos veces registros detectados como duplicados. Los casos ambiguos se reportan para conciliación; no se eliminan.
5. Hecho para el corte diario móvil: sustituir datos de ejemplo del dashboard por indicadores con período, origen y estado de carga/error explícitos. Las ventas y gastos se filtran por fecha de negocio `America/Bogota`; clientes y productos son aún conteos de catálogo y sus pantallas deberán paginar el histórico.

Criterio de salida: una venta móvil sintética con cantidad 2, importe de línea 60 y descuento 5 aparece como total 55; una cantidad ausente aparece como no informada; cambiar de cuenta/negocio no conserva datos de la sesión anterior.

## Etapa 3 — Seguridad y entorno aislado

1. Entorno de emuladores Auth/Firestore/Functions con project ID `demo-admondash`; arranque local que falle de forma cerrada si el entorno de pruebas intenta usar el proyecto real. Configuración de producción seleccionada explícitamente.
2. Reglas candidatas fuera del archivo activo de producción hasta validar la matriz móvil y colaboradores. Dueño mantiene sus accesos existentes; colaborador solo accede a rutas/módulos autorizados; acceso anónimo y entre negocios denegado.
3. Selector operativo local con revalidación de contraseña, limpieza de caché y compatibilidad estricta con los `role` existentes. No crear ni administrar Firebase Auth desde el escritorio.
4. Protección de datos administrativos de miembros, tokens, sesiones móviles y suscripción. No aplicar un wildcard que conceda todo el árbol móvil a cualquier colaborador.
5. Pruebas de aislamiento en reglas y backend antes de conectar la UI de usuarios.

Criterio de salida: dueño y móvil legado funcionan con fixtures fieles; el selector no altera sesiones ni roles activos móviles; borrar el almacenamiento local requiere una nueva selección; las rutas administrativas solo se muestran para `admon` en la interfaz.

## Etapa 4 — Compatibilidad y migración controlada

No se necesita una migración destructiva para empezar: conservar rutas y tipos, introducir datos administrativos de forma aditiva.

1. Herramienta de diagnóstico de lectura con reporte de variantes: IDs vs facturas, fechas, tipos, valores inválidos, `pagado` ausente, descuentos web ambiguos, ventas duplicadas y cantidades ausentes.
2. Si el diagnóstico exige migración: modo simulación por defecto, snapshot de entrada, mapeo determinista, cursor por lotes, ID de operación, reejecución idempotente y reporte antes/después.
3. Antes de ejecutar en real: copia verificada, prueba de restauración, ventana coordinada con sincronización móvil y plan de conciliación de escrituras nuevas. Un rollback de datos no debe sobrescribir ventas legítimas posteriores a la migración.
4. Revisar histórico `ventas_appweb` y documentos con auto-ID para agregación y conciliación. Conservar ambas colecciones; no exponer ventas web a descarga móvil ni reducir stock de nuevo por incorporarlas a reportes.

Criterio de salida: simulación y fixture histórico preservan documentos originales; todos los casos ambiguos están resueltos o aislados para consulta. No se ejecuta migración real como parte de un build o arranque.

## Etapa 5 — Completar los flujos funcionales

| Orden | Área | Trabajo concreto | Prueba de aceptación |
| --- | --- | --- | --- |
| 1 | Sesión y navegación | Un layout, espera de Auth, cancelación al logout, errores de acceso, limpieza de caché | Cambio dueño A → dueño B sin mostrar datos de A |
| 2 | Dashboard/ventas en lectura | Datos móviles reales vía adaptadores; origen, fecha civil y descuento correcto | Totales coinciden con fixtures, sin datos simulados |
| 3 | Usuarios | Crear cuenta manual, listar, revocar y asignar permisos | Colaborador usa su correo y contraseña propia; nunca necesita la principal |
| 4 | Clientes/productos | CRUD compatible, IDs estables, borrado lógico, historial separado | Descarga móvil interpreta el documento sin cambiar tipos |
| 5 | Inventario | Ambos modos seleccionables por negocio, central y por vendedor; movimientos auditables y conciliación | Cambio de modo controlado, sin duplicar saldos y con casos offline probados |
| 6 | Ventas web | Conservar `ventas_appweb`; autor UID real, descuento absoluto, idempotencia, venta + stock atómicos donde aplique | Doble clic/reintento no duplica venta ni descuento de stock |
| 7 | Distribuidores/caja | Separar operación, carga, devoluciones, pérdidas, cobros y cierre; eliminar productos ficticios y escrituras al leer | Reabrir/consultar no crea documentos; cierre verificable y auditado |
| 8 | Gastos | Integrar `gastos` móviles, categorías traducidas, filtros y permisos; distinguir gastos de ruta | Gasto móvil aparece una vez en indicadores |
| 9 | Proveedores/pagos | Corregir lectura de factura, pagos transaccionales y límites; reducir fuentes duplicadas de saldo | Dos pagos simultáneos no pierden abonos ni exceden saldo por carrera |
| 10 | Reportes/configuración | Períodos, filtros, exportación segura y paginada, moneda/zona horaria | Reporte reconcilia ventas/cobros/gastos, sin tratar error como total cero |

La numeración fiscal/legal de facturas, impuestos, multimoneda, nuevas integraciones de pago y cambios en la app móvil no están definidos en esta solicitud; no inventar su comportamiento. Una referencia única de venta no equivale por sí sola a una factura fiscal válida.

### Inventario y offline: restricción que permanece

El escritor móvil existente puede subir un saldo absoluto después de una transacción web. Tampoco todas las líneas de venta incluyen un código de producto estable. Un trigger que descuente cada venta podría duplicar el descuento que ya efectuó el móvil. Por ello, no diseñar un supuesto stock global exacto sumando ciegamente ventas ni aplicando transacciones solo al web.

La fábrica es siempre una ubicación física independiente. El dueño eligió dos alternativas para la mercancía que sale de ella: en **bolsa compartida** (valor histórico `central`), varios distribuidores usan una misma existencia administrativa; en **por distribuidor** (valor histórico `by-seller`), cada carga se asigna a un distribuidor identificable. Las cargas, devoluciones y pérdidas registran origen y destino en un libro administrativo separado; no se reescribe `productos.cantidad` como si fuera el stock de todas las ubicaciones. Este modelo no cambia el inventario que presenta el móvil hasta que el móvil adopte el mismo libro de movimientos.

El cambio de modo requiere saldo inicial aprobado, fecha efectiva, operaciones abiertas cerradas/conciliadas y registro de auditoría; conserva el histórico bajo el modo original. Si un vendedor no informa códigos de producto en ventas móviles, exigir una vinculación no ambigua o revisión humana antes de atribuir movimientos automáticamente. Ningún modo puede afirmar que los dispositivos offline implementan un protocolo que hoy no tienen.

## Etapa 6 — Validación y operación

Seguir [TEST_PLAN](TEST_PLAN.md). Reparar la suite existente, añadir pruebas de contrato, reglas, concurrencia y UI. Validar con cuentas/datos de prueba y una aplicación móvil ya compilada en un entorno autorizado; no recompilar ni cambiar `impresora` para simular compatibilidad.

Rendimiento: medir consultas y documentos leídos por pantalla, paginar históricos, evitar suscripciones duplicadas, diseñar índices por consultas reales y definir agregados solo cuando el volumen los justifique. Documentar límites/errores; no fijar una promesa de escala sin carga y métricas.

Entrega operativa: build reproducible, checks de CI, instrucciones de emuladores, errores visibles, bitácora de auditoría sin credenciales/datos sensibles en logs, monitorización de errores/permisos/coste y manual del dueño.

## Etapa 7 — Preparación y publicación

Preparar un paquete revisable: código, diferencias de reglas e índices, funciones, resultado de pruebas, informe de datos, copia/rollback, configuración requerida y lista de riesgos residuales. La autorización explícita del dueño sobre ese paquete es el paso final antes de publicar.

Desplegar por capacidades, comprobar que la app móvil sigue leyendo y escribiendo, observar errores de permisos y activar rollback si corresponde. No habilitar App Check obligatorio ni reglas estrictas de esquema sobre escritores antiguos sin una matriz de compatibilidad satisfactoria.

## Plan de producto competitivo y continuidad

Actualizado: 2026-09-25. Este es el orden de producto acordado después de comparar el escritorio con patrones actuales de punto de venta y administración. El objetivo no es replicar un ERP completo: es que el dueño pueda entender y operar su negocio en pocos pasos, mientras el móvil conserva su función de captura principal.

### Propuesta de valor y navegación

El producto se organiza alrededor de cinco áreas visibles: **Resumen**, **Operación**, **Inventario**, **Finanzas** y **Equipo**. Proveedores, distribuidores y reportes pertenecen a esas áreas, no son productos independientes. Cada pantalla debe mostrar datos verificables, su origen y la acción siguiente; no debe aparentar funcionalidades que todavía no tienen una fuente segura.

La diferenciación práctica será: operaciones móviles y de escritorio visibles sin mezclar su origen; cierre y conciliación diaria; inventario consciente de la sincronización móvil; y colaboradores con permisos propios, sin tocar licencias, sesiones o vendedores del móvil.

El escritorio es una extensión administrativa del mismo negocio móvil, no un sistema aislado: el dueño y los colaboradores autorizados podrán editar los datos compartidos cuyo contrato móvil esté verificado. Se mantienen separados únicamente las sesiones/tokens/asignaciones internas del móvil, los metadatos administrativos que el móvil podría reemplazar y las ventas web en `ventas_appweb`, conforme a la separación acordada.

### Hecho en el corte actual

- Contrato de lectura y pruebas sintéticas para ventas, productos, clientes y gastos del móvil.
- Contexto de negocio del dueño y lectores Firestore de solo consulta.
- Dashboard, gastos y reportes diarios móviles con fecha de negocio `America/Bogota`, estados de carga/error y advertencias de contrato.
- Interfaz coherente para inicio de sesión, navegación, clientes, inventario, ventas y ficha de cliente; se retiraron métricas, pagos e historiales ficticios.
- Ventas de escritorio siguen en `ventas_appweb`: las nuevas ventas guardan factura lógica basada en timestamp, fecha civil de Colombia, `ownerUid`, `createdByUid`, `source: web`, descuento con semántica explícita, total de cabecera y el `codigo` de cada producto. El código —no el nombre— es la clave de integración con el catálogo. No descuentan ni sobrescriben el stock compartido del móvil.
- El formulario de venta web distingue stock móvil conocido de cantidad no informada: no oculta ni bloquea un producto porque `cantidad` esté ausente, y nunca descuenta ese campo al guardar la venta.
- El reporte de inventario agrupa las salidas de `ventas_appweb` por `codigo` y las presenta separadas del saldo móvil observado. Las líneas históricas sin código quedan advertidas para revisión; no se les inventa una equivalencia por nombre ni se modifica `productos.cantidad`.
- Reportes leen `ventas` y `ventas_appweb` por separado y presentan subtotales por origen más un consolidado de lectura; no copian ventas entre colecciones ni convierten totales inválidos en cero.
- Distribuidores: las operaciones administrativas ya distinguen vendedores móviles internos de revendedores externos; el cierre puede reabrirse solo con nota y una revisión auditable. La conciliación guarda referencias y decisiones administrativas sin modificar ventas móviles.
- Distribuidores/caja: los roles internos se descubren por actividad móvil observada sin imponer el patrón `sellerN`; cartera solo incorpora una venta móvil con `pagado: false` explícito y total válido. Las escrituras administrativas nuevas conservan el día operativo y añaden `ultima_modificacion` con hora de servidor. La caché local se invalida después de aperturas, cierres y movimientos para no mostrar datos desactualizados.
- Distribuidores/caja: cargas, devoluciones, pérdidas y gastos se mantienen como evidencia auditada; no hay eliminación física desde el escritorio. Las cantidades administrativas conservan decimales positivos. Cancelar un pago modifica el estado administrativo conservando su comprobante y nunca toca la venta móvil.
- Distribuidores/caja: los listeners de una operación se cancelan y reemplazan al cambiar de operación; no se acumulan suscripciones ni lecturas duplicadas durante el uso diario.
- Distribuidores/caja: el efectivo esperado ya no infiere ventas desde cargas, devoluciones o pérdidas. Solo toma apertura, cobros administrativos confirmados en la operación y gastos; el valor de mercancía se presenta como inventario, no caja.
- Distribuidores/caja: el cierre, su detalle y el histórico emplean la misma base de caja. Un cierre nuevo conserva `cashFormula: known-cash-v1`; un resumen histórico sin esa marca se muestra como valor guardado, sin reescribir ni reinterpretar registros anteriores.
- Distribuidores/caja: cancelar un cobro administrativo exige nota, conserva la factura y crea evidencia de auditoría en la misma operación; no se permite simular la cancelación de una venta móvil sin un registro administrativo persistido.
- Distribuidores/caja: los nuevos resúmenes de cierre y reaperturas guardan marca de auditoría con `serverTimestamp`; la fecha de cierre legada se conserva como referencia visual y no se usa para ordenar sincronización.
- Distribuidores/caja: una confirmación de pago móvil solo retira su fila temporal observada; no oculta ni altera comprobantes o auditorías administrativas con la misma factura.
- Finanzas/proveedores: una factura nueva empieza pendiente y sin abono implícito; cada pago usa la transacción idempotente ya existente. El indicador mensual suma comprobantes de pago del período, no el importe completo de una factura que cambió de estado.
- Finanzas/proveedores: listas y tableros usan una única política de saldo. Una anulada no genera deuda y los abonos parciales disminuyen el pendiente de manera consistente; no se reescriben facturas históricas.
- Finanzas: la lectura de gastos móviles y el reporte diario usan la fecha civil operativa y excluyen registros eliminados; se mantienen en solo lectura para no interferir con el flujo móvil.
- UX: la barra lateral mantiene un comportamiento distinto y estable en escritorio, tablet y móvil; la capa oscura solo se usa en el menú móvil. Las pantallas de proveedores/facturas muestran error y reintento, en vez de confundir un fallo de carga con una lista vacía.
- UX: el modal de venta valida carrito, factura y descuento dentro del flujo, sin alertas bloqueantes del navegador. Las tarjetas de producto y las acciones rápidas se pueden operar mediante teclado; los formularios y tablas conservan su diseño acordado.
- Inventario: configuración administrativa Colombia/COP para modo central o por vendedor, con umbral validado y nota de cambio. Las escrituras directas de `productos` desde el escritorio están bloqueadas hasta completar el libro de movimientos, backend y reglas; esto evita que una sincronización móvil absoluta sea sobrescrita por la web.
- El libro administrativo de inventario se alimenta en el emulador desde las cargas, devoluciones y pérdidas de una operación. Cada evento conserva la operación origen, responsable, distribuidor, modo configurado y cantidad sin reescribir el catálogo móvil; su ID determinista permite reintentos sin duplicar el movimiento. El reporte de inventario lo muestra por separado del stock observado del móvil.
- El libro de inventario modela la fábrica, una bolsa de distribución compartida y saldos individuales por distribuidor. Las entradas a fábrica, cargas, devoluciones y pérdidas tienen origen/destino explícito; el reporte no infiere ubicaciones por nombre ni presenta como saldo físico una fábrica sin inventario inicial conciliado.
- Inventario: la política de corrección ya compensa cargas, devoluciones, pérdidas y ajustes mediante un nuevo movimiento enlazado al original y con nota obligatoria. No borra ni oculta evidencia; la persistencia y pantalla de corrección quedan pendientes de su conexión auditada.
- Inventario: el reporte ya identifica recepciones de fábrica, cargas, devoluciones, pérdidas y ajustes. Permite registrar inventario inicial o una recepción únicamente en el emulador/cuenta local de pruebas autorizada, con producto por código, referencia y nota; el libro administrativo sigue separado de `productos.cantidad`.
- Inventario: desde el reporte de pruebas, una carga, devolución, pérdida o ajuste puede corregirse con una nota obligatoria. Se registra el movimiento inverso, enlazado al original; no se edita ni elimina la evidencia. Las recepciones de fábrica requieren conciliación física específica y no se revierten desde esa pantalla.
- Inventario: el reporte alerta por ubicaciones administrativas en negativo como evidencia pendiente de conciliación; no las llama stock móvil negativo ni modifica saldos automáticamente.
- Entorno `demo-admondash` creado con Auth Emulator (`9099`), Firestore Emulator (`8080`) y UI local (`4000`), separado de `firebase.json` y de cualquier proyecto real.
- Reglas candidatas y cinco pruebas de aislamiento con datos sintéticos: anónimo bloqueado, dueño legado permitido, colaborador limitado, autoasignación bloqueada y revocación efectiva.
- Functions Emulator con backend callable para crear invitaciones, aceptar por correo verificado y revocar membresías; una prueba integral verifica el ciclo completo sin persistir el código de invitación.
- Pantalla Usuarios conectada únicamente en el modo Angular `emulator`; en los entornos normales falla de forma cerrada hasta una autorización de despliegue. La invitación genera un enlace de aceptación cuyo código queda en el fragmento local de la URL, no en la consulta enviada al servidor.
- Al iniciar sesión en el emulador, una subcuenta activa resuelve el `ownerUid` mediante una Function callable y consulta el negocio del dueño con su propio `actorUid`. La revocación deja de resolver esa membresía. No se usan ni se modifican sesiones, tokens o vendedores activos de `impresora`.
- Pantalla de aceptación con estados de enlace inválido, sesión requerida y activación; su ruta se revisó visualmente en el navegador integrado. El ciclo completo con dos cuentas sintéticas también confirmó invitación, aceptación y revocación visible; el miembro revocado queda marcado y sin acción disponible. Los datos de prueba permanecen solo en `demo-admondash`.
- Revisión de compatibilidad y predespliegue documentada en [SECURITY_COMPATIBILITY_REVIEW](SECURITY_COMPATIBILITY_REVIEW.md): no apto para publicar aún; no se modificó ni desplegó configuración de producción.

Esto no certifica seguridad de producción, permisos por colaborador, conciliación de inventario ni contabilidad completa.

### Corte verificable 2026-09-26

- `tsc --noEmit`, 38 pruebas de contrato y `ng build` completan correctamente en el escritorio.
- Las Functions del emulador compilan con la resolución de membresía; la prueba aislada aprobó el ciclo completo de invitación, aceptación, resolución del `ownerUid` y revocación. Seis pruebas de reglas candidatas aprobaron: anónimo bloqueado, dueño legado preservado, colaborador limitado, autoasignación bloqueada, revocación efectiva y libro administrativo inmutable creado solo por el dueño. Los emuladores fueron detenidos al terminar.
- El build conserva advertencias preexistentes: uso redundante de `?.` en el detalle de operación, migración pendiente de Sass `@import` y presupuesto de estilo de Gestión de Día. No bloquean el bundle, pero deben resolverse antes de una publicación de calidad.
- No se desplegaron reglas, funciones, índices, migraciones ni datos de Firebase de producción; el móvil no fue editado ni compilado.

**Para que este corte pueda activarse en producción aún faltan decisiones/autorización explícita:** revisar y desplegar backend/reglas de membresías, habilitar el libro administrativo de inventario con sus reglas y pruebas de concurrencia, y aprobar el paquete de publicación con plan de rollback. Esos puntos no se pueden resolver de forma segura solo desde el navegador.

### Prioridades de entrega

| Prioridad | Capacidad | Alcance concreto | Condición de aceptación |
| --- | --- | --- | --- |
| P0 | Seguridad y equipo | Emuladores aislados; reglas candidatas; backend de invitaciones, membresías, revocación, permisos por módulo y auditoría | Un colaborador usa su UID propio, no puede autoasignarse permisos ni acceder a otro negocio; el móvil legado conserva acceso. |
| P0 | Integridad y sesión | Limpieza de caché/listeners al cambiar negocio; origen y autor real para nuevos datos web; diagnóstico de variantes históricas | Cambiar de dueño/miembro no deja datos del negocio anterior; una pantalla de consulta no escribe datos. |
| P1 | Cierre diario de caja | Apertura, movimientos, gastos vinculados, efectivo esperado, diferencia, responsable, cierre inmutable/auditado | Un cierre identifica su fuente, autor y diferencia; no altera ventas ni sesiones móviles. |
| P1 | Reporte unificado | Leer `ventas` y `ventas_appweb` como fuentes separadas; detectar y mostrar posibles duplicados; filtros de período y exportación paginada | Un total indica qué origen incluye; ninguna venta se cuenta dos veces por inferencia. |
| P1 | Inventario por movimientos | Modos central y por vendedor, libro administrativo, carga/devolución/pérdida/ajuste con motivo y conciliación | El modo no reescribe el saldo móvil como si fuera transaccional; toda diferencia queda pendiente de revisión. |
| P1 | Venta web segura | Idempotencia, autor UID, origen, descuento con semántica explícita y protocolo de stock compatible | Reintentos o doble clic no duplican la venta; no se escribe en `ventas` móvil. |
| P2 | Clientes útiles | Historial consolidado por origen, notas administrativas separadas, frecuencia de compra y saldos solo con fuente comprobable | La sincronización móvil no borra metadatos administrativos y nunca se muestran cobros simulados. |
| P2 | Proveedores y compras | Órdenes, recepción parcial, factura, pagos concurrentes y cuentas por pagar con una sola fuente de saldo | Dos pagos simultáneos no exceden saldo ni pierden abonos. |
| P2 | Alertas y exportación | Stock bajo confiable, diferencia de caja, registros incompatibles, gastos inusuales y exportaciones con permiso | Una alerta explica dato, origen y acción; no alerta sobre stock desconocido. |

### Funciones deliberadamente fuera del primer producto

- Contabilidad completa, nómina, CRM de marketing, e-commerce y logística multiubicación avanzada.
- Facturación fiscal, impuestos por país y multimoneda: requieren decisiones legales y de producto; Colombia inicia en COP sin reinterpretar históricos.
- Automatizar descuentos de stock a partir de todas las ventas móviles: el móvil puede subir saldos absolutos y algunas líneas no incluyen código estable.
- Pantallas de gráficos, pagos, saldos, clientes recurrentes o inventario exacto sin una fuente y cálculo verificables.
- Reutilizar `role`, `active_sellers`, sesiones o tokens de suscripción del móvil para permisos web.

### Próximo bloque de trabajo

1. Corregir la base de datos administrativa de proveedores/pagos y distribuidores antes de ampliar sus interfaces; no exponer sus cálculos heredados como información financiera fiable.
2. Integrar ventas web en un modelo de reporte con origen, conciliación y autoría antes de ofrecer totales de negocio completos.

Para Distribuidores se confirma que los internos corresponden a vendedores móviles existentes y los externos a revendedores; solo administradores operan aperturas/cierres/aprobaciones. Los cobros son administrativos desde el escritorio y los cierres se pueden reabrir únicamente con nota y auditoría, preservando la versión anterior. Consultar ventas no crea distribuidores y las ventas móviles no se eliminan ni marcan pagadas desde el escritorio.

La numeración es una condición de la etapa de **ventas web**, no un bloque adelantado: antes de crear una venta del escritorio se preservará el patrón legible de `impresora`, `timestamp-consecutivo`. El móvil conserva su prefijo por instalación y consecutivo local; el escritorio reservará una serie web por negocio de forma atómica en Firebase, guardada solo en `ventas_appweb` con `origen: web` y `authorUid`. No se reinterpretan ni modifican las facturas móviles.

Ninguno de estos pasos autoriza un despliegue de reglas, funciones, índices, migraciones o datos en Firebase de producción. La autorización explícita del dueño sobre una entrega revisable continúa siendo obligatoria.
