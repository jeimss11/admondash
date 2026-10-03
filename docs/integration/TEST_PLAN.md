# Pruebas y criterios de entrega

## Resultado vigente: cierre de pendientes

Ver [informe actual](PENDING_COMPLETION_REPORT.md): 79 contratos, 55 Angular, 28 transacciones reales SDK emuladas (8 stock, 9 distribuidores, 6 proveedores, 5 inventario), 6 reglas candidatas y 8 casos auxiliares Functions/políticas aprobados. TypeScript app/spec/Functions y build producción aprobados. Total 176 casos automatizados, no recorridos end-to-end reales. Las cifras siguientes se conservan como historia. Sigue pendiente la aceptación agrupada del dueño y los bloqueos productivos descritos en el informe.

Último bloque: descuento directo de inventario en venta web. Resultado: 67/67 contratos, 30/30 Angular y 8/8 pruebas de transacción de stock contra implementación real en `demo-admondash`, más tipos app/spec y build aprobados. Ver [detalle y límites de stock](INVENTORY_MODEL_AND_WEB_STOCK.md). Las cifras anteriores de 63/26 son el corte previo.

## Evidencia actual — 2026-10-02

Resultados y límites en [DELIVERY_REVIEW_2026-10-02](DELIVERY_REVIEW_2026-10-02.md): 63 contratos frontend, 26 pruebas Angular, 5 pagos emulados y 6 pruebas de reglas candidatas aprobados; TypeScript app/spec y build de producción aprobados. Se repararon los defectos de specs descritos en la línea base histórica. Esto no sustituye la aceptación real del dueño ni certifica reglas remotas, inventario sincronizado o todos los flujos end-to-end.

Ninguna prueba de esta primera entrega usa Firebase de producción. Fixtures sintéticos, basados en escritores/lectores móviles; no son una muestra de la base real.

## Validación manual diferida

Por decisión del dueño, las pruebas que dependan de su cuenta de pruebas, credenciales, creación de documentos o criterio operativo se ejecutarán juntas en el cierre de entrega. Mientras tanto, el desarrollo continúa con pruebas automatizadas, compilación y fixtures sintéticos. El agente no ejecutará formularios de escritura ni realizará cambios en Firebase real durante esa etapa.

## Línea base

- `tsc -p tsconfig.app.json --noEmit`: pasa en la revisión inicial.
- Build Angular de producción: pasa el 2026-09-22 ejecutando el CLI local fuera del sandbox, que antes bloqueaba resolución de archivos. Bundle inicial 989.70 kB (transferencia estimada 222.76 kB). Advertencias: optional chaining innecesario, `@import` Sass deprecado y estilo de gestión diaria de 11.90 kB frente a aviso de 10 kB.
- `tsc -p tsconfig.spec.json --noEmit`: falla por import `./inventory` inexistente en `inventory.spec.ts`; defecto preexistente.
- `app.spec.ts`: conserva expectativa `Hello, frontend`; las pruebas de creación carecen de varios mocks/proveedores. Corregirlas antes de declararlas una barrera de regresión.
- No hay validación de reglas, CI ni e2e existentes que demuestren compatibilidad móvil.
- Las pruebas del contrato nuevas son independientes de Angular, Firebase y Chrome. Ejecutar desde `frontend`: `npm run test:contracts` (Node 22.15+). No sustituye la suite Angular ni pruebas de reglas.
- Resultado de esta entrega: **20/20 pruebas de contrato aprobadas**; TypeScript de aplicación aprobado después de añadir los lectores. El runner Node 22.15 avisa que `strip-types` es experimental y que el paquete no declara ESM; no se cambió el sistema de módulos de toda la aplicación por ese aviso.

Los lectores exponen inconsistencias como issues o `MobileContractError`, mantienen la precisión textual y no efectúan cálculos financieros, concilian saldos ni validan totales contra líneas todavía. No tienen escritores ni están conectados a las pantallas existentes. Preservar esa distinción al informar el alcance de las pruebas.

## Matriz mínima

