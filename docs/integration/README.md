# Integración de admonDash con impresora

Estado vigente y continuidad: [cierre de pendientes](PENDING_COMPLETION_REPORT.md), con correcciones implementadas, pruebas ejecutadas y pendientes productivos explícitos. La auditoría inicial y los informes anteriores se conservan como antecedentes, no como estado actual.

Fecha de auditoría: 2026-09-22. Estado: primera entrega de análisis y contrato; integración completa pendiente.

## Objetivo y límites acordados

El escritorio permite al dueño gestionar su negocio con la misma cuenta de Firebase Authentication que usa en `impresora`. En este corte no se crean cuentas adicionales de Firebase Auth: dentro de la misma sesión se selecciona el usuario operativo y el cambio exige revalidar la contraseña del dueño. La aplicación móvil continúa funcionando sin cambios.

- `impresora`: consulta de código exclusivamente. No editar archivos, ejecutar builds, cambiar ramas, instalar dependencias ni publicar versiones.
- `admonDash`: implementación, documentación y pruebas locales autorizadas. Conservar los cambios del usuario existentes.
- Firebase: el dueño administra manualmente reglas, índices, funciones, migraciones, configuración y datos. Este proyecto no los desplegará, escribirá ni modificará; cuando el dueño comparta una regla o índice, solo se revisará y se propondrán instrucciones manuales.
- Emuladores y datos sintéticos: entorno de integración previo a producción. No usar sesiones, contraseñas, documentos de clientes o tokens de suscripción reales en fixtures.
- Compatibilidad: adaptar el escritorio al contrato móvil. No normalizar tipos, renombrar colecciones ni mover documentos compartidos en producción como efecto secundario de abrir una pantalla.

## Entregables de esta auditoría

