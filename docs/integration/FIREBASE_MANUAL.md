# Administración manual de Firebase por el dueño

Actualizado: 2026-10-02.

Cierre posterior: [PENDING_COMPLETION_REPORT](PENDING_COMPLETION_REPORT.md). Se validó nuevamente que la raíz no contiene reglas/índices de producción y `firebase.json` solo contiene Hosting. No hubo cambios remotos. El nuevo bloqueo de modo de inventario y los recibos transaccionales se comprobaron exclusivamente en `demo-admondash`; esas pruebas no justifican publicar reglas candidatas ni crear índices indiscriminadamente.

Antes de un futuro Hosting, verificar proyecto/destino: `.firebaserc` conserva `admondashboard`, mientras el SDK de datos frontend usa `impresion-gratis`. No se modificó ni publicó ninguno. Compilar un build local no despliega Firebase.

Las reglas e índices de producción los administra exclusivamente el dueño desde la consola de Firebase. El agente entrega recomendaciones en Markdown y no despliega reglas, índices, funciones ni migraciones.

## Limpieza local

Se retiraron `firestore.rules` y `firestore.indexes.json` de la raíz y la sección `firestore` de `firebase.json`. La configuración normal conserva solamente Hosting. Ninguna configuración ni dato remoto fue modificado.

El archivo local retirado permitía `allow read, write: if true` para todos los documentos. **No publicar esa regla.** Su presencia local no demuestra que producción tenga reglas abiertas. La referencia válida es la consola del dueño.

## Reglas que compartió el dueño

Referencia de la conversación: comprobar su vigencia en la consola. No hace falta publicarlas nuevamente por esta limpieza local.

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null;
    }
    function isOwner(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }
    match /usuarios/{userId} {
      allow read, write: if isOwner(userId);
      match /{subcollection=**} {
        allow read, write: if isOwner(userId);
      }
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Estas reglas permiten al UID principal acceder a sus documentos y subcolecciones. Los permisos del selector operativo web no son restricciones de seguridad en Firestore: operadores con el mismo UID tienen el mismo acceso remoto. No aplicar propuestas históricas de cuentas Auth independientes mientras siga vigente el flujo acordado de cuenta compartida y selector.

## Índices retirados, conservados como referencia

No es una orden de creación. La captura del dueño ya mostraba ambos habilitados: comparar en la consola y no duplicarlos ni eliminarlos.

| Colección | Alcance | Campos en orden |
| --- | --- | --- |
| `gestionDiaria` | Colección | `distribuidorId` ascendente, `estado` ascendente, `fecha` descendente |
| `gestionDiaria` | Colección | `distribuidorId` ascendente, `fecha` descendente |

Conservar también los índices actuales de gastos, sesiones y ventas; pueden ser necesarios para el móvil.

## Procedimiento para recomendaciones futuras

1. Verificar el proyecto seleccionado en la consola Firebase y guardar copia de las reglas vigentes y del listado de índices.
2. Revisar la recomendación concreta: ruta afectada, diferencia exacta de reglas o campos/direcciones del índice y consulta que lo necesita. No sustituir todo por propuestas antiguas.
3. Si una consulta informa un índice faltante, revisar la definición exacta del error en Firestore Database → Índices. Crear solamente el índice necesario y esperar a que esté habilitado.
4. Si se propone cambiar reglas, probar la diferencia y verificar lectura, sincronización, sesiones y vendedores del móvil antes de que el dueño decida publicarla.
5. Registrar qué cambio aplicó el dueño y los resultados de las comprobaciones.

No hay ajustes de reglas o índices que aplicar por el mero hecho de retirar los archivos locales. Esta limpieza no certifica que todos los flujos estén listos para lanzar: consultar la validación pendiente en el plan.

## Hallazgo de la auditoría 2026-10-02: inventario administrativo

Decisión posterior de descuento web directo: venta y stock usan exclusivamente documentos de `usuarios/{ownerUid}/ventas_appweb` y `usuarios/{ownerUid}/productos`, ya cubiertos por las reglas owner-only compartidas. No requiere cambio de reglas/índices para ese flujo. No confundirlo con el libro por ubicaciones en `negocios`, que sigue teniendo la limitación descrita abajo. Las pruebas transaccionales se ejecutan solo en el emulador; ningún dato real fue modificado por el agente.

El código consulta `negocios/{ownerUid}/configuracion/inventario` y registra el libro en `negocios/{ownerUid}/inventario_movimientos/{movementId}`. Las reglas compartidas arriba no autorizan ninguna ruta `negocios`. Un error de permisos allí no significa que los datos móviles se hayan dañado.

No se recomienda abrir toda la colección `negocios` ni sustituir las reglas actuales. Antes de habilitar inventario fuera de pruebas, definir si se mantienen esas rutas o se adopta una subcolección administrativa del dueño, sin trasladar documentos existentes automáticamente. Si se mantienen, la propuesta manual deberá limitar acceso al UID dueño en esas rutas exactas y separar creación del libro de actualización/borrado, que deben permanecer denegados. Probar la diferencia y el móvil antes de publicar desde la consola.

Esto no habilita por sí solo la funcionalidad: existen protecciones locales de pruebas y falta integrar venta web con el libro físico. Tampoco crea seguridad remota por operador, porque todos comparten el UID principal. No hay un nuevo índice de producción demostrado como necesario por las pruebas locales; crear uno solo ante la consulta concreta y el error correspondiente.

## Material de pruebas locales conservado

`firebase/emulator/firestore.rules` y `firebase/emulator/firestore.indexes.json` se conservan para las pruebas sintéticas de `demo-admondash`, referenciadas por `firebase.emulator.json`. La suite de pruebas necesita esos archivos. No representan producción y la configuración normal `firebase.json` no los referencia.

No ejecutar despliegues con `firebase.emulator.json`. El uso autorizado del agente con esa configuración se limita a emuladores de `demo-admondash`.

Retirar archivos de despliegue evita esa vía accidental con la configuración normal, pero no bloquea técnicamente otros accesos a Firebase. La aplicación autenticada sigue pudiendo guardar datos según sus permisos y las reglas vigentes.