| Grupo | Casos obligatorios | Qué demuestra |
| --- | --- | --- |
| Contrato de ventas | Cantidad >1 y fraccionaria; `precio` = total línea; descuento absoluto; factura distinta del ID; `pagado` ausente | Interpretación fiel y anomalías visibles |
| Productos/clientes | `cantidad` omitida; borrado lógico; código/local estable; campos desconocidos | No transformar cantidad desconocida en cero ni modificar DTO original |
| Gastos | `amount` numérico; fechas compactas; categorías desconocidas; role ausente | Lectura compatible con otro esquema y conservación del histórico |
| Datos inválidos | NaN/Infinity/texto de dinero ambiguo; días imposibles; tipos inesperados | Errores explícitos; no métricas falsas |
| Sesión | Restauración tras refresh; logout; cambio de cuenta/negocio durante una petición | No mostrar ni cachear datos del contexto anterior |
| Dueño/móvil | Lectura/escritura en cada ruta inventariada, filtros e incremental Timestamp, listeners, batches y borrados requeridos | Las reglas candidatas aceptan el protocolo existente |
| Colaboradores | Invitación, verificación de correo, aceptar dos veces, expiración, rechazo de otro correo, revocación | Alta y baja de membresía seguras |
| Aislamiento | Anónimo, otro UID, otro negocio, edición de membresía, negocio manipulado en URL, sesiones móviles | Negación por backend/reglas, no solo por UI |
| Campos privados | Permisos por módulo; documentos con campos sensibles | Sin asumir que reglas ocultan campos de documentos permitidos |
| Venta/stock | Dos escritores web simultáneos; doble clic; timeout tras commit; stock insuficiente | Atomicidad e idempotencia web |
| Offline móvil | Subida tardía de cantidad absoluta; venta resincronizada; `set` elimina extras | Límites conocidos, conciliación y no duplicar efectos |
| Inventario configurable | Central y por vendedor, saldo inicial, operaciones abiertas, cambio de modo y trazabilidad histórica | El modo elegido no cambia silenciosamente el stock del móvil ni duplica saldos |
| Suscripciones móviles | Mismo UID con tokens/dispositivos distintos; login/logout web mientras hay sesiones móviles | Web no consume/libera suscripciones, no ocupa vendedores ni cambia sesiones móviles |
| País | COP/es-CO/America/Bogota inicial; futura configuración MXN sin reinterpretar registros COP | Moneda de origen y fecha civil conservadas |
| Cobros/proveedores | Dos abonos simultáneos, monto negativo/cero/excesivo, fallo parcial | Saldos consistentes y auditoría |
| Fechas | Medianoche en zona del negocio, fin de mes/año, horario de verano | Cortes de negocio sin desplazamiento UTC |
| Histórico | `ventas` y `ventas_appweb`, colisiones y descuentos ambiguos | No duplicar indicadores ni reescribir documentos sin revisión |
| Escala | Historial creciente, paginación, pantallas abiertas/cerradas repetidamente | Límites de consultas/listeners y memoria medidos |

## Pruebas móviles sin modificar el repositorio

Las pruebas automáticas del escritorio pueden reproducir peticiones con los DTO/query shapes observados usando emuladores, pero eso no equivale a ejecutar la app publicada. Para cerrar compatibilidad se requiere la versión móvil distribuida en un entorno de prueba autorizado. No cambiar `google-services.json` ni los workers de `impresora` como atajo.

Si no existe una compilación móvil configurada para pruebas, registrar esa limitación: las pruebas de contrato y emuladores cubren el protocolo, no toda la interacción del dispositivo. Coordinar una validación controlada con datos/cuenta de prueba antes de autorizar publicación.

## Diagnóstico y migración

El diagnóstico inicial de datos debe ser solo lectura, acotado por negocio y mostrar conteos de anomalías sin imprimir información personal. La migración debe admitir simulación, repetición, interrupción/reanudación y rollback que preserve escrituras posteriores. Cada modificación real necesita una correspondencia verificable con el reporte aprobado.

## Definición de terminado

- El dueño usa su cuenta existente y ve indicadores procedentes de datos, no ejemplos.
- Colaboradores con cuentas propias acceden únicamente a módulos autorizados del negocio elegido.
- DTO compartidos conservan rutas, IDs, tipos y semántica móvil; no se modificó el repositorio `impresora`.
- Reglas candidatas rechazan anónimos/otros negocios y permiten todas las peticiones móviles requeridas; backend valida operaciones privilegiadas.
- Build y suites relevantes pasan; los resultados y limitaciones quedan registrados.
- Stock/cobros tienen política de consistencia definida y pruebas acordes a las capacidades reales de la app móvil.
- No hay migración automática en arranque, ni cambios silenciosos en datos históricos, ni credenciales en frontend/logs/fixtures.
- Copia, recuperación, monitorización y guía operativa verificadas antes del permiso final de despliegue.

Un conjunto de pruebas de lectura aprobado no convierte por sí solo el sistema en seguro o escalable. La entrega completa requiere cerrar cada grupo pertinente de esta matriz.