1. [Contrato de datos observado](FIRESTORE_CONTRACT.md): rutas, formatos, autores de escritura y limitaciones de sincronización.
2. [Plan de implementación](IMPLEMENTATION_PLAN.md): siete etapas, arquitectura de subcuentas y orden de cambios.
3. [Pruebas y condiciones de entrega](TEST_PLAN.md): compatibilidad, aislamiento, concurrencia y publicación.
4. Capa de lectura pura en `frontend/src/app/core/integration/mobile-contract.ts`, con pruebas en `frontend/tests/contracts/mobile-contract.test.mjs`.
5. Lectores de solo consulta conectados al dashboard, gastos y reportes diarios móviles. Las pantallas muestran carga/error/origen y no realizan escrituras sobre rutas móviles.
6. [Plan de producto competitivo y continuidad](IMPLEMENTATION_PLAN.md#plan-de-producto-competitivo-y-continuidad): prioridades, descartes deliberados y próximo bloque para retomar el trabajo sin reconstruir el contexto.
7. Entorno Firebase aislado en `firebase/emulator/`, con reglas candidatas y pruebas locales de aislamiento. Se ejecuta contra `demo-admondash`, nunca contra `impresion-gratis`.

## Evidencia y alcance real de la revisión

| Repositorio | Ubicación | Revisión base |
| --- | --- | --- |
| Escritorio | `C:/Users/jeims/Documents/appwebs/admonDash` | `ae4e988` más cambios locales preexistentes |
| Móvil | `D:/codex/ImpresionBluetooth-clone` | `17412892aba3989925fe13cb877fd2796f67bd58` más cinco archivos nuevos de impresión preexistentes |

La configuración móvil local indica `versionName 5.8.6`, `versionCode 135`. No se comprobó que esa revisión sea exactamente la versión publicada ni que todos los dispositivos usen esa versión. Se revisaron autenticación, repositorios Firestore, sincronización SQLite, modelos y los flujos de ventas, productos, clientes, gastos, sesiones y selección de vendedor. No es una auditoría completa del código Android de impresión.

Comprobación al terminar esta entrega: misma revisión móvil, sin diferencias en archivos versionados y con los mismos cinco archivos nuevos preexistentes. No se ejecutó compilación ni instalación en ese repositorio. En el escritorio se conserva sin cambios el diff preexistente de cuatro archivos; esta entrega solo agrega documentación, instrucciones del proyecto y los nuevos lectores/pruebas de contrato.

Ambas configuraciones apuntan al proyecto `impresion-gratis` y al número `151013644579`. No se consultó la base real ni la consola de Firebase. Las reglas locales permiten acceso público; **no se verificó qué reglas están desplegadas**. La configuración pública de Firebase no es una credencial de administrador.

Estado local previo del escritorio: cuatro archivos modificados (`distributor-dashboard.component.ts`, `distributor.models.ts`, `distributors.service.ts`, `sales.service.ts`) y tres archivos sin seguimiento (dos guías y `data-cache.service.ts`). La revisión incluye ese trabajo sin reemplazarlo.

## Hallazgos que cambian el plan

| Hallazgo confirmado en código | Consecuencia |
| --- | --- |
| El móvil usa `usuarios/{uid}/ventas`; ventas web usa `ventas_appweb` | Separación intencional confirmada por el dueño. Conservar rutas y unificar reportes por origen, sin copiar ventas web a la descarga móvil. |
| `productos[].precio` en ventas móviles es el importe de la línea | Multiplicarlo de nuevo por cantidad infla los totales. El DTO web actual utiliza otra semántica. |
| El móvil usa `factura` como ID documental; distribuidores web crea IDs automáticos | Conservar ID y número de factura separados al leer. No renombrar documentos automáticamente. |
| Ventas y clientes se suben con `set` sin merge | Nuevos campos administrativos dentro de esos documentos pueden desaparecer en la siguiente subida móvil. |
| El inventario móvil sube cantidades absolutas, con sincronización opcional | Una transacción web por sí sola no garantiza stock global correcto ante móviles desconectados. |
| `seller1` y `admon` son preferencias/etiquetas bajo un mismo UID | No equivalen a roles seguros ni a subcuentas autenticadas. |
| Sesiones móviles contienen control de suscripción/dispositivo | El login web no debe activar, liberar ni apropiarse de esas sesiones. |
| Dashboard principal tiene datos fijos; gastos, reportes y usuarios son placeholders | La cobertura funcional es menor que lo que sugieren los nombres de los módulos. |
| Hay claves de caché por vendedor sin UID y sin limpieza global al cambiar cuenta | Posible exposición de datos de la cuenta anterior dentro del mismo navegador; corregir antes de habilitar subcuentas. |
| `SupplierInvoicesService.addPayment` usa una ruta documental como colección | El registro de pagos requiere corrección y pruebas de concurrencia, no solo completar la interfaz. |

## Decisiones confirmadas y pendientes

Confirmado por el dueño: móvil como entrada principal; ventas también desde escritorio; misma cuenta principal para móvil y web; varias suscripciones móviles bajo esa cuenta; la selección web usa los mismos identificadores `role` de operación del móvil, sin escribir `active_sellers`; no se crean subcuentas en Firebase Auth en esta etapa; `impresora` estrictamente en lectura; publicaciones a producción requieren autorización.

El dueño solicita ambos modos de inventario, central y por vendedor, seleccionables por negocio. País inicial: Colombia; valores iniciales propuestos COP, `es-CO` y `America/Bogota`, con configuración extensible para México y otros países. No mezclar monedas ni reconvertir importes históricos al cambiar país.

Pendiente de detalle de negocio: alcance inicial de permisos y tratamiento de cobros móviles anteriores sin campo `pagado`. La primera capa de lectura preserva esos datos sin adivinarlos. La coexistencia y el cambio entre modos de inventario requieren conciliación y reglas explícitas, no un interruptor que reescriba saldos existentes.

Pendiente de evidencia antes de publicar: revisión móvil realmente distribuida, reglas/índices desplegados, muestra anonimizada de variantes históricas, volumen de documentos, estado de copias de seguridad y configuración real de sincronización de los dispositivos. No solicitar contraseñas ni claves privadas en la conversación.

## Estado de los siete puntos

| Etapa | Estado al crear esta entrega |
| --- | --- |
| 1. Auditoría conjunta | Código de integración inspeccionado; falta contrastar con configuración y datos reales anonimizados. |
| 2. Contrato compartido | Documentado y primera capa de lectura probada con fixtures sintéticos; falta conectar los módulos. |
| 3. Seguridad y subcuentas | Arquitectura propuesta; reglas y backend pendientes de implementación y pruebas en emuladores. |
| 4. Compatibilidad/migraciones | Estrategia aditiva definida; ninguna migración ejecutada. |
| 5. Funcionalidad | Backlog identificado y ordenado; módulos pendientes de integración. |
| 6. Validación | Comprobaciones iniciales locales; pruebas integrales y de reglas pendientes. |
| 7. Publicación | No iniciada. |
