# Revisión de seguridad y compatibilidad — predespliegue

Fecha: 2026-09-25. Alcance: implementación local y emuladores `demo-admondash`. Esta revisión no autoriza ni realiza ningún despliegue.

## Resultado

**No apto para publicar aún.** El diseño de subcuentas está validado en aislamiento, pero faltan una matriz de pruebas con la aplicación móvil distribuida, una propuesta de reglas de producción revisable y autorización explícita del dueño.

## Evidencia local

- Las reglas candidatas viven en `firebase/emulator/firestore.rules` y solo están referenciadas por `firebase.emulator.json`.
- `firebase.json` conserva la configuración de producción existente y no referencia Functions ni reglas candidatas.
- Pruebas de reglas: 5/5 correctas. Cubren bloqueo anónimo, acceso legado del dueño, lectura limitada del colaborador, bloqueo de autoasignación/otro negocio y pérdida de acceso al revocar.
- Prueba integral de Functions: 1/1 correcta. Cubre crear invitación, aceptar con correo verificado y revocar sin guardar el código en texto plano.
- Recorrido visual con cuentas sintéticas: invitación, aceptación y revocación mostrada como `revocado` con su acción deshabilitada.

## Compatibilidad preservada

- El dueño conserva acceso a todo `usuarios/{ownerUid}/...`, incluidas rutas móviles de sesiones, sincronización y vendedores activos.
- Ninguna función de subcuentas modifica Firebase Auth del dueño, tokens de suscripción, sesiones móviles ni `active_sellers`.
- Los colaboradores usan UID propio; sus permisos no reutilizan el campo móvil `role`.
- Las ventas móviles continúan en `ventas`; las ventas web permanecen en `ventas_appweb`.

## Bloqueos antes de producción

1. La regla activa `firestore.rules` está abierta (`allow read, write: if true`). No debe reemplazarse ni desplegarse automáticamente.
2. Las reglas candidatas solo se probaron con fixtures sintéticos. Falta validar una versión distribuida de `impresora` en un entorno autorizado, incluyendo login, sincronización incremental, sesiones y vendedor seleccionado.
3. Faltan pruebas de consultas paginadas reales para cada permiso de colaborador: las reglas de Firestore rechazan consultas cuyo conjunto potencial excede el permiso.
4. Las funciones candidatas requieren revisión de límites, monitorización, gestión de secretos/configuración y estrategia de despliegue antes de estar disponibles fuera del emulador.
5. La interfaz de subcuentas falla cerrada fuera de `environment.emulators`; ese comportamiento debe mantenerse hasta autorizar una entrega concreta.

## Próxima decisión requerida más adelante

Cuando el dueño solicite preparar publicación, se debe entregar un paquete revisable con diferencias exactas de reglas, Functions, índices, pruebas móviles autorizadas, plan de rollback y riesgos residuales. Solo después podrá pedirse autorización explícita para desplegar.
